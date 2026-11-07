import { useId, useState } from 'react'
import { Image } from 'lucide-react'
import { DEFAULT_PHOTO_SETTINGS, getTemplate } from '../-lib/layouts'
import { Field, Segmented, SliderRow } from './ui'
import type { LayoutId, PhotoSettings } from '../-lib/layouts'
import type { LoadedPhoto } from '../-lib/photo'
import type { RenderInfo } from '../-lib/render'

type Props = {
  photo: LoadedPhoto | null
  loading: boolean
  error: string | null
  settings: PhotoSettings
  onSettingsChange: (settings: PhotoSettings) => void
  onPick: () => void
  onRemove: () => void
  /** 帯では曲が入らず全面に回したか */
  fallback: boolean
  layout: LayoutId
  /** 写真の上の読みやすさの自動調整の結果 */
  contrast: RenderInfo['photoContrast']
}

const TINTS = [
  { value: 'none', label: 'そのまま' },
  { value: 'mono', label: 'モノクロ' },
  { value: 'duotone', label: '2 色' },
  { value: 'xerox', label: 'コピー' },
  { value: 'dither', label: 'ドット' },
] as const

const percent = (v: number) => `${Math.round(v * 100)}%`

/**
 * 写真。入れる前は 1 ボタン、入れたら「ファイル名 · 調整 · 外す」の 1 行。
 * 調整は開いたときだけ（ズーム・暗さ・ぼかし・色調・置き方）。位置はプレビューで動かす。
 */
export function PhotoSection({
  photo,
  loading,
  error,
  settings,
  onSettingsChange,
  onPick,
  onRemove,
  fallback,
  layout,
  contrast,
}: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const template = getTemplate(layout)
  const forcedTint = layout === 'copy'
  const set = (patch: Partial<PhotoSettings>) =>
    onSettingsChange({ ...settings, ...patch })

  if (!photo) {
    return (
      <div>
        <button
          type="button"
          className="slc-btn w-full justify-start!"
          onClick={onPick}
          disabled={loading}
          title="ブースの写真やフライヤーを敷く"
        >
          <Image size={18} aria-hidden />
          {loading ? '読み込み中…' : '写真を入れる'}
        </button>
        {error ? (
          <p role="alert" className="slc-note pt-1" data-tone="alert">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  const mode = template.photoBlock ? settings.mode : 'background'
  const dimTitle = contrast
    ? `いまは自動で ${percent(contrast.scrim)} 暗くしています`
    : '0 は自動（文字が読める最小の暗さ）'

  return (
    <div>
      <div className="flex min-h-11 items-center gap-1">
        <Image size={18} aria-hidden className="mr-1 shrink-0 text-(--muted)" />
        <button
          type="button"
          className="min-h-11 min-w-0 flex-1 truncate text-left"
          onClick={onPick}
          title="差し替え"
          aria-label={`${photo.name}（押すと差し替え）`}
        >
          {photo.name}
        </button>
        <button
          type="button"
          className="slc-btn"
          data-variant="ghost"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          調整
        </button>
        <button
          type="button"
          className="slc-btn"
          data-variant="ghost"
          onClick={onRemove}
        >
          外す
        </button>
      </div>
      {error ? (
        <p role="alert" className="slc-note" data-tone="alert">
          {error}
        </p>
      ) : null}

      <div id={panelId} hidden={!open} className="space-y-3 pt-1 pb-4">
        <Segmented
          label="置き方"
          value={mode}
          options={[
            {
              value: 'block',
              label: '帯',
              disabled: !template.photoBlock,
              title: template.photoBlock
                ? '写真の場所を取って、曲を周りに組む'
                : 'フォトは写真を全面に敷くテンプレート',
            },
            {
              value: 'background',
              label: '全面',
              title: '画面いっぱいに敷いて文字を重ねる',
            },
          ]}
          onChange={(next) => set({ mode: next })}
        />
        {fallback ? (
          <p className="slc-note">帯だと曲が入らないので全面にしています</p>
        ) : null}
        <SliderRow
          label="ズーム"
          value={settings.zoom}
          min={1}
          max={3}
          step={0.01}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(zoom) => set({ zoom })}
        />
        <SliderRow
          label="暗さ"
          value={settings.dim}
          min={0}
          max={0.9}
          step={0.01}
          format={(v) => (v === 0 ? '自動' : percent(v))}
          onChange={(dim) => set({ dim })}
          title={dimTitle}
        />
        <SliderRow
          label="ぼかし"
          value={settings.blur}
          min={0}
          max={24}
          step={0.5}
          format={(v) => `${v}px`}
          onChange={(blur) => set({ blur })}
        />
        <Field label="色調">
          <Segmented
            label="色調"
            value={forcedTint ? 'xerox' : settings.tint}
            options={TINTS.map((t) => ({
              value: t.value,
              label: t.label,
              disabled: forcedTint,
              title: forcedTint
                ? 'コピーのテンプレートは写真をコピー機風にする'
                : layout === 'y2k' && t.value === 'none'
                  ? 'Y2K では「そのまま」もドットで描く'
                  : undefined,
            }))}
            onChange={(tint) => set({ tint })}
          />
        </Field>
        <button
          type="button"
          className="slc-btn"
          data-variant="link"
          onClick={() =>
            onSettingsChange({
              ...DEFAULT_PHOTO_SETTINGS,
              mode: settings.mode,
            })
          }
        >
          調整を元に戻す
        </button>
      </div>
    </div>
  )
}
