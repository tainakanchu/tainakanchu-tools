/**
 * 書き出しワーカー。OPFS の録音原本（Int16 ステレオ）をチャンクごとに読み、
 * モードに応じて分解・ミックスしてから WAV / Opus(.ogg) / AAC(.m4a) に書き出す。
 *
 * - 原本は File.slice() で数秒ずつしか読まないので、何時間の録音でもメモリに載せない
 * - 圧縮形式は WebCodecs の AudioEncoder で符号化し、mediabunny でコンテナに詰める
 *   （mediabunny 任せの符号化だと Opus の application / signal を渡せないため自前で回す）
 * - 出力先は「ユーザーが選んだファイル（FileSystemFileHandle）」か
 *   「OPFS の一時ファイル（あとでメインスレッドがダウンロードさせる）」のどちらか。
 *   どちらも位置指定で書けるので、mp4 の後書きヘッダーにも対応できる
 */
import {
  EncodedAudioPacketSource,
  EncodedPacket,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  StreamTarget,
} from 'mediabunny'
import {
  extractChannelInt16,
  framesFromBytes,
  int16ArrayToFloat,
  mixToMonoInt16,
} from '../../../../lib/meeting-recorder/pcm'
import {
  AUDIO_FILE,
  SESSIONS_DIR,
} from '../../../../lib/meeting-recorder/session'
import {
  WAV_HEADER_BYTES,
  createWavHeader,
} from '../../../../lib/meeting-recorder/wav'
import { EXPORT_TEMP_DIR } from './sessions'
import type { StreamTargetChunk } from 'mediabunny'
import type {
  ExportFormat,
  ExportTarget,
} from '../../../../lib/meeting-recorder/export-options'

export type ExportSink =
  | { kind: 'handle'; handle: FileSystemFileHandle }
  | { kind: 'temp'; name: string }

export type ExportRequest = {
  type: 'export'
  sessionId: string
  sampleRate: number
  format: ExportFormat
  bitrate: number
  outputs: Array<{ target: ExportTarget; sink: ExportSink }>
}

export type ExportResponse =
  | { type: 'progress'; fraction: number }
  | {
      type: 'done'
      outputs: Array<{ fileName: string; bytes: number; sink: ExportSink }>
      elapsedMs: number
      audioSeconds: number
      /** 実際にエンコーダーへ渡した設定（Opus の voip ヒントが効いたかの確認用） */
      encoderNote: string | null
    }
  | { type: 'error'; message: string }

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- module worker のグローバルは lib.dom の Window として型が付くので、DedicatedWorkerGlobalScope として使う面だけを切り出す
const ctx = self as unknown as {
  postMessage: (message: ExportResponse, transfer: Array<Transferable>) => void
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<ExportRequest>) => void,
  ) => void
}

/** 1 回に読む長さ（秒）。16kHz なら 640KB、48kHz でも 2MB 弱 */
const READ_SECONDS = 5

// ---------------------------------------------------------------------------
// 出力先
// ---------------------------------------------------------------------------

type ByteSink = {
  write: (data: Uint8Array<ArrayBuffer>, position: number) => Promise<void>
  close: () => Promise<void>
  abort: () => Promise<void>
  /** 書かれた最大位置 = ファイルサイズ */
  size: () => number
}

async function openSink(sink: ExportSink): Promise<ByteSink> {
  let size = 0
  const track = (data: Uint8Array, position: number) => {
    size = Math.max(size, position + data.byteLength)
  }

  if (sink.kind === 'handle') {
    const writable = await sink.handle.createWritable()
    return {
      write: async (data, position) => {
        track(data, position)
        await writable.write({ type: 'write', data, position })
      },
      close: () => writable.close(),
      abort: () => writable.abort(),
      size: () => size,
    }
  }

  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(EXPORT_TEMP_DIR, { create: true })
  const handle = await dir.getFileHandle(sink.name, { create: true })
  const sync = await handle.createSyncAccessHandle()
  sync.truncate(0)
  return {
    write: (data, position) => {
      track(data, position)
      sync.write(data, { at: position })
      return Promise.resolve()
    },
    close: () => {
      sync.flush()
      sync.close()
      return Promise.resolve()
    },
    abort: () => {
      sync.close()
      return Promise.resolve()
    },
    size: () => size,
  }
}

// ---------------------------------------------------------------------------
// エンコーダー
// ---------------------------------------------------------------------------

/** 1 出力ファイル分の書き手。チャンネル取り出し済みの Int16 を受け取る */
type ChannelWriter = {
  /** samples: モノラル or インターリーブ・ステレオの Int16 */
  write: (samples: Int16Array, frameOffset: number) => Promise<void>
  finish: () => Promise<void>
  abort: () => Promise<void>
}

