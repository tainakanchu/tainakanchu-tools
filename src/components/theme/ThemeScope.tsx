/**
 * 配色を切り替える範囲(スコープ)。
 *
 * 中身を data-theme="light|dark" の要素で包み、styles.css の dark: バリアントは
 * この属性の内側だけで効く。いまはマイタイムテーブルだけを包んでいるが、
 * ルートで包めばサイト全体に広がるように、ツール固有のことはここに書かない。
 *
 * 属性は <html> ではなくスコープの要素に付ける。ほかのツールはまだダークの
 * 配色を持たないので、<html> に付けると移動した先のツールまで暗くなりうる。
 * ただしページの背景(iOS の引っ張りすぎで見える部分・中身が短いときの下側)と
 * ページのスクロールバーは <html> 側の色になるため、マウント中だけ <html> の
 * background と color-scheme を合わせ、外れたら元に戻す。
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  loadThemeSetting,
  resolveTheme,
  saveThemeSetting,
} from '../../lib/theme/theme'
import type { ResolvedTheme, ThemeSetting } from '../../lib/theme/theme'

export interface ThemeState {
  setting: ThemeSetting
  theme: ResolvedTheme
  setSetting: (setting: ThemeSetting) => void
}

const ThemeContext = createContext<ThemeState>({
  setting: 'auto',
  theme: 'light',
  setSetting: () => {},
})

/** いまの配色。ThemeScope の外ではライト */
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

/** ページ背景に使う色。スコープの背景(bg-white / dark:bg-gray-950)と揃える */
const PAGE_BACKGROUND: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#030712',
}

export function ThemeScope({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const state = useThemeController()
  const { theme } = state

  useEffect(() => {
    const root = document.documentElement
    const prev = {
      background: root.style.backgroundColor,
      colorScheme: root.style.colorScheme,
    }
    root.style.backgroundColor = PAGE_BACKGROUND[theme]
    root.style.colorScheme = theme
    return () => {
      root.style.backgroundColor = prev.background
      root.style.colorScheme = prev.colorScheme
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={state}>
      <div
        data-theme={theme}
        // フォームの部品・スクロールバーなど、ブラウザが描く部分も配色に合わせる
        style={{ colorScheme: theme }}
        className={`bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100 ${className}`}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
