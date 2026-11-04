/**
 * テーマ（配色＋書体）のプリセット。レイアウトとは独立に選べる。
 * フォントは Web フォントを読み込まない方針（サイト全体と同じ）なので、
 * OS 標準の和文フォントへ落ちるスタックにしている。
 */
import type { RGB } from './color'

const SANS =
  '"Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", Meiryo, sans-serif'
const DISPLAY =
  '"Arial Black", "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", Meiryo, sans-serif'
const SERIF =
  '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Noto Serif CJK JP", Georgia, "Times New Roman", serif'
const MONO =
  '"SF Mono", Menlo, Consolas, "Roboto Mono", "DejaVu Sans Mono", "Noto Sans Mono CJK JP", "Noto Sans CJK JP", monospace'

export type Theme = {
  id: string
  name: string
  /** 背景（上 → 下のグラデーション） */
  bg: string
  bg2: string
  fg: string
  muted: string
  accent: string
  accent2: string
  displayFont: string
  displayWeight: number
  bodyFont: string
  monoFont: string
  /** 見出しのラテン文字を大文字にするか */
  uppercase: boolean
  texture: 'none' | 'grain' | 'scanline' | 'paper'
  /** ネオン管風のにじみ */
  glow: boolean
  /** 版ズレ風に見出しを 2 色でずらす */
  misregister: boolean
  /** 写真の duotone に使う 3 色（暗部 → 中間 → 明部） */
  duotone: readonly [string, string, string]
}

export const THEMES: ReadonlyArray<Theme> = [
  {
    id: 'neon',
    name: 'ダークネオン',
    bg: '#07070f',
    bg2: '#1b0a2e',
    fg: '#f6f2ff',
    muted: '#a9a3cf',
    accent: '#ff2bd6',
    accent2: '#21e6ff',
    displayFont: DISPLAY,
    displayWeight: 900,
    bodyFont: SANS,
    monoFont: MONO,
    uppercase: true,
    texture: 'scanline',
    glow: true,
    misregister: false,
    duotone: ['#07070f', '#c21fa6', '#7af3ff'],
  },
  {
    id: 'minimal',
    name: 'ホワイトミニマル',
    bg: '#f6f6f3',
    bg2: '#ecece7',
    fg: '#121212',
    muted: '#6d6d6a',
    accent: '#ff3b1f',
    accent2: '#121212',
    displayFont: SANS,
    displayWeight: 800,
    bodyFont: SANS,
    monoFont: MONO,
    uppercase: false,
    texture: 'none',
    glow: false,
    misregister: false,
    duotone: ['#121212', '#8a8a86', '#f6f6f3'],
  },
  {
    id: 'riso',
    name: 'リソ 2 色',
    bg: '#f4efe3',
    bg2: '#efe8d8',
    fg: '#1f47b8',
    muted: '#5a6fae',
    accent: '#ff4fa0',
    accent2: '#1f47b8',
    displayFont: DISPLAY,
    displayWeight: 900,
    bodyFont: SANS,
    monoFont: MONO,
    uppercase: true,
    texture: 'grain',
    glow: false,
    misregister: true,
    duotone: ['#1f47b8', '#ff4fa0', '#f4efe3'],
  },
  {
    id: 'vinyl',
    name: 'ウォームヴァイナル',
    bg: '#1d140f',
    bg2: '#2e1e14',
    fg: '#f4e6cf',
    muted: '#bfa587',
    accent: '#ff7a2f',
    accent2: '#f2c14e',
    displayFont: SERIF,
    displayWeight: 800,
    bodyFont: SANS,
    monoFont: MONO,
    uppercase: false,
    texture: 'paper',
    glow: false,
    misregister: false,
    duotone: ['#1d140f', '#c25a22', '#f4e6cf'],
  },
  {
    id: 'acid',
    name: 'アシッドイエロー',
    bg: '#e4fb3c',
    bg2: '#d6f02a',
    fg: '#0b0b0b',
    muted: '#3f4a12',
    accent: '#0b0b0b',
    accent2: '#ff3b1f',
    displayFont: DISPLAY,
    displayWeight: 900,
    bodyFont: SANS,
    monoFont: MONO,
    uppercase: true,
    texture: 'grain',
    glow: false,
    misregister: false,
    duotone: ['#0b0b0b', '#6d7d12', '#e4fb3c'],
  },
]

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** 画像から取ったアクセントでテーマを上書きする */
export function withAccent(theme: Theme, accent: RGB | undefined): Theme {
  if (!accent) return theme
  const hex = `#${accent
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
  return { ...theme, accent: hex }
}
