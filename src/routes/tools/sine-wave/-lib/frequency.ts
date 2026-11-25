export const MIN_HZ = 20
export const MAX_HZ = 20000
export const DEFAULT_HZ = 440
export const DEFAULT_VOLUME = 20
export const PRESETS_HZ: ReadonlyArray<number> = [50, 100, 440, 1000, 10000]

/** 周波数を 20〜20000 Hz に丸める（NaN は下限）。表示用に小数 2 桁へ揃える */
export function clampHz(hz: number): number {
  if (!Number.isFinite(hz))
    return Number.isNaN(hz) ? MIN_HZ : hz > 0 ? MAX_HZ : MIN_HZ
  const clamped = Math.min(MAX_HZ, Math.max(MIN_HZ, hz))
  return Math.round(clamped * 100) / 100
}

/** 周波数 → 対数スライダー位置（0〜1） */
export function hzToSliderPosition(hz: number): number {
  const clamped = Math.min(MAX_HZ, Math.max(MIN_HZ, hz))
  return Math.log(clamped / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)
}

/** 対数スライダー位置（0〜1） → 周波数 */
export function sliderPositionToHz(position: number): number {
  const p = Math.min(1, Math.max(0, position))
  return clampHz(MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, p))
}

/** 加算ステップ（±1, ±10 Hz）。結果は範囲内に丸める */
export function stepHz(hz: number, delta: number): number {
  return clampHz(hz + delta)
}

/** オクターブ移動（-1 で ÷2、+1 で ×2） */
export function shiftOctave(hz: number, octaves: number): number {
  return clampHz(hz * Math.pow(2, octaves))
}

/** 音量 0〜100(%) → ゲイン。知覚に合わせて 2 乗カーブ */
export function volumeToGain(volumePercent: number): number {
  const v = Math.min(100, Math.max(0, volumePercent)) / 100
  return v * v
}

export type Channel = 'left' | 'right' | 'both'

/** 出力チャンネル → StereoPanner の pan 値（左右は完全に振り切る） */
export function channelToPan(channel: Channel): number {
  return channel === 'left' ? -1 : channel === 'right' ? 1 : 0
}

/** 数値入力の文字列を Hz にパース。空・不正なら null */
export function parseHzInput(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? clampHz(n) : null
}

export function formatHz(hz: number): string {
  return Number.isInteger(hz)
    ? String(hz)
    : hz.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
