/**
 * OKLab / OKLCH（知覚的に均等な色空間）との変換と、色相を保ったままの明度調整。
 * 写真からの色の抽出（k-means の距離）と、コントラスト不足の補正に使う。
 * canvas に依存しない純粋関数。
 */
import { contrastRatio } from './color'
import type { RGB } from './color'

export type Lab = readonly [number, number, number]
/** [L 0..1, C 0..~0.37, h 0..360] */
export type Lch = readonly [number, number, number]

const toLinear = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return c * 255
}

export function rgbToOklab([r, g, b]: RGB): Lab {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** sRGB の範囲外は undefined（呼び出し側で彩度を落として収める） */
function oklabToRgbRaw([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

const inGamut = (rgb: ReadonlyArray<number>) =>
  rgb.every((v) => Number.isFinite(v) && v >= -0.5 && v <= 255.5)

const clampByte = (v: number) => Math.min(255, Math.max(0, v))

export function oklabToRgb(lab: Lab): RGB {
  const [r, g, b] = oklabToRgbRaw(lab)
  return [clampByte(r), clampByte(g), clampByte(b)]
}

export function oklabToOklch([L, a, b]: Lab): Lch {
  const C = Math.hypot(a, b)
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  return [L, C, h]
}

export function oklchToOklab([L, C, h]: Lch): Lab {
  const rad = (h * Math.PI) / 180
  return [L, C * Math.cos(rad), C * Math.sin(rad)]
}

export function rgbToOklch(rgb: RGB): Lch {
  return oklabToOklch(rgbToOklab(rgb))
}

/**
 * OKLCH から sRGB。範囲外なら色相と明度を保ったまま彩度を落として収める
 * （そのままクリップすると色相がずれるため）。
 */
export function oklchToRgb([L, C, h]: Lch): RGB {
  const l = Math.min(1, Math.max(0, L))
  let lo = 0
  let hi = Math.max(0, C)
  const raw = oklabToRgbRaw(oklchToOklab([l, hi, h]))
  if (inGamut(raw))
    return [clampByte(raw[0]), clampByte(raw[1]), clampByte(raw[2])]
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklabToRgbRaw(oklchToOklab([l, mid, h])))) lo = mid
    else hi = mid
  }
  return oklabToRgb(oklchToOklab([l, lo, h]))
}

/** OKLab の距離（ΔE_ok）。0.02 で見分けがつく程度、0.1 ではっきり違う */
export function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** 明度だけを変えた色（色相・彩度は保つ。範囲外なら彩度を落とす） */
export function withLightness(rgb: RGB, L: number): RGB {
  const [, C, h] = rgbToOklch(rgb)
  return oklchToRgb([L, C, h])
}

/** 彩度を上限で抑えた色 */
export function withMaxChroma(rgb: RGB, maxC: number): RGB {
  const [L, C, h] = rgbToOklch(rgb)
  return oklchToRgb([L, Math.min(C, maxC), h])
}

/**
 * bg とのコントラストが min に届くまで OKLCH の明度だけを動かす（色相は保つ）。
 * 明るくする向きと暗くする向きのうち、届く方で元の明度に近い方を選ぶ。
 * どちらでも届かなければ、届く限り離した方（白か黒に近い色）を返す。
 */
export function fixContrast(color: RGB, bg: RGB, min: number): RGB {
  if (contrastRatio(color, bg) >= min) return color
  const [L0, C, h] = rgbToOklch(color)
  const search = (dir: 1 | -1): { rgb: RGB; ok: boolean } => {
    // 端（L=1 / L=0）でも届かなければ失敗
    const end = oklchToRgb([dir > 0 ? 1 : 0, C, h])
    if (contrastRatio(end, bg) < min) return { rgb: end, ok: false }
    let near = L0
    let far = dir > 0 ? 1 : 0
    for (let i = 0; i < 24; i++) {
      const mid = (near + far) / 2
      if (contrastRatio(oklchToRgb([mid, C, h]), bg) >= min) far = mid
      else near = mid
    }
    return { rgb: oklchToRgb([far, C, h]), ok: true }
  }
  const up = search(1)
  const down = search(-1)
  if (up.ok && down.ok) {
    const du = Math.abs(rgbToOklch(up.rgb)[0] - L0)
    const dd = Math.abs(rgbToOklch(down.rgb)[0] - L0)
    return du <= dd ? up.rgb : down.rgb
  }
  if (up.ok) return up.rgb
  if (down.ok) return down.rgb
  return contrastRatio(up.rgb, bg) >= contrastRatio(down.rgb, bg)
    ? up.rgb
    : down.rgb
}

/**
 * 明度を動かす向きを指定した版。背景が暗いなら明るくする、のように
 * 「文字は背景と反対側」を守りたいときに使う。
 */
export function fixContrastToward(
  color: RGB,
  bg: RGB,
  min: number,
  dir: 1 | -1,
): RGB {
  if (contrastRatio(color, bg) >= min) return color
  const [L0, C, h] = rgbToOklch(color)
  const end = oklchToRgb([dir > 0 ? 1 : 0, C, h])
  if (contrastRatio(end, bg) < min) {
    // 彩度を落とせば届くこともある（白 / 黒）
    const pure = oklchToRgb([dir > 0 ? 1 : 0, 0, h])
    return contrastRatio(pure, bg) > contrastRatio(end, bg) ? pure : end
  }
  let near = L0
  let far = dir > 0 ? 1 : 0
  for (let i = 0; i < 24; i++) {
    const mid = (near + far) / 2
    if (contrastRatio(oklchToRgb([mid, C, h]), bg) >= min) far = mid
    else near = mid
  }
  return oklchToRgb([far, C, h])
}
