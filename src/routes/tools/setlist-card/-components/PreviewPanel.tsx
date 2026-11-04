import { useEffect, useMemo, useRef, useState } from 'react'
import { zipSync } from 'fflate'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Share2,
} from 'lucide-react'
import { loadPendingFonts } from '../-lib/fonts'
import { DEFAULT_PHOTO_SETTINGS, panDelta } from '../-lib/layouts'
import {
  META_LABELS,
  planPages,
  renderPage,
  resetMeasureCache,
} from '../-lib/render'
import {
  iconButtonClass,
  primaryButtonClass,
  sectionClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PhotoSettings } from '../-lib/layouts'
import type { PageLock, RenderInfo, RenderInput } from '../-lib/render'

type Props = {
  input: RenderInput
  fileBaseName: string
  onRendered: (info: RenderInfo) => void
  onPhotoSettingsChange: (settings: PhotoSettings) => void
  onEnableSplit: () => void
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG を作れませんでした'))
    }, 'image/png')
  })
}

/** ファイル共有（主にモバイル）に対応していそうか（実際のファイルでも後で確かめる） */
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

function canShareFiles(files: Array<File>): boolean {
  try {
    return (
      typeof navigator.canShare === 'function' && navigator.canShare({ files })
    )
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

/** 共有・保存用の PNG を先に作っておくまでの待ち時間 */
const PREPARE_DELAY_MS = 300

/**
 * プレビュー兼書き出し用の canvas（ページごとに 1 枚）。書き出しサイズそのままで描き、
 * CSS で縮めて見せる。複数枚のときは横スワイプのカルーセルにする（Instagram の
 * 複数枚投稿と同じ見え方）。
 */
export function PreviewPanel({
  input,
  fileBaseName,
  onRendered,
  onPhotoSettingsChange,
  onEnableSplit,
}: Props) {
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [fontEpoch, setFontEpoch] = useState(0)
  const [infos, setInfos] = useState<Array<RenderInfo>>([])
  const [current, setCurrent] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [shareSupported] = useState(() => supportsFileShare())
  /** 作り置きの PNG を canShare で確かめた結果 */
  const [shareStatus, setShareStatus] = useState<'pending' | 'ok' | 'no'>(
    'pending',
  )
  const dragRef = useRef<{ page: number; x: number; y: number } | null>(null)
  const onRenderedRef = useRef(onRendered)
  useEffect(() => {
    onRenderedRef.current = onRendered
  }, [onRendered])

  // 描くたびに版を進め、先に作っておいた PNG が今の絵と一致するかを判定する
  const versionRef = useRef(0)
  const cacheRef = useRef<{ version: number; files: Array<File> } | null>(null)

  useEffect(() => {
    let cancelled = false
    const bump = () => {
      if (cancelled) return
      resetMeasureCache()
      setFontEpoch((n) => n + 1)
    }
    void document.fonts.ready.then(bump)
    document.fonts.addEventListener('loadingdone', bump)
    return () => {
      cancelled = true
      document.fonts.removeEventListener('loadingdone', bump)
    }
  }, [])

  // ページ数は写真の位置やぼかしでは変わらないので、それらを除いた入力で決める
  const photoImage = input.photo?.image ?? null
  const photoMode = input.photo?.settings.mode ?? 'block'
  const plan = useMemo(() => {
    const planInput: RenderInput = {
      setlist: input.setlist,
      layout: input.layout,
      size: input.size,
      palette: input.palette,
      style: input.style,
      display: input.display,
      text: input.text,
      columns: input.columns,
      split: input.split,
      photo: photoImage
        ? {
            image: photoImage,
            settings: { ...DEFAULT_PHOTO_SETTINGS, mode: photoMode },
          }
        : null,
    }
    void fontEpoch
    return planPages(planInput)
  }, [
    input.setlist,
    input.layout,
    input.size,
    input.palette,
    input.style,
    input.display,
    input.text,
    input.columns,
    input.split,
    photoImage,
    photoMode,
    fontEpoch,
  ])
  const pages = plan.pages
  const planLock = plan.lock

  const fileNames = useMemo(
    () =>
      pages.map((_, i) =>
        pages.length > 1
          ? `${fileBaseName || 'setlist'}-${i + 1}.png`
          : `${fileBaseName || 'setlist'}.png`,
      ),
    [pages, fileBaseName],
  )

  const buildFiles = async (): Promise<Array<File>> => {
    const canvases = pages.map((_, i) => canvasRefs.current[i])
    const blobs = await Promise.all(
      canvases.map((canvas) => {
        if (!canvas) throw new Error('プレビューがまだ描けていません')
        return canvasToBlob(canvas)
      }),
    )
    return blobs.map(
      (blob, i) => new File([blob], fileNames[i], { type: 'image/png' }),
    )
  }
  const buildFilesRef = useRef(buildFiles)
  useEffect(() => {
    buildFilesRef.current = buildFiles
  })

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      const results: Array<RenderInfo> = []
      // 分割時はページ割りを決めたときの組み方で全ページを描く（ページごとに
      // 組み直すと、割り付けた曲数と実際に入る曲数がずれるため）
      let lock: PageLock | undefined = planLock
      pages.forEach((page, i) => {
        const canvas = canvasRefs.current[i]
        if (!canvas) return
        const { width, height } = input.size
        if (canvas.width !== width) canvas.width = width
        if (canvas.height !== height) canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const info = renderPage(ctx, input, page, lock)
        lock ??= info.lock
        results.push(info)
      })
      setInfos(results)
      if (results[0]) onRenderedRef.current(results[0])
      // 描いた文字の Web フォントを読み込み、読めたら描き直す（オフラインなら OS の書体のまま）
      void loadPendingFonts().then((loaded) => {
        if (!loaded) return
        resetMeasureCache()
        setFontEpoch((n) => n + 1)
      })
      // 共有ボタンを押した瞬間に share() を呼べるよう、PNG を先に作っておく
      versionRef.current += 1
      setShareStatus('pending')
    })
    return () => cancelAnimationFrame(handle)
  }, [input, pages, planLock, fontEpoch])

  useEffect(() => {
    const version = versionRef.current
    const timer = window.setTimeout(() => {
      void buildFilesRef.current().then(
        (files) => {
          if (version !== versionRef.current) return
          cacheRef.current = { version, files }
          setShareStatus(canShareFiles(files) ? 'ok' : 'no')
        },
        () => undefined,
      )
    }, PREPARE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [infos])

  // ページ数が減ったら表示中のページを戻す
  useEffect(() => {
    if (current >= pages.length) setCurrent(0)
  }, [pages.length, current])

  const freshFiles = (): Array<File> | null => {
    const cache = cacheRef.current
    return cache && cache.version === versionRef.current ? cache.files : null
  }

  const download = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const files = freshFiles() ?? (await buildFiles())
      let blob: Blob
      let name: string
      if (files.length === 1) {
        blob = files[0]
        name = files[0].name
      } else {
        const entries: Record<string, Uint8Array> = {}
        for (const file of files) {
          entries[file.name] = new Uint8Array(await file.arrayBuffer())
        }
        // PNG はすでに圧縮済みなので、zip では圧縮しない（速さ優先）
        blob = new Blob([zipSync(entries, { level: 0 })], {
          type: 'application/zip',
        })
        name = `${fileBaseName || 'setlist'}.zip`
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
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

  /**
   * iOS Safari はタップから share() までの間に await を挟むと NotAllowedError に
   * なるので、作り置きのファイルがあるときだけ即座に呼ぶ。無ければ作ってから
   * もう一度押してもらう。text / title は付けない（Instagram などで画像が落ちるため）。
   */
  const share = () => {
    setMessage(null)
    const files = freshFiles()
    if (!files) {
      setBusy(true)
      const version = versionRef.current
      void buildFiles()
        .then((built) => {
          cacheRef.current = { version, files: built }
          const ok = canShareFiles(built)
          setShareStatus(ok ? 'ok' : 'no')
          setMessage(
            ok
              ? '準備できました。もう一度押してください'
              : 'この端末ではこの画像を共有できません。「保存」を使ってください。',
          )
        })
        .catch(() => setMessage('画像を準備できませんでした'))
        .finally(() => setBusy(false))
      return
    }
    navigator.share({ files }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setMessage(
          '共有が許可されませんでした。もう一度「共有」を押してください。',
        )
        return
      }
      setMessage('共有できませんでした。「保存」を使ってください。')
    })
  }

  const scrollToPage = (index: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: el.clientWidth * index, behavior: 'smooth' })
  }

  const photo = input.photo
  const first = infos.at(0)
  const overflowInfo = infos.find((i) => i.overflow)
  const hiddenMeta = first ? first.hiddenMeta : []
  const multi = pages.length > 1
  const perPage = Math.round(input.setlist.tracks.length / pages.length)
  const { width: W, height: H } = input.size

  return (
    <section className={`${sectionClass} space-y-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={sectionTitleClass}>プレビュー</h2>
        {multi ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => scrollToPage(Math.max(0, current - 1))}
              disabled={current === 0}
              aria-label="前のページ"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <span className="min-w-12 text-center font-mono text-sm text-gray-300 tabular-nums">
              {current + 1} / {pages.length}
            </span>
            <button
              type="button"
              className={iconButtonClass}
              onClick={() =>
                scrollToPage(Math.min(pages.length - 1, current + 1))
              }
              disabled={current >= pages.length - 1}
              aria-label="次のページ"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:thin]"
        onScroll={(event) => {
          const el = event.currentTarget
          setCurrent(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
      >
        {pages.map((page, i) => {
          const photoRect = infos[i]?.photoRect ?? null
          const draggable = photo !== null && photoRect !== null
          return (
            <div
              key={`${page.count}-${page.index}`}
              className="w-full shrink-0 snap-center px-0.5"
            >
              <div
                className="mx-auto overflow-hidden rounded-xl border border-white/10 bg-black shadow-lg"
                style={{
                  aspectRatio: `${W} / ${H}`,
                  width: `min(100%, calc(70vh * ${W} / ${H}))`,
                }}
              >
                <canvas
                  ref={(el) => {
                    canvasRefs.current[i] = el
                  }}
                  data-page={i + 1}
                  width={W}
                  height={H}
                  className={`block h-full w-full ${draggable ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
                  aria-label={
                    multi
                      ? `セトリ画像のプレビュー ${i + 1} 枚目`
                      : 'セトリ画像のプレビュー'
                  }
                  role="img"
                  onPointerDown={(event) => {
                    if (!draggable) return
                    const pt = toCanvas(event)
                    if (
                      pt.x < photoRect.x ||
                      pt.x > photoRect.x + photoRect.w ||
                      pt.y < photoRect.y ||
                      pt.y > photoRect.y + photoRect.h
                    ) {
                      return
                    }
                    dragRef.current = { page: i, ...pt }
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                  onPointerMove={(event) => {
                    const start = dragRef.current
                    if (!start || start.page !== i || !photo || !photoRect)
                      return
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
                    dragRef.current = { page: i, ...pt }
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
            </div>
          )
        })}
      </div>

      {multi ? (
        <div
          className="flex justify-center gap-1.5"
          role="tablist"
          aria-label="ページ"
        >
          {pages.map((page, i) => (
            <button
              key={page.index}
              type="button"
              role="tab"
              aria-selected={i === current}
              aria-label={`${i + 1} 枚目`}
              className={`h-2 rounded-full transition-all ${i === current ? 'w-6 bg-cyan-400' : 'w-2 bg-white/25 hover:bg-white/40'}`}
              onClick={() => scrollToPage(i)}
            />
          ))}
        </div>
      ) : null}

      <p className="text-center font-mono text-xs text-gray-500">
        {W}×{H} px{multi ? ` × ${pages.length} 枚` : ''}
      </p>

      {multi ? (
        <p className="flex items-start gap-2 text-xs text-gray-400">
          <Info
            size={14}
            className="mt-0.5 shrink-0 text-cyan-300"
            aria-hidden
          />
          {plan.auto ? '曲数に合わせて' : ''}
          {pages.length} 枚に分けています（1 枚あたり約 {perPage}{' '}
          曲、番号は通しです）。
        </p>
      ) : null}

      {hiddenMeta.length > 0 ? (
        <p className="flex items-start gap-2 text-xs text-amber-100/80">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
          幅が足りないため {hiddenMeta
            .map((k) => META_LABELS[k])
            .join('・')}{' '}
          を省いて、曲名を大きく保っています。
        </p>
      ) : null}

      {overflowInfo ? (
        <div className="space-y-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <p className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              読める大きさに収まらないため、{overflowInfo.hiddenCount}{' '}
              曲を「ほか {overflowInfo.hiddenCount} 曲」にまとめています。
              {input.split.enabled
                ? '枚数を増やしてください。'
                : `複数枚に分けるか、${input.layout === 'columns' ? '' : '段組み や '}${input.size.id === 'story' ? '' : '9:16 '}にすると全曲入ります。`}
            </span>
          </p>
          {!input.split.enabled ? (
            <button
              type="button"
              className={subtleButtonClass}
              onClick={onEnableSplit}
            >
              複数枚に分ける
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => void download()}
          disabled={busy}
        >
          <Download size={16} aria-hidden />
          {multi ? `ZIP で保存（${pages.length} 枚）` : 'PNG を保存'}
        </button>
        {shareSupported ? (
          <button
            type="button"
            className={subtleButtonClass}
            onClick={share}
            disabled={busy || shareStatus === 'no'}
            title={
              shareStatus === 'no'
                ? 'この端末ではこの画像を共有できません'
                : shareStatus === 'pending'
                  ? '画像を準備しています'
                  : undefined
            }
          >
            <Share2 size={16} aria-hidden />
            {multi ? `共有（${pages.length} 枚）` : '共有'}
          </button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-cyan-100">{message}</p> : null}
    </section>
  )
}
