/**
 * 写真の読み込みと加工（ブラウザ依存）。
 * ファイルは createImageBitmap でローカルに読むだけで、どこにも送らない。
 */
import { applyTint, averageColor, hexToRgb, pickAccentColor } from './color'
import { coverCrop } from './layouts'
import type { RGB, TintMode } from './color'
import type { Rect } from './fit'
import type { Theme } from './themes'

/** 書き出しの最大長辺 1920px の約 1.5 倍。拡大しても粗が出にくく、メモリも抑えられる */
export const PHOTO_MAX_LONG_SIDE = 2880

export type LoadedPhoto = {
  /** 加工キャッシュのキー */
  id: string
  name: string
  source: HTMLCanvasElement | ImageBitmap
  width: number
  height: number
  /** 平均色（文字色の自動調整に使う） */
  average: RGB
  /** アクセント候補（無彩色の画像なら undefined） */
  accent: RGB | undefined
}

let photoCounter = 0

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas の 2D コンテキストを取得できませんでした')
  return ctx
}

/**
 * EXIF の向きを反映して読み込み、長辺 PHOTO_MAX_LONG_SIDE までに縮める。
 * 縮小後の小さなサンプルから平均色とアクセント候補も取っておく。
 */
export async function loadPhoto(file: File): Promise<LoadedPhoto> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  })
  let source: HTMLCanvasElement | ImageBitmap = bitmap
  let { width, height } = bitmap
  const long = Math.max(width, height)
  if (long > PHOTO_MAX_LONG_SIDE) {
    const scale = PHOTO_MAX_LONG_SIDE / long
    width = Math.round(width * scale)
    height = Math.round(height * scale)
    const canvas = createCanvas(width, height)
    const ctx = get2d(canvas)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    source = canvas
  }
  const sampleSize = 48
  const sample = createCanvas(sampleSize, sampleSize)
  const sctx = get2d(sample)
  sctx.drawImage(source, 0, 0, sampleSize, sampleSize)
  const data = sctx.getImageData(0, 0, sampleSize, sampleSize).data
  photoCounter += 1
  return {
    id: `photo-${photoCounter}`,
    name: file.name,
    source,
    width,
    height,
    average: averageColor(data),
    accent: pickAccentColor(data),
  }
}

export function disposePhoto(photo: LoadedPhoto): void {
  if ('close' in photo.source) photo.source.close()
}

export type PhotoEffect = {
  zoom: number
  posX: number
  posY: number
  blur: number
  tint: TintMode
}

const cache = new Map<string, HTMLCanvasElement>()
const CACHE_LIMIT = 4

function supportsCanvasFilter(ctx: CanvasRenderingContext2D): boolean {
  if (!('filter' in ctx)) return false
  ctx.filter = 'blur(1px)'
  const ok = ctx.filter === 'blur(1px)'
  ctx.filter = 'none'
  return ok
}

/**
 * 枠のサイズに cover で切り抜き、ぼかしと色調を掛けた画像を返す。
 * 文字を打ち直すたびに重い加工をやり直さないよう、条件ごとにキャッシュする。
 */
export function processedPhoto(
  photo: LoadedPhoto,
  rect: Rect,
  effect: PhotoEffect,
  theme: Theme,
): HTMLCanvasElement {
  const w = Math.max(1, Math.round(rect.w))
  const h = Math.max(1, Math.round(rect.h))
  const key = [
    photo.id,
    w,
    h,
    effect.zoom.toFixed(3),
    effect.posX.toFixed(3),
    effect.posY.toFixed(3),
    effect.blur.toFixed(1),
    effect.tint,
    effect.tint === 'duotone' ? theme.duotone.join(',') : '',
  ].join('|')
  const hit = cache.get(key)
  if (hit) {
    // LRU: 使ったものを末尾へ
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }

  const canvas = createCanvas(w, h)
  const ctx = get2d(canvas)
  const blur = Math.max(0, effect.blur)
  // ぼかすと縁が透けるので、ぼかし半径ぶん大きく描いてはみ出させる
  const margin = blur > 0 ? Math.ceil(blur * 2) : 0
  const crop = coverCrop(
    photo.width,
    photo.height,
    w + margin * 2,
    h + margin * 2,
    effect.zoom,
    effect.posX,
    effect.posY,
  )
  if (blur > 0 && supportsCanvasFilter(ctx)) {
    ctx.filter = `blur(${blur}px)`
    ctx.drawImage(
      photo.source,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      -margin,
      -margin,
      w + margin * 2,
      h + margin * 2,
    )
    ctx.filter = 'none'
  } else if (blur > 0) {
    // ctx.filter が効かないブラウザ向け: 縮小 → 拡大でぼかす
    const factor = Math.max(1, blur / 2)
    const sw = Math.max(1, Math.round(w / factor))
    const sh = Math.max(1, Math.round(h / factor))
    const small = createCanvas(sw, sh)
    const sctx = get2d(small)
    sctx.imageSmoothingQuality = 'high'
    const inner = coverCrop(
      photo.width,
      photo.height,
      w,
      h,
      effect.zoom,
      effect.posX,
      effect.posY,
    )
    sctx.drawImage(
      photo.source,
      inner.sx,
      inner.sy,
      inner.sw,
      inner.sh,
      0,
      0,
      sw,
      sh,
    )
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(small, 0, 0, w, h)
  } else {
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(photo.source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h)
  }

  if (effect.tint !== 'none') {
    const image = ctx.getImageData(0, 0, w, h)
    const [a, b, c] = theme.duotone
    applyTint(image.data, effect.tint, [hexToRgb(a), hexToRgb(b), hexToRgb(c)])
    ctx.putImageData(image, 0, 0)
  }

  cache.set(key, canvas)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return canvas
}

/** 加工後の平均色の近似（duotone / mono を反映） */
export function effectiveAverage(
  photo: LoadedPhoto,
  tint: TintMode,
  theme: Theme,
): RGB {
  if (tint === 'none') return photo.average
  const data = new Uint8ClampedArray([...photo.average, 255])
  const [a, b, c] = theme.duotone
  applyTint(data, tint, [hexToRgb(a), hexToRgb(b), hexToRgb(c)])
  return [data[0], data[1], data[2]]
}
