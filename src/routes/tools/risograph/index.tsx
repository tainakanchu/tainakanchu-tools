import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import { createForwardContext } from '../../../lib/risograph/forward'
import { halftonePlate } from '../../../lib/risograph/halftone'
import { randomRegistration } from '../../../lib/risograph/registration'
import { ImageSection } from './-components/ImageSection'
import { InkSection } from './-components/InkSection'
import { SeparationSection } from './-components/SeparationSection'
import { PlatesSection } from './-components/PlatesSection'
import { CompositeSection } from './-components/CompositeSection'
import { ExportSection } from './-components/ExportSection'
import { downscaleCoverage } from './-lib/downscale'
import { loadImageFile } from './-lib/image'
import {
  PREVIEW_MAX_LONG_SIDE,
  SEPARATION_MAX_LONG_SIDE,
  fitLongSide,
  initialPlateSettings,
  previewDpi,
  reconcilePlateSettings,
  toBaseName,
  toPlateTransforms,
  zeroRegistrations,
} from './-lib/plates'
import { SeparationClient } from './-lib/separationClient'
import type { GamutMapMode, InkId } from '../../../lib/risograph/types'
import type { RegistrationError } from '../../../lib/risograph/registration'
import type { LoadedImage } from './-lib/image'
import type { PlateSetting, RegistrationMode } from './-lib/plates'
import type { SeparationResult } from './-lib/separationClient'

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('risograph')!

export const Route = createFileRoute('/tools/risograph/')({
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
  }),
  component: RisographPage,
})

const DEFAULT_INKS: Array<InkId> = ['fluor-pink', 'blue']

