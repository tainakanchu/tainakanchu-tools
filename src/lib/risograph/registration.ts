/**
 * 版ズレ(仕様書 §13)。
 * seed 固定のランダムモードと、プレビュー用の座標変換パラメータ。
 */
import { mulberry32 } from './random'

export interface RegistrationError {
  offsetMm: { x: number; y: number }
  rotationDeg: number
}

/**
 * §13.2 ランダムモード: offset 0.5–2.0mm(一様)・向きランダム、回転 ±0.5°。
 * seed 固定で再現可能。
 */
export function randomRegistration(
  seed: number,
  plateCount: number,
): RegistrationError[] {
  const rng = mulberry32(seed)
  const errors: RegistrationError[] = []
  for (let i = 0; i < plateCount; i++) {
    if (i === 0) {
      // 1 版目は基準
      errors.push({ offsetMm: { x: 0, y: 0 }, rotationDeg: 0 })
      continue
    }
    const magnitude = 0.5 + rng() * 1.5
    const direction = rng() * Math.PI * 2
    const rotation = (rng() * 2 - 1) * 0.5
    errors.push({
      offsetMm: {
        x: magnitude * Math.cos(direction),
        y: magnitude * Math.sin(direction),
      },
      rotationDeg: rotation,
    })
  }
  return errors
}

export interface PlateTransformPx {
  offsetXPx: number
  offsetYPx: number
  rotationDeg: number
}

export function mmToPx(mm: number, dpi: number): number {
  return (mm / 25.4) * dpi
}

/**
 * 変換済み座標で plate を bilinear サンプリングする。
 * (x, y) は出力座標。中心回転 + オフセットの逆変換で元座標を引く。
 * 範囲外は 0(インク無し)。
 */
export function samplePlate(
  plate: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  t: PlateTransformPx,
): number {
  const cx = width / 2
  const cy = height / 2
  const rad = (-t.rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = x - t.offsetXPx - cx
  const dy = y - t.offsetYPx - cy
  const sx = dx * cos - dy * sin + cx
  const sy = dx * sin + dy * cos + cy

  if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) return 0
  const x0 = Math.floor(sx)
  const y0 = Math.floor(sy)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const tx = sx - x0
  const ty = sy - y0
  const v00 = plate[y0 * width + x0]
  const v01 = plate[y0 * width + x1]
  const v10 = plate[y1 * width + x0]
  const v11 = plate[y1 * width + x1]
  return (
    v00 * (1 - tx) * (1 - ty) +
    v01 * tx * (1 - ty) +
    v10 * (1 - tx) * ty +
    v11 * tx * ty
  )
}
