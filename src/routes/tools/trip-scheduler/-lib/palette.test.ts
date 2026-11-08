import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../../../lib/timetable/colors'
import { buildCityColorMap, fallbackCityColor } from './palette'

const WHITE = '#ffffff'
/** ダークのカードの地(gray-900) */
const DARK_CARD = '#111827'

const allColors = [
  ...buildCityColorMap(
    Array.from({ length: 10 }, (_, i) => `city-${i}`),
  ).values(),
  fallbackCityColor,
]

describe('都市色(ダーク)', () => {
  it('フォールバックを含む 11 色がすべて別の色になっている', () => {
    expect(new Set(allColors.map((color) => color.fill.dark)).size).toBe(11)
  })

  it.each(allColors.map((color) => [color.bar, color]))(
    '%s: 白字が 4.5:1 以上で読める',
    (_bar, color) => {
      expect(contrastRatio(WHITE, color.fill.dark)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(allColors.map((color) => [color.bar, color]))(
    '%s: 暗いカードの上でも面として見分けられる(3:1 は求めず 1.5:1 以上)',
    (_bar, color) => {
      expect(contrastRatio(DARK_CARD, color.fill.dark)).toBeGreaterThanOrEqual(
        1.5,
      )
    },
  )

  it('横棒のクラスは light / dark の両方を持つ', () => {
    for (const color of allColors) {
      expect(color.bar).toMatch(/^bg-\S+ dark:bg-\S+-\d+$/)
    }
  })
})
