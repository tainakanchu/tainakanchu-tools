import { useEffect } from 'react'
import { DropZone, Note } from '../../../../components/ui'
import {
  previewFrameClass,
  sectionClass,
  sectionNoteClass,
  sectionTitleClass,
} from '../-lib/styles'
import type { LoadedImage } from '../-lib/image'

type Props = {
  image: LoadedImage | null
  loading: boolean
  error: string | null
  onSelect: (file: File) => void
}

export function ImageSection({ image, loading, error, onSelect }: Props) {
  // ドロップ領域を外した画像がブラウザで開かれてしまうのを防ぐ
  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const pickFirstImage = (files: Array<File>) => {
    const file = files.find((f) => f.type.startsWith('image/'))
    if (file) onSelect(file)
  }

  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>1. 画像</h2>
      <p className={`${sectionNoteClass} mt-2`}>
        長辺 1400px まで縮小してから分版します。写真でもイラストでも構いません。
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* 差し替えもここから行う（選び直すか、上にドロップ） */}
        <DropZone
          accept="image/*"
          onFiles={pickFirstImage}
          title={
            image
              ? '別の画像を選ぶか、ここへドロップ'
              : '画像を選ぶか、ここへドロップ'
          }
          hint="PNG / JPG など 1 枚"
          className="p-8"
        />

        <div
          className={`flex flex-col items-center justify-center gap-3 p-4 ${previewFrameClass}`}
        >
          {loading ? (
            <p className="text-sm text-ink-muted">読み込み中…</p>
          ) : image ? (
            <>
              <img
                src={image.dataUrl}
                alt="読み込んだ画像"
                className="max-h-56 w-auto max-w-full"
              />
              <p className="max-w-full text-xs break-all text-ink-muted">
                {image.fileName}（{image.width}×{image.height}px）
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">まだ画像がありません</p>
          )}
        </div>
      </div>

      {error ? (
        <Note tone="error" role="alert" className="mt-3">
          {error}
        </Note>
      ) : null}
    </section>
  )
}
