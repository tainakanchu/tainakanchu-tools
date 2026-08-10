import { describe, expect, it } from 'vitest'
import { mmToPx, randomRegistration, samplePlate } from './registration'

describe('randomRegistration', () => {
  it('seed 固定で再現可能', () => {
    expect(randomRegistration(42, 3)).toEqual(randomRegistration(42, 3))
  })

  it('§13.2 の範囲(offset 0.5–2.0mm、回転 ±0.5°)に収まる', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const errors = randomRegistration(seed, 4)
      // 1 版目は基準
      expect(errors[0]).toEqual({ offsetMm: { x: 0, y: 0 }, rotationDeg: 0 })
      for (const e of errors.slice(1)) {
        const mag = Math.hypot(e.offsetMm.x, e.offsetMm.y)
        expect(mag).toBeGreaterThanOrEqual(0.5)
        expect(mag).toBeLessThanOrEqual(2.0)
        expect(Math.abs(e.rotationDeg)).toBeLessThanOrEqual(0.5)
      }
    }
  })
})

describe('mmToPx', () => {
  it('25.4mm = 1inch が dpi ピクセルになる', () => {
    expect(mmToPx(25.4, 300)).toBe(300)
  })
})

describe('samplePlate', () => {
  const width = 4
  const height = 4
  const plate = new Float32Array(16).map((_, i) => i / 15)
  const identity = { offsetXPx: 0, offsetYPx: 0, rotationDeg: 0 }

  it('恒等変換で元の値を返す', () => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        expect(samplePlate(plate, width, height, x, y, identity)).toBeCloseTo(
          plate[y * width + x],
          6,
        )
      }
    }
  })

  it('範囲外は 0(インク無し)', () => {
    const shifted = { offsetXPx: 10, offsetYPx: 0, rotationDeg: 0 }
    expect(samplePlate(plate, width, height, 0, 0, shifted)).toBe(0)
  })
})
