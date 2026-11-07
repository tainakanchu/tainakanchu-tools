import { describe, expect, it } from 'vitest'
import {
  matchesSearch,
  normalizeSearchText,
  searchTerms,
  spotSearchFields,
} from './search.ts'

describe('normalizeSearchText', () => {
  it('ひらがなをカタカナにそろえる', () => {
    expect(normalizeSearchText('ぎゅうにく')).toBe('ギュウニク')
    expect(normalizeSearchText('ゔぁ')).toBe('ヴァ')
  })
  it('半角カナは全角カナに、全角英数は半角にそろえる（NFKC）', () => {
    expect(normalizeSearchText('ｷﾞｭｳﾆｸ')).toBe('ギュウニク')
    expect(normalizeSearchText('ＣＡＦＥ１０１')).toBe('cafe101')
  })
  it('小文字にし、空白を 1 つにまとめて前後を落とす', () => {
    expect(normalizeSearchText('  Coffee　 Bar ')).toBe('coffee bar')
  })
  it('漢字はそのまま', () => {
    expect(normalizeSearchText('牛肉麵')).toBe('牛肉麵')
  })
})

describe('searchTerms', () => {
  it('空・空白だけなら語なし', () => {
    expect(searchTerms(undefined)).toEqual([])
    expect(searchTerms('   ')).toEqual([])
  })
  it('空白（全角も）で区切る', () => {
    expect(searchTerms('牛肉　しんや')).toEqual(['牛肉', 'シンヤ'])
  })
})

describe('matchesSearch', () => {
  const fields = spotSearchFields(
    {
      name: 'ギュウニク麺の店',
      nameZh: '老王牛肉麵',
      tags: ['深夜', 'Cafe'],
      summary: 'スープが濃い。',
    },
    '大稻埕・迪化街',
  )
  it('語が無ければ常に一致', () => {
    expect(matchesSearch(fields, [])).toBe(true)
  })
  it('ひらがなで入れてもカタカナの名前に一致', () => {
    expect(matchesSearch(fields, searchTerms('ぎゅうにく'))).toBe(true)
  })
  it('中国語名・タグ・エリア名・コメントも対象', () => {
    expect(matchesSearch(fields, searchTerms('老王'))).toBe(true)
    expect(matchesSearch(fields, searchTerms('ｃａｆｅ'))).toBe(true)
    expect(matchesSearch(fields, searchTerms('迪化街'))).toBe(true)
    expect(matchesSearch(fields, searchTerms('すーぷ'))).toBe(true)
  })
  it('すべての語を含むときだけ一致', () => {
    expect(matchesSearch(fields, searchTerms('深夜 牛肉'))).toBe(true)
    expect(matchesSearch(fields, searchTerms('深夜 小籠包'))).toBe(false)
  })
  it('フィールドの境目をまたいでは一致しない', () => {
    // 「深夜」と「Cafe」の境目
    expect(matchesSearch(fields, searchTerms('夜cafe'))).toBe(false)
  })
  it('undefined のフィールドは飛ばす', () => {
    expect(matchesSearch(['a', undefined], searchTerms('a'))).toBe(true)
  })
})
