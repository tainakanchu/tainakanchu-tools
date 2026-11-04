/**
 * 写真の読み込みと加工（ブラウザ依存）。
 * ファイルは createImageBitmap でローカルに読むだけで、どこにも送らない。
 */
import { applyTint, rgbToHex } from './color'
import { coverCrop } from './layouts'
import { extractSwatches } from './palette-extract'
import type { RGB, TintMode } from './color'
import type { Rect } from './fit'
import type { Swatch } from './palette-extract'

/** 書き出しの最大長辺 1920px の約 1.5 倍。拡大しても粗が出にくく、メモリも抑えられる */
export const PHOTO_MAX_LONG_SIDE = 2880

export type LoadedPhoto = {
  /** 加工キャッシュのキー */
  id: string
  name: string
  source: HTMLCanvasElement | ImageBitmap
  width: number
  height: number
  /** 写真の代表色（「写真から作る」の見本） */
  swatches: Array<Swatch>
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
 * 128px に縮めた画素から代表色（k-means）も取っておく。
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
  // 縦横比を保って長辺 128px に縮める
  const k = 128 / Math.max(width, height)
  const sw = Math.max(1, Math.round(width * k))
  const sh = Math.max(1, Math.round(height * k))
  const sample = createCanvas(sw, sh)
  const sctx = get2d(sample)
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(source, 0, 0, sw, sh)
  const data = sctx.getImageData(0, 0, sw, sh).data
  photoCounter += 1
  return {
    id: `photo-${photoCounter}`,
    name: file.name,
    source,
    width,
    height,
    swatches: extractSwatches(data),
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
const CACHE_LIMIT = 8

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
  /** 色調に使う 3 色（暗部 → 中間 → 明部） */
  stops: readonly [RGB, RGB, RGB],
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
    effect.tint === 'none' || effect.tint === 'mono'
      ? ''
      : stops.map((c) => rgbToHex(c)).join(','),
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
    applyTint(image.data, effect.tint, stops, {
      width: w,
      // ドットは出力幅 1080px で 3px 角（縮めて見ても粒が分かる大きさ）
      cell: Math.max(2, Math.round(w / 360)),
    })
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

const samplers = new WeakMap<
  HTMLCanvasElement,
  { at: (x: number, y: number) => RGB; step: number }
>()

/**
 * 加工済みの写真を 1/8 に縮め、書き出し座標の (x, y) の色を返す関数を作る。
 * 文字の後ろの画素の明るさを測るのに使う（縮小で 8px 角の平均になる）。
 */
export function photoSampler(canvas: HTMLCanvasElement): {
  at: (x: number, y: number) => RGB
  step: number
} {
  const hit = samplers.get(canvas)
  if (hit) return hit
  const step = 8
  const w = Math.max(1, Math.round(canvas.width / step))
  const h = Math.max(1, Math.round(canvas.height / step))
  const small = createCanvas(w, h)
  const sctx = get2d(small)
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(canvas, 0, 0, w, h)
  const data = sctx.getImageData(0, 0, w, h).data
  const kx = w / canvas.width
  const ky = h / canvas.height
  const at = (x: number, y: number): RGB => {
    const px = Math.min(w - 1, Math.max(0, Math.floor(x * kx)))
    const py = Math.min(h - 1, Math.max(0, Math.floor(y * ky)))
    const i = (py * w + px) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }
  const sampler = { at, step: canvas.width / w }
  samplers.set(canvas, sampler)
  return sampler
}
