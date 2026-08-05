import { describe, expect, it } from 'vitest'
import {
  printableHeightMm,
  printableWidthMm,
  totalContentHeightMm,
} from './layout'

describe('totalContentHeightMm: 配置画像の合計高さ', () => {
  it('count が 0 なら 0', () => {
    expect(totalContentHeightMm({ heightMm: 125, count: 0, gapMm: 16 })).toBe(0)
  })

  it('heightMm * count + gapMm * (count - 1) で計算する', () => {
    expect(totalContentHeightMm({ heightMm: 54, count: 2, gapMm: 16 })).toBe(
      54 * 2 + 16,
    )
  })
})

describe('printableHeightMm: 印刷可能高さ', () => {
  it('A4 の高さ297mmから上下余白を差し引く', () => {
    expect(printableHeightMm(25)).toBe(297 - 25 * 2)
  })
})

describe('printableWidthMm: 印刷可能幅', () => {
  it('A4 の幅210mmから左右余白を差し引く', () => {
    expect(printableWidthMm(25)).toBe(160)
  })
})

describe('はみ出し判定: パスポート見開き', () => {
  const heightMm = 125
  const widthMm = 176
  const marginMm = 25
  const gapMm = 16

  it('2枚では既定の余白・間隔に収まらない（高さ）', () => {
    const total = totalContentHeightMm({ heightMm, count: 2, gapMm })
    expect(total).toBeGreaterThan(printableHeightMm(marginMm))
  })

  it('1枚なら収まる（高さ）', () => {
    const total = totalContentHeightMm({ heightMm, count: 1, gapMm })
    expect(total).toBeLessThanOrEqual(printableHeightMm(marginMm))
  })

  it('既定余白25mmでは幅が収まらない', () => {
    expect(widthMm).toBeGreaterThan(printableWidthMm(marginMm))
  })

  it('余白17mmなら幅が収まる', () => {
    expect(widthMm).toBeLessThanOrEqual(printableWidthMm(17))
  })
})
