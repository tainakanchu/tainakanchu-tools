import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Button,
  Checkbox,
  DropZone,
  Field,
  Note,
  Page,
  PageTitle,
  Panel,
  Select,
  TextInput,
} from '../../../components/ui'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import { documentPresets } from './-lib/presets'
import type { PresetId } from './-lib/presets'
import {
  printableHeightMm,
  printableWidthMm,
  totalContentHeightMm,
} from './-lib/layout'
import { compressImageFile } from './-lib/image'

type UploadedImage = {
  id: string
  name: string
  dataUrl: string
  file: File
}

const MAX_IMAGES = 2

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('actual-size-layout')!

export const Route = createFileRoute('/tools/actual-size-layout/')({
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
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

  const imagesRef = useRef(images)
  imagesRef.current = images

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

  const addImageFiles = async (files: Array<File>) => {
    const imageFiles = files.filter(
      (file) =>
        file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name),
    )

    const slots = Math.max(0, MAX_IMAGES - images.length)
    if (slots === 0) return

    const filesToAdd = imageFiles.slice(0, slots)
    if (filesToAdd.length === 0) return

    try {
      const newImages = await Promise.all(
        filesToAdd.map(async (file, index) => {
          const dataUrl = await compressImageFile(file, {
            widthMm: contentSize.widthMm,
            heightMm: contentSize.heightMm,
          })
          return {
            id: `${Date.now()}-${index}`,
            name: file.name,
            dataUrl,
            file,
          }
        }),
      )

      setImages((prev) => [...prev, ...newImages])
    } catch (error) {
      console.error('画像の読み込みに失敗しました', error)
    }
  }

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const current = imagesRef.current
      if (current.length === 0) return
      try {
        const next = await Promise.all(
          current.map(async (image) => {
            const dataUrl = await compressImageFile(image.file, {
              widthMm: contentSize.widthMm,
              heightMm: contentSize.heightMm,
            })
            return { ...image, dataUrl }
          }),
        )
        if (!cancelled) {
          // 圧縮中に追加/削除された画像を消さないよう id で突き合わせて差し替える
          setImages((prev) =>
            prev.map((image) => next.find((n) => n.id === image.id) ?? image),
          )
        }
      } catch (error) {
        console.error('画像の再圧縮に失敗しました', error)
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [contentSize.widthMm, contentSize.heightMm])

  useEffect(() => {
    const prevent = (e: DragEvent) => {
      e.preventDefault()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

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
    <Page width="wide" className="print:mx-0 print:max-w-none print:p-0">
      <PageTitle
        className="print:hidden"
        lead="免許証やパスポートなどの書類画像をアップロードして、原寸大で A4 にレイアウトします。印刷または PDF 保存でそのまま使えます。"
      >
        原寸レイアウトメーカー
      </PageTitle>
      <div className="flex w-full flex-col gap-8 md:flex-row print:flex-col print:gap-0">
        <aside className="w-full space-y-8 md:w-80 md:shrink-0 print:hidden">
          <section className="space-y-4">
            <h2 className="text-lg font-bold">ドキュメント設定</h2>
            <Field label="種類">
              <Select
                value={presetId}
                onChange={(event) => {
                  const found = documentPresets.find(
                    (preset) => preset.id === event.target.value,
                  )
                  if (found) setPresetId(found.id)
                }}
              >
                {documentPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </Select>
            </Field>

            {presetId === 'custom' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="幅 (mm)">
                  <TextInput
                    type="number"
                    min={30}
                    max={210}
                    step={0.1}
                    value={customWidthMm}
                    onChange={(event) =>
                      setCustomWidthMm(Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="高さ (mm)">
                  <TextInput
                    type="number"
                    min={30}
                    max={297}
                    step={0.1}
                    value={customHeightMm}
                    onChange={(event) =>
                      setCustomHeightMm(Number(event.target.value))
                    }
                  />
                </Field>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                {currentPreset?.description ??
                  `幅 ${currentPreset?.widthMm ?? '--'}mm × 高さ ${
                    currentPreset?.heightMm ?? '--'
                  }mm`}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              <Field label="余白 (mm)">
                <TextInput
                  type="number"
                  min={0}
                  max={30}
                  step={1}
                  value={pageMarginMm}
                  onChange={(event) =>
                    setPageMarginMm(Number(event.target.value))
                  }
                />
              </Field>
              <Field label="画像の間隔 (mm)">
                <TextInput
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={cardGapMm}
                  onChange={(event) => setCardGapMm(Number(event.target.value))}
                />
              </Field>
            </div>

            <Checkbox
              label="角を丸くする"
              checked={cardCornersRounded}
              onChange={(event) => setCardCornersRounded(event.target.checked)}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">画像アップロード</h2>
            <DropZone
              accept="image/*"
              multiple
              onFiles={(files) => void addImageFiles(files)}
              title="画像を選ぶか、ここへドロップ（2 枚まで）"
              hint="PNG / JPG / HEIC"
            />

            {images.length > 0 ? (
              <ul className="ink-line-t ink-line-b divide-y divide-rule">
                {images.map((image, index) => (
                  <li
                    key={image.id}
                    className="flex items-center gap-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center border-[1.5px] border-ink text-xs font-bold">
                        {index + 1}
                      </span>
                      <span className="truncate">{image.name}</span>
                    </span>
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => removeImage(image.id)}
                      aria-label={`${image.name} を削除`}
                    >
                      削除
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">
                画像は 1 枚か 2 枚。2 枚のときは縦に並べて配置します。
              </p>
            )}

            {overflowsPrintableArea || overflowsPrintableWidth ? (
              <Note tone="error" role="alert">
                {overflowsPrintableArea
                  ? '画像の合計の高さが余白の内側に収まりません。余白や間隔を減らすか、画像を 1 枚にしてください。'
                  : null}
                {overflowsPrintableArea && overflowsPrintableWidth ? ' ' : null}
                {overflowsPrintableWidth
                  ? '画像の幅が余白の内側に収まりません。余白を減らしてください。'
                  : null}
              </Note>
            ) : null}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => window.print()}>
              印刷する
            </Button>
            <Button variant="danger" onClick={resetAll}>
              最初からやり直す
            </Button>
          </div>

          <Panel tone="wash" className="space-y-2 px-4 py-3 text-sm">
            <h3 className="text-sm font-bold">印刷時のポイント</h3>
            <ul className="list-disc space-y-1 pl-5">
              {instructions.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </Panel>
        </aside>

        <section className="min-w-0 flex-1 print:w-full print:px-0 print:py-0">
          <div className="space-y-2 print:hidden">
            <h2 className="text-lg font-bold">レイアウトプレビュー</h2>
            <p className="text-sm text-ink-muted">
              白い面が A4 の用紙を原寸で再現しています。
            </p>
          </div>
          <div className="mt-4 overflow-x-auto border-[1.5px] border-ink bg-wash p-4 print:m-0 print:overflow-visible print:border-0 print:bg-transparent print:p-0">
            <div className="relative mx-auto flex items-center justify-center overflow-visible border border-rule bg-paper print:mx-0 print:items-start print:justify-start print:border-0 print:bg-transparent">
              <div
                className="relative flex h-full w-full flex-col items-center justify-start bg-paper print:m-0 print:border-0"
                style={a4Style}
              >
                <div
                  className="flex h-full w-full flex-col items-center justify-start"
                  style={cardAreaStyle}
                >
                  {images.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center border border-dashed border-ink-muted bg-wash p-6 text-center text-sm text-ink-muted print:border-0 print:bg-transparent">
                      <p>
                        ここに画像を配置します。左の欄で画像を選んでください。
                      </p>
                      <p className="mt-2 text-xs">
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

                <footer className="pointer-events-none mt-auto w-full text-center text-[10pt] text-ink-muted print:hidden">
                  A4（210 × 297mm）に {contentSize.widthMm.toFixed(1)} ×{' '}
                  {contentSize.heightMm.toFixed(1)}mm で配置
                </footer>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Page>
  )
}

function clampDimension(value: number, min = 10, max = 400) {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}
