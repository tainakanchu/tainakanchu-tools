import { useCallback, useSyncExternalStore } from 'react'

/**
 * 配色（自動 / ライト / ダーク）。
 *
 * html の data-theme に "light" / "dark" を付けるか外すだけで切り替わる
 * （色は src/styles.css の「配色の切り替え」）。付けていないとき（自動）は OS の設定に従う。
 * 最初の描画より前に付けておかないと一瞬ライトで光るので、index.html の head にも
 * 同じ処理を小さく書いてある。保存キーと値を変えるときはそちらも直すこと。
 */

export type ThemeMode = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'

/** ブラウザの上端（theme-color）に使う紙の色。styles.css の --color-paper と同じ値 */
const THEME_COLOR = { light: '#ffffff', dark: '#141b3d' } as const

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

function readStoredTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  if (mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)

  // theme-color は media 付きでライト用・ダーク用の 2 つを置いている。
  // 自動なら OS に合わせて選ばれるので元の値に戻し、固定なら両方を選んだ側の色にする
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    const own = meta.media.includes('dark')
      ? THEME_COLOR.dark
      : THEME_COLOR.light
    meta.content = mode === 'system' ? own : THEME_COLOR[mode]
  }
}

let current: ThemeMode | null = null
const listeners = new Set<() => void>()

function getSnapshot(): ThemeMode {
  current ??= readStoredTheme()
  return current
}

function getServerSnapshot(): ThemeMode {
  return 'system'
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // 別のタブで変えたときも揃える
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return
    current = readStoredTheme()
    applyTheme(current)
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function setTheme(mode: ThemeMode): void {
  current = mode
  try {
    if (mode === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // 保存できなくても、開いている間は切り替わる
  }
  applyTheme(mode)
  for (const listener of listeners) listener()
}

/** いまの配色の選択と、変える関数 */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const set = useCallback((next: ThemeMode) => setTheme(next), [])
  return [mode, set]
}
