/**
 * 版設定・プレビュー寸法・書き出し名の導出。
 * DOM に触れない純ロジックだけを置き、vitest で直接検証できるようにしている。
 */
import { recommendedAngles } from '../../../../lib/risograph/types'
import { mmToPx } from '../../../../lib/risograph/registration'
import type { HalftoneMethod, InkId } from '../../../../lib/risograph/types'
import type {
  PlateTransformPx,
  RegistrationError,
} from '../../../../lib/risograph/registration'

/** 書き出しと版ズレの mm→px 換算で仮定する解像度 */
export const ASSUMED_DPI = 300

/** 分版に回す画像の最大長辺（これ以上は縮小してから分版する） */
export const SEPARATION_MAX_LONG_SIDE = 1400

/** 画面プレビュー用の最大長辺 */
export const PREVIEW_MAX_LONG_SIDE = 900

export const DEFAULT_LPI = 60
export const MIN_LPI = 40
export const MAX_LPI = 85

/** 版ズレの手動入力レンジ */
export const MAX_OFFSET_MM = 3
export const MAX_ROTATION_DEG = 1

export type PlateSetting = {
  inkId: InkId
  method: HalftoneMethod
  lpi: number
  angleDeg: number
}

/**
 * 選択インク列から版設定の初期値を作る（角度は §12.4 の推奨角）。
 * 実機リソの入稿は濃淡（グレースケール）のままが標準で、網点化は製版機側で
 * 行われるため、既定は「階調」。網点はあえて掛けるときの表現オプション。
 */
export function initialPlateSettings(
  inkIds: ReadonlyArray<InkId>,
): Array<PlateSetting> {
  const angles = recommendedAngles(inkIds.length)
  return inkIds.map((inkId, index) => ({
    inkId,
    method: 'none' as HalftoneMethod,
    lpi: DEFAULT_LPI,
    angleDeg: index < angles.length ? angles[index] : 45,
  }))
}

/**
 * インク構成が変わっても、同じインクの設定は引き継ぐ。
 * 新規インクだけ推奨角の初期値を入れる。
 */
export function reconcilePlateSettings(
  inkIds: ReadonlyArray<InkId>,
  previous: ReadonlyArray<PlateSetting>,
): Array<PlateSetting> {
  const defaults = initialPlateSettings(inkIds)
  return defaults.map((fallback) => {
    const kept = previous.find((p) => p.inkId === fallback.inkId)
    return kept ? { ...kept } : fallback
  })
}

export type FittedSize = {
  width: number
  height: number
  /** 元画像に対する縮小率 */
  scale: number
}

/** 長辺が maxLongSide 以下になるよう縮小した寸法（拡大はしない） */
export function fitLongSide(
  width: number,
  height: number,
  maxLongSide: number,
): FittedSize {
  const long = Math.max(width, height)
  const scale = long > maxLongSide ? maxLongSide / long : 1
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  return { width: w, height: h, scale: w / width }
}

/**
 * プレビュー解像度でのハーフトーン用 dpi。
 * 縮小率ぶんだけ dpi も下げないと、プレビューだけ網点が細かく見えてしまう。
 */
export function previewDpi(scale: number, dpi: number = ASSUMED_DPI): number {
  return Math.max(1, dpi * scale)
}

export type RegistrationMode = 'none' | 'random' | 'manual'

/** 版ズレ設定を、プレビュー/書き出し解像度の px 変換へ落とす */
export function toPlateTransforms(
  registrations: ReadonlyArray<RegistrationError>,
  dpi: number,
  enabled: boolean,
): Array<PlateTransformPx | null> {
  return registrations.map((reg) => {
    if (!enabled) return null
    const offsetXPx = mmToPx(reg.offsetMm.x, dpi)
    const offsetYPx = mmToPx(reg.offsetMm.y, dpi)
    if (offsetXPx === 0 && offsetYPx === 0 && reg.rotationDeg === 0) return null
    return { offsetXPx, offsetYPx, rotationDeg: reg.rotationDeg }
  })
}

/** ズレ無しの版ズレ設定（1 版目と同じ基準位置） */
export function zeroRegistrations(count: number): Array<RegistrationError> {
  return Array.from({ length: count }, () => ({
    offsetMm: { x: 0, y: 0 },
    rotationDeg: 0,
  }))
}

/** ファイル名に使えない文字を落とした basename */
export function toBaseName(fileName: string): string {
  const withoutDir = fileName.split(/[\\/]/).pop() ?? fileName
  const withoutExt = withoutDir.replace(/\.[^.]+$/, '')
  const cleaned = withoutExt.replace(/[^\w\-.぀-ヿ一-鿿]+/g, '_')
  return cleaned.length > 0 ? cleaned : 'image'
}

/** 版ごとのグレースケール PNG のファイル名（版番号は 1 始まり） */
export function plateFileName(
  baseName: string,
  index: number,
  inkId: InkId,
): string {
  return `${baseName}_plate${index + 1}_${inkId}.png`
}

/** 版ごとの単色（印刷用）PNG のファイル名（版番号は 1 始まり） */
export function colorPlateFileName(
  baseName: string,
  index: number,
  inkId: InkId,
): string {
  return `${baseName}_plate${index + 1}_${inkId}_color.png`
}

/** 合成プレビュー PNG のファイル名 */
export function compositeFileName(baseName: string, baked: boolean): string {
  return baked
    ? `${baseName}_composite_misregistered.png`
    : `${baseName}_composite.png`
}
