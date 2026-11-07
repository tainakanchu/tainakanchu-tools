import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageTitle } from '../../../components/ui'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import { DrumRollEngine } from './-lib/engine'

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('drum-roll')!

export const Route = createFileRoute('/tools/drum-roll/')({
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
  }),
  component: DrumRollPage,
})

type EngineStatus = 'loading' | 'ready' | 'error'
type PadMode = 'idle' | 'rolling' | 'crashed'

const CRASH_DISPLAY_MS = 1400

/** 絵文字は継承した文字色（ステージでは紙色）を引かないよう、色を明示する */
const EMOJI_STYLE = {
  color: 'initial',
} as const

/** ヘッダーのボタン等にフォーカスがあるときはスペースキーを奪わない */
const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest('button, a, input, textarea, select, [contenteditable]') !==
    null

function DrumRollPage() {
  const [status, setStatus] = useState<EngineStatus>('loading')
  const [mode, setMode] = useState<PadMode>('idle')
  const engineRef = useRef<DrumRollEngine | null>(null)
  const crashTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const engine = new DrumRollEngine()
    engineRef.current = engine
    engine
      .load()
      .then(() => {
        if (!engine.disposed) setStatus('ready')
      })
      .catch(() => {
        if (!engine.disposed) setStatus('error')
      })
    return () => {
      engineRef.current = null
      engine.dispose()
    }
  }, [])

  const clearCrashTimer = useCallback(() => {
    if (crashTimerRef.current !== null) {
      window.clearTimeout(crashTimerRef.current)
      crashTimerRef.current = null
    }
  }, [])

  const press = useCallback(() => {
    const engine = engineRef.current
    if (!engine?.isReady) return
    clearCrashTimer()
    void engine.startRoll()
    setMode('rolling')
  }, [clearCrashTimer])

  const release = useCallback(() => {
    const engine = engineRef.current
    if (!engine?.releaseToCrash()) return
    setMode('crashed')
    clearCrashTimer()
    crashTimerRef.current = window.setTimeout(() => {
      crashTimerRef.current = null
      setMode('idle')
    }, CRASH_DISPLAY_MS)
  }, [clearCrashTimer])

  const cancel = useCallback(() => {
    engineRef.current?.cancelRoll()
    setMode((prev) => (prev === 'rolling' ? 'idle' : prev))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== 'Space' ||
        event.repeat ||
        isInteractiveTarget(event.target)
      ) {
        return
      }
      event.preventDefault()
      press()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isInteractiveTarget(event.target)) return
      event.preventDefault()
      release()
    }
    const onBlur = () => cancel()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [press, release, cancel])

  useEffect(() => () => clearCrashTimer(), [clearCrashTimer])

  const hint =
    status === 'loading'
      ? '音源を読み込み中…'
      : status === 'error'
        ? '音源の読み込みに失敗しました。リロードしてみてください。'
        : mode === 'rolling'
          ? 'ドロロロロロ……（放すとジャーン！）'
          : 'ここを長押しするか、スペースキーを押し続けてください'

  return (
    <main className="flex h-[calc(100dvh-4rem)] flex-col">
      {/* タイトルだけ標準のページ幅に置き、ステージは全幅にする（docs/design.md「ページの枠」の例外） */}
      <div className="page shrink-0 pb-6 md:pb-8">
        <PageTitle
          className="mb-0"
          lead="スペースキーか画面の長押しでドラムロール。放すとシンバルが鳴って「ジャーン！」。"
        >
          {tool.name}
        </PageTitle>
      </div>

      {/* 演出の面だけは暗いインクで刷って、ステージらしくする。
          ダークでも淡いインクのベタにはせず、ライトと同じ濃紺のステージのまま（theme-light） */}
      <div
        role="button"
        tabIndex={0}
        aria-label="長押しでドラムロール、放すとジャーン"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          press()
        }}
        onPointerUp={release}
        onPointerCancel={cancel}
        onContextMenu={(event) => event.preventDefault()}
        className="relative flex flex-1 cursor-pointer touch-none flex-col items-center justify-center gap-8 theme-light on-ink border-t-[1.5px] border-ink p-8 text-center select-none focus-visible:-outline-offset-6"
      >
        {mode === 'crashed' ? (
          <>
            <span
              className="animate-drum-pop text-8xl motion-reduce:animate-none md:text-9xl"
              style={EMOJI_STYLE}
              aria-hidden
            >
              💥🥁✨
            </span>
            <span className="animate-drum-pop text-5xl font-black text-riso-yellow motion-reduce:animate-none md:text-6xl">
              ジャーン！！
            </span>
          </>
        ) : (
          <>
            <span
              className={`text-8xl md:text-9xl ${mode === 'rolling' ? 'animate-drum-shake motion-reduce:animate-none' : ''}`}
              style={EMOJI_STYLE}
              aria-hidden
            >
              🥁
            </span>
            <span className="text-lg font-medium md:text-xl">{hint}</span>
          </>
        )}
      </div>
    </main>
  )
}
