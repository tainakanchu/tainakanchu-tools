import { describe, expect, it } from 'vitest'
import { deltaE00Xyz } from './color'
import { createForwardContext, forwardXyz, interpTone } from './forward'
import { createSyntheticProfile } from './press-sim'
import { INK_PRESETS } from './presets'

const inks = INK_PRESETS.filter((p) => ['fluor-pink', 'teal'].includes(p.id))
const { profile } = createSyntheticProfile(
  inks,
  inks.map((i) => i.id),
  { seed: 3, noise: 0 },
)
const inkIds = inks.map((i) => i.id)

describe('interpTone', () => {
  it('区分線形補間で端点と中点を返す', () => {
    const tone = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
    expect(interpTone(tone, 0, 0)).toBe(0)
    expect(interpTone(tone, 0, 1)).toBe(1)
    expect(interpTone(tone, 0, 0.55)).toBeCloseTo(0.55, 6)
    // 範囲外はクランプ
    expect(interpTone(tone, 0, -1)).toBe(0)
    expect(interpTone(tone, 0, 2)).toBe(1)
  })
})

describe('forward', () => {
  const ctx = createForwardContext(profile, inkIds)

  it('coverage 0 で紙白を返す', () => {
    const xyz = forwardXyz([0, 0], ctx)
    expect(deltaE00Xyz(xyz, profile.paperWhite)).toBeLessThan(0.05)
  })

  it('単色 coverage 1 でベタ実測色を返す', () => {
    const xyz = forwardXyz([1, 0], ctx)
    expect(deltaE00Xyz(xyz, profile.inks[0].measuredSolid)).toBeLessThan(0.05)
  })

  it('2 色ベタで実測 overprint primary を返す', () => {
    const solidPair = profile.overprintSamples.find(
      (s) => s.inkIds.length === 2 && s.coverage.every((c) => c >= 0.999),
    )!
    const xyz = forwardXyz([1, 1], ctx)
    expect(deltaE00Xyz(xyz, solidPair.measured)).toBeLessThan(0.05)
  })

  it('同一入力で bit-identical な結果を返す', () => {
    const a = forwardXyz([0.3, 0.7], ctx)
    const b = forwardXyz([0.3, 0.7], ctx)
    expect(a).toEqual(b)
  })

  it('中間 coverage は紙白とベタの間に入る', () => {
    const mid = forwardXyz([0.5, 0], ctx)
    // Y(明度)が紙白と単色ベタの間
    expect(mid[1]).toBeLessThan(profile.paperWhite[1])
    expect(mid[1]).toBeGreaterThan(profile.inks[0].measuredSolid[1])
  })
})
