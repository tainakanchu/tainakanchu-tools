/**
 * 現在地まわりの小さな計算（純関数）。向きのなめらか化・台湾の中かどうか・
 * 精度の円。どれも渡された値で計算するだけで、位置をどこにも保存しない。
 */

import type { LatLng } from './types.ts'

/** 角度を [0, 360) に収める */
export function normalizeAngle(deg: number): number {
  const r = deg % 360
  return r < 0 ? r + 360 : r
}

/**
 * from から to へ回るときの、いちばん近い回り方の差（-180 < d <= 180）。
 * 350° → 10° は +20°（-340° ではない）
 */
export function shortestAngleDiff(from: number, to: number): number {
  const d = normalizeAngle(to - from)
  return d > 180 ? d - 360 : d
}

/**
 * 向き（コンパスの値）をなめらかにする。毎回 factor の割合だけ近づける
 * （0 < factor <= 1。1 なら追従しきる）。北をまたぐときに一周しないよう、
 * 近いほうへ回る。前の値が無ければ next をそのまま返す
 */
export function smoothHeading(
  prev: number | null,
  next: number,
  factor = 0.25,
): number {
  if (prev === null || !Number.isFinite(prev)) return normalizeAngle(next)
  return normalizeAngle(prev + shortestAngleDiff(prev, next) * factor)
}

/**
 * 台湾（本島・澎湖・金門・馬祖・蘭嶼・緑島を含む）をざっくり囲む範囲。
 * 「近い順」や距離が意味を持つかの判定にしか使わないので、矩形で足りる
 * （金門の西の対岸の一部も入るが、そこで困ることはない）
 */
export const TAIWAN_BOUNDS = {
  south: 21.8,
  north: 26.5,
  west: 118.0,
  east: 122.3,
} as const

export function isInsideTaiwan(p: LatLng): boolean {
  return (
    p.lat >= TAIWAN_BOUNDS.south &&
    p.lat <= TAIWAN_BOUNDS.north &&
    p.lng >= TAIWAN_BOUNDS.west &&
    p.lng <= TAIWAN_BOUNDS.east
  )
}

/** 地球の平均半径（m）。nearby.ts と同じ */
const EARTH_RADIUS_M = 6_371_008.8

/**
 * 中心から半径 radiusM の円を、経緯度の多角形（閉じたリング）で返す。
 * 現在地の精度の円を地図に描くのに使う（ズームしても実際の大きさのまま）。
 * 数百 m までの円なら、緯度による経度方向の縮みだけを補えば十分
 */
export function circleRing(
  center: LatLng,
  radiusM: number,
  steps = 48,
): Array<[number, number]> {
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI)
  const dLng = dLat / Math.cos((center.lat * Math.PI) / 180)
  const ring: Array<[number, number]> = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    ring.push([
      center.lng + dLng * Math.cos(t),
      center.lat + dLat * Math.sin(t),
    ])
  }
  ring.push(ring[0])
  return ring
}
