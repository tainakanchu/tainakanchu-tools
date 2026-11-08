import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS, CATEGORY_COLORS_DARK } from './categoryColors'
import {
  LOCAL_NAME_TEXT_FIELD,
  coreBounds,
  localizedTextField,
  spotsToFeatureCollection,
} from './mapFeatures'
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
          name: 'a',
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

  it('ダークでは一段明るいジャンル色で塗る', () => {
    const fc = spotsToFeatureCollection([spot({})], 'drink', 'dark')
    expect(fc.features[0].properties.color).toBe(CATEGORY_COLORS_DARK.drink)
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

describe('localizedTextField', () => {
  // OpenFreeMap positron の地名・道路名の text-field（2026-11 時点）
  const bilingual = [
    'case',
    ['has', 'name:nonlatin'],
    ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
    ['coalesce', ['get', 'name_en'], ['get', 'name']],
  ]

  it('名前の 2 段組みは中国語（現地表記）だけの式に差し替える', () => {
    expect(localizedTextField(bilingual)).toEqual(LOCAL_NAME_TEXT_FIELD)
    expect(LOCAL_NAME_TEXT_FIELD[1]).toEqual(['get', 'name:nonlatin'])
  })

  it('古い {name:latin} 形式の文字列も差し替える', () => {
    expect(localizedTextField('{name:latin}\n{name:nonlatin}')).toEqual(
      LOCAL_NAME_TEXT_FIELD,
    )
    expect(localizedTextField('{name}')).toEqual(LOCAL_NAME_TEXT_FIELD)
  })

  it('道路番号など名前以外のラベル・text-field の無いレイヤーは触らない', () => {
    expect(localizedTextField(['to-string', ['get', 'ref']])).toBeNull()
    expect(localizedTextField('{ref}')).toBeNull()
    expect(localizedTextField(undefined)).toBeNull()
  })
})

describe('coreBounds', () => {
  it('点が無ければ null', () => {
    expect(coreBounds([])).toBeNull()
  })
  it('少ないときは全件を囲む', () => {
    expect(
      coreBounds([
        { lat: 25, lng: 121.5 },
        { lat: 24, lng: 122 },
      ]),
    ).toEqual([
      [121.5, 24],
      [122, 25],
    ])
  })
  it('中心から外れた 1 割は囲まない', () => {
    // 中心部に 18 件 + 遠くに 2 件（貓空のような外れ値）
    const center = Array.from({ length: 18 }, (_, i) => ({
      lat: 25.04 + (i % 6) * 0.004,
      lng: 121.51 + Math.floor(i / 6) * 0.01,
    }))
    const outliers = [
      { lat: 24.9689, lng: 121.5883 },
      { lat: 25.0848, lng: 121.562 },
    ]
    const box = coreBounds([...outliers, ...center])!
    const [[west, south], [east, north]] = box
    expect(south).toBeCloseTo(25.04, 6)
    expect(north).toBeCloseTo(25.06, 6)
    expect(west).toBeCloseTo(121.51, 6)
    expect(east).toBeCloseTo(121.53, 6)
  })
  it('keepRatio 1 なら全件', () => {
    const pts = [
      { lat: 25, lng: 121 },
      { lat: 25.01, lng: 121.01 },
      { lat: 25.02, lng: 121.02 },
      { lat: 25.03, lng: 121.03 },
      { lat: 25.04, lng: 121.04 },
      { lat: 26, lng: 122 },
    ]
    expect(coreBounds(pts, 1)).toEqual([
      [121, 25],
      [122, 26],
    ])
  })
})
