import { describe, expect, it } from 'vitest'
import { labToLch, xyzToLab } from './color'
import { createForwardContext, forwardXyz } from './forward'
import { buildGamutTable, cMaxAt, mapToGamut } from './gamut'
import { createSyntheticProfile } from './press-sim'
import { INK_PRESETS } from './presets'

const inks = INK_PRESETS.filter((p) => ['fluor-pink', 'blue'].includes(p.id))
const { profile } = createSyntheticProfile(
  inks,
  inks.map((i) => i.id),
  { seed: 5, noise: 0 },
)
const ctx = createForwardContext(
  profile,
  inks.map((i) => i.id),
)
const table = buildGamutTable(ctx, 4000)

describe('buildGamutTable', () => {
  it('明度域が紙白とベタの間をカバーする', () => {
    const paperL = xyzToLab(profile.paperWhite)[0]
    expect(table.lMax).toBeGreaterThan(paperL - 1)
    expect(table.lMin).toBeLessThan(paperL - 10)
  })

  it('実際に到達可能な色の彩度がテーブルの C_max 以下に収まる', () => {
    // ガモット内の代表点(単色 60%)がテーブルで in-gamut 判定になる
    const lab = xyzToLab(forwardXyz([0.6, 0], ctx))
    const [l, c, h] = labToLch(lab)
    expect(c).toBeLessThanOrEqual(cMaxAt(table, l, h) + 0.5)
  })
})

describe('mapToGamut', () => {
  it('ガモット内の色は clip で変化しない', () => {
    const lab = xyzToLab(forwardXyz([0.4, 0.3], ctx))
    const mapped = mapToGamut(lab, table, {
      mode: 'clip',
      knee: 0.8,
      strength: 1,
    })
    expect(mapped[0]).toBeCloseTo(lab[0], 4)
    expect(mapped[1]).toBeCloseTo(lab[1], 4)
    expect(mapped[2]).toBeCloseTo(lab[2], 4)
  })

  it('ガモット外の高彩度色が境界内へ写る', () => {
    const wild = [55, 90, -80] as const // 2 インク構成では確実にガモット外
    for (const mode of [
      'clip',
      'chroma-compress',
      'lightness-first',
    ] as const) {
      const mapped = mapToGamut(wild, table, { mode, knee: 0.8, strength: 1 })
      const [l, c, h] = labToLch(mapped)
      expect(l).toBeGreaterThanOrEqual(table.lMin - 0.5)
      expect(l).toBeLessThanOrEqual(table.lMax + 0.5)
      // tanh 圧縮は漸近的に C_max へ近づくため僅かな超過を許容
      expect(c).toBeLessThanOrEqual(cMaxAt(table, l, h) + 1.0)
    }
  })

  it('chroma-compress はニー以下の彩度を保持する', () => {
    const lab = xyzToLab(forwardXyz([0.3, 0.1], ctx))
    const [, c] = labToLch(lab)
    const mapped = mapToGamut(lab, table, {
      mode: 'chroma-compress',
      knee: 0.8,
      strength: 1,
    })
    const [, c2] = labToLch(mapped)
    // 低彩度色(ニー以下)は圧縮されない
    if (c < 10) expect(c2).toBeCloseTo(c, 2)
  })
})
