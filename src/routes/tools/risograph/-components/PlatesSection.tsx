import { useEffect, useRef } from 'react'
import { INK_PRESETS } from '../../../../lib/risograph/presets'
import { renderSinglePlate } from '../../../../lib/risograph/preview'
import { putRgbaToCanvas } from '../-lib/image'
import { MAX_LPI, MIN_LPI } from '../-lib/plates'
import {
  fieldClass,
  labelClass,
  sectionClass,
  sectionNoteClass,
  sectionTitleClass,
  sliderClass,
} from '../-lib/styles'
import type { ForwardContext } from '../../../../lib/risograph/forward'
import type { HalftoneMethod } from '../../../../lib/risograph/types'
import type { PlateSetting } from '../-lib/plates'

const METHODS: Array<{ value: HalftoneMethod; label: string }> = [
  { value: 'none', label: 'なし（階調のまま）' },
  { value: 'am', label: 'AM 網点' },
  { value: 'blue-noise', label: 'blue-noise' },
]

type CardProps = {
  index: number
  setting: PlateSetting
  map: Float32Array | null
  width: number
  height: number
  fwd: ForwardContext
  onChange: (next: PlateSetting) => void
}

function PlateCard({
  index,
  setting,
  map,
  width,
  height,
  fwd,
  onChange,
}: CardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const preset = INK_PRESETS.find((p) => p.id === setting.inkId)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !map) return
    // スライダー操作中の連続更新を 1 フレームにまとめる
    const handle = requestAnimationFrame(() => {
      const rgba = new Uint8ClampedArray(width * height * 4)
      renderSinglePlate(map, width, height, fwd, rgba)
      putRgbaToCanvas(canvas, rgba, width, height)
    })
    return () => cancelAnimationFrame(handle)
  }, [map, width, height, fwd])

  const screenDisabled = setting.method !== 'am'

  return (
    <li className="rounded-2xl border border-white/10 bg-gray-950/60 p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-400">
          {index + 1}版目
        </span>
        <span
          className="h-5 w-5 rounded-full border border-white/20"
          style={{ backgroundColor: preset?.hex ?? '#000000' }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-100">
          {preset?.name ?? setting.inkId}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl bg-white">
        <canvas
          ref={canvasRef}
          className="block h-auto w-full"
          aria-label={`${preset?.name ?? setting.inkId}の単版プレビュー`}
        />
      </div>

      <div className="mt-3 space-y-3">
        <label className="block space-y-1">
          <span className={labelClass}>スクリーン方式</span>
          <select
            className={fieldClass}
            value={setting.method}
            onChange={(event) => {
              const found = METHODS.find((m) => m.value === event.target.value)
              if (found) onChange({ ...setting, method: found.value })
            }}
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className={labelClass}>
            線数 {setting.lpi} lpi
            {screenDisabled ? '（AM 網点のみ）' : ''}
          </span>
          <input
            type="range"
            className={sliderClass}
            min={MIN_LPI}
            max={MAX_LPI}
            step={1}
            value={setting.lpi}
            disabled={screenDisabled}
            onChange={(event) =>
              onChange({ ...setting, lpi: Number(event.target.value) })
            }
          />
        </label>

        <label className="block space-y-1">
          <span className={labelClass}>スクリーン角 {setting.angleDeg}°</span>
          <input
            type="range"
            className={sliderClass}
            min={0}
            max={90}
            step={1}
            value={setting.angleDeg}
            disabled={screenDisabled}
            onChange={(event) =>
              onChange({ ...setting, angleDeg: Number(event.target.value) })
            }
          />
        </label>
      </div>
    </li>
  )
}

type Props = {
  settings: Array<PlateSetting>
  maps: Array<Float32Array> | null
  width: number
  height: number
  singleFwds: Array<ForwardContext>
  onChange: (index: number, next: PlateSetting) => void
}

export function PlatesSection({
  settings,
  maps,
  width,
  height,
  singleFwds,
  onChange,
}: Props) {
  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-400">4.</span> 版（ハーフトーン）
      </h2>
      <p className={`${sectionNoteClass} mt-2`}>
        版ごとの網のかけ方です。実機リソの入稿は濃淡（グレースケール）のままが標準で、
        網点化は製版機側で行われるため、既定は「階調のまま」です。網点はドットの粗さや
        網角をあえて自分で決めたいときの表現オプションとして使ってください。
        プレビューは「その版だけを紙に刷った見え」を順モデルで予測しています。
        網点はプレビューの縮小率に合わせて表示しているため、実寸（300dpi
        想定）ではもう少し細かくなります。
      </p>

      <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {settings.map((setting, index) => (
          <PlateCard
            key={setting.inkId}
            index={index}
            setting={setting}
            map={maps ? maps[index] : null}
            width={width}
            height={height}
            fwd={singleFwds[index]}
            onChange={(next) => onChange(index, next)}
          />
        ))}
      </ul>
    </section>
  )
}
