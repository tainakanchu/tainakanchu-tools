import { CANVAS_SIZES, LAYOUTS, MAX_PAGES, getSize } from '../-lib/layouts'
import { columnsLimit } from '../-lib/render'
import { THEMES } from '../-lib/themes'
import {
  choiceClass,
  labelClass,
  sectionClass,
  sectionTitleClass,
} from '../-lib/styles'
import type { CanvasSize, ColumnsSetting, LayoutId } from '../-lib/layouts'
import type { DisplayOptions, SplitOptions, TextOptions } from '../-lib/render'

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
  textOptions: TextOptions
  onTextOptionsChange: (options: TextOptions) => void
  columns: ColumnsSetting
  onColumnsChange: (columns: ColumnsSetting) => void
  split: SplitOptions
  onSplitChange: (split: SplitOptions) => void
}

const LONG_TEXT_MODES: ReadonlyArray<{
  id: TextOptions['longText']
  name: string
  note: string
}> = [
  { id: 'ellipsis', name: '省略', note: '入らない分を「…」に' },
  { id: 'condense', name: '縮める', note: '横幅を 75% まで詰める' },
  { id: 'wrap', name: '折り返し', note: '2 行まで折り返す' },
]

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
  textOptions,
  onTextOptionsChange,
  columns,
  onColumnsChange,
  split,
  onSplitChange,
}: Props) {
  const maxColumns = columnsLimit(getSize(sizeId))
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
          {layout === 'columns' ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-sm text-gray-300">段数</span>
              {(['auto', 1, 2, 3] as const).map((value) => {
                const disabled = value !== 'auto' && value > maxColumns
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={columns === value}
                    disabled={disabled}
                    className={`${choiceClass(columns === value)} items-center! px-3! py-1! text-xs disabled:cursor-not-allowed disabled:opacity-35`}
                    onClick={() => onColumnsChange(value)}
                    title={
                      disabled
                        ? 'このサイズでは段の幅が狭すぎて読めません'
                        : undefined
                    }
                  >
                    {value === 'auto' ? '自動' : `${value} 段`}
                  </button>
                )
              })}
              <span className="text-xs text-gray-500">
                自動はサイズと曲数から段数を選びます
                {maxColumns < 3 ? '（3 段は 16:9 のみ）' : ''}
              </span>
            </div>
          ) : null}
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

        <fieldset className="space-y-2">
          <legend className={labelClass}>長い曲名・アーティスト名</legend>
          <div className="grid grid-cols-3 gap-2">
            {LONG_TEXT_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                aria-pressed={textOptions.longText === mode.id}
                className={choiceClass(textOptions.longText === mode.id)}
                onClick={() =>
                  onTextOptionsChange({ ...textOptions, longText: mode.id })
                }
              >
                <span className="font-semibold">{mode.name}</span>
                <span className="text-xs text-gray-400">{mode.note}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                [
                  'stripMix',
                  'ミックス表記を省く',
                  '(Original Mix) や [Extended Mix] など。人名入りのリミックス表記は残します',
                ],
                ['stripFeat', 'feat. を省く', 'feat. / ft. 以降のゲスト表記'],
              ] as const
            ).map(([key, label, note]) => (
              <label
                key={key}
                title={note}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-gray-200 has-[:checked]:border-cyan-400/70 has-[:checked]:bg-cyan-500/10"
              >
                <input
                  type="checkbox"
                  className="accent-cyan-500"
                  checked={textOptions[key]}
                  onChange={(event) =>
                    onTextOptionsChange({
                      ...textOptions,
                      [key]: event.target.checked,
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            ミックス表記は (Original Mix)・[Extended Mix]・- 2024 Remaster
            のような汎用の表記だけを省き、(Artist Remix)
            のような人名入りの表記は残します。
            画像の上だけの変更で、曲リストの内容はそのままです。
          </p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={labelClass}>枚数</legend>
          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              className="accent-cyan-500"
              checked={split.enabled}
              onChange={(event) =>
                onSplitChange({ ...split, enabled: event.target.checked })
              }
            />
            複数枚に分ける
            <span className="text-xs text-gray-500">
              （Instagram の複数枚投稿向け。番号は通しで、2
              枚目以降は見出しを小さくします）
            </span>
          </label>
          {split.enabled ? (
            <div className="flex flex-wrap items-center gap-2 pl-6">
              <button
                type="button"
                aria-pressed={split.mode === 'auto'}
                className={`${choiceClass(split.mode === 'auto')} items-center! px-3! py-1! text-xs`}
                onClick={() => onSplitChange({ ...split, mode: 'auto' })}
              >
                自動
              </button>
              <button
                type="button"
                aria-pressed={split.mode === 'manual'}
                className={`${choiceClass(split.mode === 'manual')} items-center! px-3! py-1! text-xs`}
                onClick={() => onSplitChange({ ...split, mode: 'manual' })}
              >
                枚数を指定
              </button>
              {split.mode === 'manual' ? (
                <label className="flex items-center gap-1.5 text-sm text-gray-300">
                  <input
                    type="number"
                    min={2}
                    max={MAX_PAGES}
                    value={split.count}
                    className="w-16 rounded-lg border border-white/15 bg-gray-950 px-2 py-1 text-sm text-gray-100 focus:border-cyan-500 focus:outline-none"
                    onChange={(event) => {
                      const n = Number(event.target.value)
                      if (Number.isFinite(n)) {
                        onSplitChange({
                          ...split,
                          count: Math.min(
                            MAX_PAGES,
                            Math.max(1, Math.round(n)),
                          ),
                        })
                      }
                    }}
                  />
                  枚
                </label>
              ) : (
                <span className="text-xs text-gray-500">
                  読みやすい大きさで全曲入る枚数にします
                </span>
              )}
            </div>
          ) : null}
        </fieldset>
      </div>
    </section>
  )
}
