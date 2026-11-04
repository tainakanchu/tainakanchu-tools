import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, Share2 } from 'lucide-react'
import { panDelta } from '../-lib/layouts'
import { renderSetlist } from '../-lib/render'
import {
  primaryButtonClass,
  sectionClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PhotoSettings } from '../-lib/layouts'
import type { RenderInfo, RenderInput } from '../-lib/render'

type Props = {
  input: RenderInput
  fileBaseName: string
  onRendered: (info: RenderInfo) => void
  onPhotoSettingsChange: (settings: PhotoSettings) => void
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG を作れませんでした'))
    }, 'image/png')
  })
}

/** ファイル共有（主にモバイル）に対応しているか */
function supportsFileShare(): boolean {
  if (typeof navigator.canShare !== 'function') return false
  try {
    const probe = new File([new Uint8Array([0])], 'probe.png', {
      type: 'image/png',
    })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))

/** ポインター位置を書き出し解像度の座標にする */
function toCanvas(event: ReactPointerEvent<HTMLCanvasElement>) {
  const canvas = event.currentTarget
  const box = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - box.left) / box.width) * canvas.width,
    y: ((event.clientY - box.top) / box.height) * canvas.height,
  }
}

/**
 * プレビュー兼書き出し用の canvas。書き出しサイズそのままで描き、CSS で縮めて見せる。
 * フォントの読み込みが終わったら描き直す（和文フォントの差し替わりで幅が変わるため）。
 */
export function PreviewPanel({
  input,
  fileBaseName,
  onRendered,
  onPhotoSettingsChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fontEpoch, setFontEpoch] = useState(0)
  const [info, setInfo] = useState<RenderInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [canShare] = useState(() => supportsFileShare())
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const onRenderedRef = useRef(onRendered)
  useEffect(() => {
    onRenderedRef.current = onRendered
  }, [onRendered])

  useEffect(() => {
    let cancelled = false
    const bump = () => {
      if (!cancelled) setFontEpoch((n) => n + 1)
    }
    void document.fonts.ready.then(bump)
    document.fonts.addEventListener('loadingdone', bump)
    return () => {
      cancelled = true
      document.fonts.removeEventListener('loadingdone', bump)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handle = requestAnimationFrame(() => {
      const { width, height } = input.size
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const result = renderSetlist(ctx, input)
      setInfo(result)
      onRenderedRef.current(result)
    })
    return () => cancelAnimationFrame(handle)
  }, [input, fontEpoch])

  const fileName = `${fileBaseName || 'setlist'}.png`

  const download = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setBusy(true)
    setMessage(null)
    try {
      const blob = await canvasToBlob(canvas)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '書き出しに失敗しました',
      )
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setBusy(true)
    setMessage(null)
    try {
      const blob = await canvasToBlob(canvas)
      const file = new File([blob], fileName, { type: 'image/png' })
      await navigator.share({
        files: [file],
        title: input.setlist.title || 'Setlist',
      })
    } catch (error) {
      // 共有シートを閉じただけなら何も言わない
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setMessage('共有できませんでした。「PNG を保存」を使ってください。')
      }
    } finally {
      setBusy(false)
    }
  }

  // --- 写真のドラッグで切り抜き位置を動かす ---
  const photo = input.photo
  const photoRect = info?.photoRect ?? null
  const inPhoto = (pt: { x: number; y: number }) =>
    photoRect !== null &&
    pt.x >= photoRect.x &&
    pt.x <= photoRect.x + photoRect.w &&
    pt.y >= photoRect.y &&
    pt.y <= photoRect.y + photoRect.h

  return (
    <section className={`${sectionClass} space-y-4`}>
      <h2 className={sectionTitleClass}>プレビュー</h2>
      <div
        className="mx-auto overflow-hidden rounded-xl border border-white/10 bg-black shadow-lg"
        style={{
          aspectRatio: `${input.size.width} / ${input.size.height}`,
          maxHeight: '70vh',
          maxWidth: '100%',
        }}
      >
        <canvas
          ref={canvasRef}
          width={input.size.width}
          height={input.size.height}
          className={`block h-full w-full ${photo ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
          aria-label="セトリ画像のプレビュー"
          role="img"
          onPointerDown={(event) => {
            if (!photo) return
            const pt = toCanvas(event)
            if (!inPhoto(pt)) return
            dragRef.current = pt
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const start = dragRef.current
            if (!start || !photo || !photoRect) return
            const pt = toCanvas(event)
            const d = panDelta(
              photo.image.width,
              photo.image.height,
              photoRect.w,
              photoRect.h,
              photo.settings.zoom,
              pt.x - start.x,
              pt.y - start.y,
            )
            dragRef.current = pt
            if (d.dx === 0 && d.dy === 0) return
            onPhotoSettingsChange({
              ...photo.settings,
              posX: clamp(photo.settings.posX + d.dx),
              posY: clamp(photo.settings.posY + d.dy),
            })
          }}
          onPointerUp={() => {
            dragRef.current = null
          }}
          onPointerCancel={() => {
            dragRef.current = null
          }}
        />
      </div>
      <p className="text-center font-mono text-xs text-gray-500">
        {input.size.width}×{input.size.height} px
      </p>

      {info?.overflow ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            曲が多くて読める大きさに収まらないため、{info.hiddenCount}{' '}
            曲を「ほか {info.hiddenCount} 曲」にまとめています。
            {input.layout !== 'columns' ? '2カラム' : ''}
            {input.layout !== 'columns' && input.size.id !== 'story'
              ? ' や '
              : ''}
            {input.size.id !== 'story' ? '9:16' : ''}
            {input.layout !== 'columns' || input.size.id !== 'story'
              ? ' にすると全曲入りやすくなります。'
              : '曲を減らすか、写真を外すと入りやすくなります。'}
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => void download()}
          disabled={busy}
        >
          <Download size={16} aria-hidden />
          PNG を保存
        </button>
        {canShare ? (
          <button
            type="button"
            className={subtleButtonClass}
            onClick={() => void share()}
            disabled={busy}
          >
            <Share2 size={16} aria-hidden />
            共有
          </button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-rose-200">{message}</p> : null}
    </section>
  )
}
