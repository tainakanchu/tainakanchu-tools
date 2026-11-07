import { describe, expect, it } from 'vitest'
import { isToolAppPathname, parseToolAppLaunch } from './tool-app'

const origin = 'https://tools.tainakanchu.com'

describe('parseToolAppLaunch', () => {
  it('start_url の印を読み、印を除いた URL を返す', () => {
    expect(
      parseToolAppLaunch(`${origin}/tools/timetable?pwa=timetable`),
    ).toEqual({ slug: 'timetable', cleanedHref: '/tools/timetable' })
  })

  it('他の検索パラメータとハッシュは残す', () => {
    expect(
      parseToolAppLaunch(`${origin}/tools/timetable?t=abc&pwa=timetable#x`),
    ).toEqual({ slug: 'timetable', cleanedHref: '/tools/timetable?t=abc#x' })
  })

  it('印が無ければ何もしない', () => {
    expect(parseToolAppLaunch(`${origin}/tools/timetable?t=abc`)).toEqual({
      slug: undefined,
      cleanedHref: undefined,
    })
  })

  it('別ツールの URL・PWA 非対応ツール・未知の slug では印だけ消して無視する', () => {
    expect(
      parseToolAppLaunch(`${origin}/tools/trip-notes?pwa=timetable`),
    ).toEqual({ slug: undefined, cleanedHref: '/tools/trip-notes' })
    expect(
      parseToolAppLaunch(`${origin}/tools/drum-roll?pwa=drum-roll`),
    ).toEqual({ slug: undefined, cleanedHref: '/tools/drum-roll' })
    expect(parseToolAppLaunch(`${origin}/?pwa=nope`)).toEqual({
      slug: undefined,
      cleanedHref: '/',
    })
  })
})

describe('isToolAppPathname', () => {
  it('起動したツールの中にいる間だけ true', () => {
    expect(isToolAppPathname('/tools/timetable', 'timetable')).toBe(true)
    expect(isToolAppPathname('/', 'timetable')).toBe(false)
    expect(isToolAppPathname('/tools/trip-notes', 'timetable')).toBe(false)
    expect(isToolAppPathname('/tools/timetable', undefined)).toBe(false)
  })
})
