import { describe, expect, it } from 'vitest'
import {
  citiesWithMatches,
  filterSpots,
  hasAnyFilter,
  matchesFilter,
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
