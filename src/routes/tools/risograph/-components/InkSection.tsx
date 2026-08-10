import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { INK_PRESETS } from '../../../../lib/risograph/presets'
import {
  iconButtonClass,
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
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-400">2.</span> インクと刷り順
      </h2>
      <p className={`${sectionNoteClass} mt-2`}>
        2〜4 色を選びます。リストの上から順に 1 版目、2 版目…として刷る想定で、
        刷り順はトラッピング（重なり方）の予測に効きます。
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {INK_PRESETS.map((preset) => {
          const order = inkIds.indexOf(preset.id)
          const selected = order >= 0
          const disabled = selected
            ? inkIds.length <= MIN_INKS
            : inkIds.length >= MAX_INKS
          return (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => toggle(preset.id)}
                disabled={disabled}
                aria-pressed={selected}
                className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                  selected
                    ? 'border-cyan-400 bg-cyan-500/10 text-gray-100'
                    : 'border-white/10 text-gray-300 hover:border-white/30'
                }`}
              >
                <span
                  className="h-6 w-6 shrink-0 rounded-full border border-white/20"
                  style={{ backgroundColor: preset.hex }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{preset.name}</span>
                {selected ? (
                  <span className="shrink-0 rounded-full bg-cyan-500 px-1.5 text-[10px] font-bold text-gray-950">
                    {order + 1}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      <ol className="mt-4 space-y-2">
        {inkIds.map((id, index) => {
          const preset = INK_PRESETS.find((p) => p.id === id)
          return (
            <li
              key={id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-gray-950/60 px-3 py-2"
            >
              <span className="w-12 shrink-0 text-xs font-semibold text-gray-400">
                {index + 1}版目
              </span>
              <span
                className="h-6 w-6 shrink-0 rounded-full border border-white/20"
                style={{ backgroundColor: preset?.hex ?? '#000000' }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-100">
                {preset?.name ?? id}
                <span className="ml-2 text-xs text-gray-500">
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
