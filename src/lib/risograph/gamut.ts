/**
 * ガモット境界推定とガモットマッピング（仕様書 §9）。
 * coverage simplex を低食い違い列でサンプリングして (L, h) → 到達可能彩度の
 * 範囲表を作り、clip / chroma-compress / lightness-first の 3 モードで写像する。
 *
 * インク数 N が少ないとき、到達可能集合は Lab 空間で N 次元の薄い塊にしかならない
 * （2 インクなら曲面）。そのため C_max の上限だけでは「その (L, h) には実際には
 * 何も無い」領域を内側と誤判定する。ビンごとに C の下限と到達サンプルの有無まで
 * 持つことで、低次元ガモットでも内外判定が実態に合う。
 */
import { deltaE00, labToLch, lchToLab, xyzToLab } from './color'
import type { Lab } from './color'
import { forward } from './forward'
import type { ForwardContext } from './forward'
import type { GamutMapConfig } from './types'

export interface GamutTable {
  lBins: number
  hBins: number
  lMin: number
  lMax: number
  /** lBins × hBins。各ビンの最大彩度（到達サンプル無しなら 0） */
  cMax: Float32Array
  /** lBins × hBins。各ビンの最小彩度（到達サンプル無しなら 0） */
  cMin: Float32Array
  /** lBins × hBins。1 = そのビンに到達可能色がある */
  occupied: Uint8Array
  /**
   * lBins × hBins。彩度圧縮に使う上限の包絡（cMax 以上、全ビンで定義）。
   * 実ガモットの境界は (L, h) に対して非常に凹凸が激しく、cMax をそのまま
   * 圧縮の上限にすると、ほぼ同じ入力色が隣り合うビンで全く違う target に
   * 写って LUT が波打つ。距離減衰つきの max 拡散で滑らかな包絡を作る。
   */
  cLimit: Float32Array
}

/** Halton 列（決定的低食い違い列） */
function halton(index: number, base: number): number {
  let f = 1
  let r = 0
  let i = index
  while (i > 0) {
    f /= base
    r += f * (i % base)
    i = Math.floor(i / base)
  }
  return r
}

const HALTON_BASES = [2, 3, 5, 7, 11]
const L_BINS = 16
const H_BINS = 32

export function buildGamutTable(
  ctx: ForwardContext,
  sampleCount = 20000,
): GamutTable {
  const n = ctx.inkCount
  const cMax = new Float32Array(L_BINS * H_BINS)
  const cMin = new Float32Array(L_BINS * H_BINS)
  const occupied = new Uint8Array(L_BINS * H_BINS)
  let lMin = Infinity
  let lMax = -Infinity

  const coverage = new Float32Array(n)
  const out = new Float32Array(3)
  const labs: Array<Lab> = []

  const evalCoverage = () => {
    // 総インク量制約へ射影
    let sum = 0
    for (let i = 0; i < n; i++) sum += coverage[i]
    if (sum > ctx.totalInkLimit) {
      const s = ctx.totalInkLimit / sum
      for (let i = 0; i < n; i++) coverage[i] *= s
    }
    forward(coverage, ctx, out)
    const lab = xyzToLab([out[0], out[1], out[2]])
    labs.push(lab)
    if (lab[0] < lMin) lMin = lab[0]
    if (lab[0] > lMax) lMax = lab[0]
  }

  // コーナー（2^N）と各軸の wedge を明示的に含める
  for (let mask = 0; mask < 1 << n; mask++) {
    for (let i = 0; i < n; i++) {
      coverage[i] = mask & (1 << i) ? ctx.maxCoverage[i] : 0
    }
    evalCoverage()
  }
  for (let i = 0; i < n; i++) {
    for (let s = 1; s <= 8; s++) {
      coverage.fill(0)
      coverage[i] = (s / 8) * ctx.maxCoverage[i]
      evalCoverage()
    }
  }
  for (let k = 1; k <= sampleCount; k++) {
    for (let i = 0; i < n; i++) {
      coverage[i] = halton(k, HALTON_BASES[i]) * ctx.maxCoverage[i]
    }
    evalCoverage()
  }

  const lSpan = Math.max(lMax - lMin, 1e-6)
  for (const lab of labs) {
    const [l, c, h] = labToLch(lab)
    const li = Math.min(
      L_BINS - 1,
      Math.max(0, Math.floor(((l - lMin) / lSpan) * L_BINS)),
    )
    const hi = Math.min(H_BINS - 1, Math.floor((h / 360) * H_BINS))
    const idx = li * H_BINS + hi
    if (occupied[idx] === 0) {
      occupied[idx] = 1
      cMax[idx] = c
      cMin[idx] = c
    } else {
      if (c > cMax[idx]) cMax[idx] = c
      if (c < cMin[idx]) cMin[idx] = c
    }
  }

  // cMax / occupied は内外判定用にそのまま残す（空ビンを埋めると、到達色が
  // 1 つも無い (L, h) をガモット内と誤判定してしまう）。
  // 圧縮上限の包絡だけを別に作る。
  return {
    lBins: L_BINS,
    hBins: H_BINS,
    lMin,
    lMax,
    cMax,
    cMin,
    occupied,
    cLimit: buildLimitEnvelope(cMax, L_BINS, H_BINS),
  }
}

