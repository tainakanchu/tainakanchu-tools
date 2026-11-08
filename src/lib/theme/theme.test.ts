// @vitest-environment jsdom
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import indexHtml from '../../../index.html?raw'
import {
  THEME_STORAGE_KEY,
  loadThemeSetting,
  parseThemeSetting,
  resolveTheme,
  saveThemeSetting,
} from './theme'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('parseThemeSetting', () => {
  it('知っている値だけ通し、ほかは自動にする', () => {
    expect(parseThemeSetting('dark')).toBe('dark')
    expect(parseThemeSetting('light')).toBe('light')
    expect(parseThemeSetting('auto')).toBe('auto')
    expect(parseThemeSetting('Dark')).toBe('auto')
    expect(parseThemeSetting(null)).toBe('auto')
    expect(parseThemeSetting(1)).toBe('auto')
  })
})

describe('resolveTheme', () => {
  it('自動は OS の設定に従い、手動の指定はそれを優先する', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('保存', () => {
  it('書いた設定を読み戻せる。自動はキーを消す', () => {
    expect(loadThemeSetting()).toBe('auto')
    expect(saveThemeSetting('dark')).toBe(true)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(loadThemeSetting()).toBe('dark')
    saveThemeSetting('auto')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(loadThemeSetting()).toBe('auto')
  })

  it('localStorage が例外を投げても止まらない', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(loadThemeSetting()).toBe('auto')
    expect(saveThemeSetting('dark')).toBe(false)
  })
})

/**
 * index.html のインライン script(初回描画前に data-theme を付ける)を実際に動かし、
 * ThemeProvider の初期値(loadThemeSetting + resolveTheme)と食い違わないかを見る。
 * 食い違うと、読み込み直後に配色が一瞬切り替わる
 */
describe('index.html の初期配色 script', () => {
  const inlineScripts = [
    ...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g),
  ].map((m) => m[1])

  // ブラウザの代わりに、script が触る window(localStorage・matchMedia)と
  // <html> だけを持つ環境で動かす
  function runBootScript(prefersDark: boolean) {
    const root: {
      dataset: Record<string, string>
      style: Record<string, string>
    } = {
      dataset: {},
      style: {},
    }
    runInNewContext(inlineScripts[0], {
      window: {
        localStorage: window.localStorage,
        matchMedia: (query: string) => ({
          matches: prefersDark && query === '(prefers-color-scheme: dark)',
        }),
      },
      document: { documentElement: root },
    })
    return { theme: root.dataset.theme, colorScheme: root.style.colorScheme }
  }

  it('インライン script は配色の 1 本だけ', () => {
    expect(inlineScripts).toHaveLength(1)
  })

  it.each([null, 'auto', 'light', 'dark', 'Dark', 'broken'])(
    '保存値 %s でも theme.ts と同じ配色になる',
    (stored) => {
      for (const prefersDark of [false, true]) {
        window.localStorage.clear()
        if (stored !== null) {
          window.localStorage.setItem(THEME_STORAGE_KEY, stored)
        }
        const expected = resolveTheme(loadThemeSetting(), prefersDark)
        expect(runBootScript(prefersDark)).toEqual({
          theme: expected,
          colorScheme: expected,
        })
      }
    },
  )

  it('localStorage が読めなくても OS の設定で決める', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(runBootScript(true).theme).toBe('dark')
    expect(runBootScript(false).theme).toBe('light')
  })
})
