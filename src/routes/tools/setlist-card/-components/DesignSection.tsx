import { CANVAS_SIZES, LAYOUTS } from '../-lib/layouts'
import { THEMES } from '../-lib/themes'
import {
  choiceClass,
  labelClass,
  sectionClass,
  sectionTitleClass,
} from '../-lib/styles'
import type { CanvasSize, LayoutId } from '../-lib/layouts'
import type { DisplayOptions } from '../-lib/render'

type Props = {
  layout: LayoutId
  onLayoutChange: (layout: LayoutId) => void
  sizeId: CanvasSize['id']
  onSizeChange: (id: CanvasSize['id']) => void
  themeId: string
  onThemeChange: (id: string) => void
  display: DisplayOptions
  onDisplayChange: (display: DisplayOptions) => void
  /** 開始時刻を持つ曲があるか（無ければ注記を出す） */
  hasStartTimes: boolean
}

const TOGGLES: ReadonlyArray<{ key: keyof DisplayOptions; label: string }> = [
  { key: 'number', label: '曲番号' },
  { key: 'bpm', label: 'BPM' },
  { key: 'key', label: 'Key' },
  { key: 'time', label: '開始時刻' },
  { key: 'credit', label: 'クレジット' },
]

export function DesignSection({
  layout,
  onLayoutChange,
  sizeId,
  onSizeChange,
  themeId,
  onThemeChange,
  display,
  onDisplayChange,
  hasStartTimes,
}: Props) {
  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-400">4.</span> デザイン
      </h2>

      <div className="mt-4 space-y-5">
        <fieldset className="space-y-2">
          <legend className={labelClass}>レイアウト</legend>
          <div className="grid grid-cols-3 gap-2">
            {LAYOUTS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={layout === item.id}
                className={choiceClass(layout === item.id)}
                onClick={() => onLayoutChange(item.id)}
              >
                <span className="font-semibold">{item.name}</span>
                <span className="text-xs text-gray-400">{item.note}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={labelClass}>サイズ</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CANVAS_SIZES.map((size) => (
              <button
                key={size.id}
                type="button"
                aria-pressed={sizeId === size.id}
                className={choiceClass(sizeId === size.id)}
                onClick={() => onSizeChange(size.id)}
              >
                <span className="font-semibold">
                  {size.label}{' '}
                  <span className="font-normal text-gray-400">{size.note}</span>
                </span>
                <span className="font-mono text-[11px] text-gray-500">
                  {size.width}×{size.height}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={labelClass}>テーマ</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                aria-pressed={themeId === theme.id}
                className={`${choiceClass(themeId === theme.id)} flex-row! items-center! gap-2!`}
                onClick={() => onThemeChange(theme.id)}
              >
                <span
                  className="flex h-7 w-10 shrink-0 overflow-hidden rounded-md border border-white/20"
                  aria-hidden
                >
                  <span className="flex-1" style={{ background: theme.bg }} />
                  <span
                    className="w-2.5"
                    style={{ background: theme.accent }}
                  />
                  <span
                    className="w-2.5"
                    style={{ background: theme.accent2 }}
                  />
                </span>
                <span className="text-xs font-medium">{theme.name}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={labelClass}>表示する項目</legend>
          <div className="flex flex-wrap gap-2">
            {TOGGLES.map((toggle) => (
              <label
                key={toggle.key}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-gray-200 has-[:checked]:border-cyan-400/70 has-[:checked]:bg-cyan-500/10"
              >
                <input
                  type="checkbox"
                  className="accent-cyan-500"
                  checked={display[toggle.key]}
                  onChange={(event) =>
                    onDisplayChange({
                      ...display,
                      [toggle.key]: event.target.checked,
                    })
                  }
                />
                {toggle.label}
              </label>
            ))}
          </div>
          {display.time && !hasStartTimes ? (
            <p className="text-xs text-amber-200/80">
              この履歴には再生開始時刻が入っていないため、開始時刻は表示されません
              （Traktor / Serato の履歴には入っています）。
            </p>
          ) : null}
        </fieldset>
      </div>
    </section>
  )
}
