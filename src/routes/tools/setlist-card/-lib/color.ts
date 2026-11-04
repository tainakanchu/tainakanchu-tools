/**
 * 色の計算（コントラスト・混色・画像からのアクセント抽出・トーン変換）。
 * canvas に依存しない純粋関数なので単体テストできる。
 */

export type RGB = readonly [number, number, number]

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const num = Number.parseInt(h.slice(0, 6), 16)
  if (!Number.isFinite(num)) return [0, 0, 0]
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]
}

const toHexByte = (v: number) =>
  Math.round(Math.min(255, Math.max(0, v)))
    .toString(16)
    .padStart(2, '0')

export function rgbToHex([r, g, b]: RGB): string {
  const to = toHexByte
  return `#${to(r)}${to(g)}${to(b)}`
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG の相対輝度 0..1 */
export function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const WHITE: RGB = [255, 255, 255]
const INK: RGB = [17, 17, 17]

/** 背景に対して読みやすい方（白 or 黒）の文字色 */
export function readableOn(bg: RGB): RGB {
  return contrastRatio(WHITE, bg) >= contrastRatio(INK, bg) ? WHITE : INK
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return [h / 6, s, l]
}

function hue(p: number, q: number, t0: number): number {
  let t = t0
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    hue(p, q, h + 1 / 3) * 255,
    hue(p, q, h) * 255,
    hue(p, q, h - 1 / 3) * 255,
  ]
}

/**
 * 背景とのコントラストが min に届くまで明度を動かす。
 * 色相・彩度は保つので「画像から取った色」の雰囲気は残る。
 */
export function ensureContrast(color: RGB, bg: RGB, min: number): RGB {
  if (contrastRatio(color, bg) >= min) return color
  const [h, s, l0] = rgbToHsl(color)
  const towardLight = luminance(bg) < 0.4
  let l = l0
  for (let i = 0; i < 40; i++) {
    l = towardLight ? Math.min(1, l + 0.025) : Math.max(0, l - 0.025)
    const candidate = hslToRgb(h, s, l)
    if (contrastRatio(candidate, bg) >= min) return candidate
  }
  return readableOn(bg)
}

/** RGBA 画素の平均色 */
export function averageColor(data: ArrayLike<number>): RGB {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3] / 255
    r += data[i] * a
    g += data[i + 1] * a
    b += data[i + 2] * a
    n += a
  }
  if (n === 0) return [0, 0, 0]
  return [r / n, g / n, b / n]
}

/**
 * アクセントに使う代表色。色相を 24 分割して「彩度 × 画素数」の多いビンを選び、
 * そのビンの平均色を、アクセントとして映えるよう彩度と明度を整えて返す。
 * 無彩色の画像（モノクロ写真など）は undefined。
 */
export function pickAccentColor(data: ArrayLike<number>): RGB | undefined {
  const BINS = 24
  const weight = new Float64Array(BINS)
  const sums = Array.from({ length: BINS }, () => [0, 0, 0])
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const rgb: RGB = [data[i], data[i + 1], data[i + 2]]
    const [h, s, l] = rgbToHsl(rgb)
    // 白飛び・黒つぶれ・無彩色はアクセントにならない
    if (s < 0.2 || l < 0.12 || l > 0.92) continue
    const bin = Math.min(BINS - 1, Math.floor(h * BINS))
    const w = s * (1 - Math.abs(l - 0.5))
    weight[bin] += w
    sums[bin][0] += rgb[0] * w
    sums[bin][1] += rgb[1] * w
    sums[bin][2] += rgb[2] * w
  }
  let best = -1
  let bestWeight = 0
  for (let i = 0; i < BINS; i++) {
    // 隣のビンも少し足して、境界で割れた色相を拾う
    const w =
      weight[i] + 0.5 * (weight[(i + 1) % BINS] + weight[(i + BINS - 1) % BINS])
    if (w > bestWeight) {
      bestWeight = w
      best = i
    }
  }
  const total = data.length / 4
  if (best === -1 || bestWeight < total * 0.01) return undefined
  const w = weight[best]
  const avg: RGB = [sums[best][0] / w, sums[best][1] / w, sums[best][2] / w]
  const [h, s, l] = rgbToHsl(avg)
  return hslToRgb(h, Math.max(0.6, s), Math.min(0.62, Math.max(0.48, l)))
}

/** 画素の明るさ 0..1（Rec.709 の重み、ガンマはそのまま） */
function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export type TintMode = 'none' | 'mono' | 'duotone'

/**
 * 画素のトーンを置き換える（in-place）。
 * mono はグレースケール、duotone は明るさに応じて shadow → mid → highlight の
 * 3 色グラデーションへ写す（リソのような 2 色刷り + 紙白の見え方）。
 */
export function applyTint(
  data: Uint8ClampedArray,
  mode: TintMode,
  stops: readonly [RGB, RGB, RGB],
): void {
  if (mode === 'none') return
  const [shadow, mid, highlight] = stops
  for (let i = 0; i + 3 < data.length; i += 4) {
    const y = luma(data[i], data[i + 1], data[i + 2])
    if (mode === 'mono') {
      const v = y * 255
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      continue
    }
    // 中間調を少し締めて、2 色の境目をはっきりさせる
    const t = Math.min(1, Math.max(0, (y - 0.5) * 1.15 + 0.5))
    const c = t < 0.5 ? mix(shadow, mid, t * 2) : mix(mid, highlight, t * 2 - 1)
    data[i] = c[0]
    data[i + 1] = c[1]
    data[i + 2] = c[2]
  }
}
