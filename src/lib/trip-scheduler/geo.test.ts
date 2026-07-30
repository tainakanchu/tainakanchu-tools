import { describe, expect, it } from 'vitest'
import { cityCatalog, getCity } from './cities'
import {
  buildRouteNodes,
  buildRouteSegments,
  projectCities,
  segmentMidpoint,
} from './geo'
import type { City } from './types'

const WIDTH = 400
const HEIGHT = 440
const PADDING = 24

const points = projectCities(cityCatalog, WIDTH, HEIGHT, PADDING)

function pointOf(cityId: string) {
  const point = points.get(cityId)
  if (!point) throw new Error(`未投影の都市: ${cityId}`)
  return point
}

function cityOf(cityId: string): City {
  const city = getCity(cityId)
  if (!city) throw new Error(`カタログに無い都市: ${cityId}`)
  return city
}

describe('projectCities', () => {
  it('北の都市ほど y が小さい', () => {
    // オスロ (59.9N) > コペンハーゲン (55.7N) > パリ (48.9N) > ローマ (41.9N) > アテネ (38.0N)
    const northToSouth = ['oslo', 'copenhagen', 'paris', 'rome', 'athens']
    for (let i = 0; i + 1 < northToSouth.length; i++) {
      const north = cityOf(northToSouth[i])
      const south = cityOf(northToSouth[i + 1])
      expect(north.lat).toBeGreaterThan(south.lat)
      expect(pointOf(north.id).y).toBeLessThan(pointOf(south.id).y)
    }
  })

  it('西の都市ほど x が小さい', () => {
    // リスボン (9.1W) < パリ (2.4E) < ウィーン (16.4E) < ヘルシンキ (24.9E)
    const westToEast = ['lisbon', 'paris', 'vienna', 'helsinki']
    for (let i = 0; i + 1 < westToEast.length; i++) {
      const west = cityOf(westToEast[i])
      const east = cityOf(westToEast[i + 1])
      expect(west.lng).toBeLessThan(east.lng)
      expect(pointOf(west.id).x).toBeLessThan(pointOf(east.id).x)
    }
  })

  it('全都市が padding の内側に収まる', () => {
    expect(points.size).toBe(cityCatalog.length)
    for (const city of cityCatalog) {
      const point = pointOf(city.id)
      expect(point.x).toBeGreaterThanOrEqual(PADDING - 1e-9)
      expect(point.x).toBeLessThanOrEqual(WIDTH - PADDING + 1e-9)
      expect(point.y).toBeGreaterThanOrEqual(PADDING - 1e-9)
      expect(point.y).toBeLessThanOrEqual(HEIGHT - PADDING + 1e-9)
    }
  })

  it('緯度差と経度差の比が実距離に近づくよう経度を縮める', () => {
    // パリ〜ベルリン: 経度差 11.05 度・緯度差 3.66 度。平均緯度 (約48度) では
    // 経度1度が緯度1度の約 2/3 なので、x の伸びは経度差そのままより小さくなる
    const paris = pointOf('paris')
    const berlin = pointOf('berlin')
    const lngRatio =
      (cityOf('berlin').lng - cityOf('paris').lng) /
      (cityOf('berlin').lat - cityOf('paris').lat)
    const pointRatio = (berlin.x - paris.x) / (paris.y - berlin.y)
    expect(pointRatio).toBeLessThan(lngRatio)
    expect(pointRatio).toBeGreaterThan(lngRatio * 0.5)
  })

  it('都市が1つでも枠の中央に収まる', () => {
    const single = projectCities([cityOf('paris')], WIDTH, HEIGHT, PADDING)
    expect(single.get('paris')).toEqual({ x: WIDTH / 2, y: HEIGHT / 2 })
  })

  it('都市が0件なら空の Map を返す', () => {
    expect(projectCities([], WIDTH, HEIGHT, PADDING).size).toBe(0)
  })
})

