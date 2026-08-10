/**
 * 仮想プレスシミュレータ。
 * 実測データが無い環境向けに、もっともらしいインクジェットの挙動
 * （ドットゲイン・光学的にじみ・重ね刷りトラッピング）を合成し、
 * 実測と同じキャリブレーション経路（§8）を通して既定 PressProfile を作る。
 *
 * シミュレータの物理はフィッティング側のモデルと意図的に別式にしてある
 * （ドットゲイン形状・トラッピングは fitting モデルに存在しない）。
 * これによりキャリブレーション経路が実際に仕事をする。
 */
import { labToXyz, linearRgbToXyz, xyzToLab, xyzToLinearRgb } from './color'
import type { RGB, XYZ } from './color'
import { assignHoldout, buildPressProfile, generateChart } from './calibration'
import type {
  CalibrationMeasurements,
  WedgeStepMeasurement,
} from './calibration'
import { gaussian, mulberry32 } from './random'
import type {
  InkId,
  OverprintSample,
  PressProfile,
  PrintCondition,
} from './types'

export interface SimInkDef {
  id: InkId
  name: string
  driverInput: RGB
  referenceColor?: XYZ
}

export interface PressSimOptions {
  /** 紙白（既定はややウォームな上質紙） */
  paperWhite?: XYZ
  /** シミュレータ側の光学にじみ指数（fitting の n とは独立） */
  simN?: number
  /** ドットゲイン強度（中間調の面積率の持ち上がり） */
  dotGain?: number
  /** 2 版目以降のインク転移率（1 で完全転移） */
  trapping?: number
  /** 測定ノイズ（Lab 各成分の標準偏差） */
  noise?: number
  seed?: number
}

const DEFAULT_PAPER: RGB = [0.94, 0.925, 0.87]

interface SimContext {
  paperR: RGB
  paperWhite: XYZ
  /** インクの 3ch 透過率（driverInput 由来） */
  transmittance: Map<InkId, RGB>
  printOrder: Array<InkId>
  simN: number
  dotGain: number
  trapping: number
}

function makeSimContext(
  inks: Array<SimInkDef>,
  printOrder: Array<InkId>,
  opts: PressSimOptions,
): SimContext {
  const paperWhite = opts.paperWhite ?? linearRgbToXyz(DEFAULT_PAPER)
  const paperR = xyzToLinearRgb(paperWhite)
  const transmittance = new Map<InkId, RGB>()
  for (const ink of inks) {
    // driverInput の linear RGB を紙に対する透過率とみなす（下限で完全黒を回避）
    transmittance.set(ink.id, [
      Math.max(ink.driverInput[0], 0.004),
      Math.max(ink.driverInput[1], 0.004),
      Math.max(ink.driverInput[2], 0.004),
    ])
  }
  return {
    paperR,
    paperWhite,
    transmittance,
    printOrder,
    simN: opts.simN ?? 1.8,
    dotGain: opts.dotGain ?? 0.22,
    trapping: opts.trapping ?? 0.85,
  }
}

/** ドットゲイン: nominal → 物理面積率（単調、端点固定） */
function simEffectiveCoverage(a: number, dotGain: number): number {
  const x = Math.min(1, Math.max(0, a))
  return x + dotGain * x * (1 - x) * 2 * (1 - x * 0.4)
}

