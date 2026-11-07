/**
 * 配色（パレット）。テンプレートとは独立で、色は名前付きの役割だけで持つ。
 * テンプレートは色をハードコードせず、必ずこの役割を通して塗る。
 *
 *   bg     … 背景
 *   fg     … 主な文字（アーティスト・見出し）
 *   muted  … 補助の文字（曲名・日付・会場）
 *   accent … 差し色（番号や小さな印。使うかどうかはテンプレート次第）
 *   rule   … 罫線
 *   scrim  … 写真の上に敷く幕の色（写真を背景にしたとき）
 *
 * 純粋関数だけなので単体テストできる。
 */
import { contrastRatio, hexToRgb, mix, rgbToHex } from './color'
import { fixContrast, fixContrastToward, oklchToRgb, rgbToOklch } from './oklab'
import type { RGB } from './color'

export type PaletteRole = 'bg' | 'fg' | 'muted' | 'accent' | 'rule' | 'scrim'

export const PALETTE_ROLES: ReadonlyArray<PaletteRole> = [
  'bg',
  'fg',
  'muted',
  'accent',
  'rule',
  'scrim',
]

export const ROLE_LABELS: Record<PaletteRole, string> = {
  bg: '背景',
  fg: '文字',
  muted: '補助の文字',
  accent: '差し色',
  rule: '罫線',
  scrim: '写真の幕',
}

export type PaletteColors = Record<PaletteRole, string>

/** Y2K のクローム文字のグラデーション（上 → 下、位置 0..1） */
export type ChromeStop = readonly [offset: number, color: string]

export type Palette = PaletteColors & {
  id: string
  name: string
  /** 写真に敷く幕の濃さの上限（0..1） */
  scrimMax?: number
  /** 2 つ目の差し色（Y2K の窓枠など。無ければ accent） */
  accent2?: string
  /** Y2K の見出しのクローム（無ければ fg / muted / bg から作る） */
  chrome?: ReadonlyArray<ChromeStop>
  /** Y2K の光（1 か所だけ） */
  glow?: { color: string; alpha: number }
}

/** コントラストの目標（WCAG の比） */
export const CONTRAST = {
  /** 文字: できれば 7、少なくとも 4.5 */
  fg: 7,
  fgMin: 4.5,
  muted: 4.5,
  accent: 3,
} as const

/** 幕の濃さの下限と、パレットに指定が無いときの上限 */
export const SCRIM_MIN = 0.35
export const SCRIM_MAX_DEFAULT = 0.75

/**
 * 暗い幕の色: 背景の色相のまま OKLCH の L≈0.08 まで落とす（真っ黒にしない）。
 */
export function darkScrimOf(bgHex: string): string {
  const [, C, h] = rgbToOklch(hexToRgb(bgHex))
  return rgbToHex(oklchToRgb([0.08, Math.min(C, 0.03), h]))
}

export const PRESET_PALETTES: ReadonlyArray<Palette> = [
  {
    id: 'paper',
    name: 'ペーパー',
    bg: '#f0eee9',
    fg: '#1a1a18',
    muted: '#5f5c56',
    accent: '#d2462a',
    rule: '#cfcac0',
    scrim: '#f0eee9',
    scrimMax: 0.85,
  },
  {
    id: 'ink',
    name: 'インク',
    bg: '#0e0e0e',
    fg: '#edede8',
    muted: '#8a8a85',
    accent: '#edede8',
    rule: '#2a2a28',
    scrim: darkScrimOf('#0e0e0e'),
    scrimMax: 0.6,
  },
  {
    id: 'acid',
    name: 'アシッド',
    bg: '#111111',
    fg: '#f2f2ee',
    muted: '#8a8a85',
    accent: '#c6f432',
    rule: '#2b2b2b',
    scrim: darkScrimOf('#111111'),
    scrimMax: 0.6,
  },
  {
    id: 'concrete',
    name: 'コンクリート',
    bg: '#d9d9d4',
    fg: '#151515',
    muted: '#53534f',
    accent: '#2440ff',
    rule: '#a8a8a2',
    scrim: '#d9d9d4',
    scrimMax: 0.8,
  },
  {
    id: 'cocoa',
    name: 'ココア',
    bg: '#2a211c',
    fg: '#efe6da',
    muted: '#a8988a',
    accent: '#e07a3f',
    rule: '#4a3b32',
    scrim: darkScrimOf('#2a211c'),
    scrimMax: 0.65,
  },
  {
    id: 'teal',
    name: 'ティールナイト',
    bg: '#0f2a2c',
    fg: '#e8f0ec',
    muted: '#8fa8a4',
    accent: '#f2b33d',
    rule: '#24484a',
    scrim: darkScrimOf('#0f2a2c'),
    scrimMax: 0.6,
  },
  {
    id: 'riso',
    name: 'リソ',
    bg: '#f3efe6',
    fg: '#1d3b8f',
    muted: '#56659a',
    accent: '#d6338f',
    rule: '#b9c0d8',
    scrim: '#f3efe6',
    scrimMax: 0.85,
  },
  {
    id: 'sage',
    name: 'セージ',
    bg: '#e4e3d6',
    fg: '#23261e',
    muted: '#5c6052',
    accent: '#b5442c',
    rule: '#c3c2b2',
    scrim: '#e4e3d6',
    scrimMax: 0.8,
  },
  {
    id: 'silver',
    name: 'シルバー',
    bg: '#c9cdd2',
    fg: '#0c0d0f',
    muted: '#464b52',
    accent: '#0c0d0f',
    rule: '#9aa0a8',
    scrim: '#c9cdd2',
    scrimMax: 0.75,
  },
  {
    id: 'ice',
    name: 'アイス',
    bg: '#dde3ea',
    fg: '#0b1020',
    muted: '#4f5c70',
    accent: '#4d5bf0',
    rule: '#aeb8c6',
    scrim: '#0b1020',
    scrimMax: 0.5,
    chrome: [
      [0, '#ffffff'],
      [0.45, '#b9c3cf'],
      [0.5, '#4a5563'],
      [0.56, '#e3e8ee'],
      [1, '#8d97a5'],
    ],
    glow: { color: '#9fb4ff', alpha: 0.4 },
  },
  {
    id: 'midnight',
    name: 'ミッドナイト',
    bg: '#07090f',
    fg: '#e9eef5',
    muted: '#7c889a',
    accent: '#b6ff3b',
    accent2: '#3d7bff',
    rule: '#1e2533',
    scrim: darkScrimOf('#07090f'),
    scrimMax: 0.6,
    chrome: [
      [0, '#f5f7fa'],
      [0.45, '#a3adba'],
      [0.5, '#1c2230'],
      [0.56, '#c7d0db'],
      [1, '#6b7585'],
    ],
    glow: { color: '#b6ff3b', alpha: 0.35 },
  },
]

