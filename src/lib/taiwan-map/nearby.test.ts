import { describe, expect, it } from 'vitest'
import { distanceMeters, formatDistance, sortSpots } from './nearby.ts'

// 台北駅と台北 101 はおよそ 4.4km
const TAIPEI_STATION = { lat: 25.0478, lng: 121.517 }
const TAIPEI_101 = { lat: 25.0339, lng: 121.5645 }

describe('distanceMeters', () => {
  it('同じ点は 0', () => {
    expect(distanceMeters(TAIPEI_STATION, TAIPEI_STATION)).toBe(0)
  })
  it('台北駅〜台北 101 はおよそ 5km', () => {
    const d = distanceMeters(TAIPEI_STATION, TAIPEI_101)
    expect(d).toBeGreaterThan(4800)
    expect(d).toBeLessThan(5200)
  })
  it('向きによらない', () => {
    expect(distanceMeters(TAIPEI_STATION, TAIPEI_101)).toBeCloseTo(
      distanceMeters(TAIPEI_101, TAIPEI_STATION),
      6,
    )
  })
  it('緯度 0.001 度はおよそ 111m', () => {
    const d = distanceMeters({ lat: 25, lng: 121 }, { lat: 25.001, lng: 121 })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })
})

describe('formatDistance', () => {
  it('1km 未満は 10m 単位', () => {
    expect(formatDistance(0)).toBe('約 10m')
    expect(formatDistance(3)).toBe('約 10m')
    expect(formatDistance(404)).toBe('約 400m')
    expect(formatDistance(995 - 1)).toBe('約 990m')
  })
  it('10km 未満は 0.1km 単位', () => {
    expect(formatDistance(995)).toBe('約 1.0km')
    expect(formatDistance(1234)).toBe('約 1.2km')
    expect(formatDistance(9949)).toBe('約 9.9km')
  })
  it('10km 以上は 1km 単位', () => {
    expect(formatDistance(9950)).toBe('約 10km')
    expect(formatDistance(23_400)).toBe('約 23km')
  })
  it('不正な値は空文字', () => {
    expect(formatDistance(Number.NaN)).toBe('')
    expect(formatDistance(-1)).toBe('')
  })
})

const ids = (xs: ReadonlyArray<{ id: string }>) => xs.map((x) => x.id)

describe('sortSpots', () => {
  const near = {
    id: 'near',
    location: { lat: 25.048, lng: 121.517 },
    status: 'want_to_go' as const,
  }
  const mid = {
    id: 'mid',
    location: { lat: 25.04, lng: 121.53 },
    status: 'visited' as const,
  }
  const far = { id: 'far', location: TAIPEI_101, status: 'visited' as const }
  const spots = [far, near, mid]

  it('近い順', () => {
    expect(ids(sortSpots(spots, 'distance', TAIPEI_STATION))).toEqual([
      'near',
      'mid',
      'far',
    ])
  })
  it('既定は行った場所が先、同じ状態の中はデータの順のまま', () => {
    expect(ids(sortSpots(spots, 'default', TAIPEI_STATION))).toEqual([
      'far',
      'mid',
      'near',
    ])
  })
  it('現在地が無ければ近い順でも既定の並び', () => {
    expect(ids(sortSpots(spots, 'distance', null))).toEqual([
      'far',
      'mid',
      'near',
    ])
  })
  it('元の配列を変えない', () => {
    sortSpots(spots, 'distance', TAIPEI_STATION)
    expect(ids(spots)).toEqual(['far', 'near', 'mid'])
  })
})
