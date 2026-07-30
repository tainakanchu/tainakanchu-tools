/**
 * 旅程を平面に落とすための投影と、訪問順の折れ線の組み立て。
 *
 * 方針:
 * - 外部の地図タイルは使わない。カタログ都市の緯度経度だけで
 *   「動線のジグザグが見える」程度の簡易マップを描くための純関数を置く。
 * - 投影は等長方形図法。経度は平均緯度の cos で縮めて、ヨーロッパの縦横比が
 *   極端に横伸びしないようにする。
 * - 画面座標なので上が北(緯度が高いほど y は小さい)。
 */

import type { City, TravelMode } from './types'

const DEG_TO_RAD = Math.PI / 180

/** 投影後の平面座標(SVG のユーザー座標系) */
export interface ProjectedPoint {
  x: number
  y: number
}

/** 訪問順の1要素。mode は「この都市から次の都市へ」の移動手段 */
export interface RouteStop {
  cityId: string
  /** 解決できた leg が無ければ null(同一都市の連泊など) */
  mode?: TravelMode | null
}

/** 地図上の折れ線1本ぶん */
export interface RouteSegment {
  key: string
  fromCityId: string
  toCityId: string
  from: ProjectedPoint
  to: ProjectedPoint
  mode: TravelMode | null
  /** 出発側の訪問順 (1始まり) */
  fromOrder: number
  /** 到着側の訪問順 (1始まり) */
  toOrder: number
}

/** 地図上の訪問都市1点ぶん */
export interface RouteNode {
  cityId: string
  point: ProjectedPoint
  /** 訪問順 (1始まり)。同じ都市に戻ってくる旅程では複数入る */
  orders: Array<number>
}

/**
 * 都市の緯度経度を width × height の枠に収める。
 *
 * - 枠の内側 (padding を除いた領域) に全都市が必ず収まる
 * - 縦横は同じ倍率(形が歪まない)。余った方向には中央寄せ
 * - 都市が1つだけ・座標が同一の場合は枠の中央に置く
 */
export function projectCities(
  cities: ReadonlyArray<City>,
  width: number,
  height: number,
  padding: number,
): Map<string, ProjectedPoint> {
  const points = new Map<string, ProjectedPoint>()
  if (cities.length === 0) return points

  const innerWidth = Math.max(0, width - padding * 2)
  const innerHeight = Math.max(0, height - padding * 2)

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const city of cities) {
    minLat = Math.min(minLat, city.lat)
    maxLat = Math.max(maxLat, city.lat)
    minLng = Math.min(minLng, city.lng)
    maxLng = Math.max(maxLng, city.lng)
  }

  // 経度1度の実距離は緯度が上がるほど短い。平均緯度の cos で補正する
  const meanLat = (minLat + maxLat) / 2
  const lngScale = Math.max(0.1, Math.cos(meanLat * DEG_TO_RAD))

  const spanX = (maxLng - minLng) * lngScale
  const spanY = maxLat - minLat

  const scale =
    spanX <= 0 && spanY <= 0
      ? 0
      : Math.min(
          spanX > 0 ? innerWidth / spanX : Infinity,
          spanY > 0 ? innerHeight / spanY : Infinity,
        )

  const offsetX = padding + (innerWidth - spanX * scale) / 2
  const offsetY = padding + (innerHeight - spanY * scale) / 2

  for (const city of cities) {
    points.set(city.id, {
      x: offsetX + (city.lng - minLng) * lngScale * scale,
      // 上が北: 最北の都市が y = offsetY になる
      y: offsetY + (maxLat - city.lat) * scale,
    })
  }
  return points
}

/**
 * 隣接する同一都市を1点にまとめた訪問列。
 * 同じ都市に泊を分けて置いても地図上は同じ点なので、線を引く意味がない。
 * 次都市への移動手段は、まとめた区間の最後の滞在のものを採用する。
 */
function collapseAdjacent(
  stops: ReadonlyArray<RouteStop>,
): Array<{ cityId: string; mode: TravelMode | null }> {
  const visits: Array<{ cityId: string; mode: TravelMode | null }> = []
  for (const stop of stops) {
    const last = visits.at(-1)
    if (last && last.cityId === stop.cityId) {
      last.mode = stop.mode ?? null
      continue
    }
    visits.push({ cityId: stop.cityId, mode: stop.mode ?? null })
  }
  return visits
}

/**
 * 訪問順の折れ線セグメント。
 * 隣接する同一都市はセグメントを作らない。座標が引けない都市 (カタログ外) は飛ばす。
 */
export function buildRouteSegments(
  stops: ReadonlyArray<RouteStop>,
  points: ReadonlyMap<string, ProjectedPoint>,
): Array<RouteSegment> {
  const visits = collapseAdjacent(stops)
  const segments: Array<RouteSegment> = []
  for (let i = 0; i + 1 < visits.length; i++) {
    const from = points.get(visits[i].cityId)
    const to = points.get(visits[i + 1].cityId)
    if (!from || !to) continue
    segments.push({
      key: `${i}:${visits[i].cityId}>${visits[i + 1].cityId}`,
      fromCityId: visits[i].cityId,
      toCityId: visits[i + 1].cityId,
      from,
      to,
      mode: visits[i].mode,
      fromOrder: i + 1,
      toOrder: i + 2,
    })
  }
  return segments
}

/**
 * 地図に打つ訪問都市の点。都市ごとに1点にまとめ、再訪ぶんは orders に足す。
 * 返り値は初回訪問の順。
 */
export function buildRouteNodes(
  stops: ReadonlyArray<RouteStop>,
  points: ReadonlyMap<string, ProjectedPoint>,
): Array<RouteNode> {
  const nodes: Array<RouteNode> = []
  const byCityId = new Map<string, RouteNode>()
  collapseAdjacent(stops).forEach((visit, index) => {
    const point = points.get(visit.cityId)
    if (!point) return
    const existing = byCityId.get(visit.cityId)
    if (existing) {
      existing.orders.push(index + 1)
      return
    }
    const node: RouteNode = {
      cityId: visit.cityId,
      point,
      orders: [index + 1],
    }
    byCityId.set(visit.cityId, node)
    nodes.push(node)
  })
  return nodes
}

/** セグメント上の位置 (t = 0 で出発点、t = 1 で到着点) */
export function pointAlong(segment: RouteSegment, t: number): ProjectedPoint {
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * t,
    y: segment.from.y + (segment.to.y - segment.from.y) * t,
  }
}

/** セグメントの中点。夜行マーカーを置く位置 */
export function segmentMidpoint(segment: RouteSegment): ProjectedPoint {
  return pointAlong(segment, 0.5)
}

/** セグメントの長さ(平面上)。短すぎる線に矢印を載せない判定に使う */
export function segmentLength(segment: RouteSegment): number {
  return Math.hypot(
    segment.to.x - segment.from.x,
    segment.to.y - segment.from.y,
  )
}
