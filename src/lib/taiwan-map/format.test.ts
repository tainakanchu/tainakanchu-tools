import { describe, expect, it } from 'vitest'
import { formatVisitedAt, googleMapsSearchUrl } from './format.ts'

describe('formatVisitedAt', () => {
  it('年月・年月日を日本語にする', () => {
    expect(formatVisitedAt('2026-08')).toBe('2026年8月')
    expect(formatVisitedAt('2026-08-05')).toBe('2026年8月5日')
  })
  it('形式外はそのまま返す', () => {
    expect(formatVisitedAt('去年の夏')).toBe('去年の夏')
  })
})

describe('googleMapsSearchUrl', () => {
  it('検索語をエンコードする', () => {
    expect(googleMapsSearchUrl('江牛樓 民樂街6號')).toBe(
      'https://www.google.com/maps/search/?api=1&query=%E6%B1%9F%E7%89%9B%E6%A8%93%20%E6%B0%91%E6%A8%82%E8%A1%976%E8%99%9F',
    )
  })
})