function createWavWriter(
  sink: ByteSink,
  channels: number,
  sampleRate: number,
  totalFrames: number,
): ChannelWriter {
  let position = WAV_HEADER_BYTES
  let headerWritten = false
  return {
    write: async (samples) => {
      if (!headerWritten) {
        // 総フレーム数は最初から分かっているのでヘッダーを先に確定できる
        await sink.write(
          createWavHeader({
            sampleRate,
            channels,
            dataBytes: totalFrames * channels * 2,
          }),
          0,
        )
        headerWritten = true
      }
      // 書き込み先の型（ArrayBuffer 裏付けの Uint8Array）に揃えるためコピーする
      const bytes = new Uint8Array(
        samples.buffer,
        samples.byteOffset,
        samples.byteLength,
      ).slice()
      await sink.write(bytes, position)
      position += bytes.byteLength
    },
    finish: async () => {
      if (!headerWritten) {
        await sink.write(
          createWavHeader({ sampleRate, channels, dataBytes: 0 }),
          0,
        )
      }
      await sink.close()
    },
    abort: () => sink.abort(),
  }
}

/**
 * Opus の用途ヒント。
 * - モノラル: 会話向け（application: voip / signal: voice）。
 * - ステレオ: application: audio（libopus の既定と同じ）にする。voip + voice だと
 *   SILK 寄りのモード選択になり、ステレオを mid/side で予測符号化するため
 *   48kbps 付近で左右がはっきり混ざる（Chromium 141 で実測: 漏れ -23dB 程度。
 *   audio なら 48kbps でも -80dB 以下）。ビットレートも目標を下回りがちだった。
 */
function opusHints(numberOfChannels: number): OpusEncoderConfig {
  return numberOfChannels === 1
    ? { application: 'voip', signal: 'voice' }
    : { application: 'audio' }
}

/**
 * isConfigSupported が通る中で一番細かく指定できた設定を選ぶ。
 * Opus は用途ヒント付きを優先し、未対応のブラウザでは外して再試行する。
 * DTX（無音区間の省略）は使わない。
 */
async function pickEncoderConfig(
  format: 'opus' | 'aac',
  sampleRate: number,
  numberOfChannels: number,
  bitrate: number,
): Promise<{ config: AudioEncoderConfig; note: string } | null> {
  const base = { sampleRate, numberOfChannels, bitrate }
  const hints = opusHints(numberOfChannels)
  const candidates: Array<AudioEncoderConfig> =
    format === 'opus'
      ? [
          {
            ...base,
            codec: 'opus',
            opus: { format: 'opus', usedtx: false, ...hints },
          },
          { ...base, codec: 'opus', opus: { format: 'opus', usedtx: false } },
          { ...base, codec: 'opus' },
        ]
      : [
          { ...base, codec: 'mp4a.40.2', aac: { format: 'aac' } },
          { ...base, codec: 'mp4a.40.2' },
        ]
  for (const candidate of candidates) {
    try {
      const support = await AudioEncoder.isConfigSupported(candidate)
      if (!support.supported) continue
      // 未知のメンバーは黙って捨てられるので、受理された設定（support.config）から判定する
      const accepted = support.config?.opus?.application
      const note =
        format === 'aac'
          ? 'AAC-LC'
          : accepted === hints.application
            ? `Opus: application=${accepted}${hints.signal ? ` / signal=${hints.signal}` : ''}`
            : 'Opus: 用途ヒントはこのブラウザで未対応のため既定設定'
      return { config: candidate, note }
    } catch {
      // 例外は「その組み合わせは不可」とみなして次へ
    }
  }
  return null
}

async function createCodecWriter(
  sink: ByteSink,
  format: 'opus' | 'aac',
  config: AudioEncoderConfig,
  trackName: string,
): Promise<ChannelWriter> {
  const output = new Output({
    format: format === 'opus' ? new OggOutputFormat() : new Mp4OutputFormat(),
    target: new StreamTarget(
      new WritableStream<StreamTargetChunk>({
        write: (chunk) => sink.write(chunk.data, chunk.position),
      }),
    ),
  })
  const source = new EncodedAudioPacketSource(format)
  output.addAudioTrack(source, { name: trackName })
  await output.start()

  let encoderError: unknown = null
  // 出力コールバックは同期なので、mediabunny への追加は Promise を数珠つなぎにする
  let packets: Promise<void> = Promise.resolve()
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const packet = EncodedPacket.fromEncodedChunk(chunk)
      packets = packets.then(() => source.add(packet, meta))
    },
    error: (error) => {
      encoderError = error
    },
  })
  encoder.configure(config)
  const { sampleRate, numberOfChannels } = config

  const throwIfFailed = () => {
    if (encoderError !== null) {
      throw encoderError instanceof Error
        ? encoderError
        : new Error('音声のエンコードに失敗しました')
    }
  }

  return {
    write: async (samples, frameOffset) => {
      throwIfFailed()
      const floats = int16ArrayToFloat(samples)
      const data = new AudioData({
        format: 'f32',
        sampleRate,
        numberOfChannels,
        numberOfFrames: floats.length / numberOfChannels,
        timestamp: Math.round((frameOffset / sampleRate) * 1_000_000),
        data: floats,
        transfer: [floats.buffer],
      })
      encoder.encode(data)
      data.close()
      // エンコーダーと書き込みの両方に背圧をかける（先走って溜め込まない）
      while (encoder.encodeQueueSize > 2) {
        await new Promise((resolve) =>
          encoder.addEventListener('dequeue', resolve, { once: true }),
        )
      }
      await packets
    },
    finish: async () => {
      await encoder.flush()
      throwIfFailed()
      await packets
      encoder.close()
      source.close()
      await output.finalize()
      await sink.close()
    },
    abort: async () => {
      if (encoder.state !== 'closed') encoder.close()
      await output.cancel()
      await sink.abort()
    },
  }
}

