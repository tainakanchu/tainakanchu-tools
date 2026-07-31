/**
 * ドラムロールの1打ごとのパラメータ生成（純粋ロジック）。
 * rng は [0, 1) を返す関数を注入する（テストで決定的にするため）。
 */

export type Rng = () => number

export type RollHit = {
  /** 再生するスネアサンプルの添字 */
  sampleIndex: number
  gain: number
  playbackRate: number
  /** -1(左)〜1(右) のステレオパン */
  pan: number
  /** 次の1打までの間隔（秒） */
  intervalSec: number
}

export type OneShot = {
  gain: number
  playbackRate: number
}

export type CrashHit = {
  crash: OneShot
  kick: OneShot
}

/** スネアサンプルの出現重み。現素材はスネア1種なので選択の余地はない */
export const ROLL_SAMPLE_WEIGHTS: ReadonlyArray<number> = [1]

export const ROLL_TUNING = {
  baseIntervalSec: 0.062,
  intervalJitterSec: 0.008,
  minGain: 0.5,
  maxGain: 0.85,
  accentChance: 0.08,
  accentBoost: 1.35,
  rateJitter: 0.04,
  maxPan: 0.15,
  /** ロール1打目の音量倍率 */
  startBoost: 1.5,
  /** 開始ブーストが減衰する時定数（単位は打数） */
  startBoostDecayHits: 3,
} as const

export const CRASH_TUNING = {
  crashMinGain: 0.85,
  crashMaxGain: 1,
  crashRateJitter: 0.03,
  kickMinGain: 0.9,
  kickMaxGain: 1,
  kickRateJitter: 0.02,
} as const

const spread = (rng: Rng, center: number, radius: number) =>
  center + (rng() * 2 - 1) * radius

const range = (rng: Rng, min: number, max: number) => min + rng() * (max - min)

/**
 * 重み付きでサンプルを選ぶ。直前と同じ添字は除外して単調さを避ける。
 * サンプルが1種のときは選ぶ余地がないので rng を消費せず 0 を返す。
 */
export function pickSampleIndex(
  weights: ReadonlyArray<number>,
  prevIndex: number | null,
  rng: Rng,
): number {
  if (weights.length === 1) return 0
  let total = 0
  for (let i = 0; i < weights.length; i++) {
    if (i !== prevIndex) total += weights[i]
  }
  let r = rng() * total
  for (let i = 0; i < weights.length; i++) {
    if (i === prevIndex) continue
    r -= weights[i]
    if (r < 0) return i
  }
  // 浮動小数の誤差で末尾まで届かなかったときの保険
  const last = weights.length - 1
  return last === prevIndex ? last - 1 : last
}

/** ロール開始からの打数に応じた音量倍率。1打目が最大で、数打かけて 1 に収束する */
export function rollStartEnvelope(hitIndex: number): number {
  const t = ROLL_TUNING
  return 1 + (t.startBoost - 1) * Math.exp(-hitIndex / t.startBoostDecayHits)
}

/**
 * ロールの次の1打を生成する。
 * rng の消費順: サンプル選択 → 音量 → アクセント判定 → ピッチ → パン → 間隔
 * （サンプル選択はスネアが1種のときは rng を消費しないため、
 * 既定の weights では音量から始まる）
 *
 * hitIndex はロール中の何打目か（0 始まり）。既定値は Infinity で、
 * 立ち上がりのブーストがかからない定常状態を表す。
 */
export function nextRollHit(
  prevSampleIndex: number | null,
  rng: Rng,
  weights: ReadonlyArray<number> = ROLL_SAMPLE_WEIGHTS,
  hitIndex: number = Number.POSITIVE_INFINITY,
): RollHit {
  const t = ROLL_TUNING
  const sampleIndex = pickSampleIndex(weights, prevSampleIndex, rng)
  let gain = range(rng, t.minGain, t.maxGain)
  if (rng() < t.accentChance) gain = Math.min(1, gain * t.accentBoost)
  gain = Math.min(1, gain * rollStartEnvelope(hitIndex))
  return {
    sampleIndex,
    gain,
    playbackRate: spread(rng, 1, t.rateJitter),
    pan: spread(rng, 0, t.maxPan),
    intervalSec: spread(rng, t.baseIntervalSec, t.intervalJitterSec),
  }
}

/** リリース時の「ジャーン」（クラッシュ＋キック同時打ち）のパラメータを生成する */
export function crashHit(rng: Rng): CrashHit {
  const t = CRASH_TUNING
  return {
    crash: {
      gain: range(rng, t.crashMinGain, t.crashMaxGain),
      playbackRate: spread(rng, 1, t.crashRateJitter),
    },
    kick: {
      gain: range(rng, t.kickMinGain, t.kickMaxGain),
      playbackRate: spread(rng, 1, t.kickRateJitter),
    },
  }
}
