/**
 * 種（seed）から決まる擬似乱数。同じ種なら同じ列になるので、書き出すたびに
 * 同じ絵になり、テストでも結果を固定できる。
 */

export type Rng = () => number

/** 0 以上 1 未満の擬似乱数を返す関数（mulberry32） */
export function mulberry32(seed: number): Rng {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
