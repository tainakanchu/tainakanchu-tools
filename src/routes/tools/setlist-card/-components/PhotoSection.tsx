import { useRef } from 'react'
import { ImagePlus, RotateCcw, X } from 'lucide-react'
import { DEFAULT_PHOTO_SETTINGS } from '../-lib/layouts'
import {
  choiceClass,
  labelClass,
  sectionClass,
  sectionNoteClass,
  sectionTitleClass,
  sliderClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { PhotoSettings } from '../-lib/layouts'
import type { LoadedPhoto } from '../-lib/photo'

type Props = {
  photo: LoadedPhoto | null
  loading: boolean
  error: string | null
  settings: PhotoSettings
  onSettingsChange: (settings: PhotoSettings) => void
  onFile: (file: File) => void
  onRemove: () => void
  /** 写真枠では曲が入らず全面背景に回したか */
  fallback: boolean
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-sm text-gray-300">
        {label}
        <span className="font-mono text-xs text-gray-500 tabular-nums">
          {format(value)}
        </span>
      </span>
      <input
        type="range"
        className={sliderClass}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

const percent = (v: number) => `${Math.round(v * 100)}%`

export function PhotoSection({
  photo,
  loading,
  error,
  settings,
  onSettingsChange,
  onFile,
  onRemove,
  fallback,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<PhotoSettings>) =>
    onSettingsChange({ ...settings, ...patch })

  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-400">5.</span> 写真
        <span className="text-sm font-normal text-gray-400">任意</span>
      </h2>
      <p className={`${sectionNoteClass} mt-2`}>
        ブースの写真やフライヤーを入れられます。全面に敷くか、レイアウトの中に写真枠を取るかを選べます。
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          event.target.value = ''
        }}
      />

      {!photo ? (
        <button
          type="button"
          className={`${subtleButtonClass} mt-4 w-full py-6`}
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          <ImagePlus size={18} className="text-cyan-300" aria-hidden />
          {loading ? '読み込み中…' : '写真を選ぶ'}
        </button>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-gray-300">
              {photo.name}
            </span>
            <button
              type="button"
              className={subtleButtonClass}
              onClick={() => inputRef.current?.click()}
            >
              差し替え
            </button>
            <button
              type="button"
              className={subtleButtonClass}
              onClick={onRemove}
            >
              <X size={14} aria-hidden />
              外す
            </button>
          </div>

          <fieldset className="space-y-2">
            <legend className={labelClass}>置き方</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['block', '写真枠', '写真の場所を取って曲を周りに組む'],
                  [
                    'background',
                    '全面背景',
                    '画面いっぱいに敷いて文字を重ねる',
                  ],
                ] as const
              ).map(([mode, name, note]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={settings.mode === mode}
                  className={choiceClass(settings.mode === mode)}
                  onClick={() => set({ mode })}
                >
                  <span className="font-semibold">{name}</span>
                  <span className="text-xs text-gray-400">{note}</span>
                </button>
              ))}
            </div>
            {fallback ? (
              <p className="text-xs text-amber-200/80">
                写真枠だと曲が入りきらないため、全面背景にして描いています。
                曲を減らすか、2カラム / 9:16 にすると写真枠に戻ります。
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <p className={labelClass}>切り抜き</p>
              <Slider
                label="横位置"
                value={settings.posX}
                min={0}
                max={1}
                step={0.01}
                format={percent}
                onChange={(posX) => set({ posX })}
              />
              <Slider
                label="縦位置"
                value={settings.posY}
                min={0}
                max={1}
                step={0.01}
                format={percent}
                onChange={(posY) => set({ posY })}
              />
              <Slider
                label="ズーム"
                value={settings.zoom}
                min={1}
                max={3}
                step={0.01}
                format={(v) => `${v.toFixed(2)}×`}
                onChange={(zoom) => set({ zoom })}
              />
              <p className="text-xs text-gray-500">
                プレビューの写真をドラッグしても位置を動かせます。
              </p>
            </div>
            <div className="space-y-3">
              <p className={labelClass}>エフェクト</p>
              <Slider
                label="暗さ"
                value={settings.dim}
                min={0}
                max={0.9}
                step={0.01}
                format={percent}
                onChange={(dim) => set({ dim })}
              />
              <Slider
                label="ぼかし"
                value={settings.blur}
                min={0}
                max={24}
                step={0.5}
                format={(v) => `${v}px`}
                onChange={(blur) => set({ blur })}
              />
              <div className="space-y-1">
                <span className="text-sm text-gray-300">色調</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['none', 'そのまま'],
                      ['mono', 'モノクロ'],
                      ['duotone', 'ダブルトーン'],
                    ] as const
                  ).map(([tint, name]) => (
                    <button
                      key={tint}
                      type="button"
                      aria-pressed={settings.tint === tint}
                      className={`${choiceClass(settings.tint === tint)} items-center! px-2! py-1.5! text-xs`}
                      onClick={() => set({ tint })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              className="mt-1 accent-cyan-500"
              checked={settings.useImageAccent}
              disabled={!photo.accent}
              onChange={(event) =>
                set({ useImageAccent: event.target.checked })
              }
            />
            <span>
              画像から色を取る
              {photo.accent ? (
                <span
                  className="ml-2 inline-block h-3 w-6 rounded-sm align-middle"
                  style={{
                    background: `rgb(${photo.accent.map(Math.round).join(',')})`,
                  }}
                  aria-hidden
                />
              ) : null}
              <span className="block text-xs text-gray-500">
                {photo.accent
                  ? '写真の中で目立つ色をアクセント色にします。背景とのコントラストは自動で補正します。'
                  : 'この写真にはアクセントになる色がありません（モノクロに近い画像です）。'}
              </span>
            </span>
          </label>

          <button
            type="button"
            className={subtleButtonClass}
            onClick={() =>
              onSettingsChange({
                ...DEFAULT_PHOTO_SETTINGS,
                mode: settings.mode,
              })
            }
          >
            <RotateCcw size={14} aria-hidden />
            写真の調整をリセット
          </button>
        </div>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
        >
          {error}
        </p>
      ) : null}
    </section>
  )
}
