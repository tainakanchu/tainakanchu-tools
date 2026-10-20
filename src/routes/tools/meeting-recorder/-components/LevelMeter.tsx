import { useEffect, useRef, useState } from 'react'

type Props = {
  label: string
  analyser: AnalyserNode | null
  /** 無音のときに出す一言（例: 「タブで音が出ているか確認」） */
  silentHint: string
}

/** メーターの下限。これより小さい音は「無音」とみなす */
const FLOOR_DB = -60
/** 「無音」表示に切り替えるまでの時間（ミリ秒）。会話の間でちらつかないように */
const SILENT_AFTER_MS = 3000

function peakDb(samples: Float32Array<ArrayBuffer>): number {
  let peak = 0
  for (const sample of samples) {
    const abs = Math.abs(sample)
    if (abs > peak) peak = abs
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity
}

/**
 * 1 チャンネル分のレベルメーター。
 * 60fps で React を再描画しないよう、バーの幅は rAF から DOM を直接書き換える。
 * 「無音かどうか」の表示だけを state にしている（切り替わったときしか描画しない）。
 */
export function LevelMeter({ label, analyser, silentHint }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const peakRef = useRef<HTMLDivElement>(null)
  const [silent, setSilent] = useState(false)

  useEffect(() => {
    if (!analyser) return
    const samples = new Float32Array(analyser.fftSize)
    let handle = 0
    let held = FLOOR_DB
    let heldAt = 0
    let lastSound = performance.now()
    const tick = (now: number) => {
      analyser.getFloatTimeDomainData(samples)
      const db = Math.max(FLOOR_DB, peakDb(samples))
      const ratio = (db - FLOOR_DB) / -FLOOR_DB
      if (barRef.current)
        barRef.current.style.width = `${(ratio * 100).toFixed(1)}%`
      // ピークホールド: 1 秒保持してから落とす
      if (db >= held || now - heldAt > 1000) {
        held = db
        heldAt = now
      }
      if (peakRef.current) {
        peakRef.current.style.left = `${(((held - FLOOR_DB) / -FLOOR_DB) * 100).toFixed(1)}%`
      }
      if (db > FLOOR_DB + 6) lastSound = now
      const nextSilent = now - lastSound > SILENT_AFTER_MS
      setSilent((prev) => (prev === nextSilent ? prev : nextSilent))
      handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [analyser])

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        {analyser ? (
          <span
            className={`text-xs ${silent ? 'text-amber-700' : 'text-emerald-700'}`}
          >
            {silent ? `無音 — ${silentHint}` : '音声あり'}
          </span>
        ) : (
          <span className="text-xs text-gray-400">未接続</span>
        )}
      </div>
      <div
        className="relative h-3 overflow-hidden rounded-full bg-gray-100"
        role="meter"
        aria-label={`${label}の音量`}
        aria-valuemin={FLOOR_DB}
        aria-valuemax={0}
      >
        <div
          ref={barRef}
          className="h-full w-0 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-amber-400"
        />
        <div
          ref={peakRef}
          className="absolute inset-y-0 w-0.5 bg-gray-500"
          style={{ left: '0%' }}
        />
      </div>
    </div>
  )
}
