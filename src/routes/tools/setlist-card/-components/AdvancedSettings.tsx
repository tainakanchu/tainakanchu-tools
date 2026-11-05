import { SEPARATORS } from '../-lib/draw'
import { MAX_PAGES, getSize, getTemplate } from '../-lib/layouts'
import { columnsLimit } from '../-lib/render'
import { PaletteEditor } from './PalettePicker'
import { RedactSettings } from './TrackSection'
import { Field, Segmented, SwitchRow } from './ui'
import type { ComponentProps } from 'react'
import type { CanvasSize, ColumnsSetting, LayoutId } from '../-lib/layouts'
import type { RedactOptions } from '../-lib/redact'
import type { DisplayOptions, StyleOptions, TextOptions } from '../-lib/render'
import type { SplitChoice } from '../-lib/split'

type Props = {
  layout: LayoutId
  sizeId: CanvasSize['id']
  style: StyleOptions
  onStyleChange: (style: StyleOptions) => void
  display: DisplayOptions
  onDisplayChange: (display: DisplayOptions) => void
  /** 開始時刻を持つ曲があるか */
  hasStartTimes: boolean
  textOptions: TextOptions
  onTextOptionsChange: (options: TextOptions) => void
  columns: ColumnsSetting
  onColumnsChange: (columns: ColumnsSetting) => void
  splitChoice: SplitChoice
  onSplitChoiceChange: (choice: SplitChoice) => void
  redact: RedactOptions
  onRedactChange: (redact: RedactOptions) => void
  paletteEditor: ComponentProps<typeof PaletteEditor>
  className?: string
}

const TOGGLES: ReadonlyArray<{ key: keyof DisplayOptions; label: string }> = [
  { key: 'number', label: '曲番号' },
  { key: 'time', label: '開始時刻' },
  { key: 'bpm', label: 'BPM' },
  { key: 'key', label: 'Key' },
  { key: 'label', label: 'レーベル' },
  { key: 'credit', label: 'クレジット（tools.tainakanchu.com）' },
]

