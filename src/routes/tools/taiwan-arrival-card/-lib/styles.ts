/**
 * 台湾入国カードメーカー UI で共有する Tailwind クラス。
 * ボタン・入力・チップ・パネルは src/components/ui の部品と styles.css のクラスを使い、
 * ここには「このツールだけで繰り返す」ものだけを置く。
 */

/**
 * フォームのまとまり（旅程・旅行者・書き出し）。箱で囲まず、上に青インクの罫を引いて区切る。
 * 中の小さなまとまり（台湾に入る／出る、旅行者 1 人ぶん）は細い罫（border-rule）で区切る。
 */
export const panelClass = 'ink-line-t pt-5'

/** フォームの外にある手伝いの面（AI でまとめて入力）。本体と形を変えて、薄塗りの箱にする */
export const asidePanelClass = 'panel panel-wash p-5 sm:p-6'

/** セクションの見出し。ページの h1 だけが Dela Gothic One、小見出しは Zen Kaku の 700 */
export const sectionTitleClass = 'text-lg font-bold leading-snug'

/** セクション見出しの下の説明文 */
export const sectionLeadClass = 'mt-2 text-sm leading-relaxed text-ink-muted'

/** 入力のまとまり（fieldset）の見出し */
export const legendClass = 'text-base font-bold'
