/**
 * 都市ごとの色。タイムラインと滞在リストで同じ色を使い、
 * 「どのブロックがどの都市か」を目で追えるようにする。
 * Tailwind は静的な文字列しか拾えないので、クラス名はここに literal で並べる。
 *
 * ダークでは色相はそのままに、白字を載せる面(タイムラインの横棒・ルートマップの丸)を
 * -700 まで濃くする。-500 のままだと暗い地の上で浮きすぎるうえ、白字が 4.5:1 に届かない
 * (palette.test.ts で確かめている)。小さな丸(dot)は字を載せないので -500 のまま。
 */

export type PaletteTheme = 'light' | 'dark'

export interface CityColor {
  /** タイムラインのブロック(白字を載せる) */
  bar: string
  /** リスト行の左端インジケータ・チップ */
  dot: string
  /** 淡い背景 */
  soft: string
  /**
   * SVG(ルートマップ)で塗る hex。SVG は class では塗れないので同じ色を持たせる。
   * light は dot と、dark は bar の dark: と同じ色
   */
  fill: Record<PaletteTheme, string>
}

const cityColors: Array<CityColor> = [
  {
    bar: 'bg-sky-500 dark:bg-sky-700',
    dot: 'bg-sky-500',
    soft: 'bg-sky-50 dark:bg-sky-950/40',
    fill: { light: '#0ea5e9', dark: '#0369a1' },
  },
  {
    bar: 'bg-emerald-500 dark:bg-emerald-700',
    dot: 'bg-emerald-500',
    soft: 'bg-emerald-50 dark:bg-emerald-950/40',
    fill: { light: '#10b981', dark: '#047857' },
  },
  {
    bar: 'bg-amber-500 dark:bg-amber-700',
    dot: 'bg-amber-500',
    soft: 'bg-amber-50 dark:bg-amber-950/40',
    fill: { light: '#f59e0b', dark: '#b45309' },
  },
  {
    bar: 'bg-violet-500 dark:bg-violet-700',
    dot: 'bg-violet-500',
    soft: 'bg-violet-50 dark:bg-violet-950/40',
    fill: { light: '#8b5cf6', dark: '#6d28d9' },
  },
  {
    bar: 'bg-rose-500 dark:bg-rose-700',
    dot: 'bg-rose-500',
    soft: 'bg-rose-50 dark:bg-rose-950/40',
    fill: { light: '#f43f5e', dark: '#be123c' },
  },
  {
    bar: 'bg-teal-500 dark:bg-teal-700',
    dot: 'bg-teal-500',
    soft: 'bg-teal-50 dark:bg-teal-950/40',
    fill: { light: '#14b8a6', dark: '#0f766e' },
  },
  {
    bar: 'bg-indigo-500 dark:bg-indigo-700',
    dot: 'bg-indigo-500',
    soft: 'bg-indigo-50 dark:bg-indigo-950/40',
    fill: { light: '#6366f1', dark: '#4338ca' },
  },
  {
    bar: 'bg-orange-500 dark:bg-orange-700',
    dot: 'bg-orange-500',
    soft: 'bg-orange-50 dark:bg-orange-950/40',
    fill: { light: '#f97316', dark: '#c2410c' },
  },
  {
    bar: 'bg-fuchsia-500 dark:bg-fuchsia-700',
    dot: 'bg-fuchsia-500',
    soft: 'bg-fuchsia-50 dark:bg-fuchsia-950/40',
    fill: { light: '#d946ef', dark: '#a21caf' },
  },
  {
    bar: 'bg-lime-600 dark:bg-lime-700',
    dot: 'bg-lime-600',
    soft: 'bg-lime-50 dark:bg-lime-950/40',
    fill: { light: '#65a30d', dark: '#4d7c0f' },
  },
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
  bar: 'bg-gray-400 dark:bg-gray-600',
  dot: 'bg-gray-400',
  soft: 'bg-gray-50 dark:bg-gray-800',
  fill: { light: '#9ca3af', dark: '#4b5563' },
}

/**
 * 曜日番号 (0 = 日 〜 6 = 土) → 曜日の文字色。
 * 日本のカレンダー慣習に合わせて土=青・日=赤、平日は色を持たず周囲を継承する。
 */
const weekdayToneClasses: Array<string> = [
  'text-red-600 dark:text-red-400', // 日
  '',
  '',
  '',
  '',
  '',
  'text-blue-600 dark:text-blue-400', // 土
]

export function weekdayToneClass(weekdayIndex: number): string {
  return weekdayToneClasses[weekdayIndex] ?? ''
}
