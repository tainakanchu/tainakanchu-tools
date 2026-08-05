import { describe, expect, it } from 'vitest'
import { documentPresets } from './presets'

describe('documentPresets: サイズプリセット', () => {
  it('全プリセットが A4 に収まる', () => {
    for (const preset of documentPresets) {
      expect(preset.widthMm).toBeLessThanOrEqual(210)
      expect(preset.heightMm).toBeLessThanOrEqual(297)
    }
  })

  it('id がユニーク', () => {
    const ids = documentPresets.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('passport-spread の幅は passport-page のちょうど2倍・高さは同一', () => {
    const spread = documentPresets.find(
      (preset) => preset.id === 'passport-spread',
    )
    const page = documentPresets.find((preset) => preset.id === 'passport-page')
    expect(spread).toBeDefined()
    expect(page).toBeDefined()
    expect(spread?.widthMm).toBe((page?.widthMm ?? 0) * 2)
    expect(spread?.heightMm).toBe(page?.heightMm)
  })

  it('id1-card が 85.6 × 54', () => {
    const idCard = documentPresets.find((preset) => preset.id === 'id1-card')
    expect(idCard?.widthMm).toBe(85.6)
    expect(idCard?.heightMm).toBe(54)
  })
})
