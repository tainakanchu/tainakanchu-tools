/**
 * 書き出しの解像度と形式（純粋関数）。
 *
 * レイアウトはすべて論理 px（4:5 なら 1080×1350）で組み、書き出すときだけ
 * canvas を倍率ぶん大きくして ctx.scale(倍率) で描く（devicePixelRatio と同じ考え方）。
 * ctx.scale が効かないもの（shadowBlur・canvas の filter・画素を直接いじる加工）は
 * ここの関数で装置の px に直す。
 */
import type { CanvasSize } from './layouts'

export type ExportScale = 1 | 2 | 3

export const EXPORT_SCALES: ReadonlyArray<{
  value: ExportScale
  label: string
}> = [
  { value: 1, label: '標準' },
  { value: 2, label: '高解像度' },
  { value: 3, label: '最高' },
]

export const DEFAULT_EXPORT_SCALE: ExportScale = 2

/** 書き出しの長辺の上限（これを超える倍率は選べない） */
export const MAX_EXPORT_LONG_SIDE = 4096

type Size = Pick<CanvasSize, 'width' | 'height'>

/** このサイズで選べるいちばん大きい倍率 */
export function maxExportScale(size: Size): ExportScale {
  const long = Math.max(size.width, size.height)
  const k = Math.floor(MAX_EXPORT_LONG_SIDE / long)
  return k >= 3 ? 3 : k >= 2 ? 2 : 1
}

/** 選んだ倍率を、このサイズで使える倍率に収める */
export function effectiveScale(size: Size, want: ExportScale): ExportScale {
  const max = maxExportScale(size)
  return want > max ? max : want
}

/** 書き出す画像の実際の画素数 */
export function exportPixelSize(
  size: Size,
  scale: number,
): { width: number; height: number } {
  return {
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
  }
}

/** 論理 px を装置の px に（shadowBlur・filter の blur など、ctx.scale が効かない値） */
export function devicePx(logical: number, scale: number): number {
  return logical * scale
}

/**
 * ドット（Bayer）の 1 マスの大きさ（装置の px）。
 * 論理幅 1080px で 3px 角を倍率ぶん大きくする（2x でも縮めれば 1x と同じ粒になる）。
 */
export function ditherCellPx(logicalWidth: number, scale: number): number {
  const s = Math.max(1, Math.round(scale))
  return s * Math.max(2, Math.round(logicalWidth / 360))
}

// ---------------------------------------------------------------------------
// 形式
// ---------------------------------------------------------------------------

export type FormatChoice = 'auto' | 'png' | 'jpeg'

export const FORMAT_CHOICES: ReadonlyArray<{
  value: FormatChoice
  label: string
}> = [
  { value: 'auto', label: '自動' },
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
]

export const DEFAULT_FORMAT: FormatChoice = 'auto'

export const JPEG_QUALITY = 0.92

export type OutputFormat = {
  mime: 'image/png' | 'image/jpeg'
  ext: 'png' | 'jpg'
  /** toBlob に渡す品質（PNG は無し） */
  quality?: number
}

const PNG: OutputFormat = { mime: 'image/png', ext: 'png' }
const JPEG: OutputFormat = {
  mime: 'image/jpeg',
  ext: 'jpg',
  quality: JPEG_QUALITY,
}

/**
 * 書き出しの形式。写真が無ければ常に PNG（文字と面だけなので PNG の方が小さく、くっきり）。
 * 写真があるときの「自動」は JPEG（写真入りの PNG は数 MB になる）。
 */
export function outputFormat(
  hasPhoto: boolean,
  choice: FormatChoice,
): OutputFormat {
  if (!hasPhoto) return PNG
  return choice === 'png' ? PNG : JPEG
}

export function exportFileName(
  base: string,
  index: number,
  count: number,
  ext: string,
): string {
  const name = base || 'setlist'
  return count > 1 ? `${name}-${index + 1}.${ext}` : `${name}.${ext}`
}

/** X（旧 Twitter）が画像をそのまま受け付ける目安 */
export const X_IMAGE_LIMIT_BYTES = 5 * 1024 * 1024

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// 写真
// ---------------------------------------------------------------------------

/**
 * 読み込んだ写真を縮める上限の長辺。2x の 9:16（長辺 3840px）でも拡大せずに済み、
 * canvas の上限（多くの端末で 4096px 前後から不安定）にも収まる。
 */
export const PHOTO_MAX_LONG_SIDE = MAX_EXPORT_LONG_SIDE

/** 長辺を max までに縮めた大きさ（縮める必要が無ければ null） */
export function fitLongSide(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } | null {
  const long = Math.max(width, height)
  if (long <= max) return null
  const k = max / long
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  }
}
