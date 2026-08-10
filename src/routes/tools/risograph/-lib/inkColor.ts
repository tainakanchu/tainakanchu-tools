/**
 * 版の coverage を「家庭用プリンタへそのまま流せる単色画像」へ着色する。
 * 紙白と仮想インクのプリンタ入力色（VirtualInk.driverInput、仕様書 §16.2）を
 * linear RGB で補間し、sRGB 8bit へエンコードする。DOM 非依存。
 */
import { linearToSrgb8 } from '../../../../lib/risograph/color'
import type { RGB } from '../../../../lib/risograph/color'

/** linear RGB の紙白（インクが乗っていない状態） */
const PAPER_WHITE: RGB = [1, 1, 1]

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * coverage 1px 分をインクの driverInput で着色した 8bit sRGB を返す。
 * v=0 で純白、v=1 で driverInput そのもの（= プリセットの hex）になる。
 */
export function inkColorAt(
  driverInput: RGB,
  coverage: number,
): [number, number, number] {
  const v = clamp01(coverage)
  return linearToSrgb8([
    PAPER_WHITE[0] + (driverInput[0] - PAPER_WHITE[0]) * v,
    PAPER_WHITE[1] + (driverInput[1] - PAPER_WHITE[1]) * v,
    PAPER_WHITE[2] + (driverInput[2] - PAPER_WHITE[2]) * v,
  ])
}

/**
 * coverage(0..1) をインク色の RGBA へ変換する（印刷データ用）。
 * out は coverage と同じピクセル数ぶんの RGBA バッファ。
 */
export function coverageToInkColor(
  coverage: Float32Array,
  driverInput: RGB,
  out: Uint8ClampedArray<ArrayBuffer>,
): void {
  for (let i = 0; i < coverage.length; i++) {
    const [r, g, b] = inkColorAt(driverInput, coverage[i])
    const o = i * 4
    out[o] = r
    out[o + 1] = g
    out[o + 2] = b
    out[o + 3] = 255
  }
}
