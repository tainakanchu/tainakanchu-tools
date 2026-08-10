/**
 * 画像の読み込みと canvas 周りのブラウザ依存ヘルパー。
 */
import { fitLongSide } from './plates'

export type LoadedImage = {
  fileName: string
  width: number
  height: number
  /** 分版解像度の sRGB 8bit RGBA */
  rgba: Uint8ClampedArray<ArrayBuffer>
  /** 表示用（縮小済みの PNG data URL） */
  dataUrl: string
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas の 2D コンテキストを取得できませんでした')
  return ctx
}

/** 長辺 maxLongSide まで縮小して RGBA を取り出す */
export async function loadImageFile(
  file: File,
  maxLongSide: number,
): Promise<LoadedImage> {
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file)
    const fitted = fitLongSide(bitmap.width, bitmap.height, maxLongSide)
    const canvas = createCanvas(fitted.width, fitted.height)
    const ctx = get2d(canvas)
    // 透過画像は白紙に置いた状態で分版する（紙に刷るツールなので背景は紙白）
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, fitted.width, fitted.height)
    ctx.drawImage(bitmap, 0, 0, fitted.width, fitted.height)
    const imageData = ctx.getImageData(0, 0, fitted.width, fitted.height)
    return {
      fileName: file.name,
      width: fitted.width,
      height: fitted.height,
      rgba: imageData.data,
      dataUrl: canvas.toDataURL('image/png'),
    }
  } finally {
    bitmap?.close()
  }
}

/** RGBA バッファを canvas へ流し込む（サイズも合わせる） */
export function putRgbaToCanvas(
  canvas: HTMLCanvasElement,
  rgba: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
): void {
  canvas.width = width
  canvas.height = height
  const ctx = get2d(canvas)
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0)
}

/** coverage(0..1) を「0%=白 / 100%=黒」のグレースケール RGBA へ変換する */
export function coverageToGrayscale(
  coverage: Float32Array,
  out: Uint8ClampedArray<ArrayBuffer>,
): void {
  for (let i = 0; i < coverage.length; i++) {
    const v = Math.round((1 - Math.min(1, Math.max(0, coverage[i]))) * 255)
    const o = i * 4
    out[o] = v
    out[o + 1] = v
    out[o + 2] = v
    out[o + 3] = 255
  }
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG の生成に失敗しました'))
    }, 'image/png')
  })
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // click 直後に revoke するとダウンロードが始まらないブラウザがあるので少し待つ
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** オフスクリーン canvas に RGBA を書いて PNG として保存する */
export async function downloadRgbaAsPng(
  rgba: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  fileName: string,
): Promise<void> {
  const canvas = createCanvas(width, height)
  putRgbaToCanvas(canvas, rgba, width, height)
  const blob = await canvasToPngBlob(canvas)
  downloadBlob(blob, fileName)
}
