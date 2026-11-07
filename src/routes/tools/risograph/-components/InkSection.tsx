import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Chip, Swatch } from '../../../../components/ui'
import { INK_PRESETS } from '../../../../lib/risograph/presets'
import {
  iconButtonClass,
  rowClass,
  rowListClass,
  sectionClass,
  sectionNoteClass,
  sectionTitleClass,
} from '../-lib/styles'
import type { InkId } from '../../../../lib/risograph/types'

export const MIN_INKS = 2
export const MAX_INKS = 4

type Props = {
  inkIds: Array<InkId>
  onChange: (next: Array<InkId>) => void
}

export function InkSection({ inkIds, onChange }: Props) {
  const toggle = (id: InkId) => {
    if (inkIds.includes(id)) {
      if (inkIds.length <= MIN_INKS) return
      onChange(inkIds.filter((x) => x !== id))
      return
    }
    if (inkIds.length >= MAX_INKS) return
    onChange([...inkIds, id])
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= inkIds.length) return
    const next = [...inkIds]
    const [picked] = next.splice(index, 1)
    next.splice(target, 0, picked)
    onChange(next)
  }

  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>2. インクと刷り順</h2>
      <p className={`${sectionNoteClass} mt-2`}>
        2〜4 色を選びます。リストの上から順に 1 版目、2 版目…として刷る想定で、
        刷り順はトラッピング（重なり方）の予測に効きます。
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {INK_PRESETS.map((preset) => {
          const order = inkIds.indexOf(preset.id)
          const selected = order >= 0
          const disabled = selected
            ? inkIds.length <= MIN_INKS
            : inkIds.length >= MAX_INKS
          return (
            <li key={preset.id}>
              <Chip
                pressed={selected}
                onPressedChange={() => toggle(preset.id)}
                disabled={disabled}
                dot={preset.hex}
                count={selected ? `${order + 1}番目` : undefined}
                className="w-full justify-start"
              >
                {preset.name}
              </Chip>
            </li>
          )
        })}
      </ul>

      <ol className={`mt-4 ${rowListClass}`}>
        {inkIds.map((id, index) => {
          const preset = INK_PRESETS.find((p) => p.id === id)
          return (
            <li key={id} className={`flex items-center gap-3 ${rowClass}`}>
              <span className="w-12 shrink-0 text-xs font-bold text-ink-muted">
                {index + 1}版目
              </span>
              <Swatch color={preset?.hex ?? '#000000'} size={24} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {preset?.name ?? id}
                <span className="ml-2 text-xs text-ink-muted">
                  {preset?.hex}
                </span>
              </span>
              <button
                type="button"
                className={iconButtonClass}
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`${preset?.name ?? id}を前の版へ`}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                className={iconButtonClass}
                onClick={() => move(index, 1)}
                disabled={index === inkIds.length - 1}
                aria-label={`${preset?.name ?? id}を次の版へ`}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                className={iconButtonClass}
                onClick={() => onChange(inkIds.filter((x) => x !== id))}
                disabled={inkIds.length <= MIN_INKS}
                aria-label={`${preset?.name ?? id}を外す`}
              >
                <X size={14} />
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