function RisographPage() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  const [inkIds, setInkIds] = useState<Array<InkId>>(DEFAULT_INKS)
  const [plateSettings, setPlateSettings] = useState<Array<PlateSetting>>(() =>
    initialPlateSettings(DEFAULT_INKS),
  )

  const [gamutMode, setGamutMode] = useState<GamutMapMode>('chroma-compress')
  const [lutSize, setLutSize] = useState<17 | 33>(17)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{
    fraction: number
    message: string
  } | null>(null)
  const [separationError, setSeparationError] = useState<string | null>(null)
  const [result, setResult] = useState<SeparationResult | null>(null)

  const [registrationMode, setRegistrationMode] =
    useState<RegistrationMode>('none')
  const [seed, setSeed] = useState(1)
  const [registrations, setRegistrations] = useState<Array<RegistrationError>>(
    () => zeroRegistrations(DEFAULT_INKS.length),
  )
  const [bake, setBake] = useState(false)

  const [halftoned, setHalftoned] = useState<Array<Float32Array> | null>(null)

  const clientRef = useRef<SeparationClient | null>(null)
  useEffect(() => () => clientRef.current?.dispose(), [])

  // 版ズレ設定は版数と seed から導出する（手動モードだけは編集値を残す）
  const plateCount = inkIds.length
  useEffect(() => {
    if (registrationMode === 'none') {
      setRegistrations(zeroRegistrations(plateCount))
      return
    }
    if (registrationMode === 'random') {
      setRegistrations(randomRegistration(seed, plateCount))
      return
    }
    setRegistrations((prev) =>
      prev.length === plateCount ? prev : zeroRegistrations(plateCount),
    )
  }, [registrationMode, seed, plateCount])

  const handleImageSelect = async (file: File) => {
    setImageLoading(true)
    setImageError(null)
    try {
      const loaded = await loadImageFile(file, SEPARATION_MAX_LONG_SIDE)
      setImage(loaded)
      // 画像が変わったら前の分版結果は無効
      setResult(null)
      setHalftoned(null)
    } catch {
      setImageError(
        '画像を読み込めませんでした。別のファイルで試してみてください。',
      )
    } finally {
      setImageLoading(false)
    }
  }

  const handleInkChange = (next: Array<InkId>) => {
    setInkIds(next)
    setPlateSettings((prev) => reconcilePlateSettings(next, prev))
    // インク構成が変われば分版はやり直し
    setResult(null)
    setHalftoned(null)
  }

  const runSeparation = async () => {
    if (!image) return
    setRunning(true)
    setSeparationError(null)
    setProgress({ fraction: 0, message: '準備中' })
    clientRef.current ??= new SeparationClient()
    try {
      const separated = await clientRef.current.run(
        {
          inkIds,
          rgba: image.rgba,
          width: image.width,
          height: image.height,
          lutSize,
          gamutMap: gamutMode,
        },
        (fraction, message) => setProgress({ fraction, message }),
      )
      setResult(separated)
      setPlateSettings((prev) => reconcilePlateSettings(separated.inkIds, prev))
    } catch (error) {
      setSeparationError(
        error instanceof Error ? error.message : '分版に失敗しました',
      )
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const preview = useMemo(
    () =>
      result
        ? fitLongSide(result.width, result.height, PREVIEW_MAX_LONG_SIDE)
        : null,
    [result],
  )

  const previewMaps = useMemo(() => {
    if (!result || !preview) return null
    return result.maps.map((map) =>
      downscaleCoverage(
        map,
        result.width,
        result.height,
        preview.width,
        preview.height,
      ),
    )
  }, [result, preview])

  // ハーフトーンは版設定を変えるたびに掛け直す。rAF で 1 フレームにまとめる
  useEffect(() => {
    if (!previewMaps || !preview) return
    if (plateSettings.length !== previewMaps.length) return
    const dpi = previewDpi(preview.scale)
    const handle = requestAnimationFrame(() => {
      setHalftoned(
        previewMaps.map((map, index) =>
          halftonePlate(
            map,
            preview.width,
            preview.height,
            plateSettings[index],
            dpi,
          ),
        ),
      )
    })
    return () => cancelAnimationFrame(handle)
  }, [previewMaps, preview, plateSettings])

  const fwd = useMemo(
    () => (result ? createForwardContext(result.profile, result.inkIds) : null),
    [result],
  )

  const singleFwds = useMemo(
    () =>
      result
        ? result.inkIds.map((id) => createForwardContext(result.profile, [id]))
        : null,
    [result],
  )

  // インクを入れ替えた直後は版数と版ズレ設定の数が食い違うことがあるので、
  // 描画・書き出しへ渡す前に版数へ揃える
  const safeRegistrations = useMemo(
    () =>
      registrations.length === plateSettings.length
        ? registrations
        : zeroRegistrations(plateSettings.length),
    [registrations, plateSettings],
  )

  const previewTransforms = useMemo(
    () =>
      toPlateTransforms(
        safeRegistrations,
        previewDpi(preview ? preview.scale : 1),
        registrationMode !== 'none',
      ),
    [safeRegistrations, preview, registrationMode],
  )

  // 版設定を変えた直後の 1 フレームだけ古いハーフトーンが残ることがあるので、
  // 版数が一致しているときだけプレビューへ渡す
  const previewPlates =
    halftoned !== null && halftoned.length === plateSettings.length
      ? halftoned
      : null

  const baseName = useMemo(
    () => toBaseName(image ? image.fileName : ''),
    [image],
  )

  const ready =
    result !== null &&
    preview !== null &&
    fwd !== null &&
    singleFwds !== null &&
    plateSettings.length === result.inkIds.length

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-gray-950 text-gray-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold">リソグラフ風 多版分解</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
            画像を 2〜4
            色の特色インクへ分版し、網点をかけて重ね刷りした結果を予測します。
            版ごとに、製版用のグレースケール PNG と、家庭用プリンタで
            そのまま刷れる単色 PNG の両方を書き出せます。
          </p>
          <p className="max-w-3xl rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-3 py-2 text-xs leading-relaxed text-cyan-100/80">
            このツールは実測プロファイルではなく、仮想プレス（シミュレーション）で
            インクの挙動を合成して分版しています。ドットゲインやトラッピングは
            もっともらしい値の推定であり、実機の刷り上がりとは差が出ます。
            実際に刷る前は必ずテスト刷りで確認してください。
          </p>
        </header>

        <ImageSection
          image={image}
          loading={imageLoading}
          error={imageError}
          onSelect={(file) => void handleImageSelect(file)}
        />

        <InkSection inkIds={inkIds} onChange={handleInkChange} />

        <SeparationSection
          gamutMode={gamutMode}
          onGamutModeChange={setGamutMode}
          lutSize={lutSize}
          onLutSizeChange={setLutSize}
          canRun={image !== null}
          running={running}
          progress={progress}
          error={separationError}
          result={result}
          onRun={() => void runSeparation()}
        />

        {ready ? (
          <>
            <PlatesSection
              settings={plateSettings}
              maps={previewPlates}
              width={preview.width}
              height={preview.height}
              singleFwds={singleFwds}
              onChange={(index, next) =>
                setPlateSettings((prev) =>
                  prev.map((setting, i) => (i === index ? next : setting)),
                )
              }
            />

            <CompositeSection
              inkIds={result.inkIds}
              maps={previewPlates}
              width={preview.width}
              height={preview.height}
              fwd={fwd}
              transforms={previewTransforms}
              originalDataUrl={image ? image.dataUrl : ''}
              mode={registrationMode}
              onModeChange={setRegistrationMode}
              seed={seed}
              onSeedChange={setSeed}
              onReroll={() => setSeed((prev) => prev + 1)}
              registrations={safeRegistrations}
              onRegistrationChange={(index, next) =>
                setRegistrations((prev) =>
                  prev.map((reg, i) => (i === index ? next : reg)),
                )
              }
            />

            <ExportSection
              result={result}
              settings={plateSettings}
              fwd={fwd}
              baseName={baseName}
              registrations={safeRegistrations}
              registrationEnabled={registrationMode !== 'none'}
              bake={bake}
              onBakeChange={setBake}
            />
          </>
        ) : null}
      </div>
    </main>
  )
}
