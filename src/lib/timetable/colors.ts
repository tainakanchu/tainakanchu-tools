/**
 * 会場ごとの色を自動で割り当てる。
 *
 * 色相を等分するだけだと、黄〜黄緑のような明るい色に白文字が乗って読めなくなる。
 * 判別しやすい固定パレットを順に使い、文字色は WCAG の相対輝度から
 * 白か黒のコントラストが高いほうを選ぶ。会場が 10 を超えたら
 * 明度を変えて 2 周目に入る(同じ色が隣り合わないように)。
 */

export interface VenueColor {
  /** 塗りの色(お気に入りの背景・見出しの帯) */
  fill: string
  /** fill の上に載せる文字色 */
  text: string
  /** 塗らないときの淡い背景 */
  tint: string
}

// Tableau 10 系を少し濃くしたもの。どれも白黒どちらかで 4.5:1 以上を取れる
const PALETTE = [
  '#2b6cb0',
  '#dd6b20',
  '#2f855a',
  '#c53030',
  '#6b46c1',
  '#b7791f',
  '#b83280',
  '#319795',
  '#4a5568',
  '#9c4221',
]

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function mix(hex: string, toward: number, ratio: number): string {
  const rgb = hexToRgb(hex).map((c) => Math.round(c + (toward - c) * ratio))
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

export function venueColor(index: number): VenueColor {
  const base = PALETTE[index % PALETTE.length]
  const round = Math.floor(index / PALETTE.length)
  // 2 周目は暗く、3 周目は明るく
  const fill =
    round === 0
      ? base
      : round % 2 === 1
        ? mix(base, 0, 0.35)
        : mix(base, 255, 0.3)
  const text =
    contrastRatio(fill, '#ffffff') >= contrastRatio(fill, '#111111')
      ? '#ffffff'
      : '#111111'
  return { fill, text, tint: mix(fill, 255, 0.86) }
}