/** ふだんは触らないものを 1 か所に（文字組み・項目・長い名前・段数・枚数・隠し方・自分の色） */
export function AdvancedSettings({
  layout,
  sizeId,
  style,
  onStyleChange,
  display,
  onDisplayChange,
  hasStartTimes,
  textOptions,
  onTextOptionsChange,
  columns,
  onColumnsChange,
  splitChoice,
  onSplitChoiceChange,
  redact,
  onRedactChange,
  paletteEditor,
  className = '',
}: Props) {
  const maxColumns = columnsLimit(getSize(sizeId))
  const template = getTemplate(layout)
  const setStyle = (patch: Partial<StyleOptions>) =>
    onStyleChange({ ...style, ...patch })

  return (
    <details className={`slc-details slc-row ${className}`}>
      <summary>詳細設定</summary>
      <div className="space-y-8 pt-2 pb-8">
        <Field label="文字組み">
          <Segmented
            label="書体"
            value={style.family}
            options={[
              { value: 'sans', label: 'ゴシック' },
              { value: 'serif', label: '明朝' },
            ]}
            onChange={(family) => setStyle({ family })}
          />
          <Segmented
            label="アーティストと曲名の区切り"
            value={style.separator}
            options={SEPARATORS.filter(
              (sep) => sep.id !== 'stack' || layout === 'center',
            ).map((sep) => ({
              value: sep.id,
              label: sep.label,
              title:
                sep.id === 'stack'
                  ? 'アーティストと曲名を 2 行に'
                  : `Artist${sep.text}Title`,
            }))}
            onChange={(separator) => setStyle({ separator })}
          />
          <div>
            <SwitchRow
              label="番号・時刻を等幅に"
              checked={style.monoMeta}
              onChange={(monoMeta) => setStyle({ monoMeta })}
            />
            <SwitchRow
              label="粒子"
              checked={style.grain}
              onChange={(grain) => setStyle({ grain })}
              title="紙やフィルムのような細かな粒"
            />
            {layout === 'tracklist' ? (
              <SwitchRow
                label="A1・B1 の面番号"
                checked={style.sideNumbers}
                onChange={(sideNumbers) => setStyle({ sideNumbers })}
                title="12 曲までは A/B 面、それより多ければ 6 曲ずつ"
              />
            ) : null}
          </div>
        </Field>

        <Field label="表示する項目">
          <div>
            {TOGGLES.map((t) => (
              <SwitchRow
                key={t.key}
                label={
                  t.key === 'time' && !hasStartTimes ? (
                    <>
                      {t.label}
                      <span className="text-(--muted)">（履歴に無し）</span>
                    </>
                  ) : (
                    t.label
                  )
                }
                checked={display[t.key]}
                onChange={(on) => onDisplayChange({ ...display, [t.key]: on })}
                title={
                  t.key === 'time' && !hasStartTimes
                    ? 'この履歴には再生開始時刻が入っていない（Traktor / Serato には入っている）'
                    : undefined
                }
              />
            ))}
          </div>
        </Field>

        <Field label="長い曲名">
          <Segmented
            label="長い曲名・アーティスト名"
            value={textOptions.longText}
            options={[
              {
                value: 'ellipsis',
                label: '省略',
                title: '入らない分を「…」に',
              },
              {
                value: 'condense',
                label: '縮める',
                title: '横幅を 75% まで詰める',
              },
              { value: 'wrap', label: '折り返し', title: '2 行まで折り返す' },
            ]}
            onChange={(longText) =>
              onTextOptionsChange({ ...textOptions, longText })
            }
          />
          <div>
            <SwitchRow
              label="ミックス表記を省く"
              checked={textOptions.stripMix}
              onChange={(stripMix) =>
                onTextOptionsChange({ ...textOptions, stripMix })
              }
              title="(Original Mix)・[Extended Mix] など。人名入りのリミックス表記は残す"
            />
            <SwitchRow
              label="feat. を省く"
              checked={textOptions.stripFeat}
              onChange={(stripFeat) =>
                onTextOptionsChange({ ...textOptions, stripFeat })
              }
            />
          </div>
        </Field>

        {template.columns ? (
          <Field label="段数">
            <Segmented
              label="段数"
              value={columns}
              options={(['auto', 1, 2, 3] as const).map((value) => ({
                value,
                label: value === 'auto' ? '自動' : `${value} 段`,
                disabled: value !== 'auto' && value > maxColumns,
                title:
                  value !== 'auto' && value > maxColumns
                    ? 'このサイズでは段が狭すぎる（3 段は横長だけ）'
                    : undefined,
              }))}
              onChange={onColumnsChange}
            />
          </Field>
        ) : null}

        <Field label="枚数">
          <div className="flex gap-2">
            <Segmented
              label="枚数"
              className="flex-1"
              value={splitChoice.mode}
              options={[
                {
                  value: 'auto',
                  label: '自動',
                  title: '読めないときだけ分ける',
                },
                { value: 'single', label: '1 枚' },
                { value: 'manual', label: '指定' },
              ]}
              onChange={(mode) =>
                onSplitChoiceChange({
                  mode,
                  count:
                    mode === 'manual'
                      ? Math.max(2, splitChoice.count)
                      : splitChoice.count,
                })
              }
            />
            {splitChoice.mode === 'manual' ? (
              <label className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={MAX_PAGES}
                  value={splitChoice.count}
                  className="slc-input mono w-16!"
                  aria-label="枚数"
                  onChange={(event) => {
                    const n = Number(event.target.value)
                    if (Number.isFinite(n)) {
                      onSplitChoiceChange({
                        ...splitChoice,
                        count: Math.min(MAX_PAGES, Math.max(1, Math.round(n))),
                      })
                    }
                  }}
                />
                枚
              </label>
            ) : null}
          </div>
        </Field>

        <RedactSettings redact={redact} onChange={onRedactChange} />

        <PaletteEditor {...paletteEditor} />
      </div>
    </details>
  )
}
