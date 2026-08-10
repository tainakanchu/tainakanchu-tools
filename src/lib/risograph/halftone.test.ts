import { describe, expect, it } from 'vitest'
import { circleSquareArea, getBlueNoiseMask, halftonePlate } from './halftone'

const RENDER_AM = { method: 'am' as const, lpi: 60, angleDeg: 15 }
const RENDER_BN = { method: 'blue-noise' as const, lpi: 60, angleDeg: 0 }

function uniformField(value: number, size: number): Float32Array {
  return new Float32Array(size * size).fill(value)
}

function mean(data: Float32Array): number {
  let sum = 0
  for (const v of data) sum += v
  return sum / data.length
}

describe('circleSquareArea', () => {
  it('端点が正しい', () => {
    expect(circleSquareArea(0)).toBe(0)
    expect(circleSquareArea(Math.SQRT1_2)).toBe(1)
    expect(circleSquareArea(1)).toBe(1)
  })

  it('r=0.5 で πr²、単調増加', () => {
    expect(circleSquareArea(0.5)).toBeCloseTo(Math.PI * 0.25, 6)
    let prev = 0
    for (let r = 0.05; r <= 0.75; r += 0.05) {
      const a = circleSquareArea(r)
      expect(a).toBeGreaterThanOrEqual(prev)
      prev = a
    }
  })
})

describe('halftonePlate (AM)', () => {
  it('coverage 0 で全点 0、1 で全点 1', () => {
    const size = 128
    const zeros = halftonePlate(
      uniformField(0, size),
      size,
      size,
      RENDER_AM,
      300,
    )
    expect(mean(zeros)).toBe(0)
    const ones = halftonePlate(
      uniformField(1, size),
      size,
      size,
      RENDER_AM,
      300,
    )
    expect(mean(ones)).toBe(1)
  })

  it('二値化後の平均が入力 coverage を近似する(不偏スクリーン)', () => {
    const size = 256
    for (const c of [0.2, 0.5, 0.8]) {
      const out = halftonePlate(
        uniformField(c, size),
        size,
        size,
        RENDER_AM,
        300,
      )
      expect(Math.abs(mean(out) - c)).toBeLessThan(0.03)
    }
  })

  it('出力は 0/1 のみ', () => {
    const size = 64
    const out = halftonePlate(
      uniformField(0.5, size),
      size,
      size,
      RENDER_AM,
      300,
    )
    for (const v of out) expect(v === 0 || v === 1).toBe(true)
  })
})

describe('halftonePlate (blue-noise)', () => {
  it('マスクは決定的で全閾値が一意', () => {
    const a = getBlueNoiseMask()
    const b = getBlueNoiseMask()
    expect(a).toBe(b) // キャッシュ
    const sorted = [...a].toSorted((x, y) => x - y)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]).toBeGreaterThan(sorted[i - 1])
    }
  })

  it('二値化後の平均が入力 coverage を近似する', () => {
    const size = 256
    for (const c of [0.25, 0.6]) {
      const out = halftonePlate(
        uniformField(c, size),
        size,
        size,
        RENDER_BN,
        300,
      )
      expect(Math.abs(mean(out) - c)).toBeLessThan(0.02)
    }
  })
})

describe('halftonePlate (none)', () => {
  it('連続値をそのままコピーする', () => {
    const src = new Float32Array([0, 0.25, 0.5, 1])
    const out = halftonePlate(
      src,
      2,
      2,
      { method: 'none', lpi: 60, angleDeg: 0 },
      300,
    )
    expect(out).toEqual(src)
    expect(out).not.toBe(src)
  })
})