describe('buildRouteSegments', () => {
  it('訪問順に折れ線をつなぎ、移動手段を持つ', () => {
    const segments = buildRouteSegments(
      [
        { cityId: 'paris', mode: 'train' },
        { cityId: 'rome', mode: 'flight' },
        { cityId: 'athens', mode: null },
      ],
      points,
    )
    expect(segments).toHaveLength(2)
    expect(segments[0].fromCityId).toBe('paris')
    expect(segments[0].toCityId).toBe('rome')
    expect(segments[0].mode).toBe('train')
    expect(segments[0].fromOrder).toBe(1)
    expect(segments[0].toOrder).toBe(2)
    expect(segments[1].mode).toBe('flight')
    expect(segments[0].from).toEqual(pointOf('paris'))
    expect(segments[1].to).toEqual(pointOf('athens'))
  })

  it('パリ→ローマの中間点が両者の間にある', () => {
    const [segment] = buildRouteSegments(
      [{ cityId: 'paris', mode: 'nightTrain' }, { cityId: 'rome' }],
      points,
    )
    const paris = pointOf('paris')
    const rome = pointOf('rome')
    const mid = segmentMidpoint(segment)
    // ローマはパリより南東なので、中間点は x も y も両者の間になる
    expect(mid.x).toBeGreaterThan(paris.x)
    expect(mid.x).toBeLessThan(rome.x)
    expect(mid.y).toBeGreaterThan(paris.y)
    expect(mid.y).toBeLessThan(rome.y)
    expect(mid.x).toBeCloseTo((paris.x + rome.x) / 2, 6)
    expect(mid.y).toBeCloseTo((paris.y + rome.y) / 2, 6)
  })

  it('隣接する同一都市はセグメントを作らない', () => {
    const segments = buildRouteSegments(
      [
        { cityId: 'paris', mode: null },
        { cityId: 'paris', mode: 'train' },
        { cityId: 'rome', mode: null },
      ],
      points,
    )
    expect(segments).toHaveLength(1)
    expect(segments[0].fromCityId).toBe('paris')
    expect(segments[0].toCityId).toBe('rome')
    // まとめた区間の最後の滞在が持つ手段を使う
    expect(segments[0].mode).toBe('train')
  })

  it('同一都市だけの旅程ではセグメントが空になる', () => {
    const segments = buildRouteSegments(
      [{ cityId: 'paris' }, { cityId: 'paris' }],
      points,
    )
    expect(segments).toHaveLength(0)
  })

  it('離れた位置での再訪はセグメントを作る', () => {
    const segments = buildRouteSegments(
      [{ cityId: 'paris' }, { cityId: 'rome' }, { cityId: 'paris' }],
      points,
    )
    expect(segments).toHaveLength(2)
    expect(segments[1].fromCityId).toBe('rome')
    expect(segments[1].toCityId).toBe('paris')
  })

  it('滞在が0〜1件ならセグメントは空', () => {
    expect(buildRouteSegments([], points)).toHaveLength(0)
    expect(buildRouteSegments([{ cityId: 'paris' }], points)).toHaveLength(0)
  })

  it('カタログに無い都市は飛ばす', () => {
    const segments = buildRouteSegments(
      [{ cityId: 'paris' }, { cityId: 'unknown-city' }, { cityId: 'rome' }],
      points,
    )
    expect(segments).toHaveLength(0)
  })
})

describe('buildRouteNodes', () => {
  it('訪問都市を初回訪問順に返し、訪問番号を持つ', () => {
    const nodes = buildRouteNodes(
      [{ cityId: 'paris' }, { cityId: 'rome' }, { cityId: 'athens' }],
      points,
    )
    expect(nodes.map((node) => node.cityId)).toEqual([
      'paris',
      'rome',
      'athens',
    ])
    expect(nodes.map((node) => node.orders)).toEqual([[1], [2], [3]])
    expect(nodes[0].point).toEqual(pointOf('paris'))
  })

  it('隣接する同一都市は1点にまとめる', () => {
    const nodes = buildRouteNodes(
      [{ cityId: 'paris' }, { cityId: 'paris' }, { cityId: 'rome' }],
      points,
    )
    expect(nodes).toHaveLength(2)
    expect(nodes[0].orders).toEqual([1])
    expect(nodes[1].orders).toEqual([2])
  })

  it('再訪した都市は同じ点に訪問番号をまとめる', () => {
    const nodes = buildRouteNodes(
      [{ cityId: 'paris' }, { cityId: 'rome' }, { cityId: 'paris' }],
      points,
    )
    expect(nodes).toHaveLength(2)
    expect(nodes[0].cityId).toBe('paris')
    expect(nodes[0].orders).toEqual([1, 3])
    expect(nodes[1].orders).toEqual([2])
  })
})
