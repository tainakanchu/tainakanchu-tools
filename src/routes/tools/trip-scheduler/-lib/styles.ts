/**
 * 旅程パズル UI で共有する Tailwind クラス。
 * ボタン・入力・チップ・パネルは src/components/ui の部品と styles.css のクラスを使い、
 * ここには「このツールだけで繰り返す」ものだけを置く。
 */

/**
 * セクションのまとまり。箱で囲まず、上に青インクの罫を 1 本引いて区切る
 * （ノートの見開きに章を書き分ける形）。箱で強く見せるのは、画面上部に貼り付く
 * 残り泊数（NightsBudget）だけにしている。
 */
export const panelClass = 'ink-line-t pt-4'

/** セクションの見出し。ページの h1 だけが Dela Gothic One、小見出しは Zen Kaku の 700 */
export const sectionTitleClass = 'text-lg font-bold leading-snug'

/** セクション見出しの下の説明文 */
export const sectionLeadClass = 'mt-2 text-sm leading-relaxed text-ink-muted'

/** 罫で区切った一覧の外枠と行（同じ種類のものを箱で積まない） */
export const ruledListClass = 'border-b border-rule'
export const ruledRowClass = 'border-t border-rule'

/** 空の状態の枠（まだ何も無い＝破線） */
export const emptyClass =
  'border-[1.5px] border-dashed border-ink-muted px-4 py-8 text-center text-sm text-ink-muted'

/** 40px 角のアイコンボタン（±、並べ替え、削除など）。ラベルは aria-label で付ける */
export const iconButtonClass =
  'inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-ui border-[1.5px] border-ink bg-paper text-ink transition-colors hover:bg-wash focus-visible:shadow-[3px_3px_0_0_var(--color-pink)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-paper'

/** 枠の無い小さなアイコンボタン（条件の有効／削除など） */
export const quietIconButtonClass =
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-ui text-ink-muted transition-colors hover:bg-wash hover:text-ink focus-visible:shadow-[3px_3px_0_0_var(--color-pink)]'
