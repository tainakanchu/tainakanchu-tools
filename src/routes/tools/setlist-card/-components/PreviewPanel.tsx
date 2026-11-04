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
import {
  DEFAULT_EXPORT_SCALE,
  DEFAULT_FORMAT,
  EXPORT_SCALES,
  FORMAT_CHOICES,
  JPEG_QUALITY,
  MAX_EXPORT_LONG_SIDE,
  X_IMAGE_LIMIT_BYTES,
  effectiveScale,
  exportFileName,
  exportPixelSize,
  formatBytes,
  maxExportScale,
  outputFormat,
} from '../-lib/export'
import { loadPendingFonts } from '../-lib/fonts'
import { DEFAULT_PHOTO_SETTINGS, panDelta } from '../-lib/layouts'
import {
  META_LABELS,
  planPages,
  renderPage,
  resetMeasureCache,
} from '../-lib/render'
import {
  choiceClass,
  iconButtonClass,
  labelClass,
  primaryButtonClass,
  sectionClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ExportScale, FormatChoice, OutputFormat } from '../-lib/export'
import type { PhotoSettings } from '../-lib/layouts'
import type { PageLock, RenderInfo, RenderInput } from '../-lib/render'

type Props = {
  input: RenderInput
  fileBaseName: string
  onRendered: (info: RenderInfo) => void
  onPhotoSettingsChange: (settings: PhotoSettings) => void
  onEnableSplit: () => void
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('画像を作れませんでした'))
      },
      format.mime,
      format.quality,
    )
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

/** ポインター位置を論理 px の座標にする（プレビューの canvas は論理 px の大きさ） */
function toCanvas(event: ReactPointerEvent<HTMLCanvasElement>) {
  const canvas = event.currentTarget
  const box = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - box.left) / box.width) * canvas.width,
    y: ((event.clientY - box.top) / box.height) * canvas.height,
  }
}

/** 共有・保存用の画像を先に作っておくまでの待ち時間（高解像度は重いので長めに待つ） */
const PREPARE_DELAY_MS = 300

