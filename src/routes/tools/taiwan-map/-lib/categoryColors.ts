/**
 * ジャンル（カテゴリ）ごとの色。地図のピンと、地図上のジャンルチップの
 * ドット（凡例を兼ねる）の両方がここを見る。色を変えるときはここだけ直す。
 *
 * ■ 選び方
 * - どれも中くらいの明るさ（Tailwind の 500〜600 相当）にして、明るい地図
 *   タイルの上でも暗い背景の上でも沈まないようにしている。ピンは白い縁取り
 *   と影を付けるので、背景の明暗に関わらず輪郭が出る。
 * - cyan は「押せるもの・選択中」の操作色（styles.ts 参照）なので使わない。
 *   選択中のピンの cyan の輪とジャンル色が混ざらないようにするため。
 * - 隣り合う色相が近くなりすぎないよう、橙・黄土・桃・青・れんが・紫・青緑・緑・灰に
 *   散らしている。色だけに頼らず、チップには必ずジャンル名の文字も出す。
 * - ダーク（暗い地図）では同じ色相のまま一段明るい 400〜500 にする
 *   （CATEGORY_COLORS_DARK）。600〜700 のままだと暗い地に沈み、未訪問の
 *   白抜きのピン（暗い地に色の縁だけ）が見えにくくなるため。
 *   暗い地図の地・ピンの中の色に対して 3:1 以上あることを
 *   mapTheme.test.ts で確かめている。
 */

import type { SpotCategory } from '../../../../lib/taiwan-map/types'
import type { ResolvedTheme } from '../../../../lib/theme/theme'

export const CATEGORY_COLORS: Record<SpotCategory, string> = {
  food: '#ea580c', // orange-600
  drink: '#ca8a04', // yellow-600
  shopping: '#db2777', // pink-600
  culture: '#2563eb', // blue-600
  townscape: '#b91c1c', // red-700（れんが色）
  music: '#7c3aed', // violet-600
  stay: '#0d9488', // teal-600
  outdoor: '#16a34a', // green-600
  other: '#64748b', // slate-500
}

/** ダーク（暗い地図・暗いチップ）でのジャンル色。色相は CATEGORY_COLORS と同じ */
export const CATEGORY_COLORS_DARK: Record<SpotCategory, string> = {
  food: '#f97316', // orange-500
  drink: '#eab308', // yellow-500
  shopping: '#f472b6', // pink-400
  culture: '#60a5fa', // blue-400
  townscape: '#f87171', // red-400（れんが色を明るく）
  music: '#a78bfa', // violet-400
  stay: '#2dd4bf', // teal-400
  outdoor: '#4ade80', // green-400
  other: '#94a3b8', // slate-400
}

/**
 * ピンの色を決めるカテゴリ。基本は先頭のカテゴリ（= そのスポットの主な
 * ジャンル）だが、ジャンルで絞り込んでいるときにそのジャンルを持っていれば
 * そちらを使う。「飲む」で絞ったのに「音楽・飲む」の店だけ紫で出る、という
 * チップとピンの色の食い違いを避けるため。
 */
export function pinCategory(
  categories: ReadonlyArray<SpotCategory>,
  active: SpotCategory | undefined,
): SpotCategory {
  if (active !== undefined && categories.includes(active)) return active
  return categories.at(0) ?? 'other'
}

export function categoryColor(
  category: SpotCategory,
  theme: ResolvedTheme = 'light',
): string {
  return (theme === 'dark' ? CATEGORY_COLORS_DARK : CATEGORY_COLORS)[category]
}
