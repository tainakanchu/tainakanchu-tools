import { useEffect, useId, useRef, useState } from 'react'
import { SegmentedControl, Swatch } from '../../../../components/ui'
import { INK_PRESETS } from '../../../../lib/risograph/presets'
import { renderComposite } from '../../../../lib/risograph/preview'
import { putRgbaToCanvas } from '../-lib/image'
import { PAPER_GRAIN_SEED, applyPaperGrain } from '../-lib/paperGrain'
import { MAX_OFFSET_MM, MAX_ROTATION_DEG } from '../-lib/plates'
import {
  fieldClass,
  labelClass,
  previewFrameClass,
  rowClass,
  rowListClass,
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
  /** 紙の粗さ 0..1（プレビューにだけ乗せる質感） */
  grain: number
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
  grain,
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
  const modeLabelId = useId()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !maps || view !== 'composite') return
    // 合成は重いので、スライダー操作中は 1 フレームに 1 回だけ描く
    const handle = requestAnimationFrame(() => {
      const rgba = new Uint8ClampedArray(width * height * 4)
      renderComposite(maps, width, height, transforms, fwd, rgba)
      // 紙の質感は書き出しデータには入れず、画面の見えだけに乗せる
      applyPaperGrain(rgba, width, height, grain, PAPER_GRAIN_SEED)
      putRgbaToCanvas(canvas, rgba, width, height)
    })
    return () => cancelAnimationFrame(handle)
  }, [maps, width, height, transforms, fwd, grain, view])

  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>5. 重ね刷りプレビュー</h2>
      <p className={`${sectionNoteClass} mt-2`}>
        版ごとのハーフトーンを適用したうえで、順モデルで重ね刷りの色を予測しています。
        版ズレは 300dpi を仮定して mm から画素へ換算しています。
        紙の色は分版に反映され、紙の質感（ざらつき）はこのプレビューにだけ乗せています。
      </p>

      <SegmentedControl
        label="表示"
        size="sm"
        className="mt-4"
        value={view}
        onChange={setView}
        options={[
          { value: 'composite', label: '合成予測' },
          { value: 'original', label: '原画' },
        ]}
      />

      <div className={`mt-3 overflow-hidden ${previewFrameClass}`}>
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
          <div className="field">
            <span id={modeLabelId} className={labelClass}>
              版ズレ
            </span>
            <SegmentedControl
              labelledBy={modeLabelId}
              value={mode}
              onChange={onModeChange}
              options={MODE_LABELS}
            />
          </div>

          {mode === 'random' ? (
            <>
              <label className="field">
                <span className={labelClass}>シード</span>
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
                振り直す
              </button>
            </>
          ) : null}
        </div>

        {mode === 'none' ? null : (
          <ul className={rowListClass}>
            {inkIds.map((id, index) => {
              const preset = INK_PRESETS.find((p) => p.id === id)
              const reg = registrations.at(index)
              if (!reg) return null
              const readOnly = mode === 'random'
              return (
                <li key={id} className={rowClass}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Swatch color={preset?.hex ?? '#000000'} size={16} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {index + 1}版目 {preset?.name ?? id}
                    </span>
                    <span className="text-xs text-ink-muted tabular-nums">
                      横 {reg.offsetMm.x.toFixed(2)}mm、縦{' '}
                      {reg.offsetMm.y.toFixed(2)}mm、回転{' '}
                      {reg.rotationDeg.toFixed(2)}°
                    </span>
                  </div>
                  {readOnly ? null : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <label className="field gap-0.5">
                        <span className="text-xs text-ink-muted">横（mm）</span>
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
                      <label className="field gap-0.5">
                        <span className="text-xs text-ink-muted">縦（mm）</span>
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
                      <label className="field gap-0.5">
                        <span className="text-xs text-ink-muted">
                          回転（°）
                        </span>
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
