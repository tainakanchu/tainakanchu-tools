/**
 * 録音 PCM を OPFS へ追記する専用ワーカー。
 *
 * FileSystemSyncAccessHandle は Dedicated Worker でしか使えないのでここに置く。
 * AudioWorklet からの PCM バッチを受けたら即座に書き、数秒ごとに flush して
 * meta.json の長さも更新する。タブが落ちても直前の flush までは確実に残る。
 *
 * 録音中は Web Locks でセッションのロックを握り、一覧側が「録音中」と
 * 「中断（クラッシュの跡）」を見分けられるようにしている。
 */
import {
  AUDIO_FILE,
  META_FILE,
  SESSIONS_DIR,
  serializeSessionMeta,
  sessionLockName,
} from '../../../../lib/meeting-recorder/session'
import { BYTES_PER_FRAME } from '../../../../lib/meeting-recorder/pcm'
import type { SessionMeta } from '../../../../lib/meeting-recorder/session'
import type { PcmMessage, WriterCommand, WriterEvent } from './protocol'

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- module worker のグローバルは lib.dom の Window として型が付くので、DedicatedWorkerGlobalScope として使う面だけを切り出す
const ctx = self as unknown as {
  postMessage: (message: WriterEvent, transfer: Array<Transferable>) => void
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<WriterCommand>) => void,
  ) => void
}

/** flush と meta.json 更新の間隔（秒） */
const CHECKPOINT_SECONDS = 2

const encoder = new TextEncoder()

let audio: FileSystemSyncAccessHandle | null = null
let metaHandle: FileSystemFileHandle | null = null
let meta: SessionMeta | null = null
let bytesWritten = 0
let framesSinceCheckpoint = 0
let releaseLock: (() => void) | null = null
/** meta.json の書き込みを直列化する（createSyncAccessHandle は同時に 1 つまで） */
let metaQueue: Promise<void> = Promise.resolve()
let failed = false

function post(event: WriterEvent) {
  ctx.postMessage(event, [])
}

function writeMeta(next: SessionMeta): Promise<void> {
  const handle = metaHandle
  if (!handle) return metaQueue
  metaQueue = metaQueue.then(async () => {
    const sync = await handle.createSyncAccessHandle()
    try {
      const bytes = encoder.encode(serializeSessionMeta(next))
      sync.truncate(0)
      sync.write(bytes, { at: 0 })
      sync.flush()
    } finally {
      sync.close()
    }
  })
  return metaQueue
}

function currentMeta(status: SessionMeta['status']): SessionMeta | null {
  if (!meta) return null
  return {
    ...meta,
    status,
    durationSamples: Math.floor(bytesWritten / BYTES_PER_FRAME),
    updatedAt: new Date().toISOString(),
  }
}

function fail(error: unknown) {
  if (failed) return
  failed = true
  const message =
    error instanceof DOMException && error.name === 'QuotaExceededError'
      ? 'ブラウザの保存容量が足りなくなったため録音を止めました。ここまでの録音は残っています。'
      : `録音データの書き込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`
  post({ type: 'error', message })
}

function checkpoint() {
  if (!audio) return
  audio.flush()
  const next = currentMeta('recording')
  if (next) writeMeta(next).catch(fail)
  post({
    type: 'stats',
    durationSamples: Math.floor(bytesWritten / BYTES_PER_FRAME),
    bytes: bytesWritten,
  })
}

function handlePcm(buffer: ArrayBuffer) {
  if (!audio || failed) return
  try {
    const written = audio.write(new Uint8Array(buffer), { at: bytesWritten })
    bytesWritten += written
    if (written !== buffer.byteLength) {
      throw new DOMException('short write', 'QuotaExceededError')
    }
  } catch (error) {
    fail(error)
    return
  }
  framesSinceCheckpoint += buffer.byteLength / BYTES_PER_FRAME
  if (meta && framesSinceCheckpoint >= meta.sampleRate * CHECKPOINT_SECONDS) {
    framesSinceCheckpoint = 0
    try {
      checkpoint()
    } catch (error) {
      fail(error)
    }
  }
}

async function finish() {
  try {
    if (audio) {
      audio.flush()
      audio.close()
      audio = null
    }
    const done = currentMeta('complete')
    if (done) {
      await writeMeta(done)
      post({ type: 'closed', meta: done })
    }
  } catch (error) {
    fail(error)
  } finally {
    releaseLock?.()
    releaseLock = null
  }
}

async function open(command: WriterCommand) {
  meta = command.meta
  const root = await navigator.storage.getDirectory()
  const sessions = await root.getDirectoryHandle(SESSIONS_DIR, {
    create: true,
  })
  const dir = await sessions.getDirectoryHandle(meta.id, { create: true })

  // ロックを取ってからファイルを作る。取れた時点で resolve し、録音終了まで握り続ける
  await new Promise<void>((granted) => {
    void navigator.locks.request(
      sessionLockName(command.meta.id),
      () =>
        new Promise<void>((release) => {
          releaseLock = release
          granted()
        }),
    )
  })

  const audioHandle = await dir.getFileHandle(AUDIO_FILE, { create: true })
  audio = await audioHandle.createSyncAccessHandle()
  bytesWritten = audio.getSize()
  metaHandle = await dir.getFileHandle(META_FILE, { create: true })
  await writeMeta(meta)

  command.port.addEventListener(
    'message',
    (event: MessageEvent<PcmMessage>) => {
      const message = event.data
      if (message.type === 'pcm') {
        handlePcm(message.buffer)
        return
      }
      void finish()
    },
  )
  // addEventListener の場合は start() するまで溜まったメッセージが流れてこない
  command.port.start()
  post({ type: 'opened' })
}

ctx.addEventListener('message', (event) => {
  open(event.data).catch((error: unknown) => {
    releaseLock?.()
    fail(error)
  })
})
