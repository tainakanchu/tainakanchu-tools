import { describe, expect, it } from 'vitest'
import {
  buildTwacOpenDayIcs,
  twacOpenDayGoogleCalendarUrl,
  twacOpenDayIcsFileName,
} from './submissionCalendar'
import { TWAC_OFFICIAL_URL } from './twac'

describe('twacOpenDayGoogleCalendarUrl', () => {
  it('終日イベントの TEMPLATE URL を組み立てる', () => {
    const url = twacOpenDayGoogleCalendarUrl('2026-10-01')
    expect(url).not.toBeNull()
    const parsed = new URL(url!)
    expect(parsed.origin + parsed.pathname).toBe(
      'https://calendar.google.com/calendar/render',
    )
    expect(parsed.searchParams.get('action')).toBe('TEMPLATE')
    expect(parsed.searchParams.get('text')).toContain('TWAC')
    expect(parsed.searchParams.get('dates')).toBe('20261001/20261002')
    expect(parsed.searchParams.get('details')).toContain(TWAC_OFFICIAL_URL)
  })

  it('壊れた日付は null', () => {
    expect(twacOpenDayGoogleCalendarUrl('2026-02-30')).toBe(null)
    expect(twacOpenDayGoogleCalendarUrl('')).toBe(null)
  })
})

describe('buildTwacOpenDayIcs', () => {
  it('VCALENDAR と終日 VEVENT・VALARM を持つ', () => {
    const ics = buildTwacOpenDayIcs('2026-10-01', Date.UTC(2026, 8, 1))
    expect(ics).not.toBeNull()
    const lines = ics!.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('DTSTART;VALUE=DATE:20261001')
    expect(lines).toContain('DTEND;VALUE=DATE:20261002')
    expect(lines).toContain('BEGIN:VALARM')
    expect(lines).toContain(`URL:${TWAC_OFFICIAL_URL}`)
    expect(ics!.endsWith('\r\n')).toBe(true)
  })

  it('UID が申請開始日で安定している', () => {
    const a = buildTwacOpenDayIcs('2026-10-01', 1)!
    const b = buildTwacOpenDayIcs('2026-10-01', 99999)!
    const uidA = a.split('\r\n').find((l) => l.startsWith('UID:'))
    const uidB = b.split('\r\n').find((l) => l.startsWith('UID:'))
    expect(uidA).toBe(uidB)
    expect(uidA).toContain('2026-10-01')
  })

  it('壊れた日付は null', () => {
    expect(buildTwacOpenDayIcs('bad')).toBe(null)
  })
})

describe('twacOpenDayIcsFileName', () => {
  it('日付入りのファイル名', () => {
    expect(twacOpenDayIcsFileName('2026-10-01')).toBe(
      'twac-apply-2026-10-01.ics',
    )
  })
})