/** 原本のチャンク（インターリーブ・ステレオ）から出力に渡す並びを作る */
function selectSamples(
  interleaved: Int16Array,
  source: ExportTarget['source'],
): Int16Array<ArrayBuffer> {
  if (source.kind === 'stereo') return interleaved.slice()
  if (source.kind === 'mix') return mixToMonoInt16(interleaved)
  return extractChannelInt16(interleaved, source.channel)
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

async function runExport(request: ExportRequest) {
  const startedAt = performance.now()
  const root = await navigator.storage.getDirectory()
  const sessions = await root.getDirectoryHandle(SESSIONS_DIR)
  const dir = await sessions.getDirectoryHandle(request.sessionId)
  const file = await (await dir.getFileHandle(AUDIO_FILE)).getFile()
  const totalFrames = framesFromBytes(file.size)
  const { sampleRate, format } = request

  let encoderNote: string | null = null
  const configs = new Map<number, AudioEncoderConfig>()
  if (format !== 'wav') {
    for (const channels of new Set(
      request.outputs.map((o) => o.target.channels),
    )) {
      const picked = await pickEncoderConfig(
        format,
        sampleRate,
        channels,
        request.bitrate,
      )
      if (!picked) {
        throw new Error(
          `このブラウザは ${format === 'opus' ? 'Opus' : 'AAC'}（${sampleRate}Hz / ${channels}ch / ${request.bitrate / 1000}kbps）で書き出せません`,
        )
      }
      configs.set(channels, picked.config)
      encoderNote = encoderNote ? `${encoderNote}、${picked.note}` : picked.note
    }
  }

  const sinks: Array<ByteSink> = []
  const writers: Array<ChannelWriter> = []
  try {
    for (const { target, sink } of request.outputs) {
      const byteSink = await openSink(sink)
      sinks.push(byteSink)
      const config = configs.get(target.channels)
      writers.push(
        format === 'wav' || !config
          ? createWavWriter(byteSink, target.channels, sampleRate, totalFrames)
          : await createCodecWriter(byteSink, format, config, target.trackName),
      )
    }

    const chunkFrames = Math.round(sampleRate * READ_SECONDS)
    let lastPost = 0
    for (let frame = 0; frame < totalFrames; frame += chunkFrames) {
      const frames = Math.min(chunkFrames, totalFrames - frame)
      const bytes = await file
        .slice(frame * 4, (frame + frames) * 4)
        .arrayBuffer()
      const interleaved = new Int16Array(bytes)
      await Promise.all(
        request.outputs.map(({ target }, i) =>
          writers[i].write(selectSamples(interleaved, target.source), frame),
        ),
      )
      const now = performance.now()
      if (now - lastPost > 100) {
        lastPost = now
        ctx.postMessage(
          {
            type: 'progress',
            fraction: (frame + frames) / totalFrames,
          },
          [],
        )
      }
    }
    for (const writer of writers) await writer.finish()
  } catch (error) {
    await Promise.allSettled(writers.map((writer) => writer.abort()))
    // writer を作る前に失敗した sink も閉じておく
    await Promise.allSettled(sinks.slice(writers.length).map((s) => s.abort()))
    throw error
  }

  ctx.postMessage(
    {
      type: 'done',
      outputs: request.outputs.map(({ target, sink }, i) => ({
        fileName: target.fileName,
        bytes: sinks[i].size(),
        sink,
      })),
      elapsedMs: performance.now() - startedAt,
      audioSeconds: totalFrames / sampleRate,
      encoderNote,
    },
    [],
  )
}

ctx.addEventListener('message', (event) => {
  runExport(event.data).catch((error: unknown) => {
    ctx.postMessage(
      {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
      [],
    )
  })
})
