import { describe, expect, it } from 'vitest'
import { applyPaperGrain } from './paperGrain'

const WIDTH = 40
const HEIGHT = 30

/** 一様なグレーの RGBA バッファ */
function flatRgba(value: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    rgba[i * 4] = value
    rgba[i * 4 + 1] = value
    rgba[i * 4 + 2] = value
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

/** RGB の平均輝度（雑に RGB 平均で十分） */
function meanRgb(rgba: Uint8ClampedArray): number {
  let sum = 0
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    sum += rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]
  }
  return sum / (WIDTH * HEIGHT * 3)
}

describe('applyPaperGrain: 紙の質感ノイズ', () => {
  it('同じ seed なら常に同じ結果になる（Math.random を使わない）', () => {
    const a = flatRgba(180)
    const b = flatRgba(180)
    applyPaperGrain(a, WIDTH, HEIGHT, 1, 42)
    applyPaperGrain(b, WIDTH, HEIGHT, 1, 42)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('seed が違えば結果も変わる', () => {
    const a = flatRgba(180)
    const b = flatRgba(180)
    applyPaperGrain(a, WIDTH, HEIGHT, 1, 42)
    applyPaperGrain(b, WIDTH, HEIGHT, 1, 43)
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('strength 0 なら何も変えない', () => {
    const rgba = flatRgba(180)
    const before = Array.from(rgba)
    applyPaperGrain(rgba, WIDTH, HEIGHT, 0, 42)
    expect(Array.from(rgba)).toEqual(before)
  })

  it('一様な面には実際に粒が乗る', () => {
    const rgba = flatRgba(180)
    applyPaperGrain(rgba, WIDTH, HEIGHT, 1, 42)
    const values = new Set<number>()
    for (let i = 0; i < WIDTH * HEIGHT; i++) values.add(rgba[i * 4])
    expect(values.size).toBeGreaterThan(3)
  })

  it('アルファは触らない', () => {
    const rgba = flatRgba(180)
    applyPaperGrain(rgba, WIDTH, HEIGHT, 1, 42)
    for (let i = 0; i < WIDTH * HEIGHT; i++) expect(rgba[i * 4 + 3]).toBe(255)
  })

  it('平均輝度の変化は ±2% 以内に収まる', () => {
    for (const strength of [0.3, 0.6, 1]) {
      const rgba = flatRgba(180)
      const before = meanRgb(rgba)
      applyPaperGrain(rgba, WIDTH, HEIGHT, strength, 42)
      const after = meanRgb(rgba)
      expect(Math.abs(after - before) / before).toBeLessThan(0.02)
    }
  })
})
