/**
 * 一括操作の直前に挟む確認ダイアログ。
 *
 * window.confirm ではなくこれを使うのは、一括操作は「何件に効くのか」を
 * 数字で見せないと判断できないからである。ブラウザ標準の確認ダイアログは
 * 見た目も文字量も制御できず、影響範囲を落ち着いて読ませる場所がない。
 *
 * 初期フォーカスは「やめる」に置く。ここに来るのは取り消しの効きにくい操作
 * ばかりなので、Enter の連打がそのまま実行に化けないようにする。
 * 実行ボタンも同じ理由で主要ボタンではなく danger の見た目にする。
 */

import { useId, useRef } from 'react'
import { Button, Dialog, buttonClass } from '../../../../components/ui'

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

  return (
    <Dialog
      onClose={onCancel}
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusRef={cancelRef}
      className="max-w-sm p-4 sm:p-5"
    >
      <h2 id={titleId} className="dialog-title">
        {title}
      </h2>
      <p id={descriptionId} className="mt-2 text-sm text-ink-muted">
        {description}
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          ref={cancelRef}
          className={buttonClass('secondary', 'sm')}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <Button
          variant="danger"
          size="sm"
          onClick={onConfirm}
          aria-label={confirmAriaLabel}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
