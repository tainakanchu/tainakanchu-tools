/**
 * 旅程パズル UI で共有する Tailwind クラス。
 * サイト全体のトーン(rounded-2xl のカード + cyan アクセント)に合わせる。
 *
 * ダーク(dark:)の配色は src/styles.css 先頭の約束に揃える。カードは gray-900、
 * カードの上の入力欄・行は gray-800、主ボタンは cyan-400 の塗りに濃い字。
 */

export const cardClass =
  'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 dark:border-gray-800 dark:bg-gray-900 dark:shadow-none'

export const sectionTitleClass =
  'flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-gray-100'

export const fieldClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:shadow-none dark:placeholder:text-gray-500 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/30'

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:bg-cyan-400 dark:text-gray-950 dark:shadow-none dark:hover:bg-cyan-300 dark:focus-visible:outline-cyan-400'

export const subtleButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus-visible:outline-cyan-400'

export const iconButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:border-gray-600 dark:text-gray-300 dark:hover:border-cyan-400 dark:hover:bg-cyan-950/50 dark:hover:text-cyan-300 dark:focus-visible:outline-cyan-400'

export const stepperButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-cyan-400 dark:hover:bg-cyan-950/50 dark:hover:text-cyan-300 dark:focus-visible:outline-cyan-400'

/** 中身がまだ無いときの破線の枠 */
export const emptyStateClass =
  'rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400'
