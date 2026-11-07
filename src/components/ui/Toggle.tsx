import type { InputHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
}

/** ラベルごと押せるラジオ。同じ name のものを fieldset（legend 付き）でまとめる */
export function Radio({ label, className, ...props }: RadioProps) {
  return (
    <label className={cx('radio', className)}>
      <input type="radio" {...props} />
      <span>{label}</span>
    </label>
  )
}

type SwitchProps = {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  title?: string
  className?: string
  /** 補足文の id（aria-describedby） */
  describedBy?: string
}

/** ラベル左・つまみ右の 1 行のスイッチ（role="switch"）。押した瞬間に効く設定に使う */
export function Switch({
  label,
  checked,
  onChange,
  disabled,
  title,
  className,
  describedBy,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      className={cx('switch', className)}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className="switch-track" aria-hidden />
    </button>
  )
}
