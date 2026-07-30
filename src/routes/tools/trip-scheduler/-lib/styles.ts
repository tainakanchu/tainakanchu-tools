/**
 * 旅程パズル UI で共有する Tailwind クラス。
 * サイト全体のトーン(rounded-2xl のカード + cyan アクセント)に合わせる。
 */

export const cardClass =
  'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6'

export const sectionTitleClass =
  'flex items-center gap-2 text-base font-semibold text-gray-800'

export const fieldClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40'

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500'

export const subtleButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400'

export const iconButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500'

export const stepperButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500'