export const DEFAULT_PALETTE_ID = 'ink'

export function getPreset(id: string): Palette | undefined {
  return PRESET_PALETTES.find((p) => p.id === id)
}

/** 背景が暗い配色か（白い文字の方が読みやすいか） */
export function isDarkColor(rgb: RGB): boolean {
  return contrastRatio([255, 255, 255], rgb) >= contrastRatio([0, 0, 0], rgb)
}

export function isDarkPalette(p: PaletteColors): boolean {
  return isDarkColor(hexToRgb(p.bg))
}

export type ContrastReport = { fg: number; muted: number; accent: number }

export function contrastReport(p: PaletteColors): ContrastReport {
  const bg = hexToRgb(p.bg)
  return {
    fg: contrastRatio(hexToRgb(p.fg), bg),
    muted: contrastRatio(hexToRgb(p.muted), bg),
    accent: contrastRatio(hexToRgb(p.accent), bg),
  }
}

/**
 * コントラストの制約を満たすよう、色相を保ったまま OKLCH の明度だけを動かす。
 * 文字は背景と反対側（暗い背景なら明るく）へ動かす。
 *   fg ≥ 7（無理なら届く限り。4.5 は必ず）、muted ≥ 4.5、accent ≥ 3
 * bg・rule・scrim は変えない。
 */
export function fixPalette<T extends PaletteColors>(p: T): T {
  const bg = hexToRgb(p.bg)
  const dir: 1 | -1 = isDarkColor(bg) ? 1 : -1
  // hex に丸めると比がわずかに下がるので、少し上を狙って丸めた後で確かめる
  const settle = (color: RGB, min: number, fallback: RGB): string => {
    for (const margin of [0.04, 0.12, 0.3]) {
      const hex = rgbToHex(fixContrastToward(color, bg, min + margin, dir))
      if (contrastRatio(hexToRgb(hex), bg) >= min) return hex
    }
    return rgbToHex(fallback)
  }
  const white: RGB = [255, 255, 255]
  const black: RGB = [0, 0, 0]
  const extreme = dir > 0 ? white : black
  let fg = settle(hexToRgb(p.fg), CONTRAST.fg, extreme)
  if (contrastRatio(hexToRgb(fg), bg) < CONTRAST.fgMin) fg = rgbToHex(extreme)
  const muted = settle(hexToRgb(p.muted), CONTRAST.muted, hexToRgb(fg))
  let accent = rgbToHex(
    fixContrast(hexToRgb(p.accent), bg, CONTRAST.accent + 0.04),
  )
  if (contrastRatio(hexToRgb(accent), bg) < CONTRAST.accent) accent = fg
  return { ...p, fg, muted, accent }
}

/** 足りない役割を補う（罫線は文字と背景の間、幕は背景の色味を濃く / 淡く） */
export function deriveRule(bg: RGB, fg: RGB): RGB {
  return mix(bg, fg, isDarkColor(bg) ? 0.16 : 0.14)
}

/** 写真のダブルトーンに使う 3 色（暗部 → 差し色 → 明部） */
export function duotoneStops(p: PaletteColors): readonly [RGB, RGB, RGB] {
  const bg = hexToRgb(p.bg)
  const fg = hexToRgb(p.fg)
  const dark = isDarkColor(bg) ? bg : fg
  const light = isDarkColor(bg) ? fg : bg
  return [dark, hexToRgb(p.accent), light]
}

/**
 * ドット（ディザ）に使う 3 色。中間は差し色そのままだと派手すぎるので、
 * 暗部と明部の中間に差し色を少しだけ混ぜる
 */
export function ditherStops(p: PaletteColors): readonly [RGB, RGB, RGB] {
  const [dark, , light] = duotoneStops(p)
  return [dark, mix(mix(dark, light, 0.42), hexToRgb(p.accent), 0.3), light]
}

export function sameColors(a: PaletteColors, b: PaletteColors): boolean {
  return PALETTE_ROLES.every((r) => a[r].toLowerCase() === b[r].toLowerCase())
}
