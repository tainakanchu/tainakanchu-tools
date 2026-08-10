/**
 * 逆分版のノードソルバ（仕様書 §10.4 / §10.7 / §10.8）。
 * 射影勾配法 + backtracking。勾配は中心差分（N ≤ 5）。
 * 決定的（同一入力で bit-identical）にするため、反復順・演算順は固定。
 */
import { deltaE00, xyzToLab, type Lab } from './color'
import { forward, type ForwardContext } from './forward'

export interface SolverContext {
  fwd: ForwardContext
  lambdaTotalInk: number
  lambdaInkCount: number
  /** スクラッチ（同一 ctx の並行利用は不可） */
  scratchXyz: Float32Array
  scratchTrial: Float32Array
  scratchGrad: Float32Array
  scratchBest: Float32Array
}

export function createSolverContext(
  fwd: ForwardContext,
  lambdaTotalInk: number,
  lambdaInkCount: number,
): SolverContext {
  return {
    fwd,
    lambdaTotalInk,
    lambdaInkCount,
    scratchXyz: new Float32Array(3),
    scratchTrial: new Float32Array(fwd.inkCount),
    scratchGrad: new Float32Array(fwd.inkCount),
    scratchBest: new Float32Array(fwd.inkCount),
  }
}

const SPARSE_EPS = 1e-4

/**
 * 制約射影（§10.8）: [0, maxCoverage] クリップ → 総インク量の一様スケール。
 */
export function projectConstraints(a: Float32Array, fwd: ForwardContext): void {
  const n = fwd.inkCount
  let sum = 0
  for (let i = 0; i < n; i++) {
    let v = a[i]
    if (v < 0) v = 0
    const max = fwd.maxCoverage[i]
    if (v > max) v = max
    a[i] = v
    sum += v
  }
  if (sum > fwd.totalInkLimit) {
    const s = fwd.totalInkLimit / sum
    for (let i = 0; i < n; i++) a[i] *= s
  }
}

/** §10.4 の目的関数 */
export function objective(
  a: ArrayLike<number>,
  targetLab: Lab,
  neighborMean: Float32Array | null,
  lambdaSmoothEff: number,
  ctx: SolverContext,
): number {
  const n = ctx.fwd.inkCount
  forward(a, ctx.fwd, ctx.scratchXyz)
  const lab = xyzToLab([
    ctx.scratchXyz[0],
    ctx.scratchXyz[1],
    ctx.scratchXyz[2],
  ])
  let obj = deltaE00(lab, targetLab)

  let total = 0
  let sparse = 0
  for (let i = 0; i < n; i++) {
    const v = a[i]
    total += v
    sparse += Math.sqrt(v + SPARSE_EPS)
  }
  obj += ctx.lambdaTotalInk * total + ctx.lambdaInkCount * sparse

  if (neighborMean !== null && lambdaSmoothEff > 0) {
    let d2 = 0
    for (let i = 0; i < n; i++) {
      const d = a[i] - neighborMean[i]
      d2 += d * d
    }
    obj += lambdaSmoothEff * d2
  }
  return obj
}

const GRAD_H = 1e-3
const MAX_ITER = 60
const REL_TOL = 1e-4

/** 各軸 5 分割の粗グリッド探索（初期値が無い場合のフォールバック） */
function coarseInit(
  targetLab: Lab,
  ctx: SolverContext,
  out: Float32Array,
): void {
  const n = ctx.fwd.inkCount
  const trial = ctx.scratchTrial
  const best = ctx.scratchBest
  let bestObj = Infinity
  const levels = 5
  const count = Math.pow(levels, n)
  for (let k = 0; k < count; k++) {
    let rest = k
    for (let i = 0; i < n; i++) {
      trial[i] = ((rest % levels) / (levels - 1)) * ctx.fwd.maxCoverage[i]
      rest = Math.floor(rest / levels)
    }
    projectConstraints(trial, ctx.fwd)
    const obj = objective(trial, targetLab, null, 0, ctx)
    if (obj < bestObj) {
      bestObj = obj
      best.set(trial)
    }
  }
  out.set(best)
}

/**
 * 1 ノードを解く（§10.7）。
 * initial が null の場合は粗グリッド探索から開始する。結果は out へ。
 */
export function solveNode(
  targetLab: Lab,
  neighborMean: Float32Array | null,
  lambdaSmoothEff: number,
  ctx: SolverContext,
  initial: Float32Array | null,
  out: Float32Array,
): void {
  const n = ctx.fwd.inkCount
  if (initial) {
    out.set(initial)
  } else {
    coarseInit(targetLab, ctx, out)
  }
  projectConstraints(out, ctx.fwd)

  const trial = ctx.scratchTrial
  const grad = ctx.scratchGrad

  let obj = objective(out, targetLab, neighborMean, lambdaSmoothEff, ctx)

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // 中心差分勾配
    for (let i = 0; i < n; i++) {
      trial.set(out)
      trial[i] = out[i] + GRAD_H
      const fp = objective(trial, targetLab, neighborMean, lambdaSmoothEff, ctx)
      trial[i] = out[i] - GRAD_H
      const fm = objective(trial, targetLab, neighborMean, lambdaSmoothEff, ctx)
      grad[i] = (fp - fm) / (2 * GRAD_H)
    }

    let gradNorm = 0
    for (let i = 0; i < n; i++) gradNorm += grad[i] * grad[i]
    if (gradNorm < 1e-12) break

    // backtracking line search
    let step = 0.25
    let improved = false
    for (let bt = 0; bt < 12; bt++) {
      for (let i = 0; i < n; i++) trial[i] = out[i] - step * grad[i]
      projectConstraints(trial, ctx.fwd)
      const trialObj = objective(
        trial,
        targetLab,
        neighborMean,
        lambdaSmoothEff,
        ctx,
      )
      if (trialObj < obj) {
        const rel = (obj - trialObj) / Math.max(obj, 1e-9)
        out.set(trial)
        obj = trialObj
        improved = true
        if (rel < REL_TOL) return
        break
      }
      step *= 0.5
    }
    if (!improved) break
  }
}
