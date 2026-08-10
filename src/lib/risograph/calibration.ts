/**
 * キャリブレーション（仕様書 §7 / §8）。
 * - チャート生成（single-ink wedge / 2 色ペア 5×5 / 3 色検証）
 * - toneResponse fitting（2-primary Yule-Nielsen + 黄金分割、PAVA 単調射影）
 * - Yule-Nielsen n の交互フィット（粗探索 → 黄金分割）
 * - ホールドアウト検証統計
 */
import { deltaE00Xyz, type XYZ } from './color'
import { createForwardContext, forward } from './forward'
import type {
  InkId,
  MeasurementQuality,
  OverprintSample,
  PressProfile,
  PrintCondition,
  VirtualInk,
} from './types'

export interface ChartPatch {
  inkIds: InkId[]
  coverage: number[]
}

export const WEDGE_STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
export const PAIR_STEPS = [0.2, 0.4, 0.6, 0.8, 1.0]
const TRIPLE_PATCHES = [
  [0.5, 0.5, 0.5],
  [0.75, 0.75, 0.75],
  [0.3, 0.6, 0.9],
  [1, 1, 1],
]

/** §7.2 のチャート構成。先頭は紙白 */
export function generateChart(inkIds: InkId[]): ChartPatch[] {
  const patches: ChartPatch[] = [{ inkIds: [], coverage: [] }]
  for (const id of inkIds) {
    for (const s of WEDGE_STEPS) patches.push({ inkIds: [id], coverage: [s] })
  }
  for (let i = 0; i < inkIds.length; i++) {
    for (let j = i + 1; j < inkIds.length; j++) {
      for (const a of PAIR_STEPS) {
        for (const b of PAIR_STEPS) {
          patches.push({ inkIds: [inkIds[i], inkIds[j]], coverage: [a, b] })
        }
      }
    }
  }
  for (let i = 0; i < inkIds.length; i++) {
    for (let j = i + 1; j < inkIds.length; j++) {
      for (let k = j + 1; k < inkIds.length; k++) {
        for (const c of TRIPLE_PATCHES) {
          patches.push({
            inkIds: [inkIds[i], inkIds[j], inkIds[k]],
            coverage: [...c],
          })
        }
      }
    }
  }
  return patches
}

