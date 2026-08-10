import { describe, expect, it } from 'vitest'
import { INK_PRESETS, getInkPreset } from '../../../../lib/risograph/presets'
import { coverageToInkColor, inkColorAt } from './inkColor'

/** '#FF48B0' → [255, 72, 176] */
function hexToRgb8(hex: string): [number, number, number] {
  const v = hex.replace('#', '')
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ]
}

const pink = getInkPreset('fluor-pink')!
const blue = getInkPreset('blue')!

describe('inkColorAt: 単色版の 1px 着色', () => {
  it('coverage 0 は紙白（純白）になる', () => {
    expect(inkColorAt(pink.driverInput, 0)).toEqual([255, 255, 255])
  })

  it('coverage 1 はプリセットの hex と一致する（全プリセット）', () => {
    for (const preset of INK_PRESETS) {
      expect([preset.id, inkColorAt(preset.driverInput, 1)]).toEqual([
        preset.id,
        hexToRgb8(preset.hex),
      ])
    }
  })

  it('coverage が増えるほどインク色へ単調に近づく', () => {
    // 蛍光ピンクは G/B がインク色の方が暗いので、coverage とともに単調減少する
    const greens = [0, 0.25, 0.5, 0.75, 1].map(
      (v) => inkColorAt(pink.driverInput, v)[1],
    )
    for (let i = 1; i < greens.length; i++) {
      expect(greens[i]).toBeLessThan(greens[i - 1])
    }
    const blues = [0, 0.25, 0.5, 0.75, 1].map(
      (v) => inkColorAt(blue.driverInput, v)[2],
    )
    for (let i = 1; i < blues.length; i++) {
      expect(blues[i]).toBeLessThanOrEqual(blues[i - 1])
    }
  })

  it('範囲外の coverage は 0..1 に丸める', () => {
    expect(inkColorAt(pink.driverInput, -1)).toEqual([255, 255, 255])
    expect(inkColorAt(pink.driverInput, 2)).toEqual(hexToRgb8(pink.hex))
  })

  it('黒インクは coverage 1 で真っ黒になる', () => {
    const black = getInkPreset('black')!
    expect(inkColorAt(black.driverInput, 1)).toEqual([0, 0, 0])
  })
})

describe('coverageToInkColor: 版全体の着色', () => {
  it('各ピクセルを着色し、アルファは不透明にする', () => {
    const coverage = Float32Array.from([0, 1])
    const out = new Uint8ClampedArray(2 * 4)
    coverageToInkColor(coverage, pink.driverInput, out)

    const [r, g, b] = hexToRgb8(pink.hex)
    expect(Array.from(out)).toEqual([255, 255, 255, 255, r, g, b, 255])
  })
})
