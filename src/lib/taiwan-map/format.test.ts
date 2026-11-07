import { describe, expect, it } from 'vitest'
import {
  extraNameZh,
  formatVisitedAt,
  googleMapsSearchUrl,
  publicText,
  spotMapsUrl,
  spotSubtitle,
} from './format.ts'

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

describe('extraNameZh', () => {
  it('名前に含まれていない中国語名だけを返す', () => {
    expect(extraNameZh({ name: 'Waiting Room', nameZh: '等候室' })).toBe(
      '等候室',
    )
    expect(
      extraNameZh({ name: 'SIDOLI RADIO 小島裡', nameZh: '小島裡' }),
    ).toBeUndefined()
    expect(extraNameZh({ name: '江牛樓' })).toBeUndefined()
  })
})

describe('spotMapsUrl', () => {
  it('googleMapsUrl を優先し、無ければ中国語名 → 名前で検索する', () => {
    expect(
      spotMapsUrl({ name: 'a', googleMapsUrl: 'https://maps.app.goo.gl/x' }),
    ).toBe('https://maps.app.goo.gl/x')
    expect(spotMapsUrl({ name: 'a', nameZh: '江牛樓' })).toBe(
      googleMapsSearchUrl('江牛樓'),
    )
    expect(spotMapsUrl({ name: 'Revolver' })).toBe(
      googleMapsSearchUrl('Revolver'),
    )
  })
})

describe('spotSubtitle', () => {
  it('タグを読点でつなぐ', () => {
    expect(spotSubtitle(['牛肉麵', '深夜'])).toBe('牛肉麵、深夜')
  })
  it('空のタグは飛ばし、無ければ undefined', () => {
    expect(spotSubtitle(['', ' 豆花 '])).toBe('豆花')
    expect(spotSubtitle([])).toBeUndefined()
    expect(spotSubtitle(undefined)).toBeUndefined()
  })
  it('多すぎるタグは先頭から max 個まで', () => {
    expect(spotSubtitle(['a', 'b', 'c', 'd', 'e'], 3)).toBe('a、b、c')
  })
})
