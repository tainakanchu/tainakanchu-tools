import { describe, expect, it } from 'vitest'
import { downscaleCoverage } from './downscale'

describe('downscaleCoverage: coverage map の縮小', () => {
  it('同じ寸法ならコピーを返す', () => {
    const src = Float32Array.from([0.1, 0.2, 0.3, 0.4])
    const out = downscaleCoverage(src, 2, 2, 2, 2)
    expect(Array.from(out)).toEqual(Array.from(src))
    expect(out).not.toBe(src)
  })

  it('ブロックの平均を取る', () => {
    // 4x4 の左半分が 1.0、右半分が 0.0
    const src = new Float32Array(16)
    for (let y = 0; y < 4; y++) {
      src[y * 4] = 1
      src[y * 4 + 1] = 1
    }
    const out = downscaleCoverage(src, 4, 4, 2, 2)
    expect(Array.from(out)).toEqual([1, 0, 1, 0])
  })

  it('一様な map は縮小しても値が変わらない', () => {
    const src = new Float32Array(9 * 9).fill(0.42)
    const out = downscaleCoverage(src, 9, 9, 4, 4)
    for (const v of out) expect(v).toBeCloseTo(0.42, 6)
  })
})
