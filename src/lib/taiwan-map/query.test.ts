import { describe, expect, it } from 'vitest'
import {
  filterFromSearch,
  orderTaiwanMapSearch,
  parseTaiwanMapSearch,
  serializeTaiwanMapSearch,
} from './query.ts'

describe('parseTaiwanMapSearch', () => {
  it('既知の値だけを拾う', () => {
    expect(
      parseTaiwanMapSearch({
        city: 'taipei',
        area: 'dadaocheng',
        category: 'music',
        status: 'visited',
        label: 'favorite',
        spot: 'sidoli-radio',
        view: 'map',
      }),
    ).toEqual({
      city: 'taipei',
      area: 'dadaocheng',
      category: 'music',
      status: 'visited',
      label: 'favorite',
      spot: 'sidoli-radio',
      view: 'map',
    })
  })

  it('未知の値・型違い・余計なキーは黙って捨てる', () => {
    expect(
      parseTaiwanMapSearch({
        city: 'tokyo',
        category: ['food'],
        status: 'went',
        label: 1,
        area: '<script>',
        spot: '../etc/passwd',
        view: 'grid',
        utm_source: 'x',
      }),
    ).toEqual({})
  })

  it('view=list は既定値なので結果に含めない', () => {
    expect(parseTaiwanMapSearch({ view: 'list' })).toEqual({})
  })

  it('数字だけの id（JSON として number で届く）も受け付ける', () => {
    expect(parseTaiwanMapSearch({ spot: 101 })).toEqual({ spot: '101' })
  })
})

describe('serializeTaiwanMapSearch', () => {
  it('キー順を固定し、未指定のキーは出さない', () => {
    expect(
      serializeTaiwanMapSearch({
        spot: 'x',
        category: 'food',
        city: 'taipei',
      }),
    ).toBe('city=taipei&category=food&spot=x')
    expect(serializeTaiwanMapSearch({})).toBe('')
  })

  it('parse と往復できる', () => {
    const search = {
      city: 'taipei',
      area: 'dadaocheng',
      status: 'want_to_go',
    } as const
    const round = parseTaiwanMapSearch(
      Object.fromEntries(new URLSearchParams(serializeTaiwanMapSearch(search))),
    )
    expect(round).toEqual(search)
  })
})

describe('filterFromSearch', () => {
  it('spot と view は絞り込み条件に含めない', () => {
    const filter = filterFromSearch({ city: 'taipei', spot: 'x', view: 'map' })
    expect(filter).not.toHaveProperty('spot')
    expect(filter).not.toHaveProperty('view')
    expect(filter.city).toBe('taipei')
  })
})

describe('orderTaiwanMapSearch', () => {
  it('キーを serialize と同じ順に並べ、undefined を落とす', () => {
    const ordered = orderTaiwanMapSearch({
      view: 'map',
      spot: 'x',
      category: undefined,
      city: 'taipei',
    })
    expect(Object.keys(ordered)).toEqual(['city', 'spot', 'view'])
    expect(new URLSearchParams(ordered).toString()).toBe(
      serializeTaiwanMapSearch(ordered),
    )
  })
})
