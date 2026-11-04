import { useEffect, useRef, useState } from 'react'
import { LAYOUTS } from '../-lib/layouts'
import { renderPage, resetMeasureCache } from '../-lib/render'
import { createSampleSetlist } from '../-lib/sample'
import { templateStyle } from '../-lib/tpl-common'
import { choiceClass, labelClass } from '../-lib/styles'
import type { CanvasSize, LayoutId, TemplateGroup } from '../-lib/layouts'
import type { RenderInput } from '../-lib/render'

/** 見本の大きさ（4:5 を 1/5 に） */
const THUMB_SIZE: CanvasSize = {
  id: 'portrait',
  label: '4:5',
  note: '',
  width: 216,
  height: 270,
}

const GROUP_LABELS: Record<TemplateGroup, string> = {
  simple: '',
  theme: 'テーマ',
  legacy: '旧テンプレート',
}

type Props = {
  layout: LayoutId
  onChange: (layout: LayoutId) => void
  /** 見本を描くための今の設定（テンプレートとサイズは見本ごとに差し替える） */
  input: RenderInput
}

const fallbackSetlist = createSampleSetlist()

function Thumb({
  id,
  input,
  epoch,
}: {
  id: LayoutId
  input: RenderInput
  epoch: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canvas = ref.current
      const c = canvas?.getContext('2d')
      if (!canvas || !c) return
      const setlist =
        input.setlist.tracks.length > 0 ? input.setlist : fallbackSetlist
      const tracks = setlist.tracks.slice(0, 12)
      const thumbInput: RenderInput = {
        ...input,
        layout: id,
        size: THUMB_SIZE,
        style:
          id === input.layout ? input.style : templateStyle(id, input.style),
        setlist: { ...setlist, tracks },
        split: { ...input.split, enabled: false },
        display: { ...input.display, credit: false },
      }
      try {
        renderPage(c, thumbInput, {
          index: 0,
          count: 1,
          start: 0,
          end: tracks.length,
        })
      } catch {
        // 見本が描けなくても本体には影響させない
      }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [id, input, epoch])
  return (
    <canvas
      ref={ref}
      width={THUMB_SIZE.width}
      height={THUMB_SIZE.height}
      className="block aspect-[4/5] w-full rounded-md border border-white/10 bg-black"
      aria-hidden
    />
  )
}

export function TemplatePicker({ layout, onChange, input }: Props) {
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    const bump = () => {
      resetMeasureCache()
      setEpoch((n) => n + 1)
    }
    document.fonts.addEventListener('loadingdone', bump)
    return () => document.fonts.removeEventListener('loadingdone', bump)
  }, [])
  const groups: Array<TemplateGroup> = ['simple', 'theme', 'legacy']
  return (
    <fieldset className="space-y-2">
      <legend className={labelClass}>テンプレート</legend>
      {groups.map((group) => {
        const list = LAYOUTS.filter((t) => t.group === group)
        return (
          <div key={group} className="space-y-1.5">
            {GROUP_LABELS[group] ? (
              <p className="pt-2 text-xs text-gray-500">
                {GROUP_LABELS[group]}
              </p>
            ) : null}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {list.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={layout === item.id}
                  className={`${choiceClass(layout === item.id)} p-1.5!`}
                  onClick={() => onChange(item.id)}
                  title={item.note}
                >
                  <Thumb id={item.id} input={input} epoch={epoch} />
                  <span className="px-0.5 pt-1 text-xs font-semibold">
                    {item.name}
                  </span>
                  <span className="px-0.5 text-[11px] leading-snug text-gray-400">
                    {item.note}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </fieldset>
  )
}
