import { describe, expect, it } from 'vitest'
import { linearToSrgb8, xyzToLab, xyzToLinearRgb } from './color'
import { createForwardContext } from './forward'
import { buildGamutTable } from './gamut'
import { createSyntheticProfile } from './press-sim'
import { INK_PRESETS, PAPER_PRESETS, getPaperPreset } from './presets'

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')}`
}

describe('PAPER_PRESETS', () => {
  it('4 種が定義され id で引ける', () => {
    expect(PAPER_PRESETS.length).toBe(4)
    for (const id of ['white', 'cream', 'recycled', 'kraft']) {
      const p = getPaperPreset(id)
      expect(p).toBeDefined()
      expect(p!.id).toBe(id)
      expect(p!.name.length).toBeGreaterThan(0)
      expect(p!.grain).toBeGreaterThanOrEqual(0)
      expect(p!.grain).toBeLessThanOrEqual(1)
    }
    expect(getPaperPreset('none')).toBeUndefined()
  })

  it('paperWhite が hex と整合する(往復で同じ hex に戻る)', () => {
    for (const p of PAPER_PRESETS) {
      expect(toHex(linearToSrgb8(xyzToLinearRgb(p.paperWhite)))).toBe(p.hex)
    }
  })

  it('クラフト紙は白紙より暗い', () => {
    const white = getPaperPreset('white')!
    const kraft = getPaperPreset('kraft')!
    expect(kraft.paperWhite[1]).toBeLessThan(white.paperWhite[1])
  })
})

describe('createSyntheticProfile の紙指定', () => {
  const inks = INK_PRESETS.filter((p) => ['fluor-pink', 'blue'].includes(p.id))
  const inkIds = inks.map((i) => i.id)

  function profileFor(paperId: string) {
    const paper = getPaperPreset(paperId)!
    const { profile } = createSyntheticProfile(inks, inkIds, {
      seed: 5,
      noise: 0,
      paperWhite: paper.paperWhite,
      paperLabel: paper.name,
    })
    return { paper, profile }
  }

  it('paperWhite / paperLabel がプロファイルに反映される', () => {
    const { paper, profile } = profileFor('kraft')
    expect(profile.paperLabel).toBe(paper.name)
    expect(profile.paperWhite).toEqual(paper.paperWhite)
    // 紙違いは別プロファイル id になる(§3.3)
    expect(profile.id).toContain(paper.name)
    expect(profile.id).not.toBe(profileFor('white').profile.id)
  })

  it('紙を指定しなければ従来の既定を保つ', () => {
    const { profile } = createSyntheticProfile(inks, inkIds, {
      seed: 5,
      noise: 0,
    })
    expect(profile.id).toBe(`synthetic-${inkIds.join('-')}`)
    expect(profile.paperLabel).toBe('上質紙（シミュレーション）')
  })

  it('暗い紙ではガモットの明度上限が下がる', () => {
    const lMaxOf = (paperId: string) => {
      const { profile } = profileFor(paperId)
      return buildGamutTable(createForwardContext(profile, inkIds), 2000).lMax
    }
    expect(lMaxOf('kraft')).toBeLessThan(lMaxOf('white'))
  })

  it('紙白の L* がそのままガモットの明度上限付近になる', () => {
    const { paper, profile } = profileFor('cream')
    const table = buildGamutTable(createForwardContext(profile, inkIds), 2000)
    expect(table.lMax).toBeCloseTo(xyzToLab(paper.paperWhite)[0], 0)
  })
})