/** 決定的ハッシュ（サンプル index → 32bit） */
function indexHash(i: number): number {
  let h = (i + 1) * 2654435761
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * ペアサンプルの約 20% を決定的に holdout にする（§7.4）。
 * 2 色ベタ（primary として使う）は holdout にしない。
 */
export function assignHoldout(samples: OverprintSample[]): void {
  samples.forEach((s, i) => {
    const isSolidPair =
      s.inkIds.length === 2 && s.coverage.every((c) => c >= 0.999)
    s.holdout = !isSolidPair && indexHash(i) % 5 === 0
  })
}

/** pool-adjacent-violators による単調非減少射影（等重み） */
export function pava(values: readonly number[]): number[] {
  const n = values.length
  const level: number[] = []
  const weight: number[] = []
  for (let i = 0; i < n; i++) {
    let v = values[i]
    let w = 1
    while (level.length > 0 && level[level.length - 1] > v) {
      const pv = level.pop()!
      const pw = weight.pop()!
      v = (v * w + pv * pw) / (w + pw)
      w += pw
    }
    level.push(v)
    weight.push(w)
  }
  const out: number[] = []
  for (let i = 0; i < level.length; i++) {
    for (let k = 0; k < weight[i]; k++) out.push(level[i])
  }
  return out
}

/** 黄金分割による 1 変数最小化 */
export function goldenSection(
  f: (x: number) => number,
  lo: number,
  hi: number,
  iterations = 48,
): number {
  const phi = (Math.sqrt(5) - 1) / 2
  let a = lo
  let b = hi
  let c = b - phi * (b - a)
  let d = a + phi * (b - a)
  let fc = f(c)
  let fd = f(d)
  for (let i = 0; i < iterations; i++) {
    if (fc < fd) {
      b = d
      d = c
      fd = fc
      c = b - phi * (b - a)
      fc = f(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + phi * (b - a)
      fd = f(d)
    }
  }
  return (a + b) / 2
}

export interface WedgeStepMeasurement {
  coverage: number
  measured: XYZ
}

/**
 * §8.5: wedge の各段について 2-primary Yule-Nielsen モデル
 *   measured^(1/n) ≈ (1-e)·paper^(1/n) + e·solid^(1/n)
 * を ΔE00 最小化で解き、PAVA で単調化して toneResponse（11 点）を返す。
 */
export function fitToneResponse(
  paperWhite: XYZ,
  solid: XYZ,
  wedge: WedgeStepMeasurement[],
  n: number,
): number[] {
  const invN = 1 / n
  const pw = paperWhite.map((v) => Math.pow(Math.max(v, 0), invN))
  const sw = solid.map((v) => Math.pow(Math.max(v, 0), invN))
  const predict = (e: number): XYZ => [
    Math.pow((1 - e) * pw[0] + e * sw[0], n),
    Math.pow((1 - e) * pw[1] + e * sw[1], n),
    Math.pow((1 - e) * pw[2] + e * sw[2], n),
  ]

  const sorted = [...wedge].sort((a, b) => a.coverage - b.coverage)
  if (sorted.length !== WEDGE_STEPS.length) {
    throw new Error(
      `wedge must have ${WEDGE_STEPS.length} steps, got ${sorted.length}`,
    )
  }
  const points = sorted.map((step) => {
    const e = goldenSection((x) => deltaE00Xyz(predict(x), step.measured), 0, 1)
    return Math.min(1, Math.max(0, e))
  })
  return pava([0, ...points])
}

export interface CalibrationMeasurements {
  paperWhite: XYZ
  /** インクごとの wedge（100% 段がベタ実測を兼ねる） */
  wedges: Map<InkId, WedgeStepMeasurement[]>
  /** ペア実測（holdout フラグは assignHoldout 済みであること） */
  pairSamples: OverprintSample[]
  /** 3 インク検証パッチ（fitting には使わない） */
  tripleSamples: OverprintSample[]
}

export interface CalibrationResult {
  n: number
  toneResponses: Map<InkId, number[]>
  solids: Map<InkId, XYZ>
  fitStats: {
    holdoutDeltaEMean: number
    holdoutDeltaEP95: number
    threeInkDeltaEMean: number | null
  }
  warnings: string[]
}

const N_MIN = 1.0
const N_MAX = 4.0

function solidOf(wedge: WedgeStepMeasurement[]): XYZ {
  const top = wedge.reduce((a, b) => (b.coverage > a.coverage ? b : a))
  return top.measured
}

/** 評価用のミニ profile を組んで forward を回す */
function makeEvalProfile(
  meas: CalibrationMeasurements,
  toneResponses: Map<InkId, number[]>,
  n: number,
): PressProfile {
  const inks: VirtualInk[] = [...meas.wedges.entries()].map(([id, wedge]) => ({
    id,
    name: id,
    driverInput: [0, 0, 0],
    measuredSolid: solidOf(wedge),
    toneResponse: toneResponses.get(id)!,
    maxCoverage: 1,
    feasibility: 'measured',
  }))
  return {
    id: 'eval',
    createdAt: '',
    printCondition: {
      printerLabel: '',
      mediaType: '',
      quality: '',
      colorManagementMode: '',
      borderless: false,
    },
    paperLabel: '',
    paperWhite: meas.paperWhite,
    printOrder: inks.map((i) => i.id),
    inks,
    overprintSamples: meas.pairSamples,
    yuleNielsenN: n,
    totalInkLimit: inks.length,
    measurementQuality: 'synthetic',
    fitStats: {
      holdoutDeltaEMean: 0,
      holdoutDeltaEP95: 0,
      threeInkDeltaEMean: null,
    },
  }
}

function sampleDeltaE(
  profile: PressProfile,
  sample: OverprintSample,
  n: number,
): number {
  const ctx = createForwardContext(profile, sample.inkIds, n)
  const out = new Float32Array(3)
  forward(sample.coverage, ctx, out)
  return deltaE00Xyz([out[0], out[1], out[2]], sample.measured)
}

/** ペア内点（非 holdout・ベタ以外）の残差 Σ ΔE00² */
function pairResidual(meas: CalibrationMeasurements, n: number): number {
  const toneResponses = new Map<InkId, number[]>()
  for (const [id, wedge] of meas.wedges) {
    toneResponses.set(
      id,
      fitToneResponse(meas.paperWhite, solidOf(wedge), wedge, n),
    )
  }
  const profile = makeEvalProfile(meas, toneResponses, n)

  // ペアごとに context を作り直すのを避けるためグループ化
  const ctxByPair = new Map<string, ReturnType<typeof createForwardContext>>()
  const out = new Float32Array(3)
  let residual = 0
  for (const s of meas.pairSamples) {
    if (s.holdout) continue
    if (s.coverage.every((c) => c >= 0.999)) continue // primary として通過するため除外
    const key = s.inkIds.join('+')
    let ctx = ctxByPair.get(key)
    if (!ctx) {
      ctx = createForwardContext(profile, s.inkIds, n)
      ctxByPair.set(key, ctx)
    }
    forward(s.coverage, ctx, out)
    const de = deltaE00Xyz([out[0], out[1], out[2]], s.measured)
    residual += de * de
  }
  return residual
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.ceil((p / 100) * sortedAsc.length) - 1,
  )
  return sortedAsc[Math.max(0, idx)]
}

/**
 * §8.4 の交互フィット。
 * n の粗探索（61 点）→ 黄金分割の細探索 → 最終 toneResponse fitting → 検証統計。
 */
export function fitCalibration(
  meas: CalibrationMeasurements,
): CalibrationResult {
  const warnings: string[] = []

  // 粗探索
  let bestN = N_MIN
  let bestR = Infinity
  const coarse = 61
  for (let i = 0; i < coarse; i++) {
    const n = N_MIN + ((N_MAX - N_MIN) * i) / (coarse - 1)
    const r = pairResidual(meas, n)
    if (r < bestR) {
      bestR = r
      bestN = n
    }
  }
  // 細探索（粗探索の 1 グリッド幅 ±）
  const step = (N_MAX - N_MIN) / (coarse - 1)
  const lo = Math.max(N_MIN, bestN - step)
  const hi = Math.min(N_MAX, bestN + step)
  const n = goldenSection((x) => pairResidual(meas, x), lo, hi, 24)

  if (n < N_MIN + 0.02 || n > N_MAX - 0.02) {
    warnings.push(
      `Yule-Nielsen n=${n.toFixed(2)} が探索区間端に張り付いています。測定エラーの可能性があります。`,
    )
  }

  const toneResponses = new Map<InkId, number[]>()
  const solids = new Map<InkId, XYZ>()
  for (const [id, wedge] of meas.wedges) {
    const solid = solidOf(wedge)
    solids.set(id, solid)
    toneResponses.set(id, fitToneResponse(meas.paperWhite, solid, wedge, n))
  }

  const profile = makeEvalProfile(meas, toneResponses, n)

  const holdoutDeltas = meas.pairSamples
    .filter((s) => s.holdout)
    .map((s) => sampleDeltaE(profile, s, n))
    .sort((a, b) => a - b)
  const holdoutDeltaEMean =
    holdoutDeltas.length > 0
      ? holdoutDeltas.reduce((a, b) => a + b, 0) / holdoutDeltas.length
      : 0

  const tripleDeltas = meas.tripleSamples.map((s) =>
    sampleDeltaE(profile, s, n),
  )
  const threeInkDeltaEMean =
    tripleDeltas.length > 0
      ? tripleDeltas.reduce((a, b) => a + b, 0) / tripleDeltas.length
      : null

  if (threeInkDeltaEMean !== null && threeInkDeltaEMean > 8) {
    warnings.push(
      `3 インク検証 ΔE00 平均 ${threeInkDeltaEMean.toFixed(1)} > 8.0。3 色以上の primary 推定が破綻しています。インク数の削減を検討してください。`,
    )
  }

  return {
    n,
    toneResponses,
    solids,
    fitStats: {
      holdoutDeltaEMean,
      holdoutDeltaEP95: percentile(holdoutDeltas, 95),
      threeInkDeltaEMean,
    },
    warnings,
  }
}

export interface ProfileBuildInput {
  id: string
  createdAt: string
  printCondition: PrintCondition
  paperLabel: string
  printOrder: InkId[]
  inkDefs: Array<{
    id: InkId
    name: string
    driverInput: readonly [number, number, number]
    referenceColor?: XYZ
  }>
  measurements: CalibrationMeasurements
  measurementQuality: MeasurementQuality
  totalInkLimit?: number
}

/** 実測（または合成測定）から PressProfile を構築する */
export function buildPressProfile(input: ProfileBuildInput): {
  profile: PressProfile
  warnings: string[]
} {
  const result = fitCalibration(input.measurements)
  const inks: VirtualInk[] = input.inkDefs.map((def) => {
    const solid = result.solids.get(def.id)
    const tone = result.toneResponses.get(def.id)
    if (!solid || !tone) throw new Error(`No measurements for ink ${def.id}`)
    const feasibility = def.referenceColor
      ? deltaE00Xyz(def.referenceColor, solid) > 12
        ? 'out-of-gamut'
        : 'approx'
      : 'measured'
    return {
      id: def.id,
      name: def.name,
      referenceColor: def.referenceColor,
      driverInput: def.driverInput,
      measuredSolid: solid,
      toneResponse: tone,
      maxCoverage: 1,
      feasibility,
    }
  })

  const profile: PressProfile = {
    id: input.id,
    createdAt: input.createdAt,
    printCondition: input.printCondition,
    paperLabel: input.paperLabel,
    paperWhite: input.measurements.paperWhite,
    printOrder: input.printOrder,
    inks,
    overprintSamples: [
      ...input.measurements.pairSamples,
      ...input.measurements.tripleSamples.map((s) => ({ ...s, holdout: true })),
    ],
    yuleNielsenN: result.n,
    totalInkLimit: input.totalInkLimit ?? Math.min(input.inkDefs.length, 3.2),
    measurementQuality: input.measurementQuality,
    fitStats: result.fitStats,
  }
  return { profile, warnings: result.warnings }
}
