import { describe, expect, it } from 'vitest'
import { buildTaiwanMapData, serializeGenerated } from './buildData.ts'
import type { TaiwanDataSource } from './schema.ts'
import type { TaiwanSpot } from './types.ts'

function spot(
  overrides: Partial<TaiwanSpot> & Pick<TaiwanSpot, 'id'>,
): TaiwanSpot {
  return {
    name: overrides.id,
    city: 'taipei',
    location: { lat: 25.05, lng: 121.51 },
    categories: ['food'],
    status: 'visited',
    summary: 'コメント',
    ...overrides,
  }
}

const source: TaiwanDataSource = {
  areas: [
    { id: 'dadaocheng', city: 'taipei', name: '大稻埕', summary: '問屋街' },
    { id: 'shennong', city: 'tainan', name: '神農街', summary: '古い通り' },
  ],
  cityFiles: {
    taipei: [
      spot({
        id: 'a',
        area: 'dadaocheng',
        categories: ['food', 'drink'],
        labels: ['favorite'],
        note: '長いメモ',
        tried: ['豆花'],
      }),
      spot({ id: 'b', categories: ['music'], status: 'want_to_go' }),
    ],
    tainan: [],
    kaohsiung: [
      spot({
        id: 'c',
        city: 'kaohsiung',
        location: { lat: 22.6, lng: 120.3 },
        labels: [],
      }),
    ],
  },
}

describe('buildTaiwanMapData', () => {
  const built = buildTaiwanMapData(source)

  it('manifest は件数 0 の都市・カテゴリを除き、定義順に並べる', () => {
    expect(built.manifest).toEqual({
      cities: [
        { id: 'taipei', name: '台北', count: 2 },
        { id: 'kaohsiung', name: '高雄', count: 1 },
      ],
      categories: [
        { id: 'food', count: 2 },
        { id: 'drink', count: 1 },
        { id: 'music', count: 1 },
      ],
    })
  })

  it('spot-index には本文（summary / note / tried）を入れない', () => {
    expect(built.spotIndex[0]).toEqual({
      id: 'a',
      name: 'a',
      city: 'taipei',
      area: 'dadaocheng',
      lat: 25.05,
      lng: 121.51,
      categories: ['food', 'drink'],
      status: 'visited',
      labels: ['favorite'],
    })
    for (const entry of built.spotIndex) {
      expect(entry).not.toHaveProperty('summary')
      expect(entry).not.toHaveProperty('note')
      expect(entry).not.toHaveProperty('tried')
    }
  })

  it('空の labels や未指定の area はキーごと省く', () => {
    const c = built.spotIndex.find((e) => e.id === 'c')!
    expect(Object.keys(c)).not.toContain('labels')
    expect(Object.keys(c)).not.toContain('area')
  })

  it('都市ファイルはその都市のエリアとスポットだけを持ち、全都市ぶん作る', () => {
    expect(built.cities.map((c) => c.city)).toEqual([
      'taipei',
      'tainan',
      'kaohsiung',
      'taichung',
      'other',
    ])
    const tainan = built.cities.find((c) => c.city === 'tainan')!
    expect(tainan.areas.map((a) => a.id)).toEqual(['shennong'])
    expect(tainan.spots).toEqual([])
    const taipei = built.cities.find((c) => c.city === 'taipei')!
    expect(taipei.spots[0]?.note).toBe('長いメモ')
  })

  it('同じ入力なら出力は常に同一（生成日時などを含まない）', () => {
    const again = buildTaiwanMapData(source)
    expect(serializeGenerated(again.manifest)).toBe(
      serializeGenerated(built.manifest),
    )
    expect(serializeGenerated(again.spotIndex)).toBe(
      serializeGenerated(built.spotIndex),
    )
  })
})
