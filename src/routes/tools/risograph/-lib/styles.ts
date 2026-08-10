/**
 * リソグラフ分版ツールで共有する Tailwind クラス。
 * 刷り上がりの色を正しく見るため、このページだけ暗い背景に振っている
 * （ヘッダーと同じ gray-900/950 系 + サイト共通の rounded-2xl / cyan アクセント）。
 */

export const sectionClass =
  'rounded-2xl border border-white/10 bg-gray-900/60 p-5 shadow-sm sm:p-6'

export const sectionTitleClass =
  'flex items-center gap-2 text-base font-semibold text-gray-100'

export const sectionNoteClass = 'text-sm leading-relaxed text-gray-400'

export const labelClass = 'text-sm font-medium text-gray-300'

export const fieldClass =
  'w-full rounded-xl border border-white/15 bg-gray-950 px-3 py-2 text-sm text-gray-100 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40'

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400'

export const subtleButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400'

export const iconButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-gray-300 transition hover:border-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400'

export const chipClass =
  'inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-xs font-medium text-gray-300'

export const statValueClass = 'text-lg font-semibold text-gray-100 tabular-nums'

export const sliderClass = 'w-full accent-cyan-500'
