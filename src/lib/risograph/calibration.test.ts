import { describe, expect, it } from 'vitest'
import {
  WEDGE_STEPS,
  assignHoldout,
  fitCalibration,
  fitToneResponse,
  generateChart,
  goldenSection,
  pava,
} from './calibration'
import { linearRgbToXyz } from './color'
import type { XYZ } from './color'
import { simulateMeasurements } from './press-sim'
import { INK_PRESETS } from './presets'
import type { OverprintSample } from './types'

describe('generateChart', () => {
  it('§7.2 のパッチ数と一致する(N=3: 110, N=4: 207, N=5: 341)', () => {
    expect(generateChart(['a', 'b', 'c']).length).toBe(110)
    expect(generateChart(['a', 'b', 'c', 'd']).length).toBe(207)
    expect(generateChart(['a', 'b', 'c', 'd', 'e']).length).toBe(341)
  })
})

const makeSamples = (count: number): Array<OverprintSample> =>
  Array.from({ length: count }, (_, i) => ({
    inkIds: ['a', 'b'],
    coverage: [0.2 + (i % 4) * 0.2, 0.4],
    measured: [0.5, 0.5, 0.5] as XYZ,
    holdout: false,
  }))

describe('assignHoldout', () => {
  it('決定的で、およそ 20% を holdout にする', () => {
    const s1 = makeSamples(100)
    const s2 = makeSamples(100)
    assignHoldout(s1)
    assignHoldout(s2)
    expect(s1.map((s) => s.holdout)).toEqual(s2.map((s) => s.holdout))
    const count = s1.filter((s) => s.holdout).length
    expect(count).toBeGreaterThan(10)
    expect(count).toBeLessThan(30)
  })

  it('2 色ベタ(primary)は holdout にしない', () => {
    const samples: Array<OverprintSample> = Array.from({ length: 50 }, () => ({
      inkIds: ['a', 'b'],
      coverage: [1, 1],
      measured: [0.5, 0.5, 0.5] as XYZ,
      holdout: false,
    }))
    assignHoldout(samples)
    expect(samples.every((s) => !s.holdout)).toBe(true)
  })
})

describe('pava', () => {
  it('単調列はそのまま返す', () => {
    expect(pava([0, 0.1, 0.5, 0.9, 1])).toEqual([0, 0.1, 0.5, 0.9, 1])
  })

  it('違反区間をプールして単調非減少にする', () => {
    const out = pava([0, 0.5, 0.3, 0.8])
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1])
    }
    expect(out[1]).toBeCloseTo(0.4, 6)
    expect(out[2]).toBeCloseTo(0.4, 6)
  })
})

describe('goldenSection', () => {
  it('放物線の最小点を見つける', () => {
    const x = goldenSection((v) => (v - 0.37) ** 2, 0, 1)
    expect(x).toBeCloseTo(0.37, 4)
  })
})

/** ドットゲイン形状（既知の toneResponse） */
const trueTone = (a: number) => Math.min(1, a * (1.4 - 0.4 * a))

describe('fitToneResponse', () => {
  it('既知の toneResponse を持つ合成 wedge から曲線を復元する', () => {
    const paper = linearRgbToXyz([0.95, 0.95, 0.95])
    const solid = linearRgbToXyz([0.6, 0.1, 0.2])
    const n = 2.0
    const invN = 1 / n
    const wedge = WEDGE_STEPS.map((coverage) => {
      const e = trueTone(coverage)
      const mix = (c: number) =>
        Math.pow(
          (1 - e) * Math.pow(paper[c], invN) + e * Math.pow(solid[c], invN),
          n,
        )
      const measured: XYZ = [mix(0), mix(1), mix(2)]
      return { coverage, measured }
    })
    const tone = fitToneResponse(paper, solid, wedge, n)
    expect(tone.length).toBe(11)
    expect(tone[0]).toBe(0)
    for (let i = 1; i < 11; i++) {
      expect(tone[i]).toBeGreaterThanOrEqual(tone[i - 1])
      expect(tone[i]).toBeCloseTo(trueTone(i / 10), 2)
    }
  })
})

describe('fitCalibration(P0 完了条件)', () => {
  // 仮想プレスの合成測定に対して交互フィットを回す。
  // シミュレータはフィッティングモデルと別式(トラッピング等)なので、
  // ここの闾値は §23 P0 の定量基準そのもの。
  const inks = INK_PRESETS.filter((p) =>
    ['fluor-pink', 'teal', 'yellow'].includes(p.id),
  )
  const printOrder = inks.map((i) => i.id)
  const meas = simulateMeasurements(inks, printOrder, { seed: 11 })
  const result = fitCalibration(meas)

  it('ホールドアウト ΔE00 平均 < 3.0、p95 < 6.0', () => {
    expect(result.fitStats.holdoutDeltaEMean).toBeLessThan(3.0)
    expect(result.fitStats.holdoutDeltaEP95).toBeLessThan(6.0)
  })

  it('3 インク検証 ΔE00 平均 < 8.0', () => {
    expect(result.fitStats.threeInkDeltaEMean).not.toBeNull()
    expect(result.fitStats.threeInkDeltaEMean!).toBeLessThan(8.0)
  })

  it('n が探索区間端に張り付かない', () => {
    expect(result.n).toBeGreaterThan(1.02)
    expect(result.n).toBeLessThan(3.98)
    expect(result.warnings.filter((w) => w.includes('張り付'))).toHaveLength(0)
  })

  it('toneResponse は単調非減少で 0 始まり', () => {
    for (const tone of result.toneResponses.values()) {
      expect(tone[0]).toBe(0)
      for (let i = 1; i < tone.length; i++) {
        expect(tone[i]).toBeGreaterThanOrEqual(tone[i - 1])
      }
    }
  })
})