/** ビンを 1 つ跨ぐごとの減衰率。1 に近いほど包絡が緩やかに広がる */
const LIMIT_DECAY = 0.65

/**
 * cMax の距離減衰つき max 拡散（limit[i] = max_j cMax[j]·decay^dist(i,j)）。
 * 収束するまで回すので更新順に依存しない不動点になり、決定的。
 */
function buildLimitEnvelope(
  cMax: Float32Array,
  lBins: number,
  hBins: number,
): Float32Array {
  const limit = Float32Array.from(cMax)
  for (let pass = 0; pass < lBins + hBins; pass++) {
    let changed = false
    for (let li = 0; li < lBins; li++) {
      for (let hi = 0; hi < hBins; hi++) {
        const idx = li * hBins + hi
        let v = limit[idx]
        for (const [dl, dh] of NEIGHBOR_OFFSETS) {
          const l2 = li + dl
          if (l2 < 0 || l2 >= lBins) continue
          const h2 = (hi + dh + hBins) % hBins
          const cand = limit[l2 * hBins + h2] * LIMIT_DECAY
          if (cand > v) v = cand
        }
        if (v > limit[idx] + 1e-9) {
          limit[idx] = v
          changed = true
        }
      }
    }
    if (!changed) break
  }
  return limit
}

const NEIGHBOR_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const

function lBinOf(table: GamutTable, l: number): number {
  const lSpan = Math.max(table.lMax - table.lMin, 1e-6)
  const li = Math.floor(((l - table.lMin) / lSpan) * table.lBins)
  return Math.min(table.lBins - 1, Math.max(0, li))
}

function hBinOf(table: GamutTable, h: number): number {
  const hh = ((h % 360) + 360) % 360
  return Math.min(table.hBins - 1, Math.floor((hh / 360) * table.hBins))
}

/**
 * (L, h) の彩度上限。cLimit 包絡を双線形補間（h はラップアラウンド）した値と、
 * 自ビンの実測 C_max の大きい方を返す。
 * - 双線形の側: 圧縮の強さをビン境界で不連続にしないため。段差があると
 *   LUT の target が階段状になり、隣接ノードの coverage が飛ぶ。
 * - 自ビンとの max: 到達可能色に対して必ず C ≤ C_max を保証するため。
 */
export function cMaxAt(table: GamutTable, l: number, h: number): number {
  const lSpan = Math.max(table.lMax - table.lMin, 1e-6)
  const lf = Math.min(
    table.lBins - 1,
    Math.max(0, ((l - table.lMin) / lSpan) * table.lBins - 0.5),
  )
  const hh = ((h % 360) + 360) % 360
  const hf = ((hh / 360) * table.hBins - 0.5 + table.hBins) % table.hBins
  const l0 = Math.floor(lf)
  const l1 = Math.min(table.lBins - 1, l0 + 1)
  const h0 = Math.floor(hf)
  const h1 = (h0 + 1) % table.hBins
  const tl = lf - l0
  const th = hf - h0
  const v00 = table.cLimit[l0 * table.hBins + h0]
  const v01 = table.cLimit[l0 * table.hBins + h1]
  const v10 = table.cLimit[l1 * table.hBins + h0]
  const v11 = table.cLimit[l1 * table.hBins + h1]
  const interpolated =
    v00 * (1 - tl) * (1 - th) +
    v01 * (1 - tl) * th +
    v10 * tl * (1 - th) +
    v11 * tl * th
  const own = table.cMax[lBinOf(table, l) * table.hBins + hBinOf(table, h)]
  return interpolated > own ? interpolated : own
}

