/**
 * リソグラフ風多版分解のデータモデル（仕様書 §5 / §9 / §10 / §12）。
 * DOM 非依存。
 */
import type { RGB, XYZ } from './color'

export type InkId = string

export type Feasibility =
  | 'measured' // 実測済み
  | 'approx' // ガモット内だが reference から乖離
  | 'out-of-gamut' // 蛍光等。物理的に到達不能

export interface VirtualInk {
  id: InkId
  name: string

  /** RISO 等の参照色。表示・比較のみ。計算に使用しない */
  referenceColor?: XYZ

  /** プリンタへ送る入力色。この値と PrintCondition の組で仮想インクが定義される */
  driverInput: RGB

  /** 100% ベタの実測色 */
  measuredSolid: XYZ

  /** nominal coverage → effective coverage。長さ 11（0, 0.1, ... 1.0）。単調 */
  toneResponse: number[]

  maxCoverage: number
  feasibility: Feasibility
}

export interface PrintCondition {
  printerLabel: string
  driverLabel?: string
  driverVersion?: string

  mediaType: string
  quality: string
  colorManagementMode: string
  borderless: boolean

  /** 乾燥時間、用紙 gsm、再給紙手順など再現性に影響する事項 */
  notes?: string
}

export interface OverprintSample {
  inkIds: InkId[]
  /** inkIds に対応する nominal coverage */
  coverage: number[]
  measured: XYZ
  /** true の場合、モデル fitting から除外して検証にのみ使う */
  holdout: boolean
}

export type MeasurementQuality =
  | 'spectrophotometer'
  | 'scanner-calibrated'
  | 'visual'
  /** 仮想プレスシミュレータ由来（実測ではない） */
  | 'synthetic'

export interface PressProfile {
  id: string
  createdAt: string

  printCondition: PrintCondition

  paperLabel: string
  paperWhite: XYZ

  /** 印刷順。profile identity の一部 */
  printOrder: InkId[]

  inks: VirtualInk[]
  overprintSamples: OverprintSample[]

  yuleNielsenN: number
  totalInkLimit: number

  measurementQuality: MeasurementQuality

  /** fitting 時の検証統計。UI に表示 */
  fitStats: {
    holdoutDeltaEMean: number
    holdoutDeltaEP95: number
    /** 3 インク検証パッチの平均 ΔE00（無い場合 null） */
    threeInkDeltaEMean: number | null
  }
}

export type GamutMapMode = 'clip' | 'chroma-compress' | 'lightness-first'

export interface GamutMapConfig {
  mode: GamutMapMode
  /** chroma-compress の圧縮開始点。C_max に対する比 */
  knee: number // default 0.8
  /** 圧縮の強さ */
  strength: number // default 1.0
}

export interface SeparationConfig {
  inkIds: InkId[] // 2..5

  lambdaTotalInk: number // default 0.02
  lambdaInkCount: number // default 0.01
  lambdaSmooth: number // default 0.05

  lutSize: 17 | 33
  gamutMap: GamutMapConfig

  /** Jacobi スイープ回数（レベルごと） */
  sweeps: number // default 3
}

export const DEFAULT_GAMUT_MAP: GamutMapConfig = {
  mode: 'chroma-compress',
  knee: 0.8,
  strength: 1.0,
}

export function defaultSeparationConfig(inkIds: InkId[]): SeparationConfig {
  return {
    inkIds,
    lambdaTotalInk: 0.02,
    lambdaInkCount: 0.01,
    lambdaSmooth: 0.05,
    lutSize: 17,
    gamutMap: { ...DEFAULT_GAMUT_MAP },
    sweeps: 3,
  }
}

export interface CoverageMap {
  inkId: InkId
  width: number
  height: number
  data: Float32Array // 0..1
}

export type HalftoneMethod = 'am' | 'blue-noise' | 'none'

export interface PlateRender {
  inkId: InkId

  lpi: number // UI 40–85, default 60
  angleDeg: number

  method: HalftoneMethod

  offsetMm: { x: number; y: number }
  rotationDeg: number
}

/** 版数 → 推奨スクリーン角度（§12.4） */
export function recommendedAngles(count: number): number[] {
  if (count <= 2) return [15, 45]
  if (count === 3) return [15, 45, 75]
  return [0, 15, 45, 75, 30].slice(0, count)
}
