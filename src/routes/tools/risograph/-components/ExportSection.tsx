import { useState } from 'react'
import { Download } from 'lucide-react'
import { halftonePlate } from '../../../../lib/risograph/halftone'
import { renderComposite } from '../../../../lib/risograph/preview'
import { INK_PRESETS } from '../../../../lib/risograph/presets'
import { coverageToGrayscale, downloadRgbaAsPng } from '../-lib/image'
import {
  ASSUMED_DPI,
  compositeFileName,
  plateFileName,
  toPlateTransforms,
} from '../-lib/plates'
import {
  primaryButtonClass,
  sectionClass,
  sectionNoteClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { ForwardContext } from '../../../../lib/risograph/forward'
import type { RegistrationError } from '../../../../lib/risograph/registration'
import type { PlateSetting } from '../-lib/plates'
import type { SeparationResult } from '../-lib/separationClient'

type Props = {
  result: SeparationResult
  settings: Array<PlateSetting>
  fwd: ForwardContext
  baseName: string
  registrations: Array<RegistrationError>
  registrationEnabled: boolean
  bake: boolean
  onBakeChange: (bake: boolean) => void
}

/** 重い処理の前にブラウザへ描画の隙を与える */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

export function ExportSection({
  result,
  settings,
  fwd,
  baseName,
  registrations,
  registrationEnabled,
  bake,
  onBakeChange,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const { width, height } = result

  const halftonedAt = (index: number): Float32Array =>
    halftonePlate(
      result.maps[index],
      width,
      height,
      settings[index],
      ASSUMED_DPI,
    )

  const exportPlates = async () => {
    setBusy('版を書き出し中…')
    try {
      const rgba = new Uint8ClampedArray(width * height * 4)
      for (let i = 0; i < settings.length; i++) {
        await yieldToBrowser()
        coverageToGrayscale(halftonedAt(i), rgba)
        await downloadRgbaAsPng(
          rgba,
          width,
          height,
          plateFileName(baseName, i, settings[i].inkId),
        )
      }
    } finally {
      setBusy(null)
    }
  }

  const exportPlate = async (index: number) => {
    setBusy('版を書き出し中…')
    try {
      await yieldToBrowser()
      const rgba = new Uint8ClampedArray(width * height * 4)
      coverageToGrayscale(halftonedAt(index), rgba)
      await downloadRgbaAsPng(
        rgba,
        width,
        height,
        plateFileName(baseName, index, settings[index].inkId),
      )
    } finally {
      setBusy(null)
    }
  }

  const exportComposite = async () => {
    setBusy('合成プレビューを書き出し中…')
    try {
      await yieldToBrowser()
      const plates = settings.map((_, i) => halftonedAt(i))
      const baked = bake && registrationEnabled
      const transforms = toPlateTransforms(registrations, ASSUMED_DPI, baked)
      const rgba = new Uint8ClampedArray(width * height * 4)
      renderComposite(plates, width, height, transforms, fwd, rgba)
      await downloadRgbaAsPng(
        rgba,
        width,
        height,
        compositeFileName(baseName, baked),
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-400">6.</span> 書き出し
      </h2>
      <p className={`${sectionNoteClass} mt-2`}>
        分版した解像度（{width}×{height}px）のまま書き出します。版の PNG は 「0%
        = 白 / 100% =
        黒」のグレースケールで、現在のハーフトーン設定を反映します。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => void exportPlates()}
          disabled={busy !== null}
        >
          <Download size={16} aria-hidden />
          全ての版を書き出す
        </button>
        <button
          type="button"
          className={subtleButtonClass}
          onClick={() => void exportComposite()}
          disabled={busy !== null}
        >
          <Download size={16} aria-hidden />
          合成プレビューを書き出す
        </button>
        <label className="inline-flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/20 bg-gray-950 text-cyan-500 focus:ring-cyan-500"
            checked={bake}
            disabled={!registrationEnabled}
            onChange={(event) => onBakeChange(event.target.checked)}
          />
          <span>
            版ズレを焼き込む
            {registrationEnabled ? '' : '（版ズレ設定が「ズレなし」）'}
          </span>
        </label>
      </div>

      <ul className="mt-4 flex flex-wrap gap-2">
        {settings.map((setting, index) => {
          const preset = INK_PRESETS.find((p) => p.id === setting.inkId)
          return (
            <li key={setting.inkId}>
              <button
                type="button"
                className={subtleButtonClass}
                onClick={() => void exportPlate(index)}
                disabled={busy !== null}
              >
                <span
                  className="h-4 w-4 rounded-full border border-white/20"
                  style={{ backgroundColor: preset?.hex ?? '#000000' }}
                  aria-hidden
                />
                {index + 1}版目だけ
              </button>
            </li>
          )
        })}
      </ul>

      {busy ? <p className="mt-3 text-sm text-gray-400">{busy}</p> : null}
    </section>
  )
}
