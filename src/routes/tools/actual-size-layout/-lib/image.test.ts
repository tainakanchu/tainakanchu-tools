import { describe, expect, it } from 'vitest'
import { PRINT_DPI, fitWithin, mmToPx } from './image'

describe('mmToPx: ミリメートルからピクセルへの変換', () => {
  it('25.4mm @ 300dpi は 300px', () => {
    expect(mmToPx(25.4, 300)).toBe(300)
  })

  it('0mm は 0px', () => {
    expect(mmToPx(0)).toBe(0)
  })

  it('dpi 省略時は PRINT_DPI (300) を使う', () => {
    expect(mmToPx(25.4)).toBe(mmToPx(25.4, PRINT_DPI))
    expect(mmToPx(25.4)).toBe(300)
  })
})

describe('fitWithin: 最大サイズ内へのフィット', () => {
  it('縮小が必要なときアスペクト比を維持する', () => {
    const result = fitWithin(
      { width: 1000, height: 500 },
      { maxWidth: 200, maxHeight: 200 },
    )
    expect(result).toEqual({ width: 200, height: 100 })
  })

  it('元画像が小さいときは拡大しない', () => {
    const result = fitWithin(
      { width: 50, height: 40 },
      { maxWidth: 200, maxHeight: 200 },
    )
    expect(result).toEqual({ width: 50, height: 40 })
  })

  it('結果を整数に丸める', () => {
    const result = fitWithin(
      { width: 100, height: 33 },
      { maxWidth: 50, maxHeight: 50 },
    )
    expect(result.width).toBe(50)
    expect(result.height).toBe(17)
  })

  it('極端に小さい結果でも最小 1px を保証する', () => {
    const result = fitWithin(
      { width: 10000, height: 1 },
      { maxWidth: 1, maxHeight: 1 },
    )
    expect(result.width).toBeGreaterThanOrEqual(1)
    expect(result.height).toBeGreaterThanOrEqual(1)
  })
})
