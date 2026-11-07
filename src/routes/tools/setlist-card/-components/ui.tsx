/**
 * このページだけの小さな部品（見た目は setlist.css）。
 * セグメント・スイッチ・ラジオの矢印キー操作は共通部品（components/ui）を使う。
 */
import { useId } from 'react'
import { Chip as UiChip } from '../../../../components/ui'
import type { ReactNode } from 'react'

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
        className="range"
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
    <UiChip pressed={pressed} aria-label={label} onClick={onClick}>
      {children}
    </UiChip>
  )
}
