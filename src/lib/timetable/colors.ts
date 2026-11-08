/**
 * 会場ごとの色を自動で割り当てる。
 *
 * 色相を等分するだけだと、黄〜黄緑のような明るい色に白文字が乗って読めなくなる。
 * 判別しやすい固定パレットを順に使い、文字色は WCAG の相対輝度から
 * 白か黒のコントラストが高いほうを選ぶ。会場が 10 を超えたら
 * 明度を変えて 2 周目に入る(同じ色が隣り合わないように)。
 *
 * ダークの配色では、淡い tint(白へ 86% 寄せた色)が暗い画面の中で眩しく浮くので、
 * tint を暗い面(#111827)へ 80% 寄せた色にし、文字を明るい灰色にする。
 * お気に入りは引き続き会場色の塗りで、いちばん強く見える。
 * 2 周目以降をライトと同じく暗くすると、暗い面の上で塗りと tint の差が
 * 無くなるので、ダークでは 2 周目・3 周目とも白へ寄せて明るくする。
 * 左の帯(bar)は暗い tint の上で見えるよう、塗りより少し明るくする。
 * どの組み合わせも文字は 4.5:1 以上(colors.test.ts で 30 色すべて確かめる)。
 */

export type ColorTheme = 'light' | 'dark'

export interface VenueColor {
  /** 塗りの色(お気に入りの背景・見出しの帯) */
  fill: string
  /** fill の上に載せる文字色 */
  text: string
  /** 塗らないときの背景(ライトでは淡く、ダークでは暗く沈める) */
  tint: string
  /** tint の上に載せる文字色 */
  tintText: string
  /** tint の左に付ける会場色の帯 */
  bar: string
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

/** ダークの tint を寄せる先(gray-900)。画面の地(gray-950)より一段明るい */
const DARK_SURFACE = '#111827'

function mixHex(hex: string, toward: string, ratio: number): string {
  const target = hexToRgb(toward)
  const rgb = hexToRgb(hex).map((c, i) =>
    Math.round(c + (target[i] - c) * ratio),
  )
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function mix(hex: string, toward: number, ratio: number): string {
  const v = toward.toString(16).padStart(2, '0')
  return mixHex(hex, `#${v}${v}${v}`, ratio)
}

function textOn(fill: string): string {
  return contrastRatio(fill, '#ffffff') >= contrastRatio(fill, '#111111')
    ? '#ffffff'
    : '#111111'
}

export function venueColor(
  index: number,
  theme: ColorTheme = 'light',
): VenueColor {
  const base = PALETTE[index % PALETTE.length]
  const round = Math.floor(index / PALETTE.length)
  if (theme === 'dark') {
    const fill =
      round === 0
        ? base
        : round % 2 === 1
          ? mix(base, 255, 0.3)
          : mix(base, 255, 0.5)
    return {
      fill,
      text: textOn(fill),
      tint: mixHex(fill, DARK_SURFACE, 0.8),
      tintText: '#e5e7eb',
      bar: mix(fill, 255, 0.25),
    }
  }
  // 2 周目は暗く、3 周目は明るく
  const fill =
    round === 0
      ? base
      : round % 2 === 1
        ? mix(base, 0, 0.35)
        : mix(base, 255, 0.3)
  return {
    fill,
    text: textOn(fill),
    tint: mix(fill, 255, 0.86),
    tintText: '#111827',
    bar: fill,
  }
}

export interface GridColors {
  /** 終わった出演の背景・文字・帯。会場色を抜いて灰色にする(文字は 4.5:1 以上) */
  pastBg: string
  pastText: string
  pastBar: string
  /** 30 分・1 時間の罫線 */
  line30: string
  line60: string
  /** 友達の選択の破線の枠 */
  friend: string
  /** いまの時刻の線 */
  now: string
}

/** グリッド(画面と画像)の会場色以外の色 */
export function gridColors(theme: ColorTheme): GridColors {
  return theme === 'dark'
    ? {
        pastBg: '#1f2937',
        pastText: '#9ca3af',
        pastBar: '#4b5563',
        line30: '#1f2937',
        line60: '#374151',
        friend: '#e5e7eb',
        now: '#f43f5e',
      }
    : {
        pastBg: '#f3f4f6',
        pastText: '#4b5563',
        pastBar: '#9ca3af',
        line30: '#d1d5db',
        line60: '#9ca3af',
        friend: '#111827',
        now: '#e11d48',
      }
}
