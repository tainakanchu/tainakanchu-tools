import { describe, expect, it } from 'vitest'
import { hasNonJapaneseHan, langOf } from './lang'

describe('langOf', () => {
  it('簡体字にしか無い字を含む名前は zh-Hans', () => {
    expect(langOf('丑橘出逃乐队')).toBe('zh-Hans')
    expect(langOf('Dekopon Escaping 丑橘出逃乐队')).toBe('zh-Hans')
    expect(langOf('秘密行动')).toBe('zh-Hans')
    expect(langOf('STOLEN 秘密行动')).toBe('zh-Hans')
  })

  it('日本語の書体に無い繁体字を含む名前は zh-Hant', () => {
    expect(langOf('妳說的話')).toBe('zh-Hant')
    expect(langOf('Neon 說')).toBe('zh-Hant')
  })

  it('日本語の書体で描ける漢字だけなら、ページの ja を引き継ぐ', () => {
    // 衛 柏 はどちらも日本語の書体にあり、混ざらずに描ける
    expect(langOf('衛柏 Neon')).toBeUndefined()
    // 漢字だけの日本語の名前を中国語の書体にしない
    expect(langOf('長渕剛')).toBeUndefined()
    expect(langOf('東京事変')).toBeUndefined()
    expect(langOf('国立競技場')).toBeUndefined()
    expect(langOf('黄昏')).toBeUndefined()
  })

  it('ハングルを含む名前は ko', () => {
    expect(langOf('Kangziwon 강지원')).toBe('ko')
  })

  it('欧文だけ・空なら undefined', () => {
    expect(langOf('MAKKURAGE')).toBeUndefined()
    expect(langOf('')).toBeUndefined()
    expect(langOf(undefined)).toBeUndefined()
    expect(langOf(null)).toBeUndefined()
  })

  it('かなを含む名前は ja', () => {
    expect(langOf('ずっと真夜中でいいのに。')).toBe('ja')
    expect(langOf('サカナクション')).toBe('ja')
  })

  it('同じ文字列は何度呼んでも同じ結果', () => {
    expect(langOf('丑橘出逃乐队')).toBe(langOf('丑橘出逃乐队'))
  })
})

describe('hasNonJapaneseHan', () => {
  it('日本語の文字集合に無い漢字を見分ける', () => {
    expect(hasNonJapaneseHan('乐')).toBe(true)
    expect(hasNonJapaneseHan('队')).toBe(true)
    expect(hasNonJapaneseHan('动')).toBe(true)
    expect(hasNonJapaneseHan('丑橘出逃')).toBe(false)
    expect(hasNonJapaneseHan('髙﨑')).toBe(false)
    expect(hasNonJapaneseHan('ABC')).toBe(false)
  })
})
