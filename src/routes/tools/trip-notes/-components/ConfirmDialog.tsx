/**
 * 一括操作の直前に挟む確認ダイアログ。
 *
 * window.confirm ではなくこれを使うのは、一括操作は「何件に効くのか」を
 * 数字で見せないと判断できないからである。ブラウザ標準の確認ダイアログは
 * 見た目も文字量も制御できず、影響範囲を落ち着いて読ませる場所がない。
 *
 * 初期フォーカスは「やめる」に置く。ここに来るのは取り消しの効きにくい操作
 * ばかりなので、Enter の連打がそのまま実行に化けないようにする。
 */

import { useId, useRef } from 'react'
import { useDialogFocus } from '../-lib/focusTrap'
import { primaryButtonClass, subtleButtonClass } from '../-lib/styles'

interface ConfirmDialogProps {
  title: string
  /** 何が起きるかの説明。影響件数はここにも書く */
  description: string
  confirmLabel: string
  /** 実行ボタンのアクセシブル名。影響件数を必ず含める */
  confirmAriaLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmAriaLabel,
  cancelLabel = 'やめる',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useDialogFocus<HTMLDivElement>({
    onClose: onCancel,
    initialFocusRef: cancelRef,
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl outline-none sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-gray-800">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-gray-600">
          {description}
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            ref={cancelRef}
            className={subtleButtonClass}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            onClick={onConfirm}
            aria-label={confirmAriaLabel}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
