/**
 * ハーフトーン(仕様書 §12)。
 * - AM スクリーン: スクリーン座標を直接計算するクラスタドット(Bayer は使わない)
 * - blue-noise: 決定的に生成した 64×64 マスク(seed 固定)
 * - grain: 実機 RISO の「グレインタッチ」相当の誤差拡散スクリーン
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

/** グレインの閾値ジッタ幅(±) */
const GRAIN_JITTER = 0.08

/**
 * 座標から決定的なジッタを作る(mulberry32 と同じ混合を座標ハッシュに使う)。
 * Math.random は使わない。誤差拡散はエラーを保存するので平均は不偏のまま。
 */
function grainJitter(x: number, y: number): number {
  let t =
    (Math.imul(x, 0x27d4eb2d) + Math.imul(y, 0x165667b1) + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return (u - 0.5) * 2 * GRAIN_JITTER
}

/**
 * 蛇行(serpentine)Floyd–Steinberg 誤差拡散。
 * 偶数行は左→右、奇数行は右→左でカーネルも左右反転させ、
 * 一方向走査で出る筋状のアーティファクトを抑える。
 * 線数・角度・dpi は使わない(グレインに線数の概念は無い)。
 */
function grainDiffusion(
  coverage: Float32Array,
  width: number,
  height: number,
  out: Float32Array,
): Float32Array {
  // 誤差を足し込む作業バッファ(入力は破壊しない)
  const buf = new Float32Array(width * height)
  buf.set(coverage)

  for (let y = 0; y < height; y++) {
    const leftToRight = (y & 1) === 0
    const step = leftToRight ? 1 : -1
    const xStart = leftToRight ? 0 : width - 1
    const xEnd = leftToRight ? width : -1
    const hasNextRow = y + 1 < height
    const nextRow = (y + 1) * width

    for (let x = xStart; x !== xEnd; x += step) {
      const idx = y * width + x
      const v = buf[idx]
      // 閾値 0.5 に決定的なジッタを与えて粒状感を出す
      const bit = v > 0.5 + grainJitter(x, y) ? 1 : 0
      out[idx] = bit
      const err = v - bit
      if (err === 0) continue

      // 進行方向を +step として 7/16, 3/16, 5/16, 1/16 を配る
      const xf = x + step
      const xb = x - step
      if (xf >= 0 && xf < width) buf[idx + step] += err * (7 / 16)
      if (hasNextRow) {
        if (xb >= 0 && xb < width) buf[nextRow + xb] += err * (3 / 16)
        buf[nextRow + x] += err * (5 / 16)
        if (xf >= 0 && xf < width) buf[nextRow + xf] += err * (1 / 16)
      }
    }
  }
  return out
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

  if (render.method === 'grain') {
    return grainDiffusion(coverage, width, height, out)
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