/** 1 パッチの反射色を合成する */
export function simulatePatch(
  ctx: SimContext,
  inkIds: Array<InkId>,
  coverage: Array<number>,
): XYZ {
  const n = inkIds.length
  // printOrder 内の位置（トラッピング計算用）
  const orderPos = inkIds.map((id) => ctx.printOrder.indexOf(id))
  const e = coverage.map((a) => simEffectiveCoverage(a, ctx.dotGain))

  const invSimN = 1 / ctx.simN
  const acc = [0, 0, 0]
  const size = 1 << n
  for (let mask = 0; mask < size; mask++) {
    let w = 1
    for (let i = 0; i < n; i++) {
      w *= mask & (1 << i) ? e[i] : 1 - e[i]
    }
    if (w === 0) continue
    // subset の反射率: 紙 × Π 透過率。printOrder 上で 2 層目以降は転移率が落ちる
    const members = []
    for (let i = 0; i < n; i++) if (mask & (1 << i)) members.push(i)
    members.sort((a, b) => orderPos[a] - orderPos[b])
    const r = [...ctx.paperR] as [number, number, number]
    members.forEach((i, layer) => {
      const t = ctx.transmittance.get(inkIds[i])!
      const transfer = layer === 0 ? 1 : ctx.trapping
      r[0] *= Math.pow(t[0], transfer)
      r[1] *= Math.pow(t[1], transfer)
      r[2] *= Math.pow(t[2], transfer)
    })
    acc[0] += w * Math.pow(r[0], invSimN)
    acc[1] += w * Math.pow(r[1], invSimN)
    acc[2] += w * Math.pow(r[2], invSimN)
  }
  const rgb: RGB = [
    Math.pow(acc[0], ctx.simN),
    Math.pow(acc[1], ctx.simN),
    Math.pow(acc[2], ctx.simN),
  ]
  return linearRgbToXyz(rgb)
}

/** チャート全体を合成測定する */
export function simulateMeasurements(
  inks: Array<SimInkDef>,
  printOrder: Array<InkId>,
  opts: PressSimOptions = {},
): CalibrationMeasurements {
  const ctx = makeSimContext(inks, printOrder, opts)
  const rng = mulberry32(opts.seed ?? 1)
  const noise = opts.noise ?? 0.25

  const addNoise = (xyz: XYZ): XYZ => {
    if (noise <= 0) return xyz
    const lab = xyzToLab(xyz)
    return labToXyz([
      lab[0] + gaussian(rng) * noise,
      lab[1] + gaussian(rng) * noise,
      lab[2] + gaussian(rng) * noise,
    ])
  }

  const inkIds = inks.map((i) => i.id)
  const patches = generateChart(inkIds)

  const wedges = new Map<InkId, Array<WedgeStepMeasurement>>()
  for (const id of inkIds) wedges.set(id, [])
  const pairSamples: Array<OverprintSample> = []
  const tripleSamples: Array<OverprintSample> = []

  for (const patch of patches) {
    if (patch.inkIds.length === 0) continue // 紙白は paperWhite として別途保持
    const measured = addNoise(simulatePatch(ctx, patch.inkIds, patch.coverage))
    if (patch.inkIds.length === 1) {
      wedges.get(patch.inkIds[0])!.push({
        coverage: patch.coverage[0],
        measured,
      })
    } else if (patch.inkIds.length === 2) {
      pairSamples.push({
        inkIds: patch.inkIds,
        coverage: patch.coverage,
        measured,
        holdout: false,
      })
    } else {
      tripleSamples.push({
        inkIds: patch.inkIds,
        coverage: patch.coverage,
        measured,
        holdout: true,
      })
    }
  }
  assignHoldout(pairSamples)

  return {
    paperWhite: ctx.paperWhite,
    wedges,
    pairSamples,
    tripleSamples,
  }
}

export const SYNTHETIC_PRINT_CONDITION: PrintCondition = {
  printerLabel: '仮想プレス（シミュレーション）',
  mediaType: '上質紙（シミュレーション）',
  quality: 'standard',
  colorManagementMode: 'simulated',
  borderless: false,
  notes:
    '実測ではなく仮想プレスシミュレータによる合成測定。実機で刷る場合は実測プロファイルに差し替えること。',
}

/** 合成測定から既定 PressProfile を構築する */
export function createSyntheticProfile(
  inks: Array<SimInkDef>,
  printOrder: Array<InkId>,
  opts: PressSimOptions = {},
): { profile: PressProfile; warnings: Array<string> } {
  const measurements = simulateMeasurements(inks, printOrder, opts)
  return buildPressProfile({
    id: `synthetic-${printOrder.join('-')}`,
    createdAt: '1970-01-01T00:00:00.000Z',
    printCondition: SYNTHETIC_PRINT_CONDITION,
    paperLabel: '上質紙（シミュレーション）',
    printOrder,
    inkDefs: inks,
    measurements,
    measurementQuality: 'synthetic',
  })
}
