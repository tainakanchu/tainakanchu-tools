/**
 * 配色(ライト・ダーク)の設定と解決。純粋関数 + localStorage の読み書き。
 *
 * サイト全体の配色(ThemeProvider と index.html の初期配色 script)が使う。
 * 設定は「自動 / ライト / ダーク」の 3 つで、
 * 自動は OS の prefers-color-scheme に従う。端末ごとの好みなので
 * localStorage に 1 つのキーで持つ(ツールごとに分けると、ツールを移るたびに
 * 配色が変わってしまう)。
 */

export const THEME_SETTINGS = ['auto', 'light', 'dark'] as const
export type ThemeSetting = (typeof THEME_SETTINGS)[number]
export type ResolvedTheme = 'light' | 'dark'

export const THEME_SETTING_LABELS: Record<ThemeSetting, string> = {
  auto: '自動',
  light: 'ライト',
  dark: 'ダーク',
}

export const THEME_STORAGE_KEY = 'tainakanchu-tools:theme'

/** 保存値を読む。知らない値・壊れた値は「自動」に倒す */
export function parseThemeSetting(raw: unknown): ThemeSetting {
  return THEME_SETTINGS.find((s) => s === raw) ?? 'auto'
}

export function resolveTheme(
  setting: ThemeSetting,
  prefersDark: boolean,
): ResolvedTheme {
  if (setting === 'auto') return prefersDark ? 'dark' : 'light'
  return setting
}

// localStorage は private モードなどで例外を投げる。読めなければ自動、
// 書けなければその場限りの設定になるだけにする

export function loadThemeSetting(): ThemeSetting {
  try {
    return parseThemeSetting(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

export function saveThemeSetting(setting: ThemeSetting): boolean {
  try {
    if (setting === 'auto') window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, setting)
    return true
  } catch {
    return false
  }
}
