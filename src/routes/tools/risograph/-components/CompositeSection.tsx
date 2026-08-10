import { useEffect, useRef, useState } from 'react'
import { Dices } from 'lucide-react'
import { INK_PRESETS } from '../../../../lib/risograph/presets'
import { renderComposite } from '../../../../lib/risograph/preview'
import { putRgbaToCanvas } from '../-lib/image'
import { MAX_OFFSET_MM, MAX_ROTATION_DEG } from '../-lib/plates'
import {
  fieldClass,
  labelClass,
  sectionClass,
  sectionNoteClass,
  sectionTitleClass,
  sliderClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { ForwardContext } from '../../../../lib/risograph/forward'
import type {
  PlateTransformPx,
  RegistrationError,
} from '../../../../lib/risograph/registration'
import type { InkId } from '../../../../lib/risograph/types'
import type { RegistrationMode } from '../-lib/plates'

type Props = {
  inkIds: Array<InkId>
  maps: Array<Float32Array> | null
  width: number
  height: number
  fwd: ForwardContext
  transforms: Array<PlateTransformPx | null>
  originalDataUrl: string
  mode: RegistrationMode
  onModeChange: (mode: RegistrationMode) => void
  seed: number
  onSeedChange: (seed: number) => void
  onReroll: () => void
  registrations: Array<RegistrationError>
  onRegistrationChange: (index: number, next: RegistrationError) => void
}

const MODE_LABELS: Array<{ value: RegistrationMode; label: string }> = [
  { value: 'none', label: 'ズレなし' },
  { value: 'random', label: 'ランダム' },
  { value: 'manual', label: '手動' },
]

export function CompositeSection({
  inkIds,
  maps,
  width,
  height,
  fwd,
  transforms,
  originalDataUrl,
  mode,
  onModeChange,
  seed,
  onSeedChange,
  onReroll,
  registrations,
  onRegistrationChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<'composite' | 'original'>('composite')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !maps || view !== 'composite') return
    // 合成は重いので、スライダー操作中は 1 フレームに 1 回だけ描く
    const handle = requestAnimationFrame(() => {
      const rgba = new Uint8ClampedArray(width * height * 4)
      renderComposite(maps, width, height, transforms, fwd, rgba)
      putRgbaToCanvas(canvas, rgba, width, height)
    })
    return () => cancelAnimationFrame(handle)
  }, [maps, width, height, transforms, fwd, view])

  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-400">5.</span> 重ね刷りプレビュー
      </h2>
      <p className={`${sectionNoteClass} mt-2`}>
        版ごとのハーフトーンを適用したうえで、順モデルで重ね刷りの色を予測しています。
        版ズレは 300dpi を仮定して mm から画素へ換算しています。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-white/15 p-0.5">
          {(['composite', 'original'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                view === value
                  ? 'bg-cyan-600 text-white'
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              {value === 'composite' ? '合成予測' : '原画'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl bg-white">
        {view === 'composite' ? (
          <canvas
            ref={canvasRef}
            className="mx-auto block h-auto w-full max-w-3xl"
            aria-label="重ね刷りの合成予測"
          />
        ) : (
          <img
            src={originalDataUrl}
            alt="原画"
            className="mx-auto block h-auto w-full max-w-3xl"
          />
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className={labelClass}>版ズレ</span>
            <select
              className={fieldClass}
              value={mode}
              onChange={(event) => {
                const found = MODE_LABELS.find(
                  (m) => m.value === event.target.value,
                )
                if (found) onModeChange(found.value)
              }}
            >
              {MODE_LABELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          {mode === 'random' ? (
            <>
              <label className="space-y-1">
                <span className={labelClass}>seed</span>
                <input
                  type="number"
                  className={`${fieldClass} w-32`}
                  value={seed}
                  min={0}
                  step={1}
                  onChange={(event) =>
                    onSeedChange(
                      Math.max(0, Math.floor(Number(event.target.value))),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className={subtleButtonClass}
                onClick={onReroll}
              >
                <Dices size={16} aria-hidden />
                振り直す
              </button>
            </>
          ) : null}
        </div>

        {mode === 'none' ? null : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {inkIds.map((id, index) => {
              const preset = INK_PRESETS.find((p) => p.id === id)
              const reg = registrations.at(index)
              if (!reg) return null
              const readOnly = mode === 'random'
              return (
                <li
                  key={id}
                  className="rounded-xl border border-white/10 bg-gray-950/60 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded-full border border-white/20"
                      style={{ backgroundColor: preset?.hex ?? '#000000' }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-300">
                      {index + 1}版目 {preset?.name ?? id}
                    </span>
                    <span className="text-[11px] text-gray-500 tabular-nums">
                      x {reg.offsetMm.x.toFixed(2)} / y{' '}
                      {reg.offsetMm.y.toFixed(2)} mm /{' '}
                      {reg.rotationDeg.toFixed(2)}°
                    </span>
                  </div>
                  {readOnly ? null : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <label className="space-y-0.5">
                        <span className="text-[11px] text-gray-400">x mm</span>
                        <input
                          type="range"
                          className={sliderClass}
                          min={-MAX_OFFSET_MM}
                          max={MAX_OFFSET_MM}
                          step={0.05}
                          value={reg.offsetMm.x}
                          onChange={(event) =>
                            onRegistrationChange(index, {
                              ...reg,
                              offsetMm: {
                                ...reg.offsetMm,
                                x: Number(event.target.value),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[11px] text-gray-400">y mm</span>
                        <input
                          type="range"
                          className={sliderClass}
                          min={-MAX_OFFSET_MM}
                          max={MAX_OFFSET_MM}
                          step={0.05}
                          value={reg.offsetMm.y}
                          onChange={(event) =>
                            onRegistrationChange(index, {
                              ...reg,
                              offsetMm: {
                                ...reg.offsetMm,
                                y: Number(event.target.value),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[11px] text-gray-400">回転°</span>
                        <input
                          type="range"
                          className={sliderClass}
                          min={-MAX_ROTATION_DEG}
                          max={MAX_ROTATION_DEG}
                          step={0.05}
                          value={reg.rotationDeg}
                          onChange={(event) =>
                            onRegistrationChange(index, {
                              ...reg,
                              rotationDeg: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
