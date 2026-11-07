import type { KeyboardEvent, ReactNode } from 'react'
import { cx } from './cx'

/**
 * ラジオの並び（role="radiogroup"）の矢印キー操作。
 * 矢印・Home・End で隣の選択肢へフォーカスを移し、そのまま選ぶ（WAI-ARIA の radio と同じ）。
 */
export function radioKeys(event: KeyboardEvent<HTMLElement>): void {
  const keys = [
    'ArrowRight',
    'ArrowDown',
    'ArrowLeft',
    'ArrowUp',
    'Home',
    'End',
  ]
  if (!keys.includes(event.key)) return
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      '[role="radio"]:not(:disabled)',
    ),
  )
  if (radios.length === 0) return
  const at = radios.findIndex((r) => r === document.activeElement)
  let next = at
  if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = radios.length - 1
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
    next = (at + 1) % radios.length
  else next = (at - 1 + radios.length) % radios.length
  event.preventDefault()
  const target = radios[next]
  target.focus()
  target.click()
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** ラジオの tabIndex（選んでいるものだけ Tab で入れる。どれも選んでいなければ先頭） */
export function radioTabIndex(
  checked: boolean,
  index: number,
  anyChecked: boolean,
): 0 | -1 {
  return checked || (!anyChecked && index === 0) ? 0 : -1
}

export type SegmentOption<T extends string | number> = {
  value: T
  label: ReactNode
  disabled?: boolean
  title?: string
  /** 表示だけでは意味が伝わらないときの読み上げ名 */
  ariaLabel?: string
}

type SegmentedControlProps<T extends string | number> = {
  /** 読み上げ用の名前（画面に見出しがあるなら labelledBy を使う） */
  label?: string
  labelledBy?: string
  value: T
  options: ReadonlyArray<SegmentOption<T>>
  onChange: (value: T) => void
  size?: 'md' | 'sm'
  /** 親の幅いっぱいに広げて等分する */
  full?: boolean
  className?: string
}

/**
 * 2〜4 択の切り替え。1 本の枠を罫で仕切り、選んでいるものはピンクの網＋版ズレ。
 * 5 択以上や複数選択はチップ（Chip）を使う。
 */
export function SegmentedControl<T extends string | number>({
  label,
  labelledBy,
  value,
  options,
  onChange,
  size = 'md',
  full = false,
  className,
}: SegmentedControlProps<T>) {
  const anyChecked = options.some((o) => o.value === value && !o.disabled)
  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={cx(
        'seg',
        size === 'sm' && 'seg-sm',
        full && 'seg-full',
        className,
      )}
      onKeyDown={radioKeys}
    >
      {options.map((o, i) => {
        const checked = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.ariaLabel}
            tabIndex={radioTabIndex(checked, i, anyChecked)}
            disabled={o.disabled}
            title={o.title}
            className="seg-item"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
