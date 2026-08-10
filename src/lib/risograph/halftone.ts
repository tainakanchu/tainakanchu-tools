/**
 * ハーフトーン(仕様書 §12)。
 * - AM スクリーン: スクリーン座標を直接計算するクラスタドット(Bayer は使わない)
 * - blue-noise: 決定的に生成した 64×64 マスク(seed 固定)
 *
 * 閾値はセル内の円形ドット成長の正確な面積 CDF を使い、
 * 二値化後の平均 coverage が入力に一致する(不偏スクリーン)。
 */
import { mulberry32 } from './random'
import type { PlateRender } from './types'

/** 単位正方形(中心原点)と半径 r の円の交差面積 */
export function circleSquareArea(r: number): number {
  if (r <= 0) return 0
  if (r >= Math.SQRT1_2) return 1
  const rr = r * r
  if (r <= 0.5) return Math.PI * rr
  // 4 つの弓形がはみ出す領域を引く
  const seg = rr * Math.acos(0.5 / r) - 0.5 * Math.sqrt(rr - 0.25)
  return Math.PI * rr - 4 * seg
}

const BN_SIZE = 64
let blueNoiseMask: Float32Array | null = null

/**
 * 決定的な blue-noise 閾値マスク(64×64)。
 * 逐次 void-filling: エネルギー最小セルへ点を置き、置くたびに
 * トーラス状ガウスカーネルを加算する。配置順 = 閾値ランク。
 */
export function getBlueNoiseMask(): Float32Array {
  if (blueNoiseMask) return blueNoiseMask
  const n = BN_SIZE * BN_SIZE
  const energy = new Float64Array(n)
  const rank = new Int32Array(n).fill(-1)
  const rng = mulberry32(7)
  // 同値タイブレークの規則性を避けるための微小ノイズ
  for (let i = 0; i < n; i++) energy[i] = rng() * 1e-6

  const sigma = 1.6
  const radius = 7
  const kernel: Array<number> = []
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      kernel.push(Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)))
    }
  }

  for (let k = 0; k < n; k++) {
    let bestIdx = -1
    let bestE = Infinity
    for (let i = 0; i < n; i++) {
      if (rank[i] >= 0) continue
      if (energy[i] < bestE) {
        bestE = energy[i]
        bestIdx = i
      }
    }
    rank[bestIdx] = k
    const px = bestIdx % BN_SIZE
    const py = Math.floor(bestIdx / BN_SIZE)
    let ki = 0
    for (let dy = -radius; dy <= radius; dy++) {
      const y = (py + dy + BN_SIZE) % BN_SIZE
      for (let dx = -radius; dx <= radius; dx++) {
        const x = (px + dx + BN_SIZE) % BN_SIZE
        energy[y * BN_SIZE + x] += kernel[ki++]
      }
    }
  }

  const mask = new Float32Array(n)
  // 閾値は (rank + 0.5)/n。coverage > threshold で不偏
  for (let i = 0; i < n; i++) mask[i] = (rank[i] + 0.5) / n
  blueNoiseMask = mask
  return mask
}

/**
 * coverage map を二値化する。method='none' はそのまま返す(コピー)。
 * dpi は AM スクリーンのセルサイズ計算に使う。
 */
export function halftonePlate(
  coverage: Float32Array,
  width: number,
  height: number,
  render: Pick<PlateRender, 'method' | 'lpi' | 'angleDeg'>,
  dpi: number,
): Float32Array {
  const out = new Float32Array(width * height)
  if (render.method === 'none') {
    out.set(coverage)
    return out
  }

  if (render.method === 'blue-noise') {
    const mask = getBlueNoiseMask()
    for (let y = 0; y < height; y++) {
      const my = (y % BN_SIZE) * BN_SIZE
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        out[idx] = coverage[idx] > mask[my + (x % BN_SIZE)] ? 1 : 0
      }
    }
    return out
  }

  // AM スクリーン(§12.3): 回転座標系のセル内円形ドット
  const rad = (render.angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const freq = render.lpi / dpi // cells per pixel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x * cos + y * sin) * freq
      const v = (-x * sin + y * cos) * freq
      const cu = u - Math.floor(u) - 0.5
      const cv = v - Math.floor(v) - 0.5
      const r = Math.hypot(cu, cv)
      // 端点保証: coverage=1 で全点が立ち、0 で全点が落ちるようにクランプ
      const threshold = Math.min(1 - 1e-6, Math.max(1e-6, circleSquareArea(r)))
      const idx = y * width + x
      out[idx] = coverage[idx] > threshold ? 1 : 0
    }
  }
  return out
}
