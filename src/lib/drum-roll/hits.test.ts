import { describe, expect, it } from 'vitest'
import {
  CRASH_TUNING,
  ROLL_SAMPLE_WEIGHTS,
  ROLL_TUNING,
  crashHit,
  nextRollHit,
  pickSampleIndex,
  rollStartEnvelope,
} from './hits'

/** 複数サンプルを差し替えたときの挙動を確かめるための重み */
const MULTI_WEIGHTS = [0.45, 0.35, 0.2]

/** 同じ乱数列を何度も使い回すための生成器 */
const seq = (values: Array<number>) => {
  let call = 0
  return () => values[call++]
}

const makeLcg = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

describe('pickSampleIndex', () => {
  it('常に範囲内の添字を返し、直前の添字は返さない', () => {
    const rng = makeLcg(1)
    let prev: number | null = null
    for (let i = 0; i < 1000; i++) {
      const index = pickSampleIndex(MULTI_WEIGHTS, prev, rng)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(MULTI_WEIGHTS.length)
      expect(index).not.toBe(prev)
      prev = index
    }
  })

  it('すべてのサンプルがいずれ選ばれる', () => {
    const rng = makeLcg(42)
    const seen = new Set<number>()
    let prev: number | null = null
    for (let i = 0; i < 200; i++) {
      prev = pickSampleIndex(MULTI_WEIGHTS, prev, rng)
      seen.add(prev)
    }
    expect(seen.size).toBe(MULTI_WEIGHTS.length)
  })

  it('rng が 1 に近い値を返しても範囲内に収まる', () => {
    const index = pickSampleIndex(MULTI_WEIGHTS, 0, () => 0.999999)
    expect(index).toBeGreaterThan(0)
    expect(index).toBeLessThan(MULTI_WEIGHTS.length)
  })

  it('現素材（スネア1種）では rng を消費せず 0 を返す', () => {
    let calls = 0
    const rng = () => {
      calls++
      return 0.5
    }
    expect(pickSampleIndex(ROLL_SAMPLE_WEIGHTS, 0, rng)).toBe(0)
    expect(calls).toBe(0)
  })
})

describe('nextRollHit', () => {
  it('各パラメータがチューニング値の範囲に収まる', () => {
    const t = ROLL_TUNING
    const rng = makeLcg(7)
    let prev: number | null = null
    for (let i = 0; i < 500; i++) {
      const hit = nextRollHit(prev, rng, MULTI_WEIGHTS)
      expect(hit.sampleIndex).not.toBe(prev)
      expect(hit.gain).toBeGreaterThanOrEqual(t.minGain)
      expect(hit.gain).toBeLessThanOrEqual(1)
      expect(hit.playbackRate).toBeGreaterThanOrEqual(1 - t.rateJitter)
      expect(hit.playbackRate).toBeLessThanOrEqual(1 + t.rateJitter)
      expect(Math.abs(hit.pan)).toBeLessThanOrEqual(t.maxPan)
      expect(hit.intervalSec).toBeGreaterThanOrEqual(
        t.baseIntervalSec - t.intervalJitterSec,
      )
      expect(hit.intervalSec).toBeLessThanOrEqual(
        t.baseIntervalSec + t.intervalJitterSec,
      )
      prev = hit.sampleIndex
    }
  })

  it('デフォルト（スネア1種）では常に sampleIndex 0 が返る', () => {
    const rng = makeLcg(11)
    let prev: number | null = null
    for (let i = 0; i < 200; i++) {
      const hit = nextRollHit(prev, rng)
      expect(hit.sampleIndex).toBe(0)
      prev = hit.sampleIndex
    }
  })

  it('アクセント時は音量が増幅されつつ 1 を超えない', () => {
    // rng の消費順: サンプル選択 → 音量 → アクセント判定 → ピッチ → パン → 間隔
    const values = [0.1, 0.999999, 0, 0.5, 0.5, 0.5]
    let call = 0
    const hit = nextRollHit(null, () => values[call++], MULTI_WEIGHTS)
    expect(hit.gain).toBe(1)
  })

  it('連続生成しても同じサンプルが2連続しない', () => {
    const rng = makeLcg(123)
    let prev: number | null = null
    for (let i = 0; i < 300; i++) {
      const hit = nextRollHit(prev, rng, MULTI_WEIGHTS)
      expect(hit.sampleIndex).not.toBe(prev)
      prev = hit.sampleIndex
    }
  })
})

describe('rollStartEnvelope', () => {
  it('1打目が最大で startBoost に一致する', () => {
    expect(rollStartEnvelope(0)).toBe(ROLL_TUNING.startBoost)
  })

  it('打数が進むほど単調に小さくなる', () => {
    let prev = rollStartEnvelope(0)
    for (let i = 1; i <= 50; i++) {
      const value = rollStartEnvelope(i)
      expect(value).toBeLessThanOrEqual(prev)
      prev = value
    }
  })

  it('十分に打数を重ねると 1 に収束する', () => {
    expect(rollStartEnvelope(50)).toBeCloseTo(1)
  })
})

describe('nextRollHit の立ち上がり', () => {
  it('hitIndex 0 では同じ乱数列でも音量が大きくなる', () => {
    // rng の消費順: サンプル選択 → 音量 → アクセント判定 → ピッチ → パン → 間隔
    const values = [0, 0.5, 0.5, 0.5, 0.5]
    const steady = nextRollHit(null, seq(values))
    const start = nextRollHit(null, seq(values), undefined, 0)
    expect(start.gain).toBeGreaterThan(steady.gain)
    expect(start.gain).toBeCloseTo(steady.gain * ROLL_TUNING.startBoost)
    expect(start.gain).toBeLessThanOrEqual(1)
  })

  it('立ち上がりでも音量は 1 を超えない', () => {
    const hit = nextRollHit(
      null,
      seq([0.999999, 0.5, 0.5, 0.5, 0.5]),
      undefined,
      0,
    )
    expect(hit.gain).toBe(1)
  })

  it('hitIndex 省略時は立ち上がりなし（Infinity 指定）と同じ結果になる', () => {
    const values = [0.3, 0.5, 0.5, 0.5, 0.5]
    expect(nextRollHit(null, seq(values))).toEqual(
      nextRollHit(null, seq(values), undefined, Number.POSITIVE_INFINITY),
    )
  })
})

describe('crashHit', () => {
  it('クラッシュとキックのパラメータが範囲に収まる', () => {
    const t = CRASH_TUNING
    const rng = makeLcg(99)
    for (let i = 0; i < 200; i++) {
      const { crash, kick } = crashHit(rng)
      expect(crash.gain).toBeGreaterThanOrEqual(t.crashMinGain)
      expect(crash.gain).toBeLessThanOrEqual(t.crashMaxGain)
      expect(Math.abs(crash.playbackRate - 1)).toBeLessThanOrEqual(
        t.crashRateJitter,
      )
      expect(kick.gain).toBeGreaterThanOrEqual(t.kickMinGain)
      expect(kick.gain).toBeLessThanOrEqual(t.kickMaxGain)
      expect(Math.abs(kick.playbackRate - 1)).toBeLessThanOrEqual(
        t.kickRateJitter,
      )
    }
  })
})
