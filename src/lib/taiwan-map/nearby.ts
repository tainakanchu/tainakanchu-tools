/**
 * 「近くの場所」の計算（純関数）。現在地からの距離・その表示・並べ替え。
 *
 * 現在地は画面のメモリにだけ持つ（URL・localStorage・サーバーには
 * 一切出さない）。ここは渡された座標で計算するだけで、どこにも保存しない。
 */

import type { LatLng, VisitStatus } from './types.ts'

/** 地球の平均半径（m） */
const EARTH_RADIUS_M = 6_371_008.8

const toRad = (deg: number) => (deg * Math.PI) / 180

/**
 * 2 点間の距離（m）。haversine の公式。街歩きの距離（数 km）なら
 * 誤差は数 m 以下で、表示に十分。
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * 距離の表示。歩いて行けるかの見当が付けばよいので細かくしすぎない。
 * GPS の誤差も地図上の直線距離であることもあるので、必ず「約」を付ける。
 * - 1km 未満 … 10m 単位（「約 400m」。10m 未満は「約 10m」）
 * - 10km 未満 … 0.1km 単位（「約 1.2km」）
 * - それ以上 … 1km 単位（「約 23km」）
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  if (meters < 995) return `約 ${Math.max(10, Math.round(meters / 10) * 10)}m`
  if (meters < 9950) return `約 ${(Math.round(meters / 100) / 10).toFixed(1)}km`
  return `約 ${Math.round(meters / 1000)}km`
}

/** 一覧の並び順 */
export type SpotOrder = 'default' | 'distance'

type SortableSpot = { location: LatLng; status: VisitStatus }

/** 既定の並びでの順位。行った場所が先 */
const statusRank = (s: SortableSpot) => (s.status === 'visited' ? 0 : 1)

/**
 * 一覧の並べ替え。元の配列は変えない（安定ソート）。
 * - default  … 行った場所を先に、未訪問・気になるを後に。それぞれの中は
 *              データの並び（書いた人がエリアごとにまとめている順）のまま。
 *              行ったことのない場所が先頭に来て「おすすめ」に見えないように
 * - distance … 現在地から近い順。現在地が無ければ default と同じ
 */
export function sortSpots<T extends SortableSpot>(
  spots: ReadonlyArray<T>,
  order: SpotOrder,
  position: LatLng | null,
): Array<T> {
  if (order === 'distance' && position) {
    return spots
      .map((spot) => ({ spot, d: distanceMeters(position, spot.location) }))
      .toSorted((a, b) => a.d - b.d)
      .map((x) => x.spot)
  }
  return spots.toSorted((a, b) => statusRank(a) - statusRank(b))
}
