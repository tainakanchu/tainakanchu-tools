/**
 * 写真から配色を作る（純粋関数・決定的）。
 *
 * 1. 128px ほどに縮めた画素を OKLab に移し、固定シードの k-means（k=12）でまとめる
 *    （画素の平均を取ると濁るので、代表色はクラスタの中心だけを使う）
 * 2. 面積 2% 未満のクラスタは捨て、ほぼ同じ色（ΔE_ok < 0.06）はまとめる
 * 3. 面積と彩度で並べた 6〜8 色を見本（スウォッチ）にする
 * 4. 見本から役割を割り当てた候補（ダーク / ライト / ビビッド / ミュート）を作る
 *    背景は最大クラスタの色相、差し色は「彩度 × √面積」がいちばん高い色
 */
import { rgbToHex } from './color'
import {
  deltaE,
  oklabToOklch,
  oklabToRgb,
  oklchToRgb,
  rgbToOklab,
} from './oklab'
import { darkScrimOf, deriveRule, fixPalette } from './palettes'
import type { Lab, Lch } from './oklab'
import type { Palette } from './palettes'

export type Swatch = {
  hex: string
  lab: Lab
  lch: Lch
  /** 面積の割合 0..1 */
  share: number
}

export type ExtractOptions = {
  k?: number
  seed?: number
  iterations?: number
  /** これより小さいクラスタは捨てる */
  minShare?: number
  /** 返す色の上限 */
  max?: number
}

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 見本の並び順: 面積と彩度（彩度の高い小さな色も残す） */
const swatchScore = (c: { lab: Lab; share: number }) =>
  Math.sqrt(c.share) * (0.35 + oklabToOklch(c.lab)[1] * 6)

const dist2 = (a: Lab, b: Lab) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/**
 * RGBA の画素列から代表色を取り出す。透明に近い画素は数えない。
 * 同じ入力なら必ず同じ結果（乱数は固定シード）。
 */
export function extractSwatches(
  data: ArrayLike<number>,
  opts: ExtractOptions = {},
): Array<Swatch> {
  const k = opts.k ?? 12
  const iterations = opts.iterations ?? 16
  const minShare = opts.minShare ?? 0.02
  const max = opts.max ?? 8
  const rand = mulberry32(opts.seed ?? 20261103)

  const points: Array<Lab> = []
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    points.push(rgbToOklab([data[i], data[i + 1], data[i + 2]]))
  }
  if (points.length === 0) return []

  // k-means++ の初期値（固定シード）
  const centers: Array<Lab> = [points[Math.floor(rand() * points.length)]]
  const nearest = new Float64Array(points.length).fill(Infinity)
  while (centers.length < Math.min(k, points.length)) {
    const last = centers[centers.length - 1]
    let total = 0
    for (let i = 0; i < points.length; i++) {
      const d = dist2(points[i], last)
      if (d < nearest[i]) nearest[i] = d
      total += nearest[i]
    }
    if (total <= 1e-12) break
    let r = rand() * total
    let pick = points.length - 1
    for (let i = 0; i < points.length; i++) {
      r -= nearest[i]
      if (r <= 0) {
        pick = i
        break
      }
    }
    centers.push(points[pick])
  }

  const assign = new Int32Array(points.length)
  for (let iter = 0; iter < iterations; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0])
    let moved = false
    for (let i = 0; i < points.length; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(points[i], centers[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (assign[i] !== best) moved = true
      assign[i] = best
      const s = sums[best]
      s[0] += points[i][0]
      s[1] += points[i][1]
      s[2] += points[i][2]
      s[3] += 1
    }
    for (let c = 0; c < centers.length; c++) {
      const s = sums[c]
      if (s[3] > 0) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]
    }
    if (!moved && iter > 0) break
  }

  const counts = Array.from({ length: centers.length }, () => 0)
  for (let i = 0; i < points.length; i++) counts[assign[i]] += 1
  let clusters = centers
    .map((lab, i) => ({ lab, share: counts[i] / points.length }))
    .filter((c) => c.share >= minShare)
    .toSorted((a, b) => b.share - a.share)

  // ほぼ同じ色はまとめる（大きい方に面積を寄せ、中心は面積で重み付け）
  const merged: typeof clusters = []
  for (const c of clusters) {
    const twin = merged.find((m) => deltaE(m.lab, c.lab) < 0.06)
    if (twin) {
      const total = twin.share + c.share
      twin.lab = [
        (twin.lab[0] * twin.share + c.lab[0] * c.share) / total,
        (twin.lab[1] * twin.share + c.lab[1] * c.share) / total,
        (twin.lab[2] * twin.share + c.lab[2] * c.share) / total,
      ]
      twin.share = total
    } else {
      merged.push({ ...c })
    }
  }
  clusters = merged

  // 面積と彩度で並べる（彩度の高い小さな色も見本に残す）
  return clusters
    .toSorted((a, b) => swatchScore(b) - swatchScore(a))
    .slice(0, max)
    .map((c) => ({
      hex: rgbToHex(oklabToRgb(c.lab)),
      lab: c.lab,
      lch: oklabToOklch(c.lab),
      share: c.share,
    }))
}

