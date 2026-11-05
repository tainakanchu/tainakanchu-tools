/**
 * プレビューの描画と、保存・共有用の画像の作り置き。
 *
 * プレビューは論理 px（1x）で描き、CSS で縮めて見せる。書き出し（保存・共有）は
 * 別の canvas に出力解像度の倍率で描き直す。共有ボタンを押した瞬間に share() を
 * 呼べるよう（iOS Safari はタップと share の間に await を挟めない）、絵が変わるたびに
 * 少し待ってから画像を作っておく。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { zipSync } from 'fflate'
import {
  DEFAULT_EXPORT_SCALE,
  DEFAULT_FORMAT,
  X_IMAGE_LIMIT_BYTES,
  effectiveScale,
  exportFileName,
  exportPixelSize,
  outputFormat,
} from '../-lib/export'
import { loadPendingFonts } from '../-lib/fonts'
import { DEFAULT_PHOTO_SETTINGS } from '../-lib/layouts'
import { planForChoice, renderPage, resetMeasureCache } from '../-lib/render'
import type { ExportScale, FormatChoice, OutputFormat } from '../-lib/export'
import type { PageLock, RenderInfo, RenderInput } from '../-lib/render'
import type { SplitChoice } from '../-lib/split'

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

/** 共有・保存用の画像を先に作っておくまでの待ち時間（高解像度は重いので長めに待つ） */
const PREPARE_DELAY_MS = 300

export function useSetlistRender(
  input: RenderInput,
  splitChoice: SplitChoice,
  fileBaseName: string,
) {
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])
  const [fontEpoch, setFontEpoch] = useState(0)
  const [infos, setInfos] = useState<Array<RenderInfo>>([])
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
      redact: input.redact,
      photo: photoImage
        ? {
            image: photoImage,
            settings: { ...DEFAULT_PHOTO_SETTINGS, mode: photoMode },
          }
        : null,
    }
    void fontEpoch
    return planForChoice(planInput, splitChoice)
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
    input.redact,
    splitChoice,
    photoImage,
    photoMode,
    fontEpoch,
  ])
  const pages = plan.pages
  const planLock = plan.lock
  const planSplit = plan.split

  /** 描画と書き出しに使う入力（枚数は自動の判断を反映したもの） */
  const renderInput: RenderInput = useMemo(
    () => ({ ...input, split: planSplit }),
    [input, planSplit],
  )

  const hasPhoto = input.photo !== null
  const scale = effectiveScale(input.size, scaleChoice)
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
        const info = renderPage(c, renderInput, page, lock, false, scale)
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
      // 分割時はページ割りを決めたときの組み方で全ページを描く
      let lock: PageLock | undefined = planLock
      pages.forEach((page, i) => {
        const canvas = canvasRefs.current[i]
        if (!canvas) return
        const { width, height } = renderInput.size
        if (canvas.width !== width) canvas.width = width
        if (canvas.height !== height) canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const info = renderPage(ctx, renderInput, page, lock)
        lock ??= info.lock
        results.push(info)
      })
      setInfos(results)
      // 描いた文字の Web フォントを読み込み、読めたら描き直す（オフラインなら OS の書体のまま）
      void loadPendingFonts().then((loaded) => {
        if (!loaded) return
        resetMeasureCache()
        setFontEpoch((n) => n + 1)
      })
      versionRef.current += 1
      setShareStatus('pending')
      setSizes(null)
    })
    return () => cancelAnimationFrame(handle)
  }, [renderInput, pages, planLock, fontEpoch])

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
          setMessage(
            canShareFiles(built)
              ? '準備できました。もう一度「共有」を'
              : 'この端末では共有できません。「保存」で。',
          )
        })
        .catch(() => setMessage('画像を準備できませんでした'))
        .finally(() => setBusy(false))
      return
    }
    navigator.share({ files }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setMessage('共有が止められました。もう一度「共有」を')
        return
      }
      setMessage('共有できませんでした。「保存」で。')
    })
  }

  const largest = sizes ? Math.max(0, ...sizes) : 0

  return {
    canvasRefs,
    plan,
    pages,
    infos,
    renderInput,
    exportState: {
      scaleChoice,
      setScaleChoice,
      formatChoice,
      setFormatChoice,
      scale,
      format,
      pixel,
      hasPhoto,
      largest,
      tooLarge: largest > X_IMAGE_LIMIT_BYTES,
      shareSupported,
      shareStatus,
      busy,
      message,
      download,
      share,
      pageCount: pages.length,
    },
  }
}

export type ExportState = ReturnType<typeof useSetlistRender>['exportState']
