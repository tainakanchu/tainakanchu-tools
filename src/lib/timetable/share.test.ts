import { describe, expect, it } from 'vitest'
import { buildShareUrl, decodeShareHash } from './share'
import { buildSampleDoc } from './sample'
import { normalizeTimetable } from './normalize'

const doc = buildSampleDoc()

describe('share', () => {
  it('往復で同じタイムテーブルに戻る', () => {
    const { url, byteLength } = buildShareUrl(
      doc,
      'https://example.com/tools/timetable?x=1#old',
    )
    expect(url.startsWith('https://example.com/tools/timetable?x=1#tt=1')).toBe(
      true,
    )
    expect(byteLength).toBeLessThan(2000)
    const decoded = decodeShareHash(new URL(url).hash)
    expect(decoded?.doc).toEqual(doc)
    expect(decoded?.favorites).toBeUndefined()
  })

  it('お気に入りと名前を載せられる', () => {
    const favIds = [doc.acts[3].id, doc.acts[10].id]
    const { url } = buildShareUrl(doc, 'https://e.com/', {
      name: 'たなか',
      actIds: favIds,
    })
    const decoded = decodeShareHash(url.slice(url.indexOf('#')))
    expect(decoded?.favorites).toEqual({ name: 'たなか', actIds: favIds })
  })

  it('AI が付けた id や重複回避の id も保たれる', () => {
    const custom = normalizeTimetable({
      title: 'x',
      timezone: 'Europe/London',
      days: [{ id: 'sat', date: '2026-11-08', label: '土' }],
      venues: [{ id: 'o-east', name: 'O-EAST', group: '道玄坂' }],
      acts: [
        {
          id: 'custom',
          dayId: 'sat',
          venueId: 'o-east',
          start: '12:00',
          title: 'A',
        },
        { dayId: 'sat', venueId: 'o-east', start: '13:00', title: 'B' },
        { dayId: 'sat', venueId: 'o-east', start: '13:00', title: 'B' },
      ],
    }).doc!
    const { url } = buildShareUrl(custom, 'https://e.com/')
    expect(decodeShareHash(url.slice(url.indexOf('#')))?.doc).toEqual(custom)
  })

  it('壊れた URL や未知のマーカーは null', () => {
    expect(decodeShareHash('#tt=9abc')).toBeNull()
    expect(decodeShareHash('#tt=1!!!!')).toBeNull()
    expect(decodeShareHash('#foo=1')).toBeNull()
    expect(decodeShareHash('')).toBeNull()
  })
})