const clampL = (table: GamutTable, l: number) =>
  Math.min(table.lMax, Math.max(table.lMin, l))

/** 内外判定を浮動小数の丸めで落とさないための許容 */
const IN_GAMUT_EPS = 1e-6

function isInGamut(
  table: GamutTable,
  l: number,
  c: number,
  h: number,
): boolean {
  if (l < table.lMin || l > table.lMax) return false
  const idx = lBinOf(table, l) * table.hBins + hBinOf(table, h)
  if (table.occupied[idx] === 0) return false
  return (
    c >= table.cMin[idx] - IN_GAMUT_EPS && c <= table.cMax[idx] + IN_GAMUT_EPS
  )
}

/**
 * ΔE00 最小の到達可能点探索（同一色相面内。clip モード用）。
 * 色相面内の各 L ビンについて、そのビンで到達可能な [C_min, C_max] へ
 * 彩度をクランプした候補を作り、最も ΔE00 が小さいものを返す。
 */
function clipToBoundary(lab: Lab, table: GamutTable): Lab {
  const [l, c, h] = labToLch(lab)
  if (isInGamut(table, l, c, h)) return lab

  const lSpan = Math.max(table.lMax - table.lMin, 1e-6)
  const hi = hBinOf(table, h)
  let best: Lab | null = null
  let bestDe = Infinity
  for (let li = 0; li < table.lBins; li++) {
    const idx = li * table.hBins + hi
    if (table.occupied[idx] === 0) continue
    // ビンが張る L 区間へ元の L をクランプ（ビン中心へ寄せると無駄に動く）。
    // 上端はビンに含まれないので僅かに内側へ寄せ、隣のビンへ落ちないようにする。
    const lLo = table.lMin + (lSpan * li) / table.lBins
    const lHi = table.lMin + (lSpan * (li + 1)) / table.lBins - lSpan * 1e-6
    const lCand = Math.min(lHi, Math.max(lLo, l))
    const cCand = Math.min(table.cMax[idx], Math.max(table.cMin[idx], c))
    const cand: Lab = lchToLab([lCand, cCand, h])
    const de = deltaE00(lab, cand)
    if (de < bestDe) {
      bestDe = de
      best = cand
    }
  }
  // 同一色相面にビンが 1 つも無い場合は彩度を捨てて明度だけ合わせる
  return best ?? lchToLab([clampL(table, l), 0, h])
}

/** §9.2 のニー付き彩度圧縮 */
function compressChroma(
  c: number,
  cMaxV: number,
  knee: number,
  strength: number,
): number {
  if (cMaxV <= 0) return 0
  const kneeC = knee * cMaxV
  if (c <= kneeC) return c
  const range = cMaxV - kneeC
  if (range <= 0) return Math.min(c, cMaxV)
  return kneeC + range * Math.tanh((strength * (c - kneeC)) / range)
}

export function mapToGamut(
  lab: Lab,
  table: GamutTable,
  config: GamutMapConfig,
): Lab {
  switch (config.mode) {
    case 'clip':
      return clipToBoundary(lab, table)
    case 'chroma-compress': {
      const [l, c, h] = labToLch(lab)
      const lc = clampL(table, l)
      const limit = cMaxAt(table, lc, h)
      return lchToLab([
        lc,
        compressChroma(c, limit, config.knee, config.strength),
        h,
      ])
    }
    case 'lightness-first': {
      const [l, c, h] = labToLch(lab)
      const lc = clampL(table, l)
      const limit = cMaxAt(table, lc, h)
      return lchToLab([lc, Math.min(c, limit), h])
    }
  }
}
