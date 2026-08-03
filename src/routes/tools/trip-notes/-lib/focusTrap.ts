/**
 * モーダルダイアログのフォーカス管理。
 *
 * 旅のしおりのダイアログはどれも「取り返しの付きにくい操作」の直前に出る
 * (AI 取り込みの確定・共有データでの全置換・予約の保存)。にもかかわらず
 * Tab でダイアログの外へ抜けられると、キーボードやスクリーンリーダーの
 * 利用者は背後の画面を触りながら操作することになり、いま何を確認しているのかが
 * 分からなくなる。そこで開いている間はフォーカスをダイアログ内で循環させる。
 *
 * 併せて次の 2 つも引き受ける。どれか 1 つでも欠けると
 * 「ダイアログを閉じたあとフォーカスが body に飛んで文脈を失う」
 * といった中途半端な壊れ方をするため、3 点セットで 1 つのフックにまとめる。
 * - 開いたときに最初のフォーカス可能要素(または明示した要素)へフォーカスする
 * - 閉じたときに開く前のフォーカス位置へ戻す
 * - Esc で閉じる
 *
 * 外部ライブラリは使わない。ダイアログは高々 2 種類しか同時に存在せず、
 * 入れ子にもならないので、focus-trap 相当の一般解を持ち込む必要がない。
 */

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * フォーカスを受け取りうる要素。
 * tabindex="-1" は「プログラムからは当てられるが Tab では止まらない」ので除く。
 * <summary> はセレクタでは拾えないので明示的に足す(BookingForm の「詳細」)。
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * セレクタだけでは判定しきれない除外条件。
 * とくに <fieldset disabled> の中身はブラウザ上ではフォーカスできないのに
 * 子要素自身には disabled 属性が付かないため、セレクタでは拾えてしまう
 * (ReviewDialog の「取り込まない」にチェックを入れた予約がこれに当たる)。
 */
function isReachable(element: HTMLElement): boolean {
  if (element.hasAttribute('hidden')) return false
  if (element.getAttribute('aria-hidden') === 'true') return false
  const disabledFieldset = element.closest('fieldset[disabled]')
  // legend の中だけは disabled な fieldset でも操作できる(HTML の仕様)
  if (disabledFieldset !== null && element.closest('legend') === null) {
    return false
  }
  return true
}

function focusableWithin(panel: HTMLElement): Array<HTMLElement> {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isReachable)
}

export interface DialogFocusOptions {
  /** Esc キーとフォーカス復帰のトリガ。ダイアログを閉じる処理を渡す */
  onClose: () => void
  /**
   * 開いたときに最初にフォーカスする要素。
   * 省略するとダイアログ内の最初のフォーカス可能要素(無ければパネル自身)。
   */
  initialFocusRef?: RefObject<HTMLElement | null>
}

/**
 * ダイアログのパネル要素に付ける ref を返す。
 * パネルには tabIndex={-1} を付けること(フォーカス可能要素が 1 つも無いときの
 * 逃げ場になり、Shift+Tab の循環判定の基準にもなる)。
 */
export function useDialogFocus<T extends HTMLElement>({
  onClose,
  initialFocusRef,
}: DialogFocusOptions): RefObject<T | null> {
  const panelRef = useRef<T | null>(null)

  // onClose は呼び出し側でインラインの関数として書かれることが多く、
  // 依存配列に入れると再レンダーのたびに effect が張り直されて
  // 「入力するたび初期フォーカスに戻る」「復帰先が上書きされる」が起きる。
  // 最新の値だけを ref 経由で読み、effect 自体はマウント時の一度きりにする。
  const onCloseRef = useRef(onClose)
  const initialFocusRefRef = useRef(initialFocusRef)
  useEffect(() => {
    onCloseRef.current = onClose
    initialFocusRefRef.current = initialFocusRef
  })

  useEffect(() => {
    const panel = panelRef.current
    if (panel === null) return

    // 開く前にフォーカスしていた要素。閉じたらここへ戻す
    const restoreTo =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    // フォーカス可能な要素が 1 つも無いダイアログでも、パネル自身(tabIndex={-1})が
    // 受け皿になるので背後の画面にフォーカスが残ることはない
    const candidates = focusableWithin(panel)
    const initial =
      initialFocusRefRef.current?.current ??
      (candidates.length > 0 ? candidates[0] : panel)
    initial.focus()

    // 関数宣言(巻き上げ)にすると panel の null 絞り込みが効かないので、
    // 絞り込み後に作られるアロー関数にする
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = focusableWithin(panel)
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      // 背景クリックなどでフォーカスがダイアログの外に出てしまっていたら、
      // Tab の向きに合わせて端から入れ直す
      if (!(active instanceof HTMLElement) || !panel.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // 復帰先が既に DOM から消えていることもある(削除した予約の編集ボタンなど)
      if (restoreTo !== null && document.contains(restoreTo)) {
        restoreTo.focus()
      }
    }
  }, [])

  return panelRef
}
