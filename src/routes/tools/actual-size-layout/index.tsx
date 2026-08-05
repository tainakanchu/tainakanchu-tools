import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { documentPresets } from './-lib/presets'
import type { PresetId } from './-lib/presets'
import {
  printableHeightMm,
  printableWidthMm,
  totalContentHeightMm,
} from './-lib/layout'

type UploadedImage = {
  id: string
  name: string
  dataUrl: string
}

const MAX_IMAGES = 2

export const Route = createFileRoute('/tools/actual-size-layout/')({
  head: () => ({
    meta: [{ title: '原寸レイアウトメーカー | かんちゅツールズ' }],
  }),
  component: ActualSizeLayoutPage,
})

function ActualSizeLayoutPage() {
  const [presetId, setPresetId] = useState<PresetId>('id1-card')
  const [customWidthMm, setCustomWidthMm] = useState(85.6)
  const [customHeightMm, setCustomHeightMm] = useState(54)
  const [pageMarginMm, setPageMarginMm] = useState(25)
  const [cardGapMm, setCardGapMm] = useState(16)
  const [cardCornersRounded, setCardCornersRounded] = useState(true)
  const [images, setImages] = useState<Array<UploadedImage>>([])

  const currentPreset = documentPresets.find((preset) => preset.id === presetId)

  const contentSize = {
    widthMm:
      presetId === 'custom'
        ? clampDimension(customWidthMm, 30, 210)
        : (currentPreset?.widthMm ?? 85.6),
    heightMm:
      presetId === 'custom'
        ? clampDimension(customHeightMm, 30, 297)
        : (currentPreset?.heightMm ?? 54),
  }

  const a4Style = useMemo(
    () => ({
      width: '210mm',
      height: '297mm',
      padding: `${clampDimension(pageMarginMm, 0, 30)}mm`,
      boxSizing: 'border-box' as const,
    }),
    [pageMarginMm],
  )

  const cardStyle = useMemo(
    () => ({
      width: `${contentSize.widthMm}mm`,
      height: `${contentSize.heightMm}mm`,
      boxSizing: 'border-box' as const,
    }),
    [contentSize.heightMm, contentSize.widthMm],
  )

  const cardAreaStyle = useMemo(
    () => ({
      gap: `${clampDimension(cardGapMm, 0, 80)}mm`,
    }),
    [cardGapMm],
  )

  const availableSlots = MAX_IMAGES - images.length

  const overflowsPrintableArea =
    images.length >= 1 &&
    totalContentHeightMm({
      heightMm: contentSize.heightMm,
      count: images.length,
      gapMm: clampDimension(cardGapMm, 0, 80),
    }) > printableHeightMm(clampDimension(pageMarginMm, 0, 30))

  const overflowsPrintableWidth =
    images.length >= 1 &&
    contentSize.widthMm > printableWidthMm(clampDimension(pageMarginMm, 0, 30))

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files
    if (!fileList) return

    const files = Array.from(fileList)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, MAX_IMAGES)

    const slots = Math.max(0, availableSlots)
    if (slots === 0) {
      event.target.value = ''
      return
    }

    const filesToAdd = files.slice(0, slots)

    try {
      const newImages = await Promise.all(
        filesToAdd.map((file, index) => readFileAsDataUrl(file, index)),
      )

      setImages((prev) => [...prev, ...newImages])
    } catch (error) {
      console.error('画像の読み込みに失敗しました', error)
    }

    event.target.value = ''
  }

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((image) => image.id !== id))
  }

  const resetAll = () => {
    setPresetId('id1-card')
    setCustomWidthMm(85.6)
    setCustomHeightMm(54)
    setPageMarginMm(25)
    setCardGapMm(16)
    setCardCornersRounded(true)
    setImages([])
  }

  const instructions = [
    '印刷ダイアログで用紙サイズをA4、倍率を100%（実寸）に設定してください。',
    '余白設定を「なし」または「ユーザー設定」で調整し、プレビューで枠が収まっているか確認してください。',
    'PDFとして保存する場合も同じ設定で実寸を維持できます。',
  ]

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 text-gray-900 md:flex-row print:mx-0 print:max-w-none print:flex-col print:gap-0 print:px-0 print:py-0">
      <aside className="w-full max-w-md space-y-8 rounded-3xl border border-gray-200 bg-white/80 p-6 shadow-sm backdrop-blur print:hidden md:w-80 md:shrink-0 md:sticky md:top-4">
        <header className="space-y-2">
          <h1 className="text-xl font-semibold whitespace-nowrap">
            原寸レイアウトメーカー
          </h1>
          <p className="text-sm text-gray-600">
            免許証やパスポートなどの書類画像をアップロードして、原寸大でA4にレイアウトします。印刷またはPDF出力でそのまま利用できます。
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-gray-800">
            ドキュメント設定
          </h2>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-700">種類</span>
            <select
              value={presetId}
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- option の value は documentPresets (PresetId 型) からのみ生成されるため実行時も安全
              onChange={(event) => setPresetId(event.target.value as PresetId)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            >
              {documentPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          {presetId === 'custom' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">
                  幅 (mm)
                </span>
                <input
                  type="number"
                  min={30}
                  max={210}
                  step={0.1}
                  value={customWidthMm}
                  onChange={(event) =>
                    setCustomWidthMm(Number(event.target.value))
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">
                  高さ (mm)
                </span>
                <input
                  type="number"
                  min={30}
                  max={297}
                  step={0.1}
                  value={customHeightMm}
                  onChange={(event) =>
                    setCustomHeightMm(Number(event.target.value))
                  }
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </label>
            </div>
          ) : (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {currentPreset?.description ??
                `幅 ${currentPreset?.widthMm ?? '--'}mm × 高さ ${
                  currentPreset?.heightMm ?? '--'
                }mm`}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium whitespace-nowrap text-gray-700">
                余白 (mm)
              </span>
              <input
                type="number"
                min={0}
                max={30}
                step={1}
                value={pageMarginMm}
                onChange={(event) =>
                  setPageMarginMm(Number(event.target.value))
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium whitespace-nowrap text-gray-700">
                画像の間隔 (mm)
              </span>
              <input
                type="number"
                min={0}
                max={50}
                step={1}
                value={cardGapMm}
                onChange={(event) => setCardGapMm(Number(event.target.value))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-2xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={cardCornersRounded}
              onChange={(event) => setCardCornersRounded(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
            />
            <span>角を丸くする</span>
          </label>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-gray-800">
            画像アップロード
          </h2>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600 transition hover:border-cyan-400 hover:bg-cyan-50">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
            />
            <span className="font-medium text-gray-800">
              画像を選択（最大2枚）
            </span>
            <span className="mt-1 text-xs text-gray-500">
              PNG / JPG / HEIC などに対応しています
            </span>
          </label>

          {images.length > 0 ? (
            <ul className="space-y-2">
              {images.map((image, index) => (
                <li
                  key={image.id}
                  className="flex items-center gap-3 rounded-xl bg-gray-100 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="truncate">{image.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeImage(image.id)}
                    className="flex-shrink-0 text-xs font-medium text-cyan-600 hover:text-cyan-700"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-500">
              1枚または2枚の画像を選択してください。2枚の場合は同じ位置に縦並びで配置します。
            </p>
          )}

          {overflowsPrintableArea ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              配置した画像の合計高さが印刷可能領域を超えています。余白や間隔を減らすか、画像を1枚にしてください。
            </p>
          ) : null}

          {overflowsPrintableWidth ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              画像の幅が印刷可能領域（余白の内側）を超えています。余白を減らしてください。
            </p>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
          >
            印刷 / PDF 出力
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
          >
            リセット
          </button>
        </div>

        <section className="space-y-2 rounded-2xl bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
          <h3 className="text-sm font-semibold">印刷時のポイント</h3>
          <ul className="list-disc space-y-1 pl-5">
            {instructions.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      </aside>

      <section className="min-w-0 flex-1 print:w-full print:px-0 print:py-0">
        <div className="space-y-4 print:hidden">
          <h2 className="text-lg font-medium text-gray-800">
            レイアウトプレビュー
          </h2>
          <p className="text-sm text-gray-600">
            下のプレビュー領域はA4サイズを再現しています。明るい部分が用紙、灰色の部分が余白です。
          </p>
        </div>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-gray-200 bg-slate-100/60 p-4 text-gray-900 print:m-0 print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:p-0">
          <div className="relative mx-auto flex items-center justify-center overflow-visible rounded-2xl border border-dashed border-gray-300 bg-white print:mx-0 print:items-start print:justify-start print:border-0 print:bg-transparent">
            <div
              className="relative flex h-full w-full flex-col items-center justify-start rounded-2xl bg-white print:m-0 print:rounded-none print:border-0"
              style={a4Style}
            >
              <div
                className="flex h-full w-full flex-col items-center justify-start"
                style={cardAreaStyle}
              >
                {images.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 print:border-0 print:bg-transparent">
                    <p>
                      ここに画像が配置されます。左側から画像を選択してください。
                    </p>
                    <p className="mt-2 text-xs text-gray-400">
                      印刷時は倍率を100%に設定すると実寸になります。
                    </p>
                  </div>
                ) : (
                  images.map((image) => (
                    <figure
                      key={image.id}
                      className="flex flex-col items-center"
                      style={cardStyle}
                    >
                      <img
                        src={image.dataUrl}
                        alt={image.name}
                        className={`h-full w-full object-contain ${
                          cardCornersRounded ? 'rounded-xl' : ''
                        }`}
                        style={{
                          boxSizing: 'border-box',
                        }}
                      />
                    </figure>
                  ))
                )}
              </div>

              <footer className="pointer-events-none mt-auto w-full text-center text-[10pt] text-gray-400 print:hidden">
                A4: 210mm × 297mm | 配置サイズ: {contentSize.widthMm.toFixed(1)}
                mm × {contentSize.heightMm.toFixed(1)}mm
              </footer>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function clampDimension(value: number, min = 10, max = 400) {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}

function readFileAsDataUrl(file: File, index: number): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      resolve({
        id: `${Date.now()}-${index}`,
        name: file.name,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- readAsDataURL() 使用のため result は string になる (ArrayBuffer にはならない)
        dataUrl: reader.result as string,
      })
    })
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}
