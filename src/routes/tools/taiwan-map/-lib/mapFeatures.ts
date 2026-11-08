/**
 * 地図のピンを GeoJSON にする純関数と、ベース地図から消すレイヤーの一覧。
 * maplibre-gl を import しないので、地図チャンクを読まずにテストできる。
 *
 * ピンを DOM の maplibregl.Marker（1 件 = 1 つの <button>）ではなく
 * GeoJSON ソース + circle レイヤーで描いている理由は MapView.tsx 冒頭を参照。
 */

import { categoryColor, pinCategory } from './categoryColors'
import type { SpotCategory, TaiwanSpot } from '../../../../lib/taiwan-map/types'
import type { ResolvedTheme } from '../../../../lib/theme/theme'

export type SpotFeatureProps = {
  id: string
  /** ズームしたときにピンの横に出す名前（symbol レイヤーの text-field） */
  name: string
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
  /** ピンの色の明るさ。ダークの地図では一段明るいジャンル色にする */
  theme: ResolvedTheme = 'light',
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
        name: spot.name,
        color: categoryColor(
          pinCategory(spot.categories, activeCategory),
          theme,
        ),
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

/**
 * ベース地図のラベルを「現地の表記（中国語）だけ」にする text-field。
 *
 * positron の地名・道路名は「name:latin + 改行（or 空白）+ name:nonlatin」の
 * 2 段組みで、台湾では latin 側に台湾語のローマ字（「GŪ-HN̂G-CHHUN 御園村」）や
 * 英語の道路名（「Section 3, Xinyi Road 信義路三段」）が入る。旅行中に
 * 見比べるのは看板と Google Maps の中国語表記なので、そちらだけを出す。
 * nonlatin（中国語）→ name（現地語）→ name_en の順で、最初にあるものを使う。
 */
export const LOCAL_NAME_TEXT_FIELD = [
  'coalesce',
  ['get', 'name:nonlatin'],
  ['get', 'name'],
  ['get', 'name_en'],
] as const

type LocalNameTextField = ['coalesce', ...Array<['get', string]>]

/**
 * symbol レイヤーの text-field を差し替えるべきかを返し、差し替えるなら
 * 新しい値を返す。名前（name:latin / name:nonlatin / name など）を参照して
 * いる text-field だけが対象で、道路番号（ref）のような名前以外のラベルや、
 * text-field を持たないレイヤーは null（= 触らない）。
 * style 側の書き方が式でも古い "{name:latin}" 形式の文字列でも判定できるよう、
 * JSON 文字列にして名前のキーを探す。
 */
export function localizedTextField(
  textField: unknown,
): LocalNameTextField | null {
  if (textField === undefined || textField === null) return null
  const json =
    typeof textField === 'string' ? textField : JSON.stringify(textField)
  if (!/name(:latin|:nonlatin|_en|_int)?["}]/.test(json)) return null
  // style 側に渡したあと書き換えられても共有の定数が壊れないよう、毎回作り直す
  const [head, ...rest] = LOCAL_NAME_TEXT_FIELD
  return [head, ...rest.map(([op, key]): ['get', string] => [op, key])]
}

function median(xs: ReadonlyArray<number>): number {
  const s = xs.toSorted((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** [[西端の経度, 南端の緯度], [東端の経度, 北端の緯度]]（maplibre の LngLatBoundsLike と同じ並び） */
export type LngLatBox = [[number, number], [number, number]]

/**
 * 都市を開いたときに地図を合わせる範囲。全件を囲むと、中心から外れた
 * 1〜2 件（台北なら山の上の貓空・内湖の工房）のせいで範囲が広がり、
 * 中心部のピンがひと固まりに潰れてしまう。そこで「中央値の地点から近い順に
 * keepRatio（既定 9 割）」だけを囲む。外れた場所のピンも地図には描くので、
 * 少し引けば見える（選べばそこへ寄る）。
 * 点が少ない（minKeep 件以下）ときは外れ値を判定する意味が薄いので全件を囲む。
 * 点が無ければ null。
 */
export function coreBounds(
  points: ReadonlyArray<{ lat: number; lng: number }>,
  keepRatio = 0.9,
  minKeep = 5,
): LngLatBox | null {
  if (points.length === 0) return null
  const c = {
    lat: median(points.map((p) => p.lat)),
    lng: median(points.map((p) => p.lng)),
  }
  // 台湾の緯度（22〜25 度）では経度 1 度が緯度 1 度よりおよそ 1 割短い。
  // 近さの順位付けだけなので、経度側を cos(緯度) で縮めれば十分
  const k = Math.cos((c.lat * Math.PI) / 180)
  const keep =
    points.length <= minKeep
      ? points.length
      : Math.max(minKeep, Math.ceil(points.length * keepRatio))
  const kept = points
    .map((p) => ({ p, d: Math.hypot(p.lat - c.lat, (p.lng - c.lng) * k) }))
    .toSorted((a, b) => a.d - b.d)
    .slice(0, keep)
    .map((x) => x.p)
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const p of kept) {
    west = Math.min(west, p.lng)
    east = Math.max(east, p.lng)
    south = Math.min(south, p.lat)
    north = Math.max(north, p.lat)
  }
  return [
    [west, south],
    [east, north],
  ]
}
