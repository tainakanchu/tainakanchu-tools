import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

type NoteProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** info: 薄塗り / warn: 破線（続行はできる注意） / error: ピンクの薄網＋文頭の四角 */
  tone?: 'info' | 'warn' | 'error'
  children: ReactNode
}

/**
 * 状態の通知帯。読み上げが要るときは role="status"（保存した等）か
 * role="alert"（操作を止めるエラー）を呼び出し側で付ける。
 */
export function Note({
  tone = 'info',
  className,
  children,
  ...props
}: NoteProps) {
  return (
    <div
      className={cx(
        'panel-note',
        tone === 'warn' && 'panel-note-warn',
        tone === 'error' && 'panel-note-error',
        className,
      )}
      {...props}
    >
      {tone === 'error' ? (
        <span className="panel-note-mark" aria-hidden />
      ) : null}
      {children}
    </div>
  )
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  /** outline: 細線 / solid: 確定 / dashed: 未確定 / muted: 弱い補足 */
  tone?: 'outline' | 'solid' | 'dashed' | 'muted'
}

/** 状態の小さな札。文字で状態を言う（色だけで区別しない） */
export function Badge({ tone = 'outline', className, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'badge',
        tone === 'solid' && 'badge-solid',
        tone === 'dashed' && 'badge-dashed',
        tone === 'muted' && 'badge-muted',
        className,
      )}
      {...props}
    />
  )
}

/** インク・紙の色見本の丸 */
export function Swatch({
  color,
  size = 20,
  className,
}: {
  color: string
  size?: number
  className?: string
}) {
  return (
    <span
      className={cx('swatch', className)}
      style={{ width: size, height: size, backgroundColor: color }}
      aria-hidden
    />
  )
}
