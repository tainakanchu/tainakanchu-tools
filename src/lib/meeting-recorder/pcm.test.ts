import { describe, expect, it } from 'vitest'
import {
  BYTES_PER_FRAME,
  extractChannelInt16,
  floatToInt16,
  framesFromBytes,
  int16ArrayToFloat,
  int16ToFloat,
  interleaveToInt16,
  mixToMonoInt16,
} from './pcm'

describe('floatToInt16', () => {
  it('範囲端と 0 を正しく写す', () => {
    expect(floatToInt16(0)).toBe(0)
    expect(floatToInt16(1)).toBe(32767)
    expect(floatToInt16(-1)).toBe(-32768)
    expect(floatToInt16(0.5)).toBe(16384)
    expect(floatToInt16(-0.5)).toBe(-16384)
  })

  it('範囲外はクリップし、NaN は無音にする', () => {
    expect(floatToInt16(2)).toBe(32767)
    expect(floatToInt16(-3)).toBe(-32768)
    expect(floatToInt16(Number.NaN)).toBe(0)
    expect(floatToInt16(Infinity)).toBe(32767)
    expect(floatToInt16(-Infinity)).toBe(-32768)
  })

  it('int16ToFloat と往復しても誤差は 1LSB 未満', () => {
    for (const value of [-1, -0.731, -0.001, 0, 0.25, 0.999, 1]) {
      expect(int16ToFloat(floatToInt16(value))).toBeCloseTo(value, 4)
    }
  })
})

describe('interleaveToInt16', () => {
  it('L / R を交互に並べ、オフセット位置から書く', () => {
    const out = new Int16Array(8)
    interleaveToInt16(
      new Float32Array([0.5, -0.5]),
      new Float32Array([1, -1]),
      out,
      1,
    )
    expect(Array.from(out)).toEqual([0, 0, 16384, 32767, -16384, -32768, 0, 0])
  })

  it('右が無いときは無音で埋める', () => {
    const out = new Int16Array(4)
    interleaveToInt16(new Float32Array([1, 1]), undefined, out, 0)
    expect(Array.from(out)).toEqual([32767, 0, 32767, 0])
  })
})

describe('チャンネル分解・ミックス', () => {
  const interleaved = new Int16Array([
    100, -200, 32767, 32767, -32768, -32768, 1, 2,
  ])

  it('extractChannelInt16 で L / R を取り出せる', () => {
    expect(Array.from(extractChannelInt16(interleaved, 0))).toEqual([
      100, 32767, -32768, 1,
    ])
    expect(Array.from(extractChannelInt16(interleaved, 1))).toEqual([
      -200, 32767, -32768, 2,
    ])
  })

  it('mixToMonoInt16 は平均を取り、クリップしない', () => {
    expect(Array.from(mixToMonoInt16(interleaved))).toEqual([
      -50, 32767, -32768, 1,
    ])
  })

  it('出力先バッファを使い回せる', () => {
    const out = new Int16Array(4)
    expect(extractChannelInt16(interleaved, 0, out)).toBe(out)
    expect(mixToMonoInt16(interleaved, out)).toBe(out)
  })

  it('int16ArrayToFloat は並びを保ったまま float にする', () => {
    const floats = int16ArrayToFloat(new Int16Array([0, 32767, -32768]))
    expect(Array.from(floats)).toEqual([0, 1, -1])
  })
})

describe('framesFromBytes', () => {
  it('途中で切れた最後のフレームは捨てる', () => {
    expect(BYTES_PER_FRAME).toBe(4)
    expect(framesFromBytes(0)).toBe(0)
    expect(framesFromBytes(4)).toBe(1)
    expect(framesFromBytes(7)).toBe(1)
    expect(framesFromBytes(64003)).toBe(16000)
    expect(framesFromBytes(-1)).toBe(0)
  })
})
