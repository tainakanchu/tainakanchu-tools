import { describe, expect, it } from 'vitest'
import { applyDensity, densityScale } from './density'

describe('densityScale: 濃度レベル→面積率の倍率', () => {
  it('1〜5 が対応表どおりの倍率になる', () => {
    expect([1, 2, 3, 4, 5].map(densityScale)).toEqual([
      0.55, 0.8, 1.0, 1.2, 1.45,
    ])
  })

  it('範囲外はクランプする', () => {
    expect(densityScale(0)).toBe(0.55)
    expect(densityScale(-10)).toBe(0.55)
    expect(densityScale(6)).toBe(1.45)
    expect(densityScale(99)).toBe(1.45)
  })

  it('小数は近い整数レベルへ丸める', () => {
    expect(densityScale(3.4)).toBe(1.0)
    expect(densityScale(4.5)).toBe(1.45)
  })
})

describe('applyDensity: coverage への濃度適用', () => {
  it('標準の 3 は恒等（値はそのまま、入力とは別配列）', () => {
    const map = new Float32Array([0, 0.25, 0.5, 1])
    const out = applyDensity(map, 3)
    expect(Array.from(out)).toEqual([0, 0.25, 0.5, 1])
    expect(out).not.toBe(map)
  })

  it('濃度を上げると面積率が増え、1 を超えない', () => {
    const map = new Float32Array([0, 0.4, 0.8, 1])
    const out = applyDensity(map, 5)
    expect(out[0]).toBeCloseTo(0)
    expect(out[1]).toBeCloseTo(0.58)
    expect(out[2]).toBe(1)
    expect(out[3]).toBe(1)
  })

  it('濃度を下げると面積率が減り、0 を下回らない', () => {
    const map = new Float32Array([-0.5, 0, 0.5, 1])
    const out = applyDensity(map, 1)
    expect(out[0]).toBe(0)
    expect(out[1]).toBe(0)
    expect(out[2]).toBeCloseTo(0.275)
    expect(out[3]).toBeCloseTo(0.55)
  })

  it('入力配列は書き換えない', () => {
    const map = new Float32Array([0.5])
    applyDensity(map, 5)
    expect(map[0]).toBe(0.5)
  })
})
