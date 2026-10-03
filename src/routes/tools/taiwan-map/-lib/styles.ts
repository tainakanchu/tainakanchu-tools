/**
 * 台湾マップ UI で共有する Tailwind クラス。
 * サイト全体のトーン（rounded-2xl のカード + cyan アクセント）に合わせる。
 *
 * cyan は「押せるもの」（絞り込みチップの選択中・リンク・主操作）専用にして、
 * 訪問状況の色には使わない。旅のしおりと同じ方針で、状態色と操作色が
 * 混ざると「どれが押せるのか」が分かりにくくなるため。
 */

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500'

export const cardClass =
  'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5'

export const sectionTitleClass = 'text-sm font-semibold text-gray-700'

/** 絞り込みチップ。aria-pressed と見た目を必ずセットで切り替える */
export function chipClass(pressed: boolean): string {
  return `inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition ${focusRing} ${
    pressed
      ? 'border-cyan-500 bg-cyan-50 font-semibold text-cyan-800'
      : 'border-gray-300 bg-white text-gray-700 hover:border-cyan-400 hover:bg-cyan-50/50'
  }`
}

export const actionButtonClass = `inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 ${focusRing}`

export const linkClass = `text-cyan-700 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-900 ${focusRing}`

/** トップの「都市から探す」などの大きめボタン */
export const bigChoiceClass = `flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-md ${focusRing}`

export const segmentedClass = (active: boolean) =>
  `flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${focusRing} ${
    active
      ? 'bg-white text-gray-900 shadow-sm'
      : 'text-gray-600 hover:text-gray-900'
  }`
