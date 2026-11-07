import { useState } from 'react'
import { Checkbox, Swatch } from '../../../../components/ui'
import { renderComposite } from '../../../../lib/risograph/preview'
import { INK_PRESETS } from '../../../../lib/risograph/presets'
import { renderPlateCoverage } from '../-lib/density'
import { coverageToGrayscale, downloadRgbaAsPng } from '../-lib/image'
import { coverageToInkColor } from '../-lib/inkColor'
import { PAPER_GRAIN_SEED, applyPaperGrain } from '../-lib/paperGrain'
import {
  ASSUMED_DPI,
  colorPlateFileName,
  compositeFileName,
  plateFileName,
  toPlateTransforms,
} from '../-lib/plates'
import {
  sectionClass,
  sectionNoteClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { RGB } from '../../../../lib/risograph/color'
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
  /** 紙の粗さ 0..1（合成プレビューの書き出しにだけ乗せる） */
  grain: number
  bake: boolean
  onBakeChange: (bake: boolean) => void
}

/** 重い処理の前にブラウザへ描画の隙を与える */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

const BLACK: RGB = [0, 0, 0]

export function ExportSection({
  result,
  settings,
  fwd,
  baseName,
  registrations,
  registrationEnabled,
  grain,
  bake,
  onBakeChange,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const { width, height } = result

  // 濃度 → ハーフトーンの順はプレビューと同じ共通経路を通す
  const halftonedAt = (index: number): Float32Array =>
    renderPlateCoverage(
      result.maps[index],
      width,
      height,
      settings[index],
      ASSUMED_DPI,
    )

  const presetAt = (index: number) =>
    INK_PRESETS.find((p) => p.id === settings[index].inkId)

  /** 版 index を PNG 1 枚として書き出す（グレースケール / 単色の共通処理） */
  const writePlate = async (
    index: number,
    color: boolean,
    rgba: Uint8ClampedArray<ArrayBuffer>,
  ) => {
    const coverage = halftonedAt(index)
    if (color) {
      coverageToInkColor(coverage, presetAt(index)?.driverInput ?? BLACK, rgba)
    } else {
      coverageToGrayscale(coverage, rgba)
    }
    await downloadRgbaAsPng(
      rgba,
      width,
      height,
      color
        ? colorPlateFileName(baseName, index, settings[index].inkId)
        : plateFileName(baseName, index, settings[index].inkId),
    )
  }

  const exportPlates = async (color: boolean) => {
    setBusy(color ? '単色の版を書き出し中…' : '版を書き出し中…')
    try {
      const rgba = new Uint8ClampedArray(width * height * 4)
      for (let i = 0; i < settings.length; i++) {
        await yieldToBrowser()
        await writePlate(i, color, rgba)
      }
    } finally {
      setBusy(null)
    }
  }

  const exportPlate = async (index: number, color: boolean) => {
    setBusy(color ? '単色の版を書き出し中…' : '版を書き出し中…')
    try {
      await yieldToBrowser()
      const rgba = new Uint8ClampedArray(width * height * 4)
      await writePlate(index, color, rgba)
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
      // 合成プレビューは「見たまま」の用途なので紙の質感も乗せる（版の PNG には乗せない）
      applyPaperGrain(rgba, width, height, grain, PAPER_GRAIN_SEED)
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

  /** 版ごとの単独書き出しボタン列 */
  const plateButtons = (color: boolean) => (
    <ul className="mt-3 flex flex-wrap gap-3">
      {settings.map((setting, index) => {
        const preset = presetAt(index)
        return (
          <li key={setting.inkId}>
            <button
              type="button"
              className={subtleButtonClass}
              onClick={() => void exportPlate(index, color)}
              disabled={busy !== null}
            >
              <Swatch color={preset?.hex ?? '#000000'} size={16} />
              {index + 1}版目だけ
            </button>
          </li>
        )
      })}
    </ul>
  )

  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>6. 書き出し</h2>
      <p className={`${sectionNoteClass} mt-2`}>
        分版した解像度（{width}×{height}
        px）のまま、現在のハーフトーン設定を反映して書き出します。版の PNG は 2
        種類あります。
      </p>

      <div className="mt-5 border-t border-rule pt-4">
        <h3 className="text-sm font-bold">製版データ（グレースケール）</h3>
        <p className={`${sectionNoteClass} mt-1`}>
          0% が白、100%
          が黒の汎用フォーマット。リソグラフの製版や、他ソフトへの受け渡し向けです。
        </p>
        <div className="mt-3">
          <button
            type="button"
            className={subtleButtonClass}
            onClick={() => void exportPlates(false)}
            disabled={busy !== null}
          >
            全ての版を書き出す
          </button>
        </div>
        {plateButtons(false)}
      </div>

      <div className="mt-5 border-t border-rule pt-4">
        <h3 className="text-sm font-bold">印刷データ（単色）</h3>
        <p className={`${sectionNoteClass} mt-1`}>
          各版を仮想インクのプリンタ入力色で着色した PNG。
          家庭用インクジェットでこのままフチなし・等倍で刷って、1
          色ずつ重ね刷りするためのデータです。
        </p>
        <div className="mt-3">
          <button
            type="button"
            className={subtleButtonClass}
            onClick={() => void exportPlates(true)}
            disabled={busy !== null}
          >
            全ての版を単色で書き出す
          </button>
        </div>
        {plateButtons(true)}

        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink-muted">
          <li>1 版目を必要枚数まとめて印刷する</li>
          <li>しっかり乾かす（顔料インクなら 30 分以上が目安）</li>
          <li>刷った束を裏返さず、向きも変えずにそのまま給紙トレイへ戻す</li>
          <li>2 版目を印刷する。以降、版の数だけ繰り返す</li>
        </ol>
        <p className={`${sectionNoteClass} mt-2`}>
          給紙時の位置ズレや表裏・上下の向きはプリンタごとに癖があります。
          本番の紙を使う前に、捨て紙で 2
          版目までテスト刷りして確かめてください。
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
        <button
          type="button"
          className={subtleButtonClass}
          onClick={() => void exportComposite()}
          disabled={busy !== null}
        >
          合成プレビューを書き出す
        </button>
        <Checkbox
          checked={bake}
          disabled={!registrationEnabled}
          onChange={(event) => onBakeChange(event.target.checked)}
          label={
            <>
              版ズレを焼き込む
              {registrationEnabled ? '' : '（版ズレ設定が「ズレなし」）'}
            </>
          }
        />
      </div>

      {busy ? <p className="mt-3 text-sm text-ink-muted">{busy}</p> : null}
    </section>
  )
}
