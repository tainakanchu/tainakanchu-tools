import { useEffect, useRef, useState } from 'react'
import { panDelta } from '../-lib/layouts'
import { META_LABELS } from '../-lib/render'
import { markSeen, seenOnce } from '../-lib/remember'
import { needsAutoSplit } from '../-lib/split'
import type {
  KeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'
import type { PhotoSettings } from '../-lib/layouts'
import type { PagePlan, RenderInfo, RenderInput } from '../-lib/render'
import type { SplitChoice } from '../-lib/split'

type Props = {
  canvasRefs: RefObject<Array<HTMLCanvasElement | null>>
  plan: PagePlan & { autoSplit: boolean }
  infos: Array<RenderInfo>
  input: RenderInput
  splitChoice: SplitChoice
  onSplitChoiceChange: (choice: SplitChoice) => void
  onPhotoSettingsChange: (settings: PhotoSettings) => void
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

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * プレビュー。phone では画面の上に固定し、desktop では左の列に固定する。
 * 複数枚のときは横スワイプ（Instagram の複数枚投稿と同じ見え方）。
 * 下に 1 行だけ、枚数のこと・入りきらないことを出す。
 */
export function PreviewStage({
  canvasRefs,
  plan,
  infos,
  input,
  splitChoice,
  onSplitChoiceChange,
  onPhotoSettingsChange,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const fadeRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  const dragRef = useRef<{ page: number; x: number; y: number } | null>(null)
  const pages = plan.pages
  const multi = pages.length > 1
  const photo = input.photo
  const { width: W, height: H } = input.size

  // ページ数が減ったら表示中のページを戻す
  useEffect(() => {
    if (current >= pages.length) setCurrent(0)
  }, [pages.length, current])

  // テンプレート・配色を変えたら短くフェードし直す（それ以上は動かさない）
  const designKey = `${input.layout}|${input.palette.id}|${input.palette.bg}`
  const firstRef = useRef(true)
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    const el = fadeRef.current
    if (!el || reducedMotion() || typeof el.animate !== 'function') return
    el.animate([{ opacity: 0.35 }, { opacity: 1 }], {
      duration: 150,
      easing: 'ease-out',
    })
  }, [designKey])

  // 写真を動かせることは、写真を入れたときに 1 回だけ控えめに伝える
  const [hint, setHint] = useState(false)
  const draggableAny = photo !== null && infos.some((i) => i.photoRect)
  useEffect(() => {
    if (!draggableAny || seenOnce('photo-drag')) return
    setHint(true)
    const timer = window.setTimeout(() => {
      setHint(false)
      markSeen('photo-drag')
    }, 3200)
    return () => window.clearTimeout(timer)
  }, [draggableAny])

  const scrollToPage = (index: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({
      left: el.clientWidth * index,
      behavior: reducedMotion() ? 'auto' : 'smooth',
    })
  }

  const nudge = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!photo) return
    const step = event.shiftKey ? 0.1 : 0.02
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[event.key] as [number, number] | undefined
    if (!move) return
    event.preventDefault()
    onPhotoSettingsChange({
      ...photo.settings,
      posX: clamp(photo.settings.posX + move[0]),
      posY: clamp(photo.settings.posY + move[1]),
    })
  }

  const first = infos.at(0)
  const overflow = infos.find((i) => i.overflow)
  const hiddenMeta = first ? first.hiddenMeta : []

  /** プレビューの下の 1 行 */
  let status: ReactNode = null
  if (plan.autoSplit) {
    status = (
      <>
        <span>{pages.length} 枚に分けました</span>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() =>
            onSplitChoiceChange({ ...splitChoice, mode: 'single' })
          }
        >
          1 枚にまとめる
        </button>
      </>
    )
  } else if (overflow && splitChoice.mode !== 'manual') {
    status = (
      <>
        <span data-tone="alert" className="slc-note">
          {overflow.hiddenCount} 曲が入りません
        </span>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => onSplitChoiceChange({ ...splitChoice, mode: 'auto' })}
        >
          分ける
        </button>
      </>
    )
  } else if (overflow) {
    status = (
      <span data-tone="alert" className="slc-note">
        {overflow.hiddenCount} 曲が入りません。枚数を増やす
      </span>
    )
  } else if (splitChoice.mode === 'single' && first && needsAutoSplit(first)) {
    status = (
      <>
        <span>1 枚</span>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => onSplitChoiceChange({ ...splitChoice, mode: 'auto' })}
        >
          自動で分ける
        </button>
      </>
    )
  } else if (hiddenMeta.length > 0) {
    status = (
      <span>
        幅が足りないので {hiddenMeta.map((k) => META_LABELS[k]).join('、')}{' '}
        を省略
      </span>
    )
  }

  return (
    <div className="flex flex-col">
      <div ref={fadeRef}>
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
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
                className="w-full shrink-0 snap-center p-3"
              >
                <div
                  className="slc-canvas-frame slc-crop"
                  style={{
                    aspectRatio: `${W} / ${H}`,
                    width: `min(100%, calc(var(--pv-h) * ${W} / ${H}))`,
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
                    role="img"
                    tabIndex={draggable ? 0 : undefined}
                    aria-label={`${multi ? `${i + 1} 枚目の` : ''}セトリ画像${draggable ? '。矢印キーで写真を動かせます' : ''}`}
                    onKeyDown={draggable ? nudge : undefined}
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
                      if (hint) {
                        setHint(false)
                        markSeen('photo-drag')
                      }
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
                  {draggable && i === 0 ? (
                    <span
                      className="slc-hint"
                      style={{ opacity: hint ? 1 : 0 }}
                      aria-hidden
                    >
                      写真はドラッグで動かせます
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div
        className={`mx-auto flex min-h-11 w-full items-center justify-between gap-3 px-3 text-[12px] text-(--muted) ${status || multi ? '' : 'max-lg:min-h-2'}`}
        style={{ maxWidth: `calc(var(--pv-h) * ${W} / ${H} + 24px)` }}
      >
        <div
          className="flex min-w-0 items-center gap-2 [&>span]:truncate"
          aria-live="polite"
        >
          {status}
        </div>
        {multi ? (
          <nav className="slc-pages" aria-label="ページ">
            {pages.map((page, i) => (
              <button
                key={page.index}
                type="button"
                aria-current={i === current}
                aria-label={`${i + 1} 枚目`}
                onClick={() => scrollToPage(i)}
              >
                {String(i + 1).padStart(2, '0')}
              </button>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  )
}
