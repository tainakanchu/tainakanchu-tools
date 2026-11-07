import { useEffect, useRef, useState } from 'react'
import { loadPendingFonts } from '../-lib/fonts'
import { renderPage, resetMeasureCache } from '../-lib/render'
import { createSampleSetlist } from '../-lib/sample'
import type { RenderInput } from '../-lib/render'

type Props = {
  /** 見本を描くための今の設定（曲はサンプルに差し替える） */
  input: RenderInput
  loading: boolean
  error: string | null
  onPick: () => void
  onFile: (file: File) => void
  onSample: () => void
}

const sample = createSampleSetlist()

/**
 * 読み込む前のプレビュー枠。枠そのものがドロップ先で、中には
 * 「履歴をここに」と「サンプルで見る」の 2 つだけ。後ろにサンプルを薄く描いて、
 * 何ができるかを見せる。
 */
export function EmptyStage({
  input,
  loading,
  error,
  onPick,
  onFile,
  onSample,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [over, setOver] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const { width: W, height: H } = input.size

  useEffect(() => {
    const canvas = canvasRef.current
    const c = canvas?.getContext('2d')
    if (!canvas || !c) return
    canvas.width = W
    canvas.height = H
    const n = sample.tracks.length
    try {
      renderPage(
        c,
        {
          ...input,
          setlist: sample,
          photo: null,
          split: { enabled: false, mode: 'auto', count: 2 },
        },
        { index: 0, count: 1, start: 0, end: n },
      )
    } catch {
      // 見本が描けなくても読み込みには影響させない
    }
    void loadPendingFonts().then((loaded) => {
      if (!loaded) return
      resetMeasureCache()
      setEpoch((e) => e + 1)
    })
  }, [input, W, H, epoch])

  return (
    <section
      aria-label="再生履歴を読み込む"
      className="slc-drop slc-crop mx-auto cursor-pointer"
      data-over={over}
      style={{
        aspectRatio: `${W} / ${H}`,
        width: `min(100%, calc(var(--empty-h) * ${W} / ${H}))`,
      }}
      onClick={(event) => {
        // 枠のどこを押しても選べる（中のボタンはそれぞれの動きをする）
        if (event.target === event.currentTarget) onPick()
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setOver(false)
        const file = event.dataTransfer.files.item(0)
        if (file) onFile(file)
      }}
    >
      <canvas ref={canvasRef} aria-hidden />
      <span className="slc-drop-shade" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-start gap-3 border-t-[1.5px] border-ink bg-paper p-5 sm:p-8">
        <button
          type="button"
          className="pointer-events-auto flex min-h-11 items-center gap-3 text-left text-[16px] leading-snug font-bold"
          onClick={onPick}
          disabled={loading}
        >
          <span>
            {loading
              ? '読み込み中…'
              : 'rekordbox、Traktor、Serato の履歴をここに'}
          </span>
        </button>
        <button
          type="button"
          className="btn btn-secondary pointer-events-auto bg-(--bg)!"
          onClick={onSample}
        >
          サンプルで見る
        </button>
        {error ? (
          <p role="alert" className="slc-note" data-tone="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}
