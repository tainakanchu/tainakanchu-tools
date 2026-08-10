/**
 * 紙の質感（グレイン）をプレビュー画像へ乗せる。
 * 実物の紙が持つ粗さは書き出しデータに焼き込むものではないので、
 * ここは「画面で見えを近づける」ためだけの後処理。
 * 座標ハッシュによる決定的な値ノイズで、同じ seed なら常に同じ結果になる。
 */

/** 合成プレビューで使う既定 seed（紙を変えても模様が暴れないよう固定） */
export const PAPER_GRAIN_SEED = 20240607

/** strength=1 のときの最大振れ幅（±5%） */
const MAX_AMPLITUDE = 0.05

/** 座標と seed から 0..1 の決定的な値を作る（Math.random は使わない） */
function hash01(x: number, y: number, seed: number): number {
  let h = Math.imul(x + 1, 0x27d4eb2d)
  h ^= Math.imul(y + 1, 0x165667b1)
  h ^= Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * RGBA バッファの RGB を 1 ± MAX_AMPLITUDE×strength で画素ごとに乗算する（破壊的）。
 * ノイズは平均 0 なので、全体の明るさはほとんど変えない。strength が 0 以下なら何もしない。
 */
export function applyPaperGrain(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
  seed: number,
): void {
  if (!(strength > 0)) return
  const amp = MAX_AMPLITUDE * Math.min(1, strength)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // -1..1 の値ノイズ。中央 0 なので明るさの平均は保たれる
      const noise = hash01(x, y, seed) * 2 - 1
      const factor = 1 + noise * amp
      const o = (y * width + x) * 4
      // Uint8ClampedArray への代入で 0..255 の丸めとクランプが効く
      rgba[o] = rgba[o] * factor
      rgba[o + 1] = rgba[o + 1] * factor
      rgba[o + 2] = rgba[o + 2] * factor
    }
  }
}
