import { describe, expect, it } from 'vitest'
import { formatVisitedAt, googleMapsSearchUrl, publicText } from './format.ts'

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

describe('publicText', () => {
  it('TODO の印だけの本文は出さない', () => {
    expect(publicText('（TODO: かんちゅのコメント未記入）')).toBeUndefined()
    expect(publicText('(TODO)')).toBeUndefined()
    expect(publicText('TODO: あとで書く')).toBeUndefined()
  })
  it('TODO の括弧書きを除いた残りの文章は出す', () => {
    expect(
      publicText('（TODO: かんちゅのコメント未記入）淡水河沿いの古い問屋街。'),
    ).toBe('淡水河沿いの古い問屋街。')
  })
  it('ふつうの本文・未指定はそのまま', () => {
    expect(publicText('魯肉飯がおいしい')).toBe('魯肉飯がおいしい')
    expect(publicText(undefined)).toBeUndefined()
    expect(publicText('   ')).toBeUndefined()
  })
  it('TODO を含む単語の一部は TODO 扱いしない', () => {
    expect(publicText('TODOROKI という店')).toBe('TODOROKI という店')
  })
})
