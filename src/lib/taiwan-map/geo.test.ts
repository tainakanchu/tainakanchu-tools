import { describe, expect, it } from 'vitest'
import { distanceMeters } from './nearby.ts'
import {
  circleRing,
  isInsideTaiwan,
  normalizeAngle,
  shortestAngleDiff,
  smoothHeading,
} from './geo.ts'

describe('normalizeAngle', () => {
  it('[0, 360) に収める', () => {
    expect(normalizeAngle(0)).toBe(0)
    expect(normalizeAngle(360)).toBe(0)
    expect(normalizeAngle(-10)).toBe(350)
    expect(normalizeAngle(725)).toBe(5)
  })
})

describe('shortestAngleDiff', () => {
  it('近いほうへ回る差を返す', () => {
    expect(shortestAngleDiff(10, 30)).toBe(20)
    expect(shortestAngleDiff(30, 10)).toBe(-20)
    expect(shortestAngleDiff(350, 10)).toBe(20)
    expect(shortestAngleDiff(10, 350)).toBe(-20)
  })
  it('真反対は +180', () => {
    expect(shortestAngleDiff(0, 180)).toBe(180)
    expect(shortestAngleDiff(90, 270)).toBe(180)
  })
})

describe('smoothHeading', () => {
  it('前の値が無ければそのまま', () => {
    expect(smoothHeading(null, 370)).toBe(10)
  })
  it('factor の割合だけ近づく', () => {
    expect(smoothHeading(0, 40, 0.25)).toBe(10)
    expect(smoothHeading(0, 40, 1)).toBe(40)
  })
  it('北をまたぐときは近いほうへ回る（一周しない）', () => {
    expect(smoothHeading(350, 10, 0.5)).toBe(0)
    expect(smoothHeading(10, 350, 0.5)).toBe(0)
    expect(smoothHeading(355, 15, 0.25)).toBe(0)
  })
})

describe('isInsideTaiwan', () => {
  it('台北・高雄・澎湖・金門・馬祖は中', () => {
    expect(isInsideTaiwan({ lat: 25.0478, lng: 121.517 })).toBe(true)
    expect(isInsideTaiwan({ lat: 22.6273, lng: 120.3014 })).toBe(true)
    expect(isInsideTaiwan({ lat: 23.5711, lng: 119.5793 })).toBe(true)
    expect(isInsideTaiwan({ lat: 24.4321, lng: 118.3171 })).toBe(true)
    expect(isInsideTaiwan({ lat: 26.1608, lng: 119.9497 })).toBe(true)
  })
  it('東京・那覇・マニラは外', () => {
    expect(isInsideTaiwan({ lat: 35.6812, lng: 139.7671 })).toBe(false)
    expect(isInsideTaiwan({ lat: 26.2124, lng: 127.6809 })).toBe(false)
    expect(isInsideTaiwan({ lat: 14.5995, lng: 120.9842 })).toBe(false)
  })
})

describe('circleRing', () => {
  const center = { lat: 25.05, lng: 121.51 }
  it('閉じたリング（最初と最後が同じ点）', () => {
    const ring = circleRing(center, 50, 16)
    expect(ring).toHaveLength(17)
    expect(ring.at(-1)).toEqual(ring[0])
  })
  it('どの点も中心からおよそ半径の距離', () => {
    for (const [lng, lat] of circleRing(center, 80)) {
      const d = distanceMeters(center, { lat, lng })
      expect(d).toBeGreaterThan(79)
      expect(d).toBeLessThan(81)
    }
  })
})
