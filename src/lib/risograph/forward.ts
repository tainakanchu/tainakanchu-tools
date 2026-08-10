/**
 * 実測ベース順モデル（仕様書 §6）。
 * Neugebauer / Demichel / Yule-Nielsen を基礎とし、実測 overprint で補正する。
 *
 * 性能要件（§6.6）:
 * - overprintSamples の線形探索は ForwardContext 構築時のみ（forward 内では禁止）
 * - 内側ループの Math.pow は外側の ^n のみ（primary^(1/n) は事前計算）
 * - forward は allocation free
 */
import type { XYZ } from './color'
import type { InkId, PressProfile, VirtualInk } from './types'

export interface ForwardContext {
  profile: PressProfile
  inkIds: InkId[]
  inks: VirtualInk[]
  inkCount: number
  /** 2^N × 3。primary(S)^(1/n) を展開済み */
  primaryPow: Float32Array
  /** N × 11。toneResponse をフラット化 */
  tone: Float32Array
  n: number
  invN: number
  maxCoverage: Float32Array
  totalInkLimit: number
  /** forward 用スクラッチ（effective coverage）。同一 ctx の並行利用は不可 */
  scratchE: Float32Array
}

/** toneResponse（11 点）の区分線形補間 */
export function interpTone(tone: ArrayLike<number>, offset: number, a: number): number {
  const x = a <= 0 ? 0 : a >= 1 ? 1 : a
  const scaled = x * 10
  let idx = Math.floor(scaled)
  if (idx > 9) idx = 9
  const frac = scaled - idx
  const t0 = tone[offset + idx]
  const t1 = tone[offset + idx + 1]
  return t0 + (t1 - t0) * frac
}

/**
 * Neugebauer primary を実測優先で構築する（§6.3）。
 * - paper / 単色ベタ / 2色ベタ: 実測
 * - 3色以上: 下位 primary × (単色ベタ / 紙白) の積による推定
 */
export function buildPrimaries(profile: PressProfile, inkIds: InkId[]): XYZ[] {
  const inks = inkIds.map((id) => {
    const ink = profile.inks.find((i) => i.id === id)
    if (!ink) throw new Error(`Unknown ink id: ${id}`)
    return ink
  })
  const n = inkIds.length
  const size = 1 << n
  const paper = profile.paperWhite
  const primaries: XYZ[] = new Array(size)
  primaries[0] = paper

  // 単色ベタ
  for (let i = 0; i < n; i++) {
    primaries[1 << i] = inks[i].measuredSolid
  }

  // 2色ベタ: 実測 overprint（両軸 coverage=1、holdout 除く）を探す
  const solidPair = (idA: InkId, idB: InkId): XYZ | null => {
    for (const s of profile.overprintSamples) {
      if (s.holdout || s.inkIds.length !== 2) continue
      const [x, y] = s.inkIds
      const match = (x === idA && y === idB) || (x === idB && y === idA)
      if (match && s.coverage[0] >= 0.999 && s.coverage[1] >= 0.999) {
        return s.measured
      }
    }
    return null
  }

  // 積による推定: base × (solid / paper)
  const productEstimate = (base: XYZ, solid: XYZ): XYZ => [
    (base[0] * solid[0]) / Math.max(paper[0], 1e-6),
    (base[1] * solid[1]) / Math.max(paper[1], 1e-6),
    (base[2] * solid[2]) / Math.max(paper[2], 1e-6),
  ]

  for (let mask = 1; mask < size; mask++) {
    if (primaries[mask]) continue
    const bits: number[] = []
    for (let i = 0; i < n; i++) if (mask & (1 << i)) bits.push(i)
    if (bits.length === 2) {
      const measured = solidPair(inkIds[bits[0]], inkIds[bits[1]])
      primaries[mask] =
        measured ??
        productEstimate(primaries[1 << bits[0]], primaries[1 << bits[1]])
    } else {
      // 最上位ビットを剥がした下位 primary（実測ペアを含み得る）に積を掛ける
      const top = bits[bits.length - 1]
      const rest = mask & ~(1 << top)
      primaries[mask] = productEstimate(primaries[rest], primaries[1 << top])
    }
  }
  return primaries
}

export function createForwardContext(
  profile: PressProfile,
  inkIds: InkId[],
  nOverride?: number,
): ForwardContext {
  const inks = inkIds.map((id) => profile.inks.find((i) => i.id === id)!)
  const inkCount = inkIds.length
  const size = 1 << inkCount
  const n = nOverride ?? profile.yuleNielsenN
  const invN = 1 / n

  const primaries = buildPrimaries(profile, inkIds)
  const primaryPow = new Float32Array(size * 3)
  for (let m = 0; m < size; m++) {
    const p = primaries[m]
    primaryPow[m * 3] = Math.pow(Math.max(p[0], 0), invN)
    primaryPow[m * 3 + 1] = Math.pow(Math.max(p[1], 0), invN)
    primaryPow[m * 3 + 2] = Math.pow(Math.max(p[2], 0), invN)
  }

  const tone = new Float32Array(inkCount * 11)
  const maxCoverage = new Float32Array(inkCount)
  for (let i = 0; i < inkCount; i++) {
    const tr = inks[i].toneResponse
    for (let k = 0; k < 11; k++) tone[i * 11 + k] = tr[k]
    maxCoverage[i] = inks[i].maxCoverage
  }

  return {
    profile,
    inkIds,
    inks,
    inkCount,
    primaryPow,
    tone,
    n,
    invN,
    maxCoverage,
    totalInkLimit: profile.totalInkLimit,
    scratchE: new Float32Array(inkCount),
  }
}

/**
 * coverage（nominal, 長さ N）→ 予測 XYZ。
 * 結果は out（長さ 3 以上）へ書き込む。allocation free。
 */
export function forward(
  coverage: ArrayLike<number>,
  ctx: ForwardContext,
  out: Float32Array,
): void {
  const n = ctx.inkCount
  const e = ctx.scratchE
  for (let i = 0; i < n; i++) {
    e[i] = interpTone(ctx.tone, i * 11, coverage[i])
  }

  const size = 1 << n
  let accX = 0
  let accY = 0
  let accZ = 0
  const pp = ctx.primaryPow
  for (let mask = 0; mask < size; mask++) {
    // Demichel: w(S) = Π e_i (i∈S) × Π (1-e_i) (i∉S)
    let w = 1
    for (let i = 0; i < n; i++) {
      w *= mask & (1 << i) ? e[i] : 1 - e[i]
    }
    if (w === 0) continue
    const base = mask * 3
    accX += w * pp[base]
    accY += w * pp[base + 1]
    accZ += w * pp[base + 2]
  }

  const yn = ctx.n
  out[0] = Math.pow(accX, yn)
  out[1] = Math.pow(accY, yn)
  out[2] = Math.pow(accZ, yn)
}

/** テスト・単発評価用の便宜ラッパ（allocation あり） */
export function forwardXyz(coverage: ArrayLike<number>, ctx: ForwardContext): XYZ {
  const out = new Float32Array(3)
  forward(coverage, ctx, out)
  return [out[0], out[1], out[2]]
}
