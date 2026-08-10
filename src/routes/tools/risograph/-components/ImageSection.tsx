import { useEffect, useRef, useState } from 'react'
import { ImageUp } from 'lucide-react'
import {
  sectionClass,
  sectionNoteClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { LoadedImage } from '../-lib/image'

type Props = {
  image: LoadedImage | null
  loading: boolean
  error: string | null
  onSelect: (file: File) => void
}

export function ImageSection({ image, loading, error, onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

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

  const pickFirstImage = (files: FileList | null) => {
    if (!files) return
    const file = Array.from(files).find((f) => f.type.startsWith('image/'))
    if (file) onSelect(file)
  }

  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-400">1.</span> 画像
      </h2>
      <p className={`${sectionNoteClass} mt-2`}>
        長辺 1400px まで縮小してから分版します。写真でもイラストでも構いません。
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            pickFirstImage(event.dataTransfer.files)
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-8 text-center text-sm transition ${
            dragOver
              ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
              : 'border-white/20 text-gray-400 hover:border-cyan-400/60 hover:text-gray-200'
          }`}
        >
          <ImageUp size={28} aria-hidden />
          <span>画像をドラッグ＆ドロップ</span>
          <span className="text-xs text-gray-500">またはクリックして選択</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              pickFirstImage(event.target.files)
              event.target.value = ''
            }}
          />
        </label>

        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-gray-950/60 p-4">
          {loading ? (
            <p className="text-sm text-gray-400">読み込み中…</p>
          ) : image ? (
            <>
              <img
                src={image.dataUrl}
                alt="読み込んだ画像"
                className="max-h-56 w-auto rounded-lg"
              />
              <p className="text-xs text-gray-400">
                {image.fileName} / {image.width}×{image.height}px
              </p>
              <button
                type="button"
                className={subtleButtonClass}
                onClick={() => inputRef.current?.click()}
              >
                画像を差し替える
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-500">まだ画像がありません</p>
          )}
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
    </section>
  )
}
