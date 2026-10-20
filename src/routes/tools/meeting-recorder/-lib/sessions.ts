/**
 * OPFS 上の録音セッションの一覧・削除（メインスレッド側）。
 * 読むのは meta.json とファイルサイズだけで、音声本体はここでは開かない。
 */
import {
  AUDIO_FILE,
  META_FILE,
  SESSIONS_DIR,
  durationSecondsFromBytes,
  parseSessionMeta,
  sessionLockName,
  sessionState,
} from '../../../../lib/meeting-recorder/session'
import { BYTES_PER_FRAME } from '../../../../lib/meeting-recorder/pcm'
import type {
  SessionMeta,
  SessionState,
} from '../../../../lib/meeting-recorder/session'

/** ダウンロード方式の書き出しで一時的に置くディレクトリ */
export const EXPORT_TEMP_DIR = 'meeting-recorder-exports'

export type SessionSummary = {
  id: string
  /** meta.json が読めなかったときは null（書き出し不可・削除のみ） */
  meta: SessionMeta | null
  state: SessionState | 'broken'
  bytes: number
  durationSeconds: number
}

async function sessionsRoot(create: boolean) {
  const root = await navigator.storage.getDirectory()
  try {
    return await root.getDirectoryHandle(SESSIONS_DIR, { create })
  } catch {
    return null
  }
}

async function heldLockNames(): Promise<Set<string>> {
  if (!('locks' in navigator)) return new Set()
  const snapshot = await navigator.locks.query()
  return new Set(
    (snapshot.held ?? []).flatMap((lock) => (lock.name ? [lock.name] : [])),
  )
}

async function readText(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string | null> {
  try {
    const handle = await dir.getFileHandle(name)
    return await (await handle.getFile()).text()
  } catch {
    return null
  }
}

async function fileSize(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<number> {
  try {
    const handle = await dir.getFileHandle(name)
    return (await handle.getFile()).size
  } catch {
    return 0
  }
}

async function summarize(
  id: string,
  dir: FileSystemDirectoryHandle,
  held: Set<string>,
): Promise<SessionSummary> {
  const locked = held.has(sessionLockName(id))
  const metaText = await readText(dir, META_FILE)
  const meta = metaText === null ? null : parseSessionMeta(metaText)
  if (!meta) {
    return {
      id,
      meta: null,
      state: locked ? 'active' : 'broken',
      bytes: locked ? 0 : await fileSize(dir, AUDIO_FILE),
      durationSeconds: 0,
    }
  }
  // 録音中のファイルは書き込みワーカーが同期ハンドルで掴んでいるので触らず、
  // 定期的に更新される meta の長さを使う
  const bytes = locked
    ? meta.durationSamples * BYTES_PER_FRAME
    : await fileSize(dir, AUDIO_FILE)
  return {
    id,
    meta,
    state: sessionState(meta, locked),
    bytes,
    durationSeconds: durationSecondsFromBytes(bytes, meta.sampleRate),
  }
}

/** 新しい順 */
export async function listSessions(): Promise<Array<SessionSummary>> {
  const root = await sessionsRoot(false)
  if (!root) return []
  const held = await heldLockNames()
  const pending: Array<Promise<SessionSummary>> = []
  for await (const [name, handle] of root.entries()) {
    if (handle instanceof FileSystemDirectoryHandle) {
      pending.push(summarize(name, handle, held))
    }
  }
  const sessions = await Promise.all(pending)
  return sessions.toSorted((a, b) => b.id.localeCompare(a.id))
}

export async function deleteSession(id: string): Promise<void> {
  const held = await heldLockNames()
  if (held.has(sessionLockName(id))) {
    throw new Error('録音中のセッションは削除できません')
  }
  const root = await sessionsRoot(false)
  await root?.removeEntry(id, { recursive: true })
}

/** ダウンロード用の一時ファイルを片付ける（失敗しても困らないので握りつぶす） */
export async function clearExportTemp(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(EXPORT_TEMP_DIR, { recursive: true })
  } catch {
    // 無ければそれでよい
  }
}

export async function readExportTemp(name: string): Promise<File> {
  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(EXPORT_TEMP_DIR)
  return (await dir.getFileHandle(name)).getFile()
}

export type StorageInfo = {
  usage: number
  quota: number
  persisted: boolean
}

export async function storageInfo(): Promise<StorageInfo | null> {
  if (!('storage' in navigator)) return null
  try {
    const [estimate, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted(),
    ])
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      persisted,
    }
  } catch {
    return null
  }
}

/** 録音を始めるときに一度だけ、勝手に消されないよう永続化を頼む */
export async function requestPersistence(): Promise<boolean> {
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
