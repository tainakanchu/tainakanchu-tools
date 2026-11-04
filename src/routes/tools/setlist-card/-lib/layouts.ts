/**
 * 書き出しサイズ・レイアウト・写真の配置（純粋な幾何計算）。
 */
import type { Rect } from './fit'

export type CanvasSize = {
  id: 'portrait' | 'story' | 'square' | 'wide'
  label: string
  note: string
  width: number
  height: number
}

export const CANVAS_SIZES: ReadonlyArray<CanvasSize> = [
  { id: 'portrait', label: '4:5', note: '投稿', width: 1080, height: 1350 },
  {
    id: 'story',
    label: '9:16',
    note: 'ストーリーズ',
    width: 1080,
    height: 1920,
  },
  { id: 'square', label: '1:1', note: '正方形', width: 1080, height: 1080 },
  { id: 'wide', label: '16:9', note: '横長', width: 1200, height: 675 },
]

export type LayoutId = 'list' | 'columns' | 'poster'

export const LAYOUTS: ReadonlyArray<{
  id: LayoutId
  name: string
  note: string
}> = [
  { id: 'list', name: 'リスト', note: '定番の縦リスト' },
  { id: 'columns', name: '段組み', note: '長いセット向け・1〜3 段' },
  { id: 'poster', name: 'ポスター', note: 'フライヤー風' },
]

export function getSize(id: string): CanvasSize {
  return CANVAS_SIZES.find((s) => s.id === id) ?? CANVAS_SIZES[0]
}

export function isLandscape(size: { width: number; height: number }): boolean {
  return size.width > size.height * 1.3
}

/** 画像の置き方 */
export type PhotoMode = 'background' | 'block'

export type PhotoSettings = {
  mode: PhotoMode
  /** 切り抜き位置 0..1（0.5 が中央） */
  posX: number
  posY: number
  /** 1 = cover ちょうど */
  zoom: number
  /** 文字を読みやすくする暗幕 0..1 */
  dim: number
  /** ぼかし（書き出し解像度での px） */
  blur: number
  tint: 'none' | 'mono' | 'duotone'
  /** 画像から取った色をアクセントにする */
  useImageAccent: boolean
}

export const DEFAULT_PHOTO_SETTINGS: PhotoSettings = {
  mode: 'block',
  posX: 0.5,
  posY: 0.5,
  zoom: 1,
  dim: 0.55,
  blur: 0,
  tint: 'none',
  useImageAccent: false,
}

/** 写真枠の高さ比（縦長・正方形は上に帯で置く） */
const BAND_RATIO: Record<
  LayoutId,
  Record<Exclude<CanvasSize['id'], 'wide'>, number>
> = {
  // リストは見出しを写真の下部に重ねるので、帯を広めに取る
  list: { portrait: 0.42, story: 0.4, square: 0.42 },
  columns: { portrait: 0.24, story: 0.28, square: 0.22 },
  poster: { portrait: 0.44, story: 0.46, square: 0.4 },
}

/** 横長で横に置くときの幅比 */
const SIDE_RATIO: Record<LayoutId, number> = {
  list: 0.4,
  columns: 0.34,
  poster: 0.42,
}

export type PhotoPlan = {
  photo: Rect
  /** 文字を置く残りの領域 */
  content: Rect
  /** 写真がどちら側にあるか */
  side: 'top' | 'left' | 'right'
}

/**
 * 写真枠モードでの写真と本文の領域。
 * 縦長・正方形は上の帯、横長は横の柱（ポスターだけ右側）。
 * 本文が狭くなりすぎる組み合わせは null を返し、呼び出し側は全面背景に戻す。
 */
export function planPhotoBlock(
  layout: LayoutId,
  size: CanvasSize,
): PhotoPlan | null {
  const { width: W, height: H } = size
  if (size.id === 'wide' || isLandscape(size)) {
    const pw = Math.round(W * SIDE_RATIO[layout])
    if (W - pw < W * 0.5) return null
    if (layout === 'poster') {
      return {
        photo: { x: W - pw, y: 0, w: pw, h: H },
        content: { x: 0, y: 0, w: W - pw, h: H },
        side: 'right',
      }
    }
    return {
      photo: { x: 0, y: 0, w: pw, h: H },
      content: { x: pw, y: 0, w: W - pw, h: H },
      side: 'left',
    }
  }
  const ratio = BAND_RATIO[layout][size.id]
  const ph = Math.round(H * ratio)
  if (H - ph < H * 0.5) return null
  return {
    photo: { x: 0, y: 0, w: W, h: ph },
    content: { x: 0, y: ph, w: W, h: H - ph },
    side: 'top',
  }
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))

