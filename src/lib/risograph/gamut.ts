/**
 * ガモット境界推定とガモットマッピング（仕様書 §9）。
 * coverage simplex を低食い違い列でサンプリングして (L, h) → C_max 表を作り、
 * clip / chroma-compress / lightness-first の 3 モードで写像する。
 */
import { deltaE00, labToLch, lchToLab, type Lab } from './color'
import { forward, type ForwardContext } from './forward'
import { xyzToLab } from './color'
import type { GamutMapConfig } from './types'

export interface GamutTable {
  lBins: number
  hBins: number
  lMin: number
  lMax: number
  /** lBins × hBins。各ビンの最大彩度 */
  cMax: Float32Array
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
  let lMin = Infinity
  let lMax = -Infinity

  const coverage = new Float32Array(n)
  const out = new Float32Array(3)
  const labs: Lab[] = []

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
    if (c > cMax[idx]) cMax[idx] = c
  }

  // 空ビンを近傍の最大値で埋める（保守的な境界）
  for (let pass = 0; pass < L_BINS + H_BINS; pass++) {
    let changed = false
    for (let li = 0; li < L_BINS; li++) {
      for (let hi = 0; hi < H_BINS; hi++) {
        const idx = li * H_BINS + hi
        if (cMax[idx] > 0) continue
        let best = 0
        for (const [dl, dh] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const l2 = li + dl
          if (l2 < 0 || l2 >= L_BINS) continue
          const h2 = (hi + dh + H_BINS) % H_BINS
          const v = cMax[l2 * H_BINS + h2]
          if (v > best) best = v
        }
        if (best > 0) {
          cMax[idx] = best * 0.9
          changed = true
        }
      }
    }
    if (!changed) break
  }

  return { lBins: L_BINS, hBins: H_BINS, lMin, lMax, cMax }
}

/** (L, h) の C_max を双線形補間（h はラップアラウンド） */
export function cMaxAt(table: GamutTable, l: number, h: number): number {
  const lSpan = Math.max(table.lMax - table.lMin, 1e-6)
  const lf = Math.min(
    table.lBins - 1,
    Math.max(0, ((l - table.lMin) / lSpan) * table.lBins - 0.5),
  )
  const hf = ((h / 360) * table.hBins - 0.5 + table.hBins) % table.hBins
  const l0 = Math.floor(lf)
  const l1 = Math.min(table.lBins - 1, l0 + 1)
  const h0 = Math.floor(hf)
  const h1 = (h0 + 1) % table.hBins
  const tl = lf - l0
  const th = hf - h0
  const v00 = table.cMax[l0 * table.hBins + h0]
  const v01 = table.cMax[l0 * table.hBins + h1]
  const v10 = table.cMax[l1 * table.hBins + h0]
  const v11 = table.cMax[l1 * table.hBins + h1]
  return (
    v00 * (1 - tl) * (1 - th) +
    v01 * (1 - tl) * th +
    v10 * tl * (1 - th) +
    v11 * tl * th
  )
}

const clampL = (table: GamutTable, l: number) =>
  Math.min(table.lMax, Math.max(table.lMin, l))

/** ΔE00 最小の境界点探索（同一色相面内。clip モード用） */
function clipToBoundary(lab: Lab, table: GamutTable): Lab {
  const [l, c, h] = labToLch(lab)
  const lc = clampL(table, l)
  const limit = cMaxAt(table, lc, h)
  if (l === lc && c <= limit) return lab

  let best: Lab = lchToLab([lc, Math.min(c, limit), h])
  let bestDe = deltaE00(lab, best)
  const steps = 16
  for (let i = 0; i <= steps; i++) {
    const lCand = table.lMin + ((table.lMax - table.lMin) * i) / steps
    const cLimit = cMaxAt(table, lCand, h)
    const cand: Lab = lchToLab([lCand, Math.min(c, cLimit), h])
    const de = deltaE00(lab, cand)
    if (de < bestDe) {
      bestDe = de
      best = cand
    }
  }
  return best
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
