import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

type ChipProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-pressed' | 'onChange'
> & {
  /** 選択中か。aria-pressed に出し、選択中は版ズレが付く */
  pressed: boolean
  onPressedChange?: (next: boolean) => void
  /** カテゴリ色の丸（CSS の色。例: 'var(--color-riso-teal)'） */
  dot?: string
  /** 件数などの添え字 */
  count?: ReactNode
}

export function Chip({
  pressed,
  onPressedChange,
  dot,
  count,
  className,
  children,
  onClick,
  ...props
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cx('chip', className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) onPressedChange?.(!pressed)
      }}
      {...props}
    >
      {dot ? (
        <span
          className="chip-dot"
          style={{
            background: dot,
            // イエローなど薄いインクでも丸の形が見えるよう青インクの縁を付ける
            boxShadow: 'inset 0 0 0 1px var(--color-ink)',
          }}
          aria-hidden
        />
      ) : null}
      {children}
      {count !== undefined ? <span className="chip-count">{count}</span> : null}
    </button>
  )
}
