/**
 * 地図のピンを GeoJSON にする純関数と、ベース地図から消すレイヤーの一覧。
 * maplibre-gl を import しないので、地図チャンクを読まずにテストできる。
 *
 * ピンを DOM の maplibregl.Marker（1 件 = 1 つの <button>）ではなく
 * GeoJSON ソース + circle レイヤーで描いている理由は MapView.tsx 冒頭を参照。
 */

import { categoryColor, pinCategory } from './categoryColors'
import type { SpotCategory, TaiwanSpot } from '../../../../lib/taiwan-map/types'

export type SpotFeatureProps = {
  id: string
  /** ピンの色（ジャンル色）。絞り込み中のジャンルを優先する */
  color: string
  visited: boolean
  /** circle-sort-key 用。行った場所を未訪問の上に重ねる */
  sortKey: number
}

/**
 * GeoJSON の FeatureCollection（Point だけ）。@types/geojson は maplibre-gl の
 * 間接依存で、pnpm ではこのパッケージから直接 import できないので、使う形だけを
 * 自前で書いている（構造は GeoJSON と同じなので setData にそのまま渡せる）
 */
export type SpotFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: SpotFeatureProps
}

export type SpotFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<SpotFeature>
}

export function spotsToFeatureCollection(
  spots: ReadonlyArray<TaiwanSpot>,
  activeCategory: SpotCategory | undefined,
): SpotFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: spots.map((spot): SpotFeature => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [spot.location.lng, spot.location.lat],
      },
      properties: {
        id: spot.id,
        color: categoryColor(pinCategory(spot.categories, activeCategory)),
        visited: spot.status === 'visited',
        sortKey: spot.status === 'visited' ? 1 : 0,
      },
    })),
  }
}

/**
 * OpenFreeMap positron（淡色）から、ピンの邪魔になるので隠すレイヤー。
 * positron はもともと POI（店・施設のアイコンとラベル）と駅のレイヤーを
 * 持たないので、残っている「細かい交通系のラベル」だけを消す。
 * 大きな道路の名前・地名・川や海の名前（点）・空港は、場所の見当を付ける
 * のに要るので残す。
 * style 側の id が変わって見つからないものは黙って飛ばす（MapView 参照）。
 */
export const HIDDEN_BASE_LAYERS = [
  // 路地・小道・細い道の道路名（ズーム 15〜で一覧の店名と同じくらい目立つ）
  'highway-name-path',
  'highway-name-minor',
  // 道路番号の盾アイコン（台湾の省道・国道番号。観光にはほぼ不要）
  'highway-shield-non-us',
  'highway-shield-us-interstate',
  'road_shield_us',
  // 用水路・小川の線に沿った名前
  'waterway_line_label',
] as const
