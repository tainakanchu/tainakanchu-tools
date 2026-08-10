import { describe, expect, it } from 'vitest'
import {
  TWAC_SUBMISSION_WINDOW_DAYS,
  assessSubmissionWindow,
  eachIsoDateInclusive,
  formatMonthDay,
  submissionOpensOn,
  todayInTaipei,
} from './submissionWindow'

describe('submissionOpensOn', () => {
  it('公式 FAQ の例: 入国 10/7 → 開始 10/1', () => {
    // 7 日ウィンドウ(入国日含む)なら 6 日前が開始
    expect(TWAC_SUBMISSION_WINDOW_DAYS).toBe(7)
    expect(submissionOpensOn('2025-10-07')).toBe('2025-10-01')
  })

  it('月をまたいでも正しい', () => {
    expect(submissionOpensOn('2026-03-03')).toBe('2026-02-25')
  })

  it('壊れた日付は null', () => {
    expect(submissionOpensOn('')).toBe(null)
    expect(submissionOpensOn('2026-02-30')).toBe(null)
  })
})

describe('eachIsoDateInclusive', () => {
  it('両端を含む列を返す', () => {
    expect(eachIsoDateInclusive('2026-10-01', '2026-10-03')).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ])
  })

  it('1 日だけならその日だけ', () => {
    expect(eachIsoDateInclusive('2026-10-07', '2026-10-07')).toEqual([
      '2026-10-07',
    ])
  })

  it('from > to は空', () => {
    expect(eachIsoDateInclusive('2026-10-07', '2026-10-01')).toEqual([])
  })
})

describe('assessSubmissionWindow', () => {
  const entry = '2026-10-07'

  it('未入力は empty', () => {
    expect(assessSubmissionWindow('', '2026-10-01')).toEqual({ kind: 'empty' })
    expect(assessSubmissionWindow('   ', '2026-10-01')).toEqual({
      kind: 'empty',
    })
  })

  it('実在しない日付は invalid', () => {
    expect(assessSubmissionWindow('2026-02-30', '2026-10-01')).toEqual({
      kind: 'invalid',
    })
  })

  it('開始日より前は too_early', () => {
    const status = assessSubmissionWindow(entry, '2026-09-28')
    expect(status).toMatchObject({
      kind: 'too_early',
      opensOn: '2026-10-01',
      daysUntilOpen: 3,
      entryDate: entry,
    })
    if (status.kind === 'too_early') {
      expect(status.windowDays).toHaveLength(7)
      expect(status.windowDays[0]).toBe('2026-10-01')
      expect(status.windowDays.at(-1)).toBe('2026-10-07')
    }
  })

  it('開始日当日は open', () => {
    const status = assessSubmissionWindow(entry, '2026-10-01')
    expect(status).toMatchObject({
      kind: 'open',
      daysUntilEntry: 6,
      opensOn: '2026-10-01',
    })
  })

  it('入国日当日も open', () => {
    const status = assessSubmissionWindow(entry, '2026-10-07')
    expect(status).toMatchObject({
      kind: 'open',
      daysUntilEntry: 0,
    })
  })

  it('ウィンドウ中盤は open', () => {
    expect(assessSubmissionWindow(entry, '2026-10-04')).toMatchObject({
      kind: 'open',
      daysUntilEntry: 3,
    })
  })

  it('入国日の翌日は past', () => {
    expect(assessSubmissionWindow(entry, '2026-10-08')).toMatchObject({
      kind: 'past',
      entryDate: entry,
    })
  })
})

describe('todayInTaipei', () => {
  it('Asia/Taipei の暦日を返す(UTC 深夜でも台湾は翌日にならない場合がある)', () => {
    // 2026-10-01 00:30 UTC = 台湾 08:30 → 10/1
    const ms = Date.UTC(2026, 9, 1, 0, 30, 0)
    expect(todayInTaipei(ms)).toBe('2026-10-01')
  })

  it('UTC では前日でも台湾では当日になる瞬間', () => {
    // 2026-09-30 16:00 UTC = 台湾 10/1 00:00
    const ms = Date.UTC(2026, 8, 30, 16, 0, 0)
    expect(todayInTaipei(ms)).toBe('2026-10-01')
  })
})

describe('formatMonthDay', () => {
  it('先頭ゼロを落とす', () => {
    expect(formatMonthDay('2026-10-07')).toBe('10/7')
    expect(formatMonthDay('2026-03-01')).toBe('3/1')
  })
})
