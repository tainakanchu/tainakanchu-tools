/**
 * 都市ごとの色。タイムラインと滞在リストで同じ色を使い、
 * 「どのブロックがどの都市か」を目で追えるようにする。
 * Tailwind は静的な文字列しか拾えないので、クラス名はここに literal で並べる。
 */

export interface CityColor {
  /** タイムラインのブロック */
  bar: string
  /** リスト行の左端インジケータ・チップ */
  dot: string
  /** 淡い背景 */
  soft: string
}

const cityColors: Array<CityColor> = [
  { bar: 'bg-sky-500', dot: 'bg-sky-500', soft: 'bg-sky-50' },
  { bar: 'bg-emerald-500', dot: 'bg-emerald-500', soft: 'bg-emerald-50' },
  { bar: 'bg-amber-500', dot: 'bg-amber-500', soft: 'bg-amber-50' },
  { bar: 'bg-violet-500', dot: 'bg-violet-500', soft: 'bg-violet-50' },
  { bar: 'bg-rose-500', dot: 'bg-rose-500', soft: 'bg-rose-50' },
  { bar: 'bg-teal-500', dot: 'bg-teal-500', soft: 'bg-teal-50' },
  { bar: 'bg-indigo-500', dot: 'bg-indigo-500', soft: 'bg-indigo-50' },
  { bar: 'bg-orange-500', dot: 'bg-orange-500', soft: 'bg-orange-50' },
  { bar: 'bg-fuchsia-500', dot: 'bg-fuchsia-500', soft: 'bg-fuchsia-50' },
  { bar: 'bg-lime-600', dot: 'bg-lime-600', soft: 'bg-lime-50' },
]

/** 都市 ID → 色。訪問順に色を割り当てるので、並べ替えても同じ都市は同じ色 */
export function buildCityColorMap(
  cityIds: Array<string>,
): Map<string, CityColor> {
  const map = new Map<string, CityColor>()
  let index = 0
  for (const cityId of cityIds) {
    if (map.has(cityId)) continue
    map.set(cityId, cityColors[index % cityColors.length])
    index += 1
  }
  return map
}

export const fallbackCityColor: CityColor = {
  bar: 'bg-gray-400',
  dot: 'bg-gray-400',
  soft: 'bg-gray-50',
}

/**
 * 曜日番号 (0 = 日 〜 6 = 土) → 曜日の文字色。
 * 日本のカレンダー慣習に合わせて土=青・日=赤、平日は色を持たず周囲を継承する。
 */
const weekdayToneClasses: Array<string> = [
  'text-red-600', // 日
  '',
  '',
  '',
  '',
  '',
  'text-blue-600', // 土
]

export function weekdayToneClass(weekdayIndex: number): string {
  return weekdayToneClasses[weekdayIndex] ?? ''
}