/**
 * プレビュー用の canvas（ページごとに 1 枚）。論理 px（1x）で描き、CSS で縮めて見せる。
 * 書き出し（保存・共有）のときだけ、別の canvas に出力解像度の倍率で描き直す。
 * 複数枚のときは横スワイプのカルーセルにする（Instagram の複数枚投稿と同じ見え方）。
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
  const [scaleChoice, setScaleChoice] =
    useState<ExportScale>(DEFAULT_EXPORT_SCALE)
  const [formatChoice, setFormatChoice] = useState<FormatChoice>(DEFAULT_FORMAT)
  /** 作り置きの画像のファイルサイズ（作り終えるまで null） */
  const [sizes, setSizes] = useState<Array<number> | null>(null)
  /** 作り置きの画像を canShare で確かめた結果 */
  const [shareStatus, setShareStatus] = useState<'pending' | 'ok' | 'no'>(
    'pending',
  )
  const dragRef = useRef<{ page: number; x: number; y: number } | null>(null)
  const onRenderedRef = useRef(onRendered)
  useEffect(() => {
    onRenderedRef.current = onRendered
  }, [onRendered])

  // 描くたびに（と出力解像度・形式を変えるたびに）版を進め、先に作っておいた画像が
  // 今の絵・今の書き出し設定と一致するかを判定する
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

  const hasPhoto = input.photo !== null
  const scale = effectiveScale(input.size, scaleChoice)
  const maxScale = maxExportScale(input.size)
  const format = outputFormat(hasPhoto, formatChoice)
  const pixel = exportPixelSize(input.size, scale)
  const exportKey = `${scale}|${format.mime}`
  const prepareDelay = PREPARE_DELAY_MS * (scale > 1 ? 2 : 1)

  const fileNames = useMemo(
    () =>
      pages.map((_, i) =>
        exportFileName(fileBaseName, i, pages.length, format.ext),
      ),
    [pages, fileBaseName, format.ext],
  )

  /**
   * 書き出し用の画像を作る。プレビューとは別の canvas に出力解像度で 1 枚ずつ描き、
   * 画像にしてから次のページへ進む（大きな canvas を 1 枚しか持たない）。
   * 途中で絵や設定が変わったら（isStale）やめて null を返す。
   */
  const buildFiles = async (
    isStale: () => boolean = () => false,
  ): Promise<Array<File> | null> => {
    const canvas = document.createElement('canvas')
    canvas.width = pixel.width
    canvas.height = pixel.height
    const c = canvas.getContext('2d')
    if (!c) throw new Error('canvas の 2D コンテキストを取得できませんでした')
    const files: Array<File> = []
    // プレビューと同じく、ページ割りを決めたときの組み方で全ページを描く
    let lock: PageLock | undefined = planLock
    try {
      for (const [i, page] of pages.entries()) {
        if (isStale()) return null
        const info = renderPage(c, input, page, lock, false, scale)
        lock ??= info.lock
        const blob = await canvasToBlob(canvas, format)
        files.push(new File([blob], fileNames[i], { type: format.mime }))
      }
    } finally {
      // 大きな canvas の画素をすぐに手放す
      canvas.width = 0
      canvas.height = 0
    }
    return isStale() ? null : files
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
      // 共有ボタンを押した瞬間に share() を呼べるよう、画像を先に作っておく
      versionRef.current += 1
      setShareStatus('pending')
      setSizes(null)
    })
    return () => cancelAnimationFrame(handle)
  }, [input, pages, planLock, fontEpoch])

  // 出力解像度・形式を変えたら、作り置きの画像は使えない（下の作り置きより先に走らせる）
  const exportKeyRef = useRef(exportKey)
  useEffect(() => {
    if (exportKeyRef.current === exportKey) return
    exportKeyRef.current = exportKey
    versionRef.current += 1
    setShareStatus('pending')
    setSizes(null)
  }, [exportKey])

  const remember = (version: number, files: Array<File>) => {
    if (version !== versionRef.current) return
    cacheRef.current = { version, files }
    setSizes(files.map((f) => f.size))
    setShareStatus(canShareFiles(files) ? 'ok' : 'no')
  }
  const rememberRef = useRef(remember)
  useEffect(() => {
    rememberRef.current = remember
  })

  useEffect(() => {
    const version = versionRef.current
    const stale = () => version !== versionRef.current
    const timer = window.setTimeout(() => {
      void buildFilesRef.current(stale).then(
        (files) => {
          if (files) rememberRef.current(version, files)
        },
        () => undefined,
      )
    }, prepareDelay)
    return () => window.clearTimeout(timer)
  }, [infos, exportKey, prepareDelay])

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
      let files = freshFiles()
      if (!files) {
        const version = versionRef.current
        files = await buildFiles()
        if (!files) throw new Error('書き出しに失敗しました')
        remember(version, files)
      }
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
        // PNG / JPEG はすでに圧縮済みなので、zip では圧縮しない（速さ優先）
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
          if (!built) throw new Error('stale')
          remember(version, built)
          const ok = canShareFiles(built)
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
  const formatLabel = format.ext === 'jpg' ? 'JPEG' : 'PNG'
  const totalBytes = sizes ? sizes.reduce((a, b) => a + b, 0) : 0
  const largest = sizes ? Math.max(0, ...sizes) : 0
  const tooLarge = largest > X_IMAGE_LIMIT_BYTES
  const sizeTips = [
    hasPhoto && format.ext === 'png' ? '形式を JPEG にする' : '',
    scale > 1 ? '出力解像度を「標準」にする' : '',
  ].filter(Boolean)

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
        {pixel.width}×{pixel.height} px{multi ? ` × ${pages.length} 枚` : ''}
        {' · '}
        {formatLabel}
        {' · '}
        <span aria-live="polite">
          {sizes
            ? multi
              ? `合計 ${formatBytes(totalBytes)}（最大 ${formatBytes(largest)}/枚）`
              : formatBytes(totalBytes)
            : 'サイズを計算中…'}
        </span>
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

      <div className="space-y-3">
        <fieldset className="space-y-2">
          <legend className={labelClass}>出力解像度</legend>
          <div className="grid grid-cols-3 gap-2">
            {EXPORT_SCALES.map((option) => {
              const disabled = option.value > maxScale
              const px = exportPixelSize(input.size, option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={scale === option.value}
                  className={`${choiceClass(scale === option.value)} disabled:cursor-not-allowed disabled:opacity-40`}
                  disabled={disabled}
                  title={
                    disabled
                      ? `このサイズでは長辺が ${MAX_EXPORT_LONG_SIDE}px を超えるため選べません`
                      : undefined
                  }
                  onClick={() => setScaleChoice(option.value)}
                >
                  <span className="font-semibold">
                    {option.label}{' '}
                    <span className="font-normal text-gray-400">
                      {option.value}x
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-gray-500">
                    {px.width}×{px.height}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-gray-500">
            プレビューは標準のまま。保存・共有のときだけ選んだ解像度で描き直します
            {maxScale < 3
              ? `（最高 3x は長辺 ${MAX_EXPORT_LONG_SIDE}px までのサイズだけ）`
              : ''}
            。
          </p>
        </fieldset>

        {hasPhoto ? (
          <fieldset className="space-y-2">
            <legend className={labelClass}>形式</legend>
            <div className="grid grid-cols-3 gap-2">
              {FORMAT_CHOICES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={formatChoice === option.value}
                  className={choiceClass(formatChoice === option.value)}
                  onClick={() => setFormatChoice(option.value)}
                >
                  <span className="font-semibold">{option.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              自動は写真が入っているので JPEG（品質{' '}
              {Math.round(JPEG_QUALITY * 100)}%）。PNG
              は劣化しませんが、写真入りだと数 MB になります。
            </p>
          </fieldset>
        ) : null}
      </div>

      {tooLarge ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {`${multi ? '1 枚あたり' : '画像が'} 5MB を超えています（${formatBytes(largest)}）。`}
            {
              'X（旧 Twitter）では再圧縮されたり、投稿できなかったりすることがあります。'
            }
            {sizeTips.length > 0
              ? `${sizeTips.join('か、')}と小さくなります。`
              : ''}
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
          {multi ? `ZIP で保存（${pages.length} 枚）` : `${formatLabel} を保存`}
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
