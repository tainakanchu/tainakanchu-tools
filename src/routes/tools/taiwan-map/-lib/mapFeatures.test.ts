import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS } from './categoryColors'
import { spotsToFeatureCollection } from './mapFeatures'
import type { TaiwanSpot } from '../../../../lib/taiwan-map/types'

function spot(over: Partial<TaiwanSpot>): TaiwanSpot {
  return {
    id: 'a',
    name: 'a',
    city: 'taipei',
    location: { lat: 25.05, lng: 121.51 },
    categories: ['music', 'drink'],
    status: 'visited',
    summary: 'x',
    ...over,
  }
}

describe('spotsToFeatureCollection', () => {
  it('経度・緯度の順で座標を持ち、id・色・訪問状況を properties に入れる', () => {
    const fc = spotsToFeatureCollection([spot({})], undefined)
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toEqual([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [121.51, 25.05] },
        properties: {
          id: 'a',
          color: CATEGORY_COLORS.music,
          visited: true,
          sortKey: 1,
        },
      },
    ])
  })

  it('絞り込み中のジャンルを持っていれば、その色で塗る', () => {
    const fc = spotsToFeatureCollection([spot({})], 'drink')
    expect(fc.features[0].properties.color).toBe(CATEGORY_COLORS.drink)
  })

  it('未訪問は visited=false で、行った場所より下に重ねる', () => {
    const fc = spotsToFeatureCollection(
      [spot({ id: 'w', status: 'want_to_go' }), spot({ id: 'v' })],
      undefined,
    )
    expect(fc.features.map((f) => f.properties)).toMatchObject([
      { id: 'w', visited: false, sortKey: 0 },
      { id: 'v', visited: true, sortKey: 1 },
    ])
  })
})
