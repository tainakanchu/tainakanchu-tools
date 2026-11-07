/**
 * 写真を背景にしたときの読みやすさ（純粋関数）。
 *
 * 文字が乗る範囲の実際の画素（縮小した写真から取る）に幕を重ねた色で
 * コントラストを測り、
 *   1. 文字の向き（明るい文字 + 暗い幕 / 暗い文字 + 明るい幕）を、幕が薄くて済む方にする
 *   2. いちばんコントラストの低い画素でも文字が 4.5:1 に届く、最小の幕の濃さを二分探索する
 *      （SCRIM_MIN〜パレットの上限に収める）
 *   3. それでも届かなければ、文字・補助・差し色の明度を色相を保ったまま動かす
 * 幕の色はパレットの scrim（反転したときは背景の色相で作る）。
 */
import { contrastRatio, hexToRgb, luminance, mix, rgbToHex } from './color'
import { fixContrastToward, oklchToRgb, rgbToOklch } from './oklab'
import {
  CONTRAST,
  SCRIM_MAX_DEFAULT,
  SCRIM_MIN,
  darkScrimOf,
  isDarkColor,
} from './palettes'
import type { RGB } from './color'
import type { Palette } from './palettes'

/** 文字の後ろの画素。w はその位置の幕の効き（グラデーションの重み 0..1） */
export type Sample = { rgb: RGB; w: number }

/** 画素の相対輝度のばらつき（標準偏差）から、コントラストの目標に足す量 */
export function busyPenalty(samples: ReadonlyArray<Sample>): number {
  if (samples.length < 2) return 0
  const ys = samples.map((s) => luminance(s.rgb))
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length
  const sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length)
  return Math.min(2.5, Math.max(0, (sd - 0.06) * 18))
}

/** 幕を alpha で重ねたときの、いちばん低いコントラスト */
export function worstContrast(
  samples: ReadonlyArray<Sample>,
  text: RGB,
  scrim: RGB,
  alpha: number,
): number {
  let worst = Infinity
  for (const s of samples) {
    const ratio = contrastRatio(text, mix(s.rgb, scrim, alpha * s.w))
    if (ratio < worst) worst = ratio
  }
  return worst
}

/**
 * いちばんコントラストの低い画素が target に届く最小の幕の濃さ。
 * [lo, hi] に収め、hi でも届かなければ reached = false。
 */
export function minScrimAlpha(
  samples: ReadonlyArray<Sample>,
  text: RGB,
  scrim: RGB,
  target: number,
  lo: number,
  hi: number,
): { alpha: number; reached: boolean } {
  if (samples.length === 0) return { alpha: lo, reached: true }
  if (worstContrast(samples, text, scrim, lo) >= target) {
    return { alpha: lo, reached: true }
  }
  if (worstContrast(samples, text, scrim, hi) < target) {
    return { alpha: hi, reached: false }
  }
  let a = lo
  let b = hi
  for (let i = 0; i < 18; i++) {
    const mid = (a + b) / 2
    if (worstContrast(samples, text, scrim, mid) >= target) b = mid
    else a = mid
  }
  return { alpha: b, reached: true }
}

/** 幕を重ねた後で、いちばん文字に近い（＝読みにくい）画素の色 */
function worstBackground(
  samples: ReadonlyArray<Sample>,
  text: RGB,
  scrim: RGB,
  alpha: number,
): RGB {
  let worst: RGB = scrim
  let ratio = Infinity
  for (const s of samples) {
    const c = mix(s.rgb, scrim, alpha * s.w)
    const r = contrastRatio(text, c)
    if (r < ratio) {
      ratio = r
      worst = c
    }
  }
  return worst
}

export type PhotoColors = {
  fg: string
  muted: string
  accent: string
  /** 罫線（文字色を薄く） */
  rule: string
  scrim: string
  /** zone ごとの幕の濃さ */
  alphas: Array<number>
  /** パレットと逆の向き（背景色を文字に）にしたか */
  flipped: boolean
  /** 幕を上限まで濃くしても届かず、文字色を補正したか */
  adjusted: boolean
}

export type ZoneSamples = ReadonlyArray<Sample>

