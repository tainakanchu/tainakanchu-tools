import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'

type PresetId = 'license' | 'custom'

type UploadedImage = {
  id: string
  name: string
  dataUrl: string
}

const MAX_IMAGES = 2

const documentPresets: Array<{
  id: PresetId
  label: string
  widthMm: number
  heightMm: number
  description?: string
}> = [
  {
    id: 'license',
    label: '運転免許証（85.6mm × 54mm）',
    widthMm: 85.6,
    heightMm: 54,
    description: 'JIS規格（ID-1）サイズ。クレジットカードと同じ大きさです。',
  },
  {
    id: 'custom',
    label: 'カスタムサイズ',
    widthMm: 85.6,
    heightMm: 54,
  },
]

export const Route = createFileRoute('/tools/license-layout/')({
  component: LicenseLayoutPage,
})

function LicenseLayoutPage() {
  const [presetId, setPresetId] = useState<PresetId>('license')
  const [customWidthMm, setCustomWidthMm] = useState(85.6)
  const [customHeightMm, setCustomHeightMm] = useState(54)
  const [pageMarginMm, setPageMarginMm] = useState(10)
  const [cardGapMm, setCardGapMm] = useState(8)
  const [images, setImages] = useState<UploadedImage[]>([])

  const currentPreset = documentPresets.find((preset) => preset.id === presetId)

  const contentSize = {
    widthMm:
      presetId === 'custom'
        ? clampDimension(customWidthMm, 30, 210)
        : currentPreset?.widthMm ?? 85.6,
    heightMm:
      presetId === 'custom'
        ? clampDimension(customHeightMm, 30, 297)
        : currentPreset?.heightMm ?? 54,
  }

  const a4Style = useMemo(
    () => ({
      width: '210mm',
      height: '297mm',
      padding: `${clampDimension(pageMarginMm, 0, 30)}mm`,
    }),
    [pageMarginMm],
  )

  const cardStyle = useMemo(
    () => ({
      width: `${contentSize.widthMm}mm`,
      height: `${contentSize.heightMm}mm`,
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
    setPresetId('license')
    setCustomWidthMm(85.6)
    setCustomHeightMm(54)
    setPageMarginMm(10)
    setCardGapMm(8)
    setImages([])
  }

  const instructions = [
    '印刷ダイアログで用紙サイズをA4、倍率を100%（実寸）に設定してください。',
    '余白設定を「なし」または「ユーザー設定」で調整し、プレビューで枠が収まっているか確認してください。',
    'PDFとして保存する場合も同じ設定で実寸を維持できます。',
  ]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 text-gray-900 md:flex-row">
      <aside className="w-full max-w-md space-y-8 rounded-3xl border border-gray-200 bg-white/80 p-6 shadow-sm backdrop-blur print:hidden md:sticky md:top-4">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">免許証レイアウトメーカー</h1>
          <p className="text-sm text-gray-600">
            免許証などカード型の画像をアップロードして、原寸大でA4にレイアウトします。印刷またはPDF出力でそのまま利用できます。
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-medium text-gray-800">ドキュメント設定</h2>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-700">種類</span>
            <select
              value={presetId}
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
                <span className="text-sm font-medium text-gray-700">幅 (mm)</span>
                <input
                  type="number"
                  min={30}
                  max={210}
                  step={0.1}
                  value={customWidthMm}
                  onChange={(event) => setCustomWidthMm(Number(event.target.value))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">高さ (mm)</span>
                <input
                  type="number"
                  min={30}
                  max={297}
                  step={0.1}
                  value={customHeightMm}
                  onChange={(event) => setCustomHeightMm(Number(event.target.value))}
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
              <span className="text-sm font-medium text-gray-700">余白 (mm)</span>
              <input
                type="number"
                min={0}
                max={30}
                step={1}
                value={pageMarginMm}
                onChange={(event) => setPageMarginMm(Number(event.target.value))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">カード間隔 (mm)</span>
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
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-gray-800">画像アップロード</h2>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600 transition hover:border-cyan-400 hover:bg-cyan-50">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
            />
            <span className="font-medium text-gray-800">画像を選択（最大2枚）</span>
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

      <section className="flex-1">
        <div className="space-y-4 print:hidden">
          <h2 className="text-lg font-medium text-gray-800">レイアウトプレビュー</h2>
          <p className="text-sm text-gray-600">
            下のプレビュー領域はA4サイズを再現しています。明るい部分が用紙、灰色の部分が余白です。
          </p>
        </div>
        <div className="mt-4 rounded-3xl border border-gray-200 bg-slate-100/60 p-4 text-gray-900 shadow-inner">
          <div className="relative mx-auto flex items-center justify-center overflow-visible rounded-2xl border border-dashed border-gray-300 bg-white shadow-sm print:border-0 print:shadow-none">
            <div
              className="relative flex h-full w-full flex-col items-center justify-start rounded-2xl bg-white"
              style={a4Style}
            >
              <div
                className="flex h-full w-full flex-col items-center justify-start"
                style={cardAreaStyle}
              >
                {images.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 print:border-0 print:bg-transparent">
                    <p>ここに画像が配置されます。左側から画像を選択してください。</p>
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
                        className="h-full w-full rounded-xl border border-gray-200 object-contain shadow-sm"
                        style={{
                          boxSizing: 'border-box',
                        }}
                      />
                    </figure>
                  ))
                )}
              </div>

              <footer className="pointer-events-none mt-auto w-full text-center text-[10pt] text-gray-400 print:hidden">
                A4: 210mm × 297mm | カード: {contentSize.widthMm.toFixed(1)}mm ×{' '}
                {contentSize.heightMm.toFixed(1)}mm
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
    reader.onload = () => {
      resolve({
        id: `${Date.now()}-${index}`,
        name: file.name,
        dataUrl: reader.result as string,
      })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
