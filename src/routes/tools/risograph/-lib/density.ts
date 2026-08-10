/**
 * インク濃度（実機リソのドラム濃度設定に相当）の適用と、
 * 「coverage → 濃度 → ハーフトーン」の共通経路。
 * プレビューと書き出しで同じ順序を通すため、両方からこの関数だけを呼ぶ。
 * DOM に触れない純ロジック。
 */
import { halftonePlate } from '../../../../lib/risograph/halftone'
import type { PlateSetting } from './plates'

/**
 * 濃度レベル 1〜5 に対応する面積率の倍率。
 * 3 が標準（等倍）で、下げると薄く・上げると濃く刷った見えになる。
 */
export const DENSITY_SCALES: ReadonlyArray<number> = [0.55, 0.8, 1.0, 1.2, 1.45]

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** 濃度レベル（1〜5、範囲外はクランプ）を面積率の倍率へ直す */
export function densityScale(level: number): number {
  const rounded = Math.round(Number.isFinite(level) ? level : 3)
  const clamped = Math.min(DENSITY_SCALES.length, Math.max(1, rounded))
  return DENSITY_SCALES[clamped - 1]
}

/**
 * coverage へ濃度倍率を掛けて 0..1 に収めた新しい配列を返す（入力は変更しない）。
 * 標準の 3 は等倍なのでコピーだけ返す。
 */
export function applyDensity(map: Float32Array, level: number): Float32Array {
  const scale = densityScale(level)
  const out = new Float32Array(map.length)
  if (scale === 1) {
    out.set(map)
    return out
  }
  for (let i = 0; i < map.length; i++) out[i] = clamp01(map[i] * scale)
  return out
}

/**
 * 版設定を反映した coverage を作る。
 * 濃度はハーフトーンより前に掛ける（実機で濃度を上げるほど網点が太る挙動に合わせる）。
 */
export function renderPlateCoverage(
  map: Float32Array,
  width: number,
  height: number,
  setting: PlateSetting,
  dpi: number,
): Float32Array {
  return halftonePlate(
    applyDensity(map, setting.density),
    width,
    height,
    setting,
    dpi,
  )
}
