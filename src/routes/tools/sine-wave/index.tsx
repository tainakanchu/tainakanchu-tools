import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import { SineEngine } from './-lib/engine'
import {
  DEFAULT_HZ,
  DEFAULT_VOLUME,
  MAX_HZ,
  MIN_HZ,
  PRESETS_HZ,
  clampHz,
  formatHz,
  hzToSliderPosition,
  parseHzInput,
  shiftOctave,
  sliderPositionToHz,
  stepHz,
} from './-lib/frequency'
import type { Channel } from './-lib/frequency'

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('sine-wave')!

export const Route = createFileRoute('/tools/sine-wave/')({
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
  }),
  component: SineWavePage,
})

const SLIDER_STEPS = 1000

const CHANNELS: ReadonlyArray<{ value: Channel; label: string }> = [
  { value: 'left', label: 'L' },
  { value: 'both', label: '両方' },
  { value: 'right', label: 'R' },
]

/** テキスト・数値入力中はスペースキーを奪わない */
const isTextEntryTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest(
    'textarea, select, [contenteditable], input:not([type="range"]):not([type="button"])',
  ) !== null

const btn =
  'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 transition hover:border-cyan-500 hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-cyan-400 dark:hover:bg-gray-700'

function SineWavePage() {
  const [hz, setHz] = useState(DEFAULT_HZ)
  const [hzText, setHzText] = useState(String(DEFAULT_HZ))
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const [channel, setChannel] = useState<Channel>('both')
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(false)
  const engineRef = useRef<SineEngine | null>(null)
  const stateRef = useRef({ hz, volume, channel, playing })
  stateRef.current = { hz, volume, channel, playing }

  useEffect(() => {
    const engine = new SineEngine()
    engineRef.current = engine
    return () => {
      engineRef.current = null
      engine.dispose()
    }
  }, [])

  const applyHz = useCallback((next: number) => {
    const value = clampHz(next)
    setHz(value)
    setHzText(formatHz(value))
    engineRef.current?.setFrequency(value)
  }, [])

  const toggle = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    if (stateRef.current.playing) {
      engine.stop()
      setPlaying(false)
      return
    }
    const current = stateRef.current
    setPlaying(true)
    setError(false)
    try {
      await engine.start(current.hz, current.volume, current.channel)
    } catch {
      setPlaying(false)
      setError(true)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== 'Space' ||
        event.repeat ||
        isTextEntryTarget(event.target)
      ) {
        return
      }
      // ボタン上のスペースはそのボタンの押下に任せる
      if (
        event.target instanceof Element &&
        event.target.closest('button, a') !== null
      ) {
        return
      }
      event.preventDefault()
      void toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 text-gray-900 dark:text-gray-100">
      <header>
        <h1 className="text-2xl font-bold">{tool.name}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {tool.description}
        </p>
      </header>

      <section
        aria-label="周波数"
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex items-baseline justify-center gap-2">
          <output
            aria-live="off"
            className="font-mono text-6xl font-black tabular-nums text-cyan-700 sm:text-7xl dark:text-cyan-300"
          >
            {formatHz(hz)}
          </output>
          <span className="text-2xl font-semibold text-gray-500 dark:text-gray-400">
            Hz
          </span>
        </div>

        <input
          type="range"
          aria-label="周波数スライダー（対数）"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={Math.round(hzToSliderPosition(hz) * SLIDER_STEPS)}
          onChange={(e) =>
            applyHz(sliderPositionToHz(Number(e.target.value) / SLIDER_STEPS))
          }
          className="mt-5 w-full accent-cyan-600"
        />
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{MIN_HZ} Hz</span>
          <span>{MAX_HZ} Hz</span>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">
            周波数
            <input
              type="number"
              inputMode="decimal"
              min={MIN_HZ}
              max={MAX_HZ}
              step="any"
              value={hzText}
              onChange={(e) => {
                setHzText(e.target.value)
                const parsed = parseHzInput(e.target.value)
                if (parsed !== null) {
                  setHz(parsed)
                  engineRef.current?.setFrequency(parsed)
                }
              }}
              onBlur={() => setHzText(formatHz(hz))}
              className="ml-2 w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-right font-mono text-lg text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <span className="text-sm text-gray-600 dark:text-gray-400">Hz</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <button
            type="button"
            className={btn}
            onClick={() => applyHz(stepHz(hz, -10))}
          >
            −10
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => applyHz(stepHz(hz, -1))}
          >
            −1
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => applyHz(stepHz(hz, 1))}
          >
            +1
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => applyHz(stepHz(hz, 10))}
          >
            +10
          </button>
          <button
            type="button"
            className={btn}
            aria-label="1 オクターブ下（÷2）"
            onClick={() => applyHz(shiftOctave(hz, -1))}
          >
            ÷2
          </button>
          <button
            type="button"
            className={btn}
            aria-label="1 オクターブ上（×2）"
            onClick={() => applyHz(shiftOctave(hz, 1))}
          >
            ×2
          </button>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {PRESETS_HZ.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={hz === preset}
              className={`${btn} ${hz === preset ? 'border-cyan-600 bg-cyan-100 dark:border-cyan-400 dark:bg-cyan-900/40' : ''}`}
              onClick={() => applyHz(preset)}
            >
              {preset} Hz
            </button>
          ))}
        </div>
      </section>

      <section
        aria-label="音量と出力"
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900"
      >
        <label className="block">
          <span className="flex justify-between text-sm font-semibold">
            <span>音量</span>
            <span className="font-mono tabular-nums">{volume}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value)
              setVolume(v)
              engineRef.current?.setVolume(v)
            }}
            className="mt-2 w-full accent-cyan-600"
          />
        </label>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          ⚠
          小さい音量から始めてください。高い周波数やヘッドホンでは耳を傷めるおそれがあります。
        </p>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">出力チャンネル</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={channel === c.value}
                onClick={() => {
                  setChannel(c.value)
                  engineRef.current?.setChannel(c.value)
                }}
                className={`${btn} ${channel === c.value ? 'border-cyan-600 bg-cyan-600 text-white hover:bg-cyan-700 dark:border-cyan-400 dark:bg-cyan-600 dark:hover:bg-cyan-500' : ''}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <button
        type="button"
        onClick={() => void toggle()}
        aria-pressed={playing}
        className={`rounded-2xl px-6 py-5 text-xl font-bold text-white shadow transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${playing ? 'bg-rose-600 hover:bg-rose-700' : 'bg-cyan-600 hover:bg-cyan-700'}`}
      >
        {playing ? '■ 停止' : '▶ 再生'}
      </button>
      <p className="-mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
        スペースキーでも再生 / 停止できます
      </p>
      {error ? (
        <p
          role="alert"
          className="text-center text-sm text-rose-600 dark:text-rose-400"
        >
          音声を開始できませんでした。ブラウザの設定を確認してください。
        </p>
      ) : null}
    </main>
  )
}
