/**
 * 録音セッションのメタ情報（OPFS の meta.json）と命名規則（純粋ロジック）。
 *
 * OPFS 上の配置:
 *   meeting-recorder/<sessionId>/audio.pcm  … 16bit LE インターリーブ・ステレオ（L=マイク / R=相手）
 *   meeting-recorder/<sessionId>/meta.json  … SessionMeta
 *
 * 録音中にタブが落ちても audio.pcm は追記済みのところまで残るので、
 * status が 'recording' のままのセッションは「中断（復元可能）」として扱い、
 * 長さはファイルサイズから導く。
 */
import { BYTES_PER_FRAME, framesFromBytes } from './pcm'

export const SESSIONS_DIR = 'meeting-recorder'
export const AUDIO_FILE = 'audio.pcm'
export const META_FILE = 'meta.json'

export const SAMPLE_RATES = [16000, 24000, 48000] as const
export type RecordingSampleRate = (typeof SAMPLE_RATES)[number]
export const DEFAULT_SAMPLE_RATE: RecordingSampleRate = 16000

export type SessionStatus = 'recording' | 'complete'

export type SessionMeta = {
  version: 1
  id: string
  /** ISO 8601 */
  createdAt: string
  /** ISO 8601。録音中は定期的に更新する */
  updatedAt: string
  sampleRate: number
  channels: 2
  /** チャンネル順のラベル（L, R） */
  channelLabels: [string, string]
  status: SessionStatus
  /** 1 チャンネルあたりのサンプル数（= フレーム数） */
  durationSamples: number
  /** 取得したマイク・共有元の表示名（分かれば） */
  micLabel?: string
  sourceLabel?: string
}

export const CHANNEL_LABELS: [string, string] = ['マイク', '相手']

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

/** ローカル時刻の YYYYMMDD-HHmmss（セッション ID とファイル名の共通部品） */
function localStamp(date: Date, withSeconds: boolean): string {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${withSeconds ? pad(date.getSeconds()) : ''}`
  return `${day}-${time}`
}

/**
 * セッション ID。並べ替えるだけで時系列になり、OPFS のディレクトリ名として
 * 安全な文字だけを使う。同じ秒に 2 回始めても衝突しないよう乱数を足す。
 */
export function createSessionId(date: Date, random: () => number): string {
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0')
  return `${localStamp(date, true)}-${suffix}`
}

/** 書き出しファイルのベース名（例: meeting-20261020-1430） */
export function fileBaseName(createdAt: Date): string {
  return `meeting-${localStamp(createdAt, false)}`
}

export function createSessionMeta(params: {
  id: string
  createdAt: Date
  sampleRate: number
  micLabel?: string
  sourceLabel?: string
}): SessionMeta {
  const iso = params.createdAt.toISOString()
  return {
    version: 1,
    id: params.id,
    createdAt: iso,
    updatedAt: iso,
    sampleRate: params.sampleRate,
    channels: 2,
    channelLabels: CHANNEL_LABELS,
    status: 'recording',
    durationSamples: 0,
    micLabel: params.micLabel,
    sourceLabel: params.sourceLabel,
  }
}

export function serializeSessionMeta(meta: SessionMeta): string {
  return JSON.stringify(meta, null, 2)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

/** 壊れた / 未知の形式の meta.json は null（一覧では「メタ情報なし」扱い） */
export function parseSessionMeta(text: string): SessionMeta | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.version !== 1) return null
  const { id, createdAt, sampleRate, status, durationSamples } = raw
  if (typeof id !== 'string' || typeof createdAt !== 'string') return null
  if (Number.isNaN(Date.parse(createdAt))) return null
  if (typeof sampleRate !== 'number' || !(sampleRate > 0)) return null
  if (status !== 'recording' && status !== 'complete') return null
  const rawLabels: unknown = raw.channelLabels
  const labels: [string, string] =
    Array.isArray(rawLabels) &&
    typeof rawLabels[0] === 'string' &&
    typeof rawLabels[1] === 'string'
      ? [rawLabels[0], rawLabels[1]]
      : CHANNEL_LABELS
  return {
    version: 1,
    id,
    createdAt,
    updatedAt: optionalString(raw.updatedAt) ?? createdAt,
    sampleRate,
    channels: 2,
    channelLabels: labels,
    status,
    durationSamples:
      typeof durationSamples === 'number' && durationSamples >= 0
        ? Math.floor(durationSamples)
        : 0,
    micLabel: optionalString(raw.micLabel),
    sourceLabel: optionalString(raw.sourceLabel),
  }
}

/** 録音ファイルのバイト数 → 秒 */
export function durationSecondsFromBytes(
  bytes: number,
  sampleRate: number,
): number {
  return framesFromBytes(bytes) / sampleRate
}

/** 秒 → 録音原本のバイト数（ステレオ 16bit） */
export function bytesForSeconds(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate) * BYTES_PER_FRAME
}

/**
 * 一覧に出す状態。
 * - active: 今まさにどこかのタブで録音中（Web Locks が握られている）
 * - interrupted: status が recording のまま止まった＝クラッシュ / リロードの跡。
 *   ファイルに残っている分は書き出せる
 * - complete: 正常に停止した
 */
export type SessionState = 'active' | 'interrupted' | 'complete'

export function sessionState(
  meta: Pick<SessionMeta, 'status'>,
  locked: boolean,
): SessionState {
  if (locked) return 'active'
  return meta.status === 'complete' ? 'complete' : 'interrupted'
}

/** Web Locks の名前（録音中のワーカーが握り、一覧側が問い合わせる） */
export function sessionLockName(id: string): string {
  return `${SESSIONS_DIR}:${id}`
}

/** 1:02:03 / 4:05 形式 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
}
