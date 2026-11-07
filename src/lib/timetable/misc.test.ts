import { describe, expect, it } from 'vitest'
import { contrastRatio, venueColor } from './colors'
import { buildFavoritesIcs } from './ics'
import { buildSampleDoc } from './sample'
import { parseFriends, parseIdList, parseLibrary } from './storage'

describe('venueColor', () => {
  it('どの色でも文字とのコントラストが 4.5 以上', () => {
    for (let i = 0; i < 30; i += 1) {
      const c = venueColor(i)
      expect(contrastRatio(c.fill, c.text)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('隣の会場と同じ色にならない', () => {
    for (let i = 0; i < 25; i += 1) {
      expect(venueColor(i).fill).not.toBe(venueColor(i + 1).fill)
    }
  })
})

describe('buildFavoritesIcs', () => {
  it('タイムゾーンを UTC に直して書き出す', () => {
    const doc = buildSampleDoc()
    const act = doc.acts.find((a) => a.title === '9m88')!
    const ics = buildFavoritesIcs(doc, new Set([act.id]), Date.UTC(2025, 0, 1))
    // 台北 14:40 = UTC 06:40
    expect(ics).toContain('DTSTART:20251129T064000Z')
    expect(ics).toContain('DTEND:20251129T073000Z')
    expect(ics).toContain('SUMMARY:9m88')
    expect(ics).toContain('LOCATION:天空舞台')
    expect(ics.split('BEGIN:VEVENT')).toHaveLength(2)
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
  })
})

describe('storage parse', () => {
  it('壊れた項目だけ捨てる', () => {
    const doc = buildSampleDoc()
    const lib = parseLibrary([
      { id: 'a', doc, savedAt: 'x' },
      { id: 'b', doc: { title: 'broken' } },
      'junk',
    ])
    expect(lib.map((e) => e.id)).toEqual(['a'])
    expect(parseIdList(['a', 'a', 1, 'b'])).toEqual(['a', 'b'])
    expect(parseFriends([{ id: 'f', actIds: ['x'] }, null])).toEqual([
      { id: 'f', name: '友達', actIds: ['x'] },
    ])
  })
})
