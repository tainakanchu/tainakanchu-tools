// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
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
