import { describe, expect, it } from 'vitest'
import {
  applyLutToImage,
  buildSeparationLut,
  evaluateLut,
  sampleLut,
} from './lut'
import { createSyntheticProfile } from './press-sim'
import { INK_PRESETS } from './presets'
import { defaultSeparationConfig } from './types'

const inks = INK_PRESETS.filter((p) => ['fluor-pink', 'teal'].includes(p.id))
const { profile } = createSyntheticProfile(
  inks,
  inks.map((i) => i.id),
  { seed: 9, noise: 0 },
)
const config = defaultSeparationConfig(inks.map((i) => i.id))
const result = buildSeparationLut(profile, config)

describe('buildSeparationLut(P1 完了条件)', () => {
  it('17³ LUT を生成できる', () => {
    expect(result.lut.size).toBe(17)
    expect(result.lut.data.length).toBe(17 * 17 * 17 * 2)
  })

  it('全ノードが制約を満たす', () => {
    const { lut } = result
    const n = lut.inkCount
    for (let idx = 0; idx < lut.data.length / n; idx++) {
      let sum = 0
      for (let i = 0; i < n; i++) {
        const v = lut.data[idx * n + i]
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1 + 1e-6)
        sum += v
      }
      expect(sum).toBeLessThanOrEqual(profile.totalInkLimit + 1e-4)
    }
  })

  it('隣接ノード間の coverage L2 距離 p99 < 0.08', () => {
    const quality = evaluateLut(result)
    expect(quality.neighborL2P99).toBeLessThan(0.08)
  })

  it('ガモット内サンプルの再現 ΔE00 平均 < 3.0', () => {
    const quality = evaluateLut(result)
    expect(quality.inGamutDeltaEMean).toBeLessThan(3.0)
  })

  it('同一入力に対して bit-identical(§21.1 決定性)', () => {
    const again = buildSeparationLut(profile, config)
    expect(again.lut.data).toEqual(result.lut.data)
  })
})

describe('sampleLut / applyLutToImage', () => {
  it('紙白ピクセルの coverage はほぼ 0', () => {
    const out = new Float32Array(2)
    sampleLut(result.lut, 1, 1, 1, out)
    expect(out[0]).toBeLessThan(0.05)
    expect(out[1]).toBeLessThan(0.05)
  })

  it('画像適用でインクごとの map が返る', () => {
    const white = [255, 255, 255, 255]
    const pink = [255, 72, 176, 255] // 蛍光ピンク相当
    const rgba = new Uint8ClampedArray([...white, ...pink])
    const maps = applyLutToImage(result.lut, rgba, 2, 1)
    expect(maps.length).toBe(2)
    expect(maps[0].length).toBe(2)
    // 白ピクセルはインクほぼゼロ、ピンクピクセルはピンク版が支配的
    expect(maps[0][0] + maps[1][0]).toBeLessThan(0.1)
    expect(maps[0][1]).toBeGreaterThan(0.5)
    expect(maps[0][1]).toBeGreaterThan(maps[1][1])
  })
})
