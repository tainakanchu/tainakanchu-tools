import type { ReactNode, RefObject } from 'react'
import { cx } from './cx'
import { useDialogFocus } from './useDialogFocus'

type DialogProps = {
  /** Esc・背景クリック・閉じるボタンで呼ぶ */
  onClose: () => void
  /** 見出し要素の id（aria-labelledby） */
  labelledBy: string
  describedBy?: string
  /** 開いたときに最初にフォーカスする要素（取り消しにくい操作なら「やめる」） */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** 上に別のダイアログを重ねている間 true（Esc と Tab の循環を止める） */
  paused?: boolean
  /** 背景クリックで閉じるか（入力途中のフォームなら false） */
  closeOnBackdrop?: boolean
  /** パネルの幅など（既定は max-w-lg） */
  className?: string
  /** 背景の z-index を上げたいとき（重ねるダイアログ） */
  backdropClassName?: string
  role?: 'dialog' | 'alertdialog'
  children: ReactNode
}

/**
 * モーダルダイアログの枠。背後に青インクの薄網を敷き、panel を 1 枚載せる。
 * フォーカスの閉じ込め・初期フォーカス・閉じたあとの復帰・Esc は useDialogFocus が持つ。
 * 開閉は呼び出し側でマウント／アンマウントする（open prop は持たない）。
 */
export function Dialog({
  onClose,
  labelledBy,
  describedBy,
  initialFocusRef,
  paused,
  closeOnBackdrop = true,
  className,
  backdropClassName,
  role = 'dialog',
  children,
}: DialogProps) {
  const panelRef = useDialogFocus<HTMLDivElement>({
    onClose,
    initialFocusRef,
    paused,
  })
  return (
    <div
      className={cx('dialog-backdrop', backdropClassName)}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cx('dialog max-w-lg', className)}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
