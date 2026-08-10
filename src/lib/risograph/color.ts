/**
 * 色変換の単一ソース。
 * モデル層の canonical は XYZ (D50, Y=1 正規化)。sRGB は入出力・表示に限定する。
 * DOM 非依存（Node 上で数値テスト可能）。
 */

/** XYZ (D50, Y=1 正規化) */
export type XYZ = readonly [number, number, number]
/** linear sRGB 0..1 */
export type RGB = readonly [number, number, number]
/** CIE L*a*b* (D50) */
export type Lab = readonly [number, number, number]

/** D50 白色点 */
export const D50: XYZ = [0.96422, 1.0, 0.82521]

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** ガンマ付き sRGB(0..1) → linear sRGB */
export function srgbToLinear(c: number): number {
  const v = clamp01(c)
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** linear sRGB → ガンマ付き sRGB(0..1) */
export function linearToSrgb(c: number): number {
  const v = clamp01(c)
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

/** 8bit sRGB → linear RGB */
export function srgb8ToLinear(r: number, g: number, b: number): RGB {
  return [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)]
}

/** linear RGB → 8bit sRGB（クリップあり） */
export function linearToSrgb8(rgb: RGB): [number, number, number] {
  return [
    Math.round(linearToSrgb(rgb[0]) * 255),
    Math.round(linearToSrgb(rgb[1]) * 255),
    Math.round(linearToSrgb(rgb[2]) * 255),
  ]
}

// Bradford 順応込みの linear sRGB(D65) ↔ XYZ(D50) 行列（ICC 標準）
const M_RGB_TO_XYZ = [
  [0.4360747, 0.3850649, 0.1430804],
  [0.2225045, 0.7168786, 0.0606169],
  [0.0139322, 0.0971045, 0.7141733],
] as const

const M_XYZ_TO_RGB = [
  [3.1338561, -1.6168667, -0.4906146],
  [-0.9787684, 1.9161415, 0.033454],
  [0.0719453, -0.2289914, 1.4052427],
] as const

export function linearRgbToXyz(rgb: RGB): XYZ {
  const [r, g, b] = rgb
  return [
    M_RGB_TO_XYZ[0][0] * r + M_RGB_TO_XYZ[0][1] * g + M_RGB_TO_XYZ[0][2] * b,
    M_RGB_TO_XYZ[1][0] * r + M_RGB_TO_XYZ[1][1] * g + M_RGB_TO_XYZ[1][2] * b,
    M_RGB_TO_XYZ[2][0] * r + M_RGB_TO_XYZ[2][1] * g + M_RGB_TO_XYZ[2][2] * b,
  ]
}

/** ガモット外は成分クリップ（表示用途のみで使う） */
export function xyzToLinearRgb(xyz: XYZ): RGB {
  const [x, y, z] = xyz
  return [
    clamp01(M_XYZ_TO_RGB[0][0] * x + M_XYZ_TO_RGB[0][1] * y + M_XYZ_TO_RGB[0][2] * z),
    clamp01(M_XYZ_TO_RGB[1][0] * x + M_XYZ_TO_RGB[1][1] * y + M_XYZ_TO_RGB[1][2] * z),
    clamp01(M_XYZ_TO_RGB[2][0] * x + M_XYZ_TO_RGB[2][1] * y + M_XYZ_TO_RGB[2][2] * z),
  ]
}

/**
 * 減法混色（重ね刷り）の積を取るための 3ch 反射率プロキシ。
 * XYZ は等色関数の積分なので、XYZ 同士を掛けても物理的な重ね刷りにはならない。
 * linear sRGB はバンド反射率に近い振る舞いをするので、積はこの空間で取る。
 * 表示用の xyzToLinearRgb と違い上限クリップはしない（暗部・高彩度で情報が落ちるため）。
 * 下限だけ微小値で押さえ、積が 0 に潰れるのを防ぐ。
 */
export function xyzToReflectance(xyz: XYZ): RGB {
  const [x, y, z] = xyz
  const floor = (v: number) => (v < 1e-5 ? 1e-5 : v)
  return [
    floor(M_XYZ_TO_RGB[0][0] * x + M_XYZ_TO_RGB[0][1] * y + M_XYZ_TO_RGB[0][2] * z),
    floor(M_XYZ_TO_RGB[1][0] * x + M_XYZ_TO_RGB[1][1] * y + M_XYZ_TO_RGB[1][2] * z),
    floor(M_XYZ_TO_RGB[2][0] * x + M_XYZ_TO_RGB[2][1] * y + M_XYZ_TO_RGB[2][2] * z),
  ]
}

const LAB_EPS = 216 / 24389
const LAB_KAPPA = 24389 / 27

function labF(t: number): number {
  return t > LAB_EPS ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116
}

function labFInv(t: number): number {
  const t3 = t * t * t
  return t3 > LAB_EPS ? t3 : (116 * t - 16) / LAB_KAPPA
}

export function xyzToLab(xyz: XYZ): Lab {
  const fx = labF(xyz[0] / D50[0])
  const fy = labF(xyz[1] / D50[1])
  const fz = labF(xyz[2] / D50[2])
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function labToXyz(lab: Lab): XYZ {
  const fy = (lab[0] + 16) / 116
  const fx = fy + lab[1] / 500
  const fz = fy - lab[2] / 200
  return [labFInv(fx) * D50[0], labFInv(fy) * D50[1], labFInv(fz) * D50[2]]
}

/** L*C*h（h は度、0..360） */
export function labToLch(lab: Lab): readonly [number, number, number] {
  const c = Math.hypot(lab[1], lab[2])
  let h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI
  if (h < 0) h += 360
  return [lab[0], c, h]
}

export function lchToLab(lch: readonly [number, number, number]): Lab {
  const rad = (lch[2] * Math.PI) / 180
  return [lch[0], lch[1] * Math.cos(rad), lch[1] * Math.sin(rad)]
}

const DEG = Math.PI / 180

/** CIEDE2000。Sharma et al. (2005) の実装に準拠 */
export function deltaE00(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1
  const [L2, a2, b2] = lab2

  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cbar = (C1 + C2) / 2
  const Cbar7 = Math.pow(Cbar, 7)
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))))

  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)

  const h1p = C1p === 0 ? 0 : ((Math.atan2(b1, a1p) / DEG) + 360) % 360
  const h2p = C2p === 0 ? 0 : ((Math.atan2(b2, a2p) / DEG) + 360) % 360

  const dLp = L2 - L1
  const dCp = C2p - C1p

  let dhp = 0
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p
    if (Math.abs(diff) <= 180) dhp = diff
    else if (diff > 180) dhp = diff - 360
    else dhp = diff + 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * DEG)

  const Lbarp = (L1 + L2) / 2
  const Cbarp = (C1p + C2p) / 2

  let hbarp: number
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p
  } else {
    const sum = h1p + h2p
    const diff = Math.abs(h1p - h2p)
    if (diff <= 180) hbarp = sum / 2
    else if (sum < 360) hbarp = (sum + 360) / 2
    else hbarp = (sum - 360) / 2
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * DEG) +
    0.24 * Math.cos(2 * hbarp * DEG) +
    0.32 * Math.cos((3 * hbarp + 6) * DEG) -
    0.2 * Math.cos((4 * hbarp - 63) * DEG)

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2))
  const Cbarp7 = Math.pow(Cbarp, 7)
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)))
  const Lm50sq = Math.pow(Lbarp - 50, 2)
  const SL = 1 + (0.015 * Lm50sq) / Math.sqrt(20 + Lm50sq)
  const SC = 1 + 0.045 * Cbarp
  const SH = 1 + 0.015 * Cbarp * T
  const RT = -Math.sin(2 * dTheta * DEG) * RC

  const dL = dLp / SL
  const dC = dCp / SC
  const dH = dHp / SH

  return Math.sqrt(dL * dL + dC * dC + dH * dH + RT * dC * dH)
}

/** XYZ ペアの ΔE00（Lab へ変換して評価） */
export function deltaE00Xyz(x1: XYZ, x2: XYZ): number {
  return deltaE00(xyzToLab(x1), xyzToLab(x2))
}
