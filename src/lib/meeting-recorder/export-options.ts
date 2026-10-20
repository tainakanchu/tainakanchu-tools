/**
 * 書き出しモード・形式・ビットレートの定義と、出力ファイル構成の導出（純粋ロジック）。
 * UI とエクスポートワーカーの両方がここを単一ソースにする。
 */
import { MIC_CHANNEL, SYSTEM_CHANNEL } from './pcm'

/**
 * - stereo: L=マイク / R=相手 の 1 ファイル（既定）
 * - separate: マイクと相手をそれぞれモノラルの別ファイル
 * - mix: 両者を混ぜたモノラル 1 ファイル
 */
export type ExportMode = 'stereo' | 'separate' | 'mix'
export const DEFAULT_EXPORT_MODE: ExportMode = 'stereo'

export const EXPORT_MODES: ReadonlyArray<{
  id: ExportMode
  label: string
  note: string
}> = [
  {
    id: 'stereo',
    label: 'ステレオ（L=マイク / R=相手）',
    note: '1 ファイルで話者を左右に分けて保存します。',
  },
  {
    id: 'separate',
    label: '別ファイル',
    note: 'マイクと相手をモノラル 2 ファイルに分けます。分離はこれが確実です。',
  },
  {
    id: 'mix',
    label: 'モノラルミックス',
    note: '両者を混ぜた 1 ファイル。いちばん軽く、聞き返し向きです。',
  },
]

export type ExportFormat = 'opus' | 'aac' | 'wav'
export const DEFAULT_EXPORT_FORMAT: ExportFormat = 'opus'

export const EXPORT_FORMATS: ReadonlyArray<{
  id: ExportFormat
  label: string
  extension: string
  mimeType: string
}> = [
  {
    id: 'opus',
    label: 'Opus (.ogg)',
    extension: 'ogg',
    mimeType: 'audio/ogg',
  },
  {
    id: 'aac',
    label: 'AAC-LC (.m4a)',
    extension: 'm4a',
    mimeType: 'audio/mp4',
  },
  {
    id: 'wav',
    label: 'WAV (16bit PCM)',
    extension: 'wav',
    mimeType: 'audio/wav',
  },
]

export function exportFormatInfo(format: ExportFormat) {
  const info = EXPORT_FORMATS.find((f) => f.id === format)
  if (!info) throw new Error(`unknown format: ${format}`)
  return info
}

/** 出力 1 ファイルあたりのチャンネル数 */
export function outputChannels(mode: ExportMode): 1 | 2 {
  return mode === 'stereo' ? 2 : 1
}

/**
 * ビットレート候補（bps）。WAV は無圧縮なので候補なし。
 * ステレオ Opus は低ビットレートほど左右をまとめて符号化しやすく
 * （mid/side・intensity stereo）、話者の分離が崩れるので下限を 48kbps にしている。
 */
export function bitrateOptions(
  format: ExportFormat,
  channels: 1 | 2,
): ReadonlyArray<number> {
  if (format === 'opus') {
    return channels === 1 ? [16000, 24000, 32000] : [48000, 64000, 96000]
  }
  if (format === 'aac') {
    return channels === 1 ? [32000, 48000, 64000] : [64000, 96000, 128000]
  }
  return []
}

export function defaultBitrate(format: ExportFormat, channels: 1 | 2): number {
  if (format === 'opus') return channels === 1 ? 24000 : 64000
  if (format === 'aac') return channels === 1 ? 48000 : 96000
  return 0
}

/** 選択中のビットレートが候補外（モード切替直後など）なら既定値へ寄せる */
export function normalizeBitrate(
  format: ExportFormat,
  channels: 1 | 2,
  bitrate: number,
): number {
  return bitrateOptions(format, channels).includes(bitrate)
    ? bitrate
    : defaultBitrate(format, channels)
}

/**
 * 出力 1 ファイル分の中身。
 * source は録音原本（L=マイク / R=相手）からの取り出し方。
 */
export type ExportTarget = {
  /** 拡張子込みのファイル名 */
  fileName: string
  channels: 1 | 2
  source:
    { kind: 'channel'; channel: number } | { kind: 'stereo' } | { kind: 'mix' }
  /** トラック名（コンテナのメタデータ用） */
  trackName: string
}

export function exportTargets(
  baseName: string,
  mode: ExportMode,
  format: ExportFormat,
): Array<ExportTarget> {
  const ext = exportFormatInfo(format).extension
  if (mode === 'separate') {
    return [
      {
        fileName: `${baseName}-mic.${ext}`,
        channels: 1,
        source: { kind: 'channel', channel: MIC_CHANNEL },
        trackName: 'マイク',
      },
      {
        fileName: `${baseName}-system.${ext}`,
        channels: 1,
        source: { kind: 'channel', channel: SYSTEM_CHANNEL },
        trackName: '相手',
      },
    ]
  }
  if (mode === 'mix') {
    return [
      {
        fileName: `${baseName}-mix.${ext}`,
        channels: 1,
        source: { kind: 'mix' },
        trackName: 'ミックス',
      },
    ]
  }
  return [
    {
      fileName: `${baseName}-stereo.${ext}`,
      channels: 2,
      source: { kind: 'stereo' },
      trackName: 'L=マイク / R=相手',
    },
  ]
}

/** 同名ファイルがあるときの退避名（a.ogg → a (2).ogg） */
export function numberedFileName(fileName: string, n: number): string {
  if (n <= 1) return fileName
  const dot = fileName.lastIndexOf('.')
  return dot <= 0
    ? `${fileName} (${n})`
    : `${fileName.slice(0, dot)} (${n})${fileName.slice(dot)}`
}

/** 書き出し後のおおよそのサイズ（バイト）。進捗表示と事前の目安用 */
export function estimateOutputBytes(params: {
  format: ExportFormat
  channels: 1 | 2
  bitrate: number
  seconds: number
  sampleRate: number
}): number {
  if (params.format === 'wav') {
    return (
      44 + Math.round(params.seconds * params.sampleRate) * params.channels * 2
    )
  }
  return Math.round((params.bitrate / 8) * params.seconds)
}
