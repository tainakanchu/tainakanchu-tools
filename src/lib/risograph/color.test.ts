import { describe, expect, it } from 'vitest'
import {
  D50,
  deltaE00,
  labToLch,
  labToXyz,
  lchToLab,
  linearRgbToXyz,
  linearToSrgb,
  srgbToLinear,
  xyzToLab,
  xyzToLinearRgb,
} from './color'

describe('sRGB ガンマ', () => {
  it('往復変換が恒等になる', () => {
    for (const v of [0, 0.001, 0.04, 0.2, 0.5, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6)
    }
  })
})

describe('linear sRGB ↔ XYZ (D50)', () => {
  it('白 (1,1,1) が D50 白色点に写る', () => {
    const xyz = linearRgbToXyz([1, 1, 1])
    expect(xyz[0]).toBeCloseTo(D50[0], 3)
    expect(xyz[1]).toBeCloseTo(D50[1], 3)
    expect(xyz[2]).toBeCloseTo(D50[2], 3)
  })

  it('往復変換が恒等になる', () => {
    const rgb = [0.3, 0.6, 0.1] as const
    const back = xyzToLinearRgb(linearRgbToXyz(rgb))
    expect(back[0]).toBeCloseTo(rgb[0], 4)
    expect(back[1]).toBeCloseTo(rgb[1], 4)
    expect(back[2]).toBeCloseTo(rgb[2], 4)
  })
})

describe('XYZ ↔ Lab (D50)', () => {
  it('白色点が L=100, a=b=0 になる', () => {
    const lab = xyzToLab(D50)
    expect(lab[0]).toBeCloseTo(100, 4)
    expect(lab[1]).toBeCloseTo(0, 4)
    expect(lab[2]).toBeCloseTo(0, 4)
  })

  it('往復変換が恒等になる(暗部の折れ線含む)', () => {
    for (const lab of [
      [50, 20, -30],
      [5, 2, 1],
      [95, -40, 60],
    ] as const) {
      const back = xyzToLab(labToXyz(lab))
      expect(back[0]).toBeCloseTo(lab[0], 4)
      expect(back[1]).toBeCloseTo(lab[1], 4)
      expect(back[2]).toBeCloseTo(lab[2], 4)
    }
  })

  it('LCh 往復が恒等になる', () => {
    const lab = [60, -25, 40] as const
    const back = lchToLab(labToLch(lab))
    expect(back[0]).toBeCloseTo(lab[0], 6)
    expect(back[1]).toBeCloseTo(lab[1], 6)
    expect(back[2]).toBeCloseTo(lab[2], 6)
  })
})

describe('ΔE00', () => {
  // Sharma, Wu, Dalal (2005) の公式テストデータより抜粋
  const cases: Array<
    [[number, number, number], [number, number, number], number]
  > = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [50, 3.2592, 0.335], 1.0],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ]

  it('Sharma のリファレンス値と一致する', () => {
    for (const [lab1, lab2, expected] of cases) {
      expect(deltaE00(lab1, lab2)).toBeCloseTo(expected, 3)
      // 対称性
      expect(deltaE00(lab2, lab1)).toBeCloseTo(expected, 3)
    }
  })

  it('同一色で 0 になる', () => {
    expect(deltaE00([50, 10, -10], [50, 10, -10])).toBe(0)
  })
})
