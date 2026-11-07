import { describe, expect, it } from 'vitest'
import {
  bytesForSeconds,
  createSessionId,
  createSessionMeta,
  durationSecondsFromBytes,
  fileBaseName,
  formatBytes,
  formatDuration,
  parseSessionMeta,
  serializeSessionMeta,
  sessionState,
} from './session'

// ローカル時刻のコンストラクタで作るので、実行環境のタイムゾーンに依存しない
const CREATED = new Date(2026, 9, 20, 9, 5, 7)

describe('命名', () => {
  it('セッション ID はローカル時刻 + 4 桁の乱数で、ソート順が時系列になる', () => {
    expect(createSessionId(CREATED, () => 0)).toBe('20261020-090507-0000')
    const id = createSessionId(CREATED, () => 0.999999)
    expect(id).toMatch(/^20261020-090507-[0-9a-z]{4}$/)
    const later = createSessionId(new Date(2026, 9, 20, 10, 0, 0), () => 0)
    expect([later, id].toSorted()).toEqual([id, later])
  })

  it('書き出しのベース名は meeting-YYYYMMDD-HHmm', () => {
    expect(fileBaseName(CREATED)).toBe('meeting-20261020-0905')
  })
})

describe('meta.json の往復', () => {
  const meta = createSessionMeta({
    id: 'abc',
    createdAt: CREATED,
    sampleRate: 16000,
    micLabel: 'USB Mic',
  })

  it('作成直後は recording / 長さ 0', () => {
    expect(meta.status).toBe('recording')
    expect(meta.durationSamples).toBe(0)
    expect(meta.channels).toBe(2)
    expect(meta.channelLabels).toEqual(['マイク', '相手'])
  })

  it('serialize → parse で同じ内容に戻る', () => {
    const done = {
      ...meta,
      status: 'complete' as const,
      durationSamples: 48000,
    }
    expect(parseSessionMeta(serializeSessionMeta(done))).toEqual(done)
  })

  it('壊れた JSON・必須項目欠落・未知の version は null', () => {
    expect(parseSessionMeta('{')).toBeNull()
    expect(parseSessionMeta('[]')).toBeNull()
    expect(parseSessionMeta(JSON.stringify({ ...meta, version: 2 }))).toBeNull()
    expect(
      parseSessionMeta(JSON.stringify({ ...meta, sampleRate: 0 })),
    ).toBeNull()
    expect(
      parseSessionMeta(JSON.stringify({ ...meta, status: 'paused' })),
    ).toBeNull()
    expect(
      parseSessionMeta(JSON.stringify({ ...meta, createdAt: 'yesterday' })),
    ).toBeNull()
  })

  it('任意項目が欠けていても既定値で補う', () => {
    const parsed = parseSessionMeta(
      JSON.stringify({
        version: 1,
        id: 'x',
        createdAt: CREATED.toISOString(),
        sampleRate: 24000,
        status: 'recording',
      }),
    )
    expect(parsed).toMatchObject({
      durationSamples: 0,
      channelLabels: ['マイク', '相手'],
      updatedAt: CREATED.toISOString(),
    })
  })
})

describe('長さとサイズ', () => {
  it('ファイルサイズから秒数を出す（端数フレームは切り捨て）', () => {
    expect(durationSecondsFromBytes(16000 * 4 * 5, 16000)).toBe(5)
    expect(durationSecondsFromBytes(16000 * 4 * 5 + 3, 16000)).toBe(5)
    expect(bytesForSeconds(5, 48000)).toBe(48000 * 4 * 5)
  })

  it('状態: ロック中は録音中、recording のまま止まったものは中断', () => {
    expect(sessionState({ status: 'recording' }, true)).toBe('active')
    expect(sessionState({ status: 'recording' }, false)).toBe('interrupted')
    expect(sessionState({ status: 'complete' }, false)).toBe('complete')
  })

  it('表示用フォーマット', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65.9)).toBe('1:05')
    expect(formatDuration(3723)).toBe('1:02:03')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(200 * 1024 * 1024)).toBe('200 MB')
  })
})
