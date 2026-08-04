/**
 * 旅のしおり UI で共有する Tailwind クラス。
 * サイト全体のトーン(rounded-2xl のカード + cyan アクセント)に合わせる。
 *
 * cyan / sky はブランド・リンク・プライマリ操作の専用色として扱い、
 * 予約状況や支払状況の「状態色」には使い回さない。
 * 状態色に使うと、押せる場所と状態表示の区別が付かなくなるため。
 */

export const cardClass =
  'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5'

export const sectionTitleClass =
  'flex items-center gap-2 text-base font-semibold text-gray-800'

export const fieldClass =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40'

export const labelClass = 'text-sm font-medium text-gray-700'

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500'

export const subtleButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400'

export const dangerButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500'

export const iconButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500'

/**
 * AI が埋めたまま人間が未確認の入力欄に引く黄色い下線。
 * 「間違っているかもしれない値」であることを、値そのものを隠さずに伝える。
 */
export const unverifiedFieldClass = 'border-b-2 border-amber-400 bg-amber-50/60'