const scrimFor = (text: RGB, palette: Palette, flipped: boolean): RGB => {
  if (!flipped) return hexToRgb(palette.scrim)
  // 反転: 明るい文字なら背景の色相の暗い幕、暗い文字なら淡い幕
  if (isDarkColor(text)) {
    const [, C, h] = rgbToOklch(hexToRgb(palette.bg))
    return oklchToRgb([0.97, Math.min(C, 0.015), h])
  }
  return hexToRgb(darkScrimOf(palette.bg))
}

/**
 * 写真の上の文字色と幕の濃さを決める。
 * zones は幕の区域ごとの画素（写真テンプレートなら上の見出しと下の曲リスト）。
 * floor はユーザーが指定した幕の最低の濃さ。
 */
export function resolvePhotoColors(
  palette: Palette,
  zones: ReadonlyArray<ZoneSamples>,
  opts: { floor?: number; min?: number } = {},
): PhotoColors {
  const max = Math.max(opts.floor ?? 0, palette.scrimMax ?? SCRIM_MAX_DEFAULT)
  const lo = Math.min(max, Math.max(opts.min ?? SCRIM_MIN, opts.floor ?? 0))
  const target = CONTRAST.fgMin
  // 模様の細かい（明るさのばらつきが大きい）背景は、比が足りていても読みにくいので
  // 区域ごとに目標を上げる（最大 +2.5）
  const targets = zones.map((z) => target + busyPenalty(z))

  const attempt = (flipped: boolean) => {
    const text = hexToRgb(flipped ? palette.bg : palette.fg)
    const scrim = scrimFor(text, palette, flipped)
    const results = zones.map((z, i) =>
      minScrimAlpha(z, text, scrim, targets[i], lo, max),
    )
    const cost =
      results.reduce((m, r) => Math.max(m, r.alpha), 0) +
      (results.some((r) => !r.reached) ? 1 : 0)
    return { flipped, text, scrim, results, cost }
  }
  const natural = attempt(false)
  const flip = attempt(true)
  // 反転は幕がはっきり薄くなる（または届く）ときだけ。パレットの見た目を優先する
  const chosen = flip.cost < natural.cost - 0.15 ? flip : natural
  const alphas = chosen.results.map((r) => r.alpha)
  // 区域ごとの濃さを反映した画素
  const effective: Array<Sample> = zones.flatMap((z, i) =>
    z.map((s) => ({ rgb: mix(s.rgb, chosen.scrim, alphas[i] * s.w), w: 0 })),
  )
  const dir: 1 | -1 = isDarkColor(chosen.text) ? -1 : 1
  let fg = chosen.text
  let adjusted = false
  const worstFor = (color: RGB) =>
    worstBackground(effective, color, chosen.scrim, 0)
  if (
    effective.length > 0 &&
    worstContrast(effective, fg, chosen.scrim, 0) < target
  ) {
    fg = fixContrastToward(fg, worstFor(fg), target + 0.1, dir)
    adjusted = true
  }
  // 補助の文字: パレットの muted の明度関係を保ちつつ 4.5 を守る
  const mutedBase = hexToRgb(chosen.flipped ? palette.fg : palette.muted)
  let muted = chosen.flipped ? mix(fg, chosen.scrim, 0.35) : mutedBase
  if (effective.length > 0) {
    if (isDarkColor(muted) !== isDarkColor(fg))
      muted = mix(fg, chosen.scrim, 0.35)
    for (let i = 0; i < 12; i++) {
      if (worstContrast(effective, muted, chosen.scrim, 0) >= CONTRAST.muted)
        break
      muted = mix(muted, fg, 0.25)
    }
    if (worstContrast(effective, muted, chosen.scrim, 0) < CONTRAST.muted) {
      muted = fg
    }
  }
  let accent = hexToRgb(palette.accent)
  if (
    effective.length > 0 &&
    worstContrast(effective, accent, chosen.scrim, 0) < CONTRAST.accent
  ) {
    accent = fixContrastToward(accent, worstFor(accent), CONTRAST.accent, dir)
    if (worstContrast(effective, accent, chosen.scrim, 0) < CONTRAST.accent)
      accent = fg
  }
  const rule = mix(fg, chosen.scrim, 0.6)
  return {
    fg: rgbToHex(fg),
    muted: rgbToHex(muted),
    accent: rgbToHex(accent),
    rule: rgbToHex(rule),
    scrim: rgbToHex(chosen.scrim),
    alphas,
    flipped: chosen.flipped,
    adjusted,
  }
}
