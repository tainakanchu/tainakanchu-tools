/**
 * 色の計算（コントラスト・混色・トーン変換）。
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

/** 画素の明るさ 0..1（Rec.709 の重み、ガンマはそのまま） */
function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export type TintMode = 'none' | 'mono' | 'duotone' | 'dither' | 'xerox'

/** 4×4 の Bayer 行列（0..15） */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * 画素のトーンを置き換える（in-place）。stops は暗部 → 中間 → 明部の 3 色。
 * - mono: グレースケール
 * - duotone: 明るさに応じて 3 色のグラデーションへ写す（2 色刷り + 紙白）
 * - xerox: コピー機風。レベル補正（入力 20〜235、ガンマ 1.2）で潰してから
 *   暗部 → 明部の 2 色（インクと紙）へ写す
 * - dither: 4×4 の Bayer 配列で 3 色 + 中間 2 段に減色する（Y2K 用）。
 *   width（画像の幅）と cell（1 マスの px）が要る
 */
export function applyTint(
  data: Uint8ClampedArray,
  mode: TintMode,
  stops: readonly [RGB, RGB, RGB],
  opts: { width?: number; cell?: number } = {},
): void {
  if (mode === 'none') return
  const [shadow, mid, highlight] = stops
  const width = Math.max(1, opts.width ?? 1)
  const cell = Math.max(1, Math.round(opts.cell ?? 1))
  // dither の段（暗部・暗部と中間の間・中間・中間と明部の間・明部）
  const levels: Array<RGB> = [
    shadow,
    mix(shadow, mid, 0.5),
    mid,
    mix(mid, highlight, 0.5),
    highlight,
  ]
  for (let i = 0; i + 3 < data.length; i += 4) {
    const y = luma(data[i], data[i + 1], data[i + 2])
    let c: RGB
    if (mode === 'mono') {
      const v = y * 255
      c = [v, v, v]
    } else if (mode === 'xerox') {
      const v = clamp01((y * 255 - 20) / (235 - 20)) ** (1 / 1.2)
      // コピーらしく中間調を少し飛ばす
      const t = clamp01((v - 0.5) * 1.35 + 0.5)
      c = mix(shadow, highlight, t)
    } else if (mode === 'dither') {
      const p = i / 4
      const x = Math.floor((p % width) / cell) % 4
      const yy = Math.floor(Math.floor(p / width) / cell) % 4
      const threshold = (BAYER4[yy * 4 + x] + 0.5) / 16
      const scaled = y * (levels.length - 1)
      const base = Math.floor(scaled)
      const level = Math.min(
        levels.length - 1,
        base + (scaled - base > threshold ? 1 : 0),
      )
      c = levels[level]
    } else {
      // 中間調を少し締めて、2 色の境目をはっきりさせる
      const t = clamp01((y - 0.5) * 1.15 + 0.5)
      c = t < 0.5 ? mix(shadow, mid, t * 2) : mix(mid, highlight, t * 2 - 1)
    }
    data[i] = c[0]
    data[i + 1] = c[1]
    data[i + 2] = c[2]
  }
}
