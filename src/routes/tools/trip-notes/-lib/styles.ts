/**
 * 旅のしおり UI で共有する Tailwind クラス。
 * サイト共通の riso デザイン（docs/design.md）の部品クラスに寄せている。
 *
 * ピンクは「選択中・主要ボタン・ハイライト・エラー印」だけに使う。
 * 予約状況や支払状況などの状態は、色ではなく線の種類とラベル(文字)で区別する。
 */

export const cardClass = 'panel p-4 sm:p-5'

export const sectionTitleClass =
  'flex items-center gap-2 text-base font-bold text-ink'

export const fieldClass = 'input'

export const labelClass = 'field-label'

export const primaryButtonClass = 'btn btn-primary btn-sm'

export const subtleButtonClass = 'btn btn-secondary btn-sm'

/** 取り消しにくい操作（共通の btn-danger）。色は付けず、hover とフォーカスでピンクの薄網を敷く */
export const dangerButtonClass = 'btn btn-secondary btn-danger btn-sm'

export const iconButtonClass =
  'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-ui border border-ink bg-paper text-ink transition hover:bg-wash disabled:cursor-not-allowed disabled:opacity-40 focus-visible:shadow-[3px_3px_0_0_var(--color-pink)]'

/**
 * AI が埋めたまま人間が未確認の入力欄に引く破線の下線と薄塗り。
 * 「間違っているかもしれない値」であることを、値そのものを隠さずに伝える。
 */
export const unverifiedFieldClass =
  'border-b-2 border-dashed border-ink bg-wash'
