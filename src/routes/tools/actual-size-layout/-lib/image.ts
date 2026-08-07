export const PRINT_DPI = 300

export function mmToPx(mm: number, dpi: number = PRINT_DPI): number {
  return (mm / 25.4) * dpi
}

export function fitWithin(
  size: { width: number; height: number },
  max: { maxWidth: number; maxHeight: number },
): { width: number; height: number } {
  const scale = Math.min(
    1,
    max.maxWidth / size.width,
    max.maxHeight / size.height,
  )
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- readAsDataURL() 使用のため result は string になる (ArrayBuffer にはならない)
      resolve(reader.result as string)
    })
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

export async function compressImageFile(
  file: File,
  target: { widthMm: number; heightMm: number; dpi?: number },
): Promise<string> {
  const dpi = target.dpi ?? PRINT_DPI
  let bitmap: ImageBitmap | undefined

  try {
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      // HEIC などブラウザ未対応フォーマットは dataURL をそのまま返す
      return readFileAsDataUrl(file)
    }

    const maxWidth = Math.ceil(mmToPx(target.widthMm, dpi))
    const maxHeight = Math.ceil(mmToPx(target.heightMm, dpi))
    const fitted = fitWithin(
      { width: bitmap.width, height: bitmap.height },
      { maxWidth, maxHeight },
    )

    // 縮小不要なら再エンコードせず品質を保つ
    if (fitted.width === bitmap.width && fitted.height === bitmap.height) {
      return readFileAsDataUrl(file)
    }

    const canvas = document.createElement('canvas')
    canvas.width = fitted.width
    canvas.height = fitted.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return readFileAsDataUrl(file)
    }

    const isPng = file.type === 'image/png'
    if (!isPng) {
      // JPEG では透明部分が黒になるのを防ぐため白で塗りつぶす
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    ctx.drawImage(bitmap, 0, 0, fitted.width, fitted.height)

    if (isPng) {
      return canvas.toDataURL('image/png')
    }
    return canvas.toDataURL('image/jpeg', 0.9)
  } finally {
    bitmap?.close()
  }
}
