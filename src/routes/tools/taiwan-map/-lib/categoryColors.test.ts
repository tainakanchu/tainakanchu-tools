import { describe, expect, it } from 'vitest'
import { SPOT_CATEGORY_IDS } from '../../../../lib/taiwan-map/types'
import { CATEGORY_COLORS, pinCategory } from './categoryColors'

describe('CATEGORY_COLORS', () => {
  it('全カテゴリに別々の色がある', () => {
    const colors = SPOT_CATEGORY_IDS.map((id) => CATEGORY_COLORS[id])
    expect(colors.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true)
    expect(new Set(colors).size).toBe(SPOT_CATEGORY_IDS.length)
  })
})

describe('pinCategory', () => {
  it('絞り込みなしなら先頭のカテゴリ', () => {
    expect(pinCategory(['music', 'drink'], undefined)).toBe('music')
  })

  it('絞り込み中のカテゴリを持っていればそれを使う', () => {
    expect(pinCategory(['music', 'drink'], 'drink')).toBe('drink')
  })

  it('絞り込み中のカテゴリを持っていなければ先頭', () => {
    expect(pinCategory(['music', 'drink'], 'food')).toBe('music')
  })

  it('カテゴリが空なら other', () => {
    expect(pinCategory([], undefined)).toBe('other')
  })
})
