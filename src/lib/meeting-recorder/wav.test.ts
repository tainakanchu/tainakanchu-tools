import { describe, expect, it } from 'vitest'
import { WAV_HEADER_BYTES, WAV_MAX_DATA_BYTES, createWavHeader } from './wav'

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.slice(start, start + length))

describe('createWavHeader', () => {
  it('16bit PCM の標準 44 バイトヘッダーを作る', () => {
    const header = createWavHeader({
      sampleRate: 16000,
      channels: 2,
      dataBytes: 64000,
    })
    const view = new DataView(header.buffer)
    expect(header.length).toBe(WAV_HEADER_BYTES)
    expect(ascii(header, 0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(36 + 64000)
    expect(ascii(header, 8, 4)).toBe('WAVE')
    expect(ascii(header, 12, 4)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint32(28, true)).toBe(16000 * 4)
    expect(view.getUint16(32, true)).toBe(4)
    expect(view.getUint16(34, true)).toBe(16)
    expect(ascii(header, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(64000)
  })

  it('モノラルでは block align / byte rate が半分になる', () => {
    const view = new DataView(
      createWavHeader({ sampleRate: 24000, channels: 1, dataBytes: 0 }).buffer,
    )
    expect(view.getUint32(28, true)).toBe(48000)
    expect(view.getUint16(32, true)).toBe(2)
    expect(view.getUint32(4, true)).toBe(36)
  })

  it('4GB を超える data や不正値は拒否する', () => {
    expect(() =>
      createWavHeader({
        sampleRate: 48000,
        channels: 2,
        dataBytes: WAV_MAX_DATA_BYTES + 1,
      }),
    ).toThrow(RangeError)
    expect(() =>
      createWavHeader({ sampleRate: 48000, channels: 2, dataBytes: -1 }),
    ).toThrow(RangeError)
    expect(() =>
      createWavHeader({
        sampleRate: 48000,
        channels: 2,
        dataBytes: WAV_MAX_DATA_BYTES,
      }),
    ).not.toThrow()
  })
})
