/**
 * 合成プレビュー(仕様書 §15 の CPU 実装)。
 * coverage maps(連続値または二値化済み)を版ズレ変換つきで重ね、
 * 順モデルで反射色を予測して RGBA バッファへ書く。
 * DOM 非依存(Canvas への転送は呼び出し側)。
 */
import { linearToSrgb, xyzToLinearRgb } from './color'
import { forward, type ForwardContext } from './forward'
import { samplePlate, type PlateTransformPx } from './registration'

/**
 * plates は fwd.inkIds と同順の coverage map(width×height)。
 * transforms が null の版は変換なし。out は width×height×4 の RGBA。
 */
export function renderComposite(
  plates: Float32Array[],
  width: number,
  height: number,
  transforms: Array<PlateTransformPx | null>,
  fwd: ForwardContext,
  out: Uint8ClampedArray,
): void {
  const n = plates.length
  const cov = new Float32Array(n)
  const xyz = new Float32Array(3)
  const identity = transforms.every(
    (t) =>
      t === null ||
      (t.offsetXPx === 0 && t.offsetYPx === 0 && t.rotationDeg === 0),
  )

  // sRGB 変換表(linear 0..1 を 4096 段で量子化)
  const LEVELS = 4096
  const toSrgb = new Uint8ClampedArray(LEVELS)
  for (let i = 0; i < LEVELS; i++) {
    toSrgb[i] = Math.round(linearToSrgb(i / (LEVELS - 1)) * 255)
  }
  const encode = (v: number) =>
    toSrgb[
      Math.min(LEVELS - 1, Math.max(0, Math.round(v * (LEVELS - 1))))
    ]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      for (let i = 0; i < n; i++) {
        const t = transforms[i]
        cov[i] =
          identity || t === null
            ? plates[i][idx]
            : samplePlate(plates[i], width, height, x, y, t)
      }
      forward(cov, fwd, xyz)
      const rgb = xyzToLinearRgb([xyz[0], xyz[1], xyz[2]])
      const o = idx * 4
      out[o] = encode(rgb[0])
      out[o + 1] = encode(rgb[1])
      out[o + 2] = encode(rgb[2])
      out[o + 3] = 255
    }
  }
}

/**
 * 単版ビュー: 1 インクのみの forward で紙にインクを載せた見え方を描く。
 * fwd は対象インク 1 つで作った ForwardContext を渡す。
 */
export function renderSinglePlate(
  plate: Float32Array,
  width: number,
  height: number,
  fwd: ForwardContext,
  out: Uint8ClampedArray,
): void {
  renderComposite([plate], width, height, [null], fwd, out)
}