export type Crop = { sx: number; sy: number; sw: number; sh: number }

/**
 * 画像を枠いっぱいに cover で敷くときの切り出し範囲。
 * zoom で範囲を狭め、posX / posY（0..1）で余った分のどこを使うか決める。
 */
export function coverCrop(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  zoom: number,
  posX: number,
  posY: number,
): Crop {
  const scale = Math.max(dstW / srcW, dstH / srcH) * Math.max(1, zoom)
  const sw = Math.min(srcW, dstW / scale)
  const sh = Math.min(srcH, dstH / scale)
  return {
    sx: (srcW - sw) * clamp(posX),
    sy: (srcH - sh) * clamp(posY),
    sw,
    sh,
  }
}

/**
 * プレビュー上のドラッグ量（書き出し座標の px）を posX / posY の変化量にする。
 * 画像を掴んで動かす感覚にするため、右へドラッグすると左側が見える（pos が減る）。
 */
export function panDelta(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  zoom: number,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const crop = coverCrop(srcW, srcH, dstW, dstH, zoom, 0.5, 0.5)
  // 枠の px あたり、画像の何 px か
  const k = crop.sw / dstW
  const spareX = srcW - crop.sw
  const spareY = srcH - crop.sh
  return {
    dx: spareX > 0.5 ? (-dx * k) / spareX : 0,
    dy: spareY > 0.5 ? (-dy * k) / spareY : 0,
  }
}

// ---------------------------------------------------------------------------
// 密度（最小文字サイズ・段数・ページ分割）
// ---------------------------------------------------------------------------

/** 読める最小の文字サイズ（幅 1080px で 20px、出力幅に比例） */
export function minLegibleFont(size: { width: number }): number {
  return (20 * size.width) / 1080
}

/** 1 段の最小幅（最小文字サイズで 15 文字ぶん） */
export function minColumnWidth(size: { width: number }): number {
  return minLegibleFont(size) * 15
}

/** この幅で読める段数の上限（最大 3） */
export function maxColumnsFor(
  size: { width: number },
  areaWidth: number,
  gap: number,
): number {
  const n = Math.floor((areaWidth + gap) / (minColumnWidth(size) + gap))
  return Math.max(1, Math.min(3, n))
}

export type ColumnsSetting = 'auto' | 1 | 2 | 3

/** 段組みの候補（自動なら 1〜上限、手動なら上限で頭打ち） */
export function columnOptions(
  setting: ColumnsSetting,
  max: number,
): Array<number> {
  if (setting === 'auto') return Array.from({ length: max }, (_, i) => i + 1)
  return [Math.min(setting, max)]
}

export const MAX_PAGES = 10

/**
 * 曲を pages 枚に均等に分ける（先頭のページから 1 曲ずつ多くする）。
 * 返すのは各ページの [start, end) の範囲。
 */
export function splitEvenly(
  count: number,
  pages: number,
): Array<{ start: number; end: number }> {
  const n = Math.max(1, Math.min(pages, Math.max(1, count)))
  const base = Math.floor(count / n)
  const extra = count % n
  const ranges: Array<{ start: number; end: number }> = []
  let start = 0
  for (let i = 0; i < n; i++) {
    const len = base + (i < extra ? 1 : 0)
    ranges.push({ start, end: start + len })
    start += len
  }
  return ranges
}

// ---------------------------------------------------------------------------
// 飾りのレコード盤の置き場所
// ---------------------------------------------------------------------------

function circleHitsRect(
  cx: number,
  cy: number,
  r: number,
  rect: Rect,
): boolean {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w))
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h))
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r
}

/**
 * 文字のどれにも重ならない、なるべく大きなレコード盤の位置を探す。
 * 盤は画面の左右の端からはみ出させる（その方が飾りらしく見える）。右側・上寄りを優先。
 * 置けなければ null（無理に重ねない）。
 */
export function placeDisc(opts: {
  width: number
  height: number
  /** 避ける領域（文字や帯） */
  avoid: ReadonlyArray<Rect>
  radii: ReadonlyArray<number>
  margin: number
  step: number
}): { cx: number; cy: number; r: number } | null {
  const { width: W, height: H, avoid, margin, step } = opts
  for (const r of opts.radii) {
    const xs = [W - r * 0.3, W - r * 0.55, W - r * 0.8, r * 0.3, r * 0.55]
    for (const cx of xs) {
      for (let cy = r * 0.4; cy <= H - r * 0.4; cy += step) {
        if (!avoid.some((rect) => circleHitsRect(cx, cy, r + margin, rect))) {
          return { cx, cy, r }
        }
      }
    }
  }
  return null
}