export type CandidateId = 'dark' | 'light' | 'vivid' | 'muted'

export const CANDIDATE_LABELS: Record<CandidateId, string> = {
  dark: 'ダーク',
  light: 'ライト',
  vivid: 'ビビッド',
  muted: 'ミュート',
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

const hexOf = (lch: Lch) => rgbToHex(oklchToRgb(lch))

/** 差し色の候補: 「彩度 × √面積」の高い順（彩度 0.08 未満は差し色にしない） */
function accentRanking(swatches: ReadonlyArray<Swatch>): Array<Swatch> {
  return swatches
    .filter((s) => s.lch[1] >= 0.08)
    .toSorted(
      (a, b) => b.lch[1] * Math.sqrt(b.share) - a.lch[1] * Math.sqrt(a.share),
    )
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * 見本から配色の候補を作る。どれもコントラストの制約を満たすよう補正済み。
 * 見本が無ければ空。
 */
export function buildCandidates(
  swatches: ReadonlyArray<Swatch>,
): Array<Palette & { candidate: CandidateId }> {
  if (swatches.length === 0) return []
  const largest = swatches.reduce((a, b) => (b.share > a.share ? b : a))
  const hue = largest.lch[2]
  const ranked = accentRanking(swatches)
  const accent = ranked.at(0)
  const second = ranked.find(
    (s) => accent !== undefined && hueGap(s.lch[2], accent.lch[2]) > 40,
  )

  const make = (
    candidate: CandidateId,
    bg: Lch,
    fg: Lch,
    accentLch: Lch | undefined,
    dark: boolean,
  ): Palette & { candidate: CandidateId } => {
    const bgHex = hexOf(bg)
    const fgHex = hexOf(fg)
    const fgRgb = oklchToRgb(fg)
    const bgRgb = oklchToRgb(bg)
    // 補助の文字は文字 6 : 背景 4（足りなければ fixPalette が明度で補う）
    const muted = rgbToHex([
      fgRgb[0] * 0.6 + bgRgb[0] * 0.4,
      fgRgb[1] * 0.6 + bgRgb[1] * 0.4,
      fgRgb[2] * 0.6 + bgRgb[2] * 0.4,
    ])
    return {
      ...fixPalette({
        bg: bgHex,
        fg: fgHex,
        muted,
        accent: accentLch ? hexOf(accentLch) : fgHex,
        rule: rgbToHex(deriveRule(bgRgb, fgRgb)),
        scrim: dark ? darkScrimOf(bgHex) : bgHex,
      }),
      id: `photo-${candidate}`,
      name: `写真: ${CANDIDATE_LABELS[candidate]}`,
      candidate,
      scrimMax: dark ? 0.7 : 0.8,
    }
  }

  const darkAccent = (s: Swatch | undefined): Lch | undefined =>
    s ? [clamp(s.lch[0], 0.72, 0.82), s.lch[1], s.lch[2]] : undefined
  const lightAccent = (s: Swatch | undefined): Lch | undefined =>
    s ? [clamp(s.lch[0], 0.45, 0.55), s.lch[1], s.lch[2]] : undefined

  const out: Array<Palette & { candidate: CandidateId }> = [
    make(
      'dark',
      [clamp(largest.lch[0], 0.14, 0.2), Math.min(largest.lch[1], 0.05), hue],
      [0.95, 0.01, hue],
      darkAccent(accent),
      true,
    ),
    make(
      'light',
      [clamp(largest.lch[0], 0.93, 0.96), Math.min(largest.lch[1], 0.03), hue],
      [0.2, 0.02, hue],
      lightAccent(accent),
      false,
    ),
  ]
  if (accent) {
    // ビビッド: 差し色の色相を背景に（彩度を残す）、2 番目の色相を差し色に
    out.push(
      make(
        'vivid',
        [0.26, Math.min(accent.lch[1], 0.11), accent.lch[2]],
        [0.96, 0.01, accent.lch[2]],
        darkAccent(second) ?? [0.86, 0.06, accent.lch[2]],
        true,
      ),
    )
  }
  out.push(
    make(
      'muted',
      [clamp(largest.lch[0], 0.3, 0.36), Math.min(largest.lch[1], 0.03), hue],
      [0.94, 0.01, hue],
      accent ? [0.76, Math.min(accent.lch[1], 0.08), accent.lch[2]] : undefined,
      true,
    ),
  )
  return out
}

/**
 * 「写真から自動」に使う候補。明るい写真ならライト、それ以外はダーク。
 * 写真の明るさは見本の明度を面積で平均したもの。
 */
export function autoCandidate(swatches: ReadonlyArray<Swatch>): CandidateId {
  const total = swatches.reduce((s, w) => s + w.share, 0)
  if (total <= 0) return 'dark'
  const L = swatches.reduce((s, w) => s + w.lch[0] * w.share, 0) / total
  return L > 0.68 ? 'light' : 'dark'
}
