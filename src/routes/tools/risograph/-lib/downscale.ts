/**
 * coverage map の縮小（ボックスフィルタ）。
 * 分版フル解像度の版をプレビュー解像度へ落とすのに使う。DOM 非依存。
 */

export function downscaleCoverage(
  src: Float32Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Float32Array {
  if (srcWidth === dstWidth && srcHeight === dstHeight) {
    return Float32Array.from(src)
  }
  const out = new Float32Array(dstWidth * dstHeight)
  const xRatio = srcWidth / dstWidth
  const yRatio = srcHeight / dstHeight
  for (let y = 0; y < dstHeight; y++) {
    const y0 = Math.floor(y * yRatio)
    const y1 = Math.max(
      y0 + 1,
      Math.min(srcHeight, Math.ceil((y + 1) * yRatio)),
    )
    for (let x = 0; x < dstWidth; x++) {
      const x0 = Math.floor(x * xRatio)
      const x1 = Math.max(
        x0 + 1,
        Math.min(srcWidth, Math.ceil((x + 1) * xRatio)),
      )
      let sum = 0
      let count = 0
      for (let sy = y0; sy < y1; sy++) {
        const row = sy * srcWidth
        for (let sx = x0; sx < x1; sx++) {
          sum += src[row + sx]
          count++
        }
      }
      out[y * dstWidth + x] = count > 0 ? sum / count : 0
    }
  }
  return out
}
