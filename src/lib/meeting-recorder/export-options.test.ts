import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXPORT_FORMAT,
  DEFAULT_EXPORT_MODE,
  bitrateOptions,
  defaultBitrate,
  estimateOutputBytes,
  exportTargets,
  normalizeBitrate,
  numberedFileName,
  outputChannels,
} from './export-options'

describe('既定値', () => {
  it('既定はステレオ Opus 64kbps', () => {
    expect(DEFAULT_EXPORT_MODE).toBe('stereo')
    expect(DEFAULT_EXPORT_FORMAT).toBe('opus')
    expect(defaultBitrate('opus', outputChannels('stereo'))).toBe(64000)
  })

  it('モノラル Opus は 24kbps が既定、ステレオ Opus は 48kbps 未満を出さない', () => {
    expect(defaultBitrate('opus', 1)).toBe(24000)
    expect(bitrateOptions('opus', 1)).toEqual([16000, 24000, 32000])
    expect(Math.min(...bitrateOptions('opus', 2))).toBe(48000)
    expect(bitrateOptions('wav', 2)).toEqual([])
  })

  it('候補外のビットレートは既定値へ寄せる', () => {
    expect(normalizeBitrate('opus', 2, 24000)).toBe(64000)
    expect(normalizeBitrate('opus', 1, 32000)).toBe(32000)
    expect(normalizeBitrate('opus', 1, 64000)).toBe(24000)
  })
})

describe('exportTargets', () => {
  it('ステレオは 1 ファイル 2ch', () => {
    expect(exportTargets('meeting-x', 'stereo', 'opus')).toEqual([
      expect.objectContaining({
        fileName: 'meeting-x-stereo.ogg',
        channels: 2,
        source: { kind: 'stereo' },
      }),
    ])
  })

  it('別ファイルは mic (L) / system (R) のモノラル 2 本', () => {
    const targets = exportTargets('meeting-x', 'separate', 'wav')
    expect(targets.map((t) => t.fileName)).toEqual([
      'meeting-x-mic.wav',
      'meeting-x-system.wav',
    ])
    expect(targets.map((t) => t.source)).toEqual([
      { kind: 'channel', channel: 0 },
      { kind: 'channel', channel: 1 },
    ])
    expect(targets.every((t) => t.channels === 1)).toBe(true)
  })

  it('ミックスは m4a でも 1 ファイル', () => {
    expect(exportTargets('m', 'mix', 'aac')).toEqual([
      expect.objectContaining({ fileName: 'm-mix.m4a', channels: 1 }),
    ])
  })
})

describe('補助', () => {
  it('numberedFileName は拡張子の前に番号を入れる', () => {
    expect(numberedFileName('a.ogg', 1)).toBe('a.ogg')
    expect(numberedFileName('a.ogg', 2)).toBe('a (2).ogg')
    expect(numberedFileName('noext', 3)).toBe('noext (3)')
  })

  it('サイズ見積もり: WAV は PCM そのまま、圧縮形式はビットレート × 秒', () => {
    expect(
      estimateOutputBytes({
        format: 'wav',
        channels: 1,
        bitrate: 0,
        seconds: 10,
        sampleRate: 16000,
      }),
    ).toBe(44 + 320000)
    expect(
      estimateOutputBytes({
        format: 'opus',
        channels: 1,
        bitrate: 24000,
        seconds: 3600,
        sampleRate: 16000,
      }),
    ).toBe(10_800_000)
  })
})
