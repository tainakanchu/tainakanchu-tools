import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { btn, btnDanger } from '../-lib/ui'

interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/** 削除など取り消せない操作の確認。Esc と背景クリックで閉じる */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tt-confirm-title"
        aria-describedby="tt-confirm-message"
        className="w-full max-w-sm rounded-lg bg-white p-4 text-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="tt-confirm-title" className="text-base font-bold">
          {title}
        </h2>
        <p id="tt-confirm-message" className="mt-2 text-sm text-gray-700">
          {message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className={btn}
            onClick={onCancel}
          >
            やめる
          </button>
          <button type="button" className={btnDanger} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
