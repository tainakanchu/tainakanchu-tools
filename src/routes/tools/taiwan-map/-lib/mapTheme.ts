/**
 * 地図のダーク配色（ベース地図 + ピンなど自前のレイヤー）。
 * maplibre-gl を import しないので、地図チャンクを読まずにテストできる。
 *
 * ■ ベース地図は positron を塗り直す
 *   OpenFreeMap には dark という style もあるが、地名の文字が地に対して
 *   3.4:1 ほどしかなく（小さい文字には足りない）、レイヤーの id も positron と
 *   違うので、隠すレイヤー（HIDDEN_BASE_LAYERS）や地名の差し替えを二重に
 *   持つことになる。さらに配色を切り替えるたびに setStyle で style ごと
 *   読み直すと、足したピンのレイヤーも消えて作り直しになる。
 *   そこで style は positron のまま、レイヤーごとの色（paint）だけを
 *   setPaintProperty で暗い色に差し替える。ライトに戻すときは、style を
 *   読んだ時点の元の値（MapView が控えておく）に戻す。
 *
 * ■ 色の選び方
 *   - 陸は gray-950 のページより一段明るい紺がかった灰、海はそれより暗くして
 *     海岸線が分かるようにする。道路は陸より明るい灰（暗い地図の約束どおり、
 *     明るい地図とは明暗が逆になる）
 *   - 地名の文字は 4.5:1 以上（文字の縁取り = halo と、陸の色の両方に対して）。
 *     mapTheme.test.ts で確かめている
 *   - ここに無い id のレイヤー（positron 側で増えたものなど）は、種類ごとの
 *     控えめな色（DARK_FALLBACK_PAINT）で塗る。白いまま残って暗い地図の中で
 *     光らないように
 */

import type { ResolvedTheme } from '../../../../lib/theme/theme'

/** ダークのベース地図の基本色 */
export const DARK_BASEMAP = {
  land: '#18202c',
  water: '#0b1422',
  park: '#1a2a27',
  residential: '#1c2432',
  building: '#222b3a',
  buildingEdge: '#2b3546',
  roadCasing: '#121924',
  roadMinor: '#2c3747',
  roadMajor: '#3a4658',
  roadMotorway: '#4a586d',
  rail: '#3a4658',
  boundary: '#64748b',
  /** 地名（都市・町）の文字 */
  label: '#e5e7eb',
  /** 地名（それ以外）・道路名の文字 */
  labelMuted: '#cbd5e1',
  /** 文字の縁取り */
  labelHalo: '#0f141d',
  /** 海・川の名前 */
  waterLabel: '#93c5fd',
} as const

type PaintValue = string | number | ReadonlyArray<unknown>
export type PaintOverrides = Readonly<Record<string, PaintValue>>

const B = DARK_BASEMAP

const labelPaint = (text: string): PaintOverrides => ({
  'text-color': text,
  'text-halo-color': B.labelHalo,
})

const motorwayInner = [
  'interpolate',
  ['linear'],
  ['zoom'],
  5.8,
  'rgba(74, 88, 109, 0.53)',
  6,
  B.roadMotorway,
] as const

/** positron のレイヤー id ごとの、ダークで差し替える paint */
export const DARK_BASEMAP_PAINT: Readonly<
  Partial<Record<string, PaintOverrides>>
> = {
  background: { 'background-color': B.land },
  park: { 'fill-color': B.park },
  water: { 'fill-color': B.water },
  landcover_ice_shelf: { 'fill-color': B.residential },
  landcover_glacier: { 'fill-color': B.residential },
  landuse_residential: { 'fill-color': B.residential },
  landcover_wood: { 'fill-color': B.park },
  waterway: { 'line-color': '#13213a' },
  building: { 'fill-color': B.building, 'fill-outline-color': B.buildingEdge },
  tunnel_motorway_casing: { 'line-color': B.roadCasing },
  tunnel_motorway_inner: { 'line-color': B.roadMinor },
  'aeroway-taxiway': { 'line-color': B.roadMinor },
  'aeroway-runway-casing': { 'line-color': B.roadMinor },
  'aeroway-area': { 'fill-color': B.building },
  'aeroway-runway': { 'line-color': B.roadMajor },
  road_area_pier: { 'fill-color': B.land },
  road_pier: { 'line-color': B.land },
  highway_path: { 'line-color': B.roadMinor },
  highway_minor: { 'line-color': B.roadMinor },
  highway_major_casing: { 'line-color': B.roadCasing },
  highway_major_inner: { 'line-color': B.roadMajor },
  highway_major_subtle: { 'line-color': 'rgba(58, 70, 88, 0.69)' },
  highway_motorway_casing: { 'line-color': B.roadCasing },
  highway_motorway_inner: { 'line-color': motorwayInner },
  highway_motorway_subtle: { 'line-color': 'rgba(74, 88, 109, 0.53)' },
  railway_transit: { 'line-color': B.rail },
  railway_transit_dashline: { 'line-color': B.land },
  railway_service: { 'line-color': B.rail },
  railway_service_dashline: { 'line-color': B.land },
  railway: { 'line-color': B.rail },
  railway_dashline: { 'line-color': B.land },
  highway_motorway_bridge_casing: { 'line-color': B.roadCasing },
  highway_motorway_bridge_inner: { 'line-color': motorwayInner },
  boundary_3: { 'line-color': B.boundary },
  boundary_2: { 'line-color': B.boundary },
  boundary_disputed: { 'line-color': B.boundary },
  waterway_line_label: labelPaint(B.waterLabel),
  water_name_point_label: labelPaint(B.waterLabel),
  water_name_line_label: labelPaint(B.waterLabel),
  'highway-name-path': labelPaint(B.labelMuted),
  'highway-name-minor': labelPaint(B.labelMuted),
  'highway-name-major': labelPaint(B.labelMuted),
  airport: labelPaint(B.labelMuted),
  label_other: labelPaint(B.labelMuted),
  label_village: labelPaint(B.label),
  label_town: labelPaint(B.label),
  label_state: labelPaint(B.labelMuted),
  label_city: labelPaint(B.label),
  label_city_capital: labelPaint(B.label),
  label_country_3: labelPaint(B.label),
  label_country_2: labelPaint(B.label),
  label_country_1: labelPaint(B.label),
}

