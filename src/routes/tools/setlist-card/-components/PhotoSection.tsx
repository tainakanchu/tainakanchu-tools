import { useRef, useState } from 'react'
import { ImagePlus, RotateCcw, X } from 'lucide-react'
import { DEFAULT_PHOTO_SETTINGS, getTemplate } from '../-lib/layouts'
import { PALETTE_ROLES, ROLE_LABELS, fixPalette } from '../-lib/palettes'
import { PaletteSwatch } from './PalettePicker'
import {
  choiceClass,
  labelClass,
  sectionClass,
  sectionNoteClass,
  sectionTitleClass,
  sliderClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { LayoutId, PhotoSettings } from '../-lib/layouts'
import type { Palette, PaletteRole } from '../-lib/palettes'
import type { LoadedPhoto } from '../-lib/photo'
import type { RenderInfo } from '../-lib/render'

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
  layout: LayoutId
  palette: Palette
  onPaletteChange: (palette: Palette) => void
  /** 写真から作った配色の候補 */
  candidates: ReadonlyArray<Palette>
  /** 写真の上の読みやすさの自動調整の結果 */
  contrast: RenderInfo['photoContrast']
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
  layout,
  palette,
  onPaletteChange,
  candidates,
  contrast,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const template = getTemplate(layout)
  const forcedTint = layout === 'copy'
  const assign = (role: PaletteRole, hex: string) => {
    onPaletteChange(
      fixPalette({ ...palette, id: 'custom', name: 'カスタム', [role]: hex }),
    )
  }
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
                  disabled={mode === 'block' && !template.photoBlock}
                  className={`${choiceClass(settings.mode === mode)} disabled:cursor-not-allowed disabled:opacity-35`}
                  onClick={() => set({ mode })}
                >
                  <span className="font-semibold">{name}</span>
                  <span className="text-xs text-gray-400">{note}</span>
                </button>
              ))}
            </div>
            {!template.photoBlock ? (
              <p className="text-xs text-gray-500">
                フォトは写真を全面に敷くテンプレートです（写真枠にはなりません）。
              </p>
            ) : null}
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
                label="幕を濃くする"
                value={settings.dim}
                min={0}
                max={0.9}
                step={0.01}
                format={(v) => (v === 0 ? '自動' : percent(v))}
                onChange={(dim) => set({ dim })}
              />
              <p className="text-xs text-gray-500">
                {contrast
                  ? `文字の後ろの写真の明るさを測って、読める最小の濃さ（いま ${percent(contrast.scrim)}）の幕を敷いています。${contrast.flipped ? '写真に合わせて文字を反対の明るさにしています。' : ''}${contrast.adjusted ? '幕だけでは足りないため、文字色の明るさも補正しています。' : ''}`
                  : '全面背景のとき、文字が読める最小の濃さの幕を自動で敷きます。'}
                0 より上にすると、その濃さまでは必ず暗くします。
              </p>
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
                      ['xerox', 'コピー'],
                      ['dither', 'ドット'],
                    ] as const
                  ).map(([tint, name]) => (
                    <button
                      key={tint}
                      type="button"
                      aria-pressed={settings.tint === tint}
                      disabled={forcedTint}
                      className={`${choiceClass(settings.tint === tint)} items-center! px-2! py-1.5! text-xs`}
                      onClick={() => set({ tint })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                {forcedTint ? (
                  <p className="text-xs text-gray-500">
                    コピーのテンプレートは写真をコピー機風のモノクロにします。
                  </p>
                ) : layout === 'y2k' && settings.tint === 'none' ? (
                  <p className="text-xs text-gray-500">
                    Y2K では「そのまま」のときもドット（4×4
                    のディザ）で描きます。
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-gray-950/40 p-3">
            <p className={labelClass}>写真から作る</p>
            {photo.swatches.length === 0 ? (
              <p className="text-xs text-gray-500">
                この写真からは色を取り出せませんでした。
              </p>
            ) : (
              <>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="写真の代表色"
                >
                  {photo.swatches.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      aria-pressed={picked === sw.hex}
                      className={`h-9 w-9 rounded-lg border-2 transition ${picked === sw.hex ? 'border-cyan-300' : 'border-white/15 hover:border-white/40'}`}
                      style={{ background: sw.hex }}
                      onClick={() =>
                        setPicked(picked === sw.hex ? null : sw.hex)
                      }
                      title={`${sw.hex}（面積 ${Math.round(sw.share * 100)}%）`}
                      aria-label={`${sw.hex} を選ぶ`}
                    />
                  ))}
                </div>
                {picked ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-gray-400">{picked} を</span>
                    {PALETTE_ROLES.map((role) => (
                      <button
                        key={role}
                        type="button"
                        className={`${choiceClass(false)} items-center! px-2.5! py-1! text-xs`}
                        onClick={() => {
                          assign(role, picked)
                          setPicked(null)
                        }}
                      >
                        {ROLE_LABELS[role]}
                      </button>
                    ))}
                    <span className="text-xs text-gray-400">に使う</span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    色をクリックすると、背景・文字・差し色などに割り当てられます（コントラストが足りなければ明るさを自動で直します）。
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {candidates.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={palette.id === p.id}
                      className={`${choiceClass(palette.id === p.id)} flex-row! items-center! gap-2! px-2! py-1.5!`}
                      onClick={() => onPaletteChange(p)}
                    >
                      <PaletteSwatch palette={p} />
                      <span className="text-xs font-medium">
                        {p.name.replace('写真: ', '')}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

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
