import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXPORT_FORMAT,
  DEFAULT_EXPORT_MODE,
  EXPORT_FORMATS,
  bitrateOptions,
  defaultBitrate,
  estimateOutputBytes,
  exportFormatInfo,
  exportTargets,
  isValidMp3Bitrate,
  normalizeBitrate,
  numberedFileName,
  outputChannels,
} from './export-options'

describe('既定値', () => {
  it('既定はステレオ MP3 64kbps（NotebookLM が Ogg Opus を読めないため）', () => {
    expect(DEFAULT_EXPORT_MODE).toBe('stereo')
    expect(DEFAULT_EXPORT_FORMAT).toBe('mp3')
    expect(EXPORT_FORMATS[0].id).toBe('mp3')
    expect(defaultBitrate('mp3', outputChannels('stereo'))).toBe(64000)
    expect(exportFormatInfo('mp3')).toMatchObject({
      extension: 'mp3',
      mimeType: 'audio/mpeg',
    })
  })

  it('MP3 の候補: モノラル 32/48/64（既定 48）、ステレオ 64/96/128（既定 64）', () => {
    expect(bitrateOptions('mp3', 1)).toEqual([32000, 48000, 64000])
    expect(defaultBitrate('mp3', 1)).toBe(48000)
    expect(bitrateOptions('mp3', 2)).toEqual([64000, 96000, 128000])
    expect(normalizeBitrate('mp3', 2, 48000)).toBe(64000)
    expect(normalizeBitrate('mp3', 1, 128000)).toBe(48000)
  })

  it('MP3 の候補はすべて、録音の 16k / 24k / 48kHz で有効な組み合わせ', () => {
    for (const sampleRate of [16000, 24000, 48000]) {
      for (const channels of [1, 2] as const) {
        for (const bitrate of bitrateOptions('mp3', channels)) {
          expect(isValidMp3Bitrate(sampleRate, bitrate)).toBe(true)
        }
      }
    }
  })

  it('isValidMp3Bitrate: MPEG-2 LSF（16k / 24kHz）は 160kbps まで、48kHz は 32kbps から', () => {
    expect(isValidMp3Bitrate(16000, 160000)).toBe(true)
    expect(isValidMp3Bitrate(16000, 192000)).toBe(false)
    expect(isValidMp3Bitrate(24000, 8000)).toBe(true)
    expect(isValidMp3Bitrate(48000, 320000)).toBe(true)
    expect(isValidMp3Bitrate(48000, 24000)).toBe(false)
    expect(isValidMp3Bitrate(48000, 50000)).toBe(false)
    expect(isValidMp3Bitrate(96000, 128000)).toBe(false)
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
    expect(exportTargets('meeting-x', 'stereo', 'mp3')).toEqual([
      expect.objectContaining({
        fileName: 'meeting-x-stereo.mp3',
        channels: 2,
        source: { kind: 'stereo' },
      }),
    ])
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
    // MP3 は CBR なので 1 時間・ステレオ 64kbps で約 28.8MB
    expect(
      estimateOutputBytes({
        format: 'mp3',
        channels: 2,
        bitrate: 64000,
        seconds: 3600,
        sampleRate: 48000,
      }),
    ).toBe(28_800_000)
  })
})
