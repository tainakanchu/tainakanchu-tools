import { describe, expect, it } from 'vitest'
import {
  citiesWithMatches,
  countByArea,
  countByCategory,
  countByCity,
  countByLabel,
  countByStatus,
  filterSpots,
  hasAnyFilter,
  matchesFilter,
  visibleByCount,
} from './filter.ts'
import type { FilterableSpot } from './filter.ts'

const spots: Array<FilterableSpot & { id: string }> = [
  {
    id: 'a',
    city: 'taipei',
    area: 'dadaocheng',
    categories: ['food'],
    status: 'visited',
    labels: ['favorite'],
  },
  {
    id: 'b',
    city: 'taipei',
    categories: ['music', 'drink'],
    status: 'want_to_go',
  },
  { id: 'c', city: 'tainan', categories: ['food'], status: 'visited' },
  { id: 'd', city: 'kaohsiung', categories: ['stay'], status: 'visited' },
]

const ids = (list: Array<{ id: string }>) => list.map((s) => s.id)

describe('filterSpots', () => {
  it('条件なしなら全件', () => {
    expect(ids(filterSpots(spots, {}))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('各軸で絞り込める', () => {
    expect(ids(filterSpots(spots, { city: 'taipei' }))).toEqual(['a', 'b'])
    expect(ids(filterSpots(spots, { area: 'dadaocheng' }))).toEqual(['a'])
    expect(ids(filterSpots(spots, { category: 'drink' }))).toEqual(['b'])
    expect(ids(filterSpots(spots, { status: 'want_to_go' }))).toEqual(['b'])
    expect(ids(filterSpots(spots, { label: 'favorite' }))).toEqual(['a'])
  })

  it('複数の軸は AND', () => {
    expect(
      ids(filterSpots(spots, { category: 'food', status: 'visited' })),
    ).toEqual(['a', 'c'])
    expect(
      ids(filterSpots(spots, { city: 'tainan', category: 'music' })),
    ).toEqual([])
  })

  it('labels 未指定のスポットはラベル条件に合わない', () => {
    expect(matchesFilter(spots[2], { label: 'recommend' })).toBe(false)
  })
})

describe('citiesWithMatches', () => {
  it('該当スポットのある都市だけを CITIES の順で返す', () => {
    expect(citiesWithMatches(spots, { category: 'food' })).toEqual([
      'taipei',
      'tainan',
    ])
    expect(citiesWithMatches(spots, { status: 'visited' })).toEqual([
      'taipei',
      'tainan',
      'kaohsiung',
    ])
    expect(citiesWithMatches(spots, { category: 'outdoor' })).toEqual([])
  })
})

describe('hasAnyFilter', () => {
  it('どれか 1 つでも条件があれば true', () => {
    expect(hasAnyFilter({})).toBe(false)
    expect(hasAnyFilter({ city: undefined })).toBe(false)
    expect(hasAnyFilter({ label: 'favorite' })).toBe(true)
  })
})

describe('countByCategory', () => {
  it('全カテゴリのキーを持ち、該当なしは 0', () => {
    const counts = countByCategory(spots, {})
    expect(Object.fromEntries(counts)).toEqual({
      food: 2,
      drink: 1,
      shopping: 0,
      culture: 0,
      townscape: 0,
      music: 1,
      stay: 1,
      outdoor: 0,
      other: 0,
    })
    // SPOT_CATEGORIES の順
    expect([...counts.keys()][0]).toBe('food')
  })

  it('カテゴリ条件は無視し、それ以外の条件だけで数える', () => {
    const counts = countByCategory(spots, { city: 'taipei', category: 'food' })
    expect(counts.get('food')).toBe(1)
    expect(counts.get('drink')).toBe(1)
    expect(counts.get('music')).toBe(1)
    expect(counts.get('stay')).toBe(0)
  })

  it('同じカテゴリが重複していても 1 件として数える', () => {
    const dup: Array<FilterableSpot> = [
      { city: 'taipei', categories: ['food', 'food'], status: 'visited' },
    ]
    expect(countByCategory(dup, {}).get('food')).toBe(1)
  })
})

describe('countByStatus', () => {
  it('状況の条件は無視し、それ以外の条件だけで数える', () => {
    const counts = countByStatus(spots, {
      city: 'taipei',
      status: 'visited',
    })
    expect(Object.fromEntries(counts)).toEqual({ visited: 1, want_to_go: 1 })
  })
})

describe('countByLabel', () => {
  it('全ラベルのキーを持ち、ラベルの条件は無視して数える', () => {
    const counts = countByLabel(spots, { label: 'favorite' })
    expect(counts.get('favorite')).toBe(1)
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('他の条件で外れたスポットのラベルは数えない', () => {
    expect(countByLabel(spots, { city: 'tainan' }).get('favorite')).toBe(0)
  })
})

describe('countByCity', () => {
  it('全都市のキーを CITIES の順（北から南・その他）で持ち、該当なしは 0', () => {
    const counts = countByCity(spots)
    expect([...counts.keys()]).toEqual([
      'taipei',
      'taichung',
      'tainan',
      'kaohsiung',
      'other',
    ])
    expect(Object.fromEntries(counts)).toEqual({
      taipei: 2,
      taichung: 0,
      tainan: 1,
      kaohsiung: 1,
      other: 0,
    })
  })
})

describe('countByArea', () => {
  it('エリアごとに数え、エリア未設定は数えない', () => {
    const more: Array<FilterableSpot> = [
      ...spots,
      { city: 'taipei', area: 'dadaocheng', categories: [], status: 'visited' },
    ]
    const counts = countByArea(more)
    expect(Object.fromEntries(counts)).toEqual({ dadaocheng: 2 })
  })
})

describe('visibleByCount', () => {
  const items = [{ id: 'x' }, { id: 'y' }, { id: 'z' }]
  const counts = new Map([
    ['x', 3],
    ['y', 0],
  ])

  it('0 件（と件数の無いもの）を除き、元の順を保つ', () => {
    expect(visibleByCount(items, counts, undefined)).toEqual([{ id: 'x' }])
  })

  it('選択中なら 0 件でも残す', () => {
    expect(visibleByCount(items, counts, 'z')).toEqual([
      { id: 'x' },
      { id: 'z' },
    ])
  })

  it('件数が分からないときは全部出す', () => {
    expect(visibleByCount(items, null, undefined)).toEqual(items)
  })
})
