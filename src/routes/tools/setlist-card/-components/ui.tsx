/**
 * このページだけの小さな部品（見た目は setlist.css）。
 * 選択肢はすべて「セグメント」「スイッチの行」「サムネ / 丸の列」のどれかにそろえる。
 */
import { useId } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

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
}

/** 1 本のセグメント（ラジオ）。px や説明は出さない */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  /** 読み上げ用の名前（画面には出さない） */
  label: string
  value: T
  options: ReadonlyArray<SegmentOption<T>>
  onChange: (value: T) => void
  className?: string
}) {
  const anyChecked = options.some((o) => o.value === value && !o.disabled)
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`slc-seg ${className}`}
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
            tabIndex={radioTabIndex(checked, i, anyChecked)}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** ラベル左・スイッチ右の 1 行 */
export function SwitchRow({
  label,
  checked,
  onChange,
  disabled,
  title,
}: {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="slc-switch"
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className="track" aria-hidden />
    </button>
  )
}

/** 小さなラベルと中身（詳細設定の 1 項目など） */
export function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className={`space-y-2 ${className}`}>
      <p id={id} className="slc-label">
        {label}
      </p>
      {children}
    </div>
  )
}

/** ラベル・値・スライダーを 1 行に */
export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  title,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  title?: string
}) {
  const id = useId()
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-3">
      <label htmlFor={id} title={title}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="slc-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="mono text-right text-[12px] text-(--muted)">
        {format(value)}
      </span>
    </div>
  )
}

/** 「固定」などの小さな切り替え */
export function Chip({
  pressed,
  onClick,
  children,
  label,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
  /** 読み上げ用（短い表示だけでは意味が伝わらないとき） */
  label?: string
}) {
  return (
    <button
      type="button"
      className="slc-chip"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
    >
      <span>{children}</span>
    </button>
  )
}