/** 表に無いレイヤーを種類ごとに塗る色 */
export const DARK_FALLBACK_PAINT: Readonly<
  Partial<Record<string, PaintOverrides>>
> = {
  background: { 'background-color': B.land },
  fill: { 'fill-color': B.residential },
  line: { 'line-color': B.roadMinor },
  symbol: labelPaint(B.labelMuted),
}

export type BasemapPaintEntry = {
  layerId: string
  property: string
  dark: PaintValue
}

/**
 * ベース地図の各レイヤーで、ダークのときに差し替える paint の一覧。
 * skip に入っている id（ピンなど自前のレイヤー）は含めない。
 * アイコンだけの symbol（道路番号の盾など）にも文字色を足してしまうが、
 * 文字を描かないレイヤーでは何も変わらない
 */
export function basemapPaintPlan(
  layers: ReadonlyArray<{ id: string; type: string }>,
  skip: ReadonlySet<string> = new Set(),
): Array<BasemapPaintEntry> {
  const plan: Array<BasemapPaintEntry> = []
  for (const layer of layers) {
    if (skip.has(layer.id)) continue
    const paint =
      DARK_BASEMAP_PAINT[layer.id] ?? DARK_FALLBACK_PAINT[layer.type]
    if (!paint) continue
    for (const [property, dark] of Object.entries(paint)) {
      plan.push({ layerId: layer.id, property, dark })
    }
  }
  return plan
}

/** ピン・現在地など、自前のレイヤーの色 */
export type SpotLayerColors = {
  /** 未訪問（白抜き）のピンの中 */
  hollowFill: string
  /** 行った（塗り）のピンの縁 */
  pinEdge: string
  shadow: string
  shadowOpacity: number
  /** 選択中・フォーカス中の輪（操作色の cyan） */
  select: string
  selectEdge: string
  /** 寄ったときにピンの横に出す名前 */
  label: string
  labelHalo: string
  /** 現在地の点・精度の円 */
  user: string
  userEdge: string
  accuracyFillOpacity: number
  accuracyLineOpacity: number
}

export const SPOT_LAYER_COLORS: Record<ResolvedTheme, SpotLayerColors> = {
  light: {
    hollowFill: '#ffffff',
    pinEdge: '#ffffff',
    shadow: '#0f172a',
    shadowOpacity: 0.28,
    // styles.ts の cyan-500 と同じ。ジャンル色には使っていない
    select: '#06b6d4',
    selectEdge: '#ffffff',
    label: '#111827',
    labelHalo: '#ffffff',
    // ピンのジャンル色・選択の cyan と取り違えない青
    user: '#2563eb',
    userEdge: '#ffffff',
    accuracyFillOpacity: 0.1,
    accuracyLineOpacity: 0.35,
  },
  // 暗い地図では白い縁は光りすぎるので、縁は暗くしてジャンル色の塗りで
  // 見せる。未訪問は「暗い中にジャンル色の縁」で白抜きと同じ形を保つ。
  // 現在地の点だけは白い縁のまま（どの地図アプリでも同じ見た目で、
  // ピンと取り違えないように）
  dark: {
    hollowFill: '#0f172a',
    pinEdge: '#0f172a',
    shadow: '#000000',
    shadowOpacity: 0.45,
    select: '#22d3ee',
    selectEdge: '#0f172a',
    label: '#f1f5f9',
    labelHalo: '#0f141d',
    user: '#3b82f6',
    userEdge: '#ffffff',
    accuracyFillOpacity: 0.18,
    accuracyLineOpacity: 0.55,
  },
}
