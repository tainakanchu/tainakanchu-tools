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

export type ExportFormat = 'mp3' | 'opus' | 'aac' | 'wav'
/**
 * 既定は MP3。Opus (.ogg) の方が同じサイズで音は良いが、NotebookLM（PC の Web 版）は
 * Ogg Opus を受け付けない（このツールの .ogg も ffmpeg の libopus で作った .ogg も
 * アップロードがエラーになり、同じ録音の WAV は通った）。文字起こしサービスに
 * そのまま渡せることを優先し、どこでも読める MP3 を既定にしている。
 */
export const DEFAULT_EXPORT_FORMAT: ExportFormat = 'mp3'

export const EXPORT_FORMATS: ReadonlyArray<{
  id: ExportFormat
  label: string
  /** 形式の選択肢の下に出す補足（無ければ出さない） */
  note?: string
  extension: string
  mimeType: string
}> = [
  {
    id: 'mp3',
    label: 'MP3 (.mp3)',
    note: 'NotebookLM などの文字起こしサービスでそのまま読み込めます（既定）',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
  },
  {
    id: 'opus',
    label: 'Opus (.ogg)',
    note: 'いちばん軽量。ただし NotebookLM は Ogg Opus を読み込めません（確認済み）。Whisper など Opus 対応のサービス向け',
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
    note: '無圧縮。サイズは大きくなります',
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
 * MP3 の候補は録音の 16k / 24k / 48kHz のどれでも有効な値だけにしている
 * （16k / 24kHz は MPEG-2 LSF で上限 160kbps。isValidMp3Bitrate を参照）。
 */
export function bitrateOptions(
  format: ExportFormat,
  channels: 1 | 2,
): ReadonlyArray<number> {
  if (format === 'mp3') {
    return channels === 1 ? [32000, 48000, 64000] : [64000, 96000, 128000]
  }
  if (format === 'opus') {
    return channels === 1 ? [16000, 24000, 32000] : [48000, 64000, 96000]
  }
  if (format === 'aac') {
    return channels === 1 ? [32000, 48000, 64000] : [64000, 96000, 128000]
  }
  return []
}

export function defaultBitrate(format: ExportFormat, channels: 1 | 2): number {
  if (format === 'mp3') return channels === 1 ? 48000 : 64000
  if (format === 'opus') return channels === 1 ? 24000 : 64000
  if (format === 'aac') return channels === 1 ? 48000 : 96000
  return 0
}

/**
 * MPEG Audio Layer III で使えるサンプリング周波数とビットレート（kbps）の組み合わせ。
 * - MPEG-1（32k / 44.1k / 48kHz）: 32〜320kbps
 * - MPEG-2 LSF（16k / 22.05k / 24kHz）と MPEG-2.5（8k / 11.025k / 12kHz）: 8〜160kbps
 * 表に無い値を渡すと LAME は黙って近い値へ丸めるので、書き出し前にここで弾く。
 */
const MP3_MPEG1_RATES = [32000, 44100, 48000]
const MP3_LSF_RATES = [8000, 11025, 12000, 16000, 22050, 24000]
const MP3_MPEG1_KBPS = [
  32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
]
const MP3_LSF_KBPS = [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]

export function isValidMp3Bitrate(
  sampleRate: number,
  bitrate: number,
): boolean {
  const kbps = bitrate / 1000
  if (MP3_MPEG1_RATES.includes(sampleRate)) return MP3_MPEG1_KBPS.includes(kbps)
  if (MP3_LSF_RATES.includes(sampleRate)) return MP3_LSF_KBPS.includes(kbps)
  return false
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

/** 同名ファイルがあるときの退避名（a.mp3 → a (2).mp3） */
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
