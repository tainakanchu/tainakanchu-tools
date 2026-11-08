/**
 * サイト全体の配色(ライト・ダーク)。__root.tsx で 1 度だけ ThemeProvider を置く。
 *
 * 解決した配色は <html> の data-theme="light|dark" と color-scheme に書く。
 * styles.css の dark: バリアントはこの属性を見るので、どのツールでも dark:
 * クラスを書けばそのまま効く。ページの背景・文字色・スクロールバーやフォーム部品
 * (color-scheme)も <html> 側で決まるので、ツール側でページ全体を包む必要は無い。
 *
 * 初回の描画前に index.html のインライン script が同じ判定で data-theme を
 * 付けている(読み込み時に白く光らないように)。ここの初期値も同じ保存値と
 * OS の設定から決めるので、マウントしても配色は変わらない。判定を変えるときは
 * index.html の script も合わせる(theme.test.ts が両者の一致を確かめる)。
 *
 * ツール側の使い方:
 * - 色はなるべく Tailwind の dark: クラスで付ける(配色の約束は styles.css の先頭)
 * - canvas やインライン style など JS で色を決めるときは
 *   `const { theme } = useTheme()` の theme('light' | 'dark')で分ける
 * - 書き出す画像・PDF・印刷は、ツールが明示的に配色を選ばない限りライトのまま
 */

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import {
  THEME_STORAGE_KEY,
  loadThemeSetting,
  resolveTheme,
  saveThemeSetting,
} from '../../lib/theme/theme'
import type { ResolvedTheme, ThemeSetting } from '../../lib/theme/theme'

export interface ThemeState {
  /** 利用者の設定(自動 / ライト / ダーク) */
  setting: ThemeSetting
  /** 実際に使う配色。自動なら OS の設定で決まる */
  theme: ResolvedTheme
  setSetting: (setting: ThemeSetting) => void
}

const ThemeContext = createContext<ThemeState>({
  setting: 'auto',
  theme: 'light',
  setSetting: () => {},
})

/** いまの配色。ThemeProvider の外ではライト */
export function useTheme(): ThemeState {
  return useContext(ThemeContext)
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

function prefersDarkNow(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DARK_QUERY).matches
  )
}

/** 設定(保存値)と OS の配色から、実際に使う配色を決める */
function useThemeController(): ThemeState {
  const [setting, setSettingState] = useState<ThemeSetting>(() =>
    typeof window === 'undefined' ? 'auto' : loadThemeSetting(),
  )
  const [prefersDark, setPrefersDark] = useState(prefersDarkNow)

  // OS の設定が変わったら(夕方に自動で切り替わる端末など)その場で追従する
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => setPrefersDark(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // 別のタブで切り替えたら、開いているほかのタブも揃える
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        setSettingState(loadThemeSetting())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return useMemo(
    () => ({
      setting,
      theme: resolveTheme(setting, prefersDark),
      setSetting: (next: ThemeSetting) => {
        setSettingState(next)
        saveThemeSetting(next)
      },
    }),
    [setting, prefersDark],
  )
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const state = useThemeController()
  const { theme } = state

  // 描画と同じフレームで <html> を切り替える(useEffect だと、JS で色を
  // 決めている部分とクラスで色を付けている部分が 1 フレームずれうる)
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    // フォーム部品・スクロールバーなど、ブラウザが描く部分も配色に合わせる。
    // 印刷では styles.css がライトに戻す
    root.style.colorScheme = theme
  }, [theme])

  return <ThemeContext.Provider value={state}>{children}</ThemeContext.Provider>
}
