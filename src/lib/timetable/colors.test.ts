import { describe, expect, it } from 'vitest'
import { contrastRatio, gridColors, venueColor } from './colors'
import type { ColorTheme } from './colors'

const THEMES: Array<ColorTheme> = ['light', 'dark']
/** パレット 10 色 × 3 周 */
const INDEXES = Array.from({ length: 30 }, (_, i) => i)

describe.each(THEMES)('venueColor(%s)', (theme) => {
  it('塗り(お気に入り)の上の文字が 4.5:1 以上', () => {
    for (const i of INDEXES) {
      const c = venueColor(i, theme)
      expect(contrastRatio(c.fill, c.text)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('塗らない出演(tint)の上の文字が 4.5:1 以上', () => {
    for (const i of INDEXES) {
      const c = venueColor(i, theme)
      expect(contrastRatio(c.tint, c.tintText)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('お気に入りの塗りと塗らない出演の背景がはっきり違う', () => {
    for (const i of INDEXES) {
      const c = venueColor(i, theme)
      expect(contrastRatio(c.fill, c.tint)).toBeGreaterThanOrEqual(2)
    }
  })

  it('左の帯が tint の上で見える', () => {
    // ダークは図形の目安の 3:1 を満たす。ライトは従来どおり帯 = 塗りで、
    // 3 周目の明るい色だけ 2:1 台になる(帯は形の手がかりで、文字ではない)
    const min = theme === 'dark' ? 3 : 2
    for (const i of INDEXES) {
      const c = venueColor(i, theme)
      expect(contrastRatio(c.bar, c.tint)).toBeGreaterThanOrEqual(min)
    }
  })

  it('隣の会場と同じ色にならない', () => {
    for (const i of INDEXES.slice(0, -1)) {
      expect(venueColor(i, theme).fill).not.toBe(venueColor(i + 1, theme).fill)
    }
  })

  it('終わった出演も文字が 4.5:1 以上', () => {
    const g = gridColors(theme)
    expect(contrastRatio(g.pastBg, g.pastText)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('ダークの tint', () => {
  it('淡い色(眩しい色)にならない', () => {
    for (const i of INDEXES) {
      // 明るい文字(#e5e7eb)を載せるので、背景は十分暗い
      expect(contrastRatio(venueColor(i, 'dark').tint, '#000000')).toBeLessThan(
        2.5,
      )
    }
  })

  it('ライトの配色は変えない', () => {
    expect(venueColor(0)).toEqual(venueColor(0, 'light'))
    expect(venueColor(0).fill).toBe('#2b6cb0')
  })
})
