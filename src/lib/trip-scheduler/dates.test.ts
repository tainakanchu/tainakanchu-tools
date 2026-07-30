import { describe, expect, it } from 'vitest'
import { addDays, dayDiff, formatShortJa, isValidISODate, weekdayJa } from './dates'

describe('dates', () => {
  it('dayDiff は日数差を返す', () => {
    expect(dayDiff('2026-06-12', '2026-06-26')).toBe(14)
    expect(dayDiff('2026-06-12', '2026-06-12')).toBe(0)
    expect(dayDiff('2026-06-26', '2026-06-12')).toBe(-14)
  })

  it('dayDiff は月・年跨ぎを扱える', () => {
    expect(dayDiff('2026-12-28', '2027-01-03')).toBe(6)
  })

  it('addDays は月跨ぎ・うるう年を扱える', () => {
    expect(addDays('2026-06-28', 5)).toBe('2026-07-03')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-06-12', 0)).toBe('2026-06-12')
  })

  it('欧州の夏時間切替日を跨いでも日数がずれない', () => {
    // 2026-03-29 は EU の夏時間開始日
    expect(dayDiff('2026-03-28', '2026-03-30')).toBe(2)
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
  })

  it('weekdayJa / formatShortJa', () => {
    expect(weekdayJa('2026-06-12')).toBe('金')
    expect(formatShortJa('2026-06-12')).toBe('6/12(金)')
  })

  it('isValidISODate', () => {
    expect(isValidISODate('2026-06-12')).toBe(true)
    expect(isValidISODate('2026-6-12')).toBe(false)
    expect(isValidISODate('')).toBe(false)
    expect(isValidISODate('not-a-date')).toBe(false)
  })
})
