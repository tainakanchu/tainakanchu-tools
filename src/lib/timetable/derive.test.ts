import { describe, expect, it } from 'vitest'
import {
  buildMyTimeline,
  computeNow,
  matchesQuery,
  travelMinutes,
  upcomingFavorites,
} from './derive'
import { remapActIds } from './favorites'
import { buildSampleDoc } from './sample'
import { normalizeTimetable } from './normalize'
import { toEpochMs } from './time'

const doc = buildSampleDoc()
const idOf = (title: string, dayId = 'd1') =>
  doc.acts.find(
    (a) => a.title === title && a.dayId === dayId && a.kind !== 'signing',
  )!.id

describe('buildMyTimeline', () => {
  it('重なり・移動・間に合わないを判定する', () => {
    const favs = new Set([
      idOf('9m88'), // 天空 14:40-15:30
      idOf('庸俗救星 Vulgar Savior'), // Legacy 14:50-15:30 → 重なり
      idOf('阿肆'), // 天空 16:00-16:40
      idOf('Andr'), // Legacy 16:10-16:50 → 重なり
      idOf('YaMon Social Club 壓滿俱樂部'), // 街聲 16:20-16:50 重なり
      idOf('就以斯JOYCE feat. PIZZALI'), // 微風 16:40-17:20 → 重なり
      idOf('丹丹猫猫'), // Legacy 17:30-18:10, 微風→Legacy 6分, 空き10分 → move
      idOf('老貓偵探社'), // 街聲 17:50 → 重なり
      idOf('知更 John Stoniae'), // 微風 18:10, 街聲→微風 7分, 空き -10 → overlap
    ])
    const [day1] = buildMyTimeline(doc, favs)
    expect(day1.day.id).toBe('d1')
    const kinds = day1.items.map((i) => i.gapBefore?.kind ?? null)
    expect(kinds[0]).toBeNull()
    expect(kinds[1]).toBe('overlap')
    expect(day1.items[6].gapBefore).toMatchObject({
      kind: 'move',
      freeMinutes: 10,
      travelMinutes: 6,
    })
  })

  it('空きが移動時間より短ければ tight', () => {
    const favs = new Set([idOf('凹與山 Our Shame'), idOf('9m88')]) // 微風 14:40 終 → 天空 14:40 開始、5分移動
    const [day1] = buildMyTimeline(doc, favs)
    expect(day1.items[1].gapBefore).toMatchObject({
      kind: 'tight',
      freeMinutes: 0,
      travelMinutes: 5,
    })
  })

  it('移動時間が登録されていなければ null', () => {
    expect(travelMinutes(doc, 'sky', 'sign')).toBeNull()
    expect(travelMinutes(doc, 'legacy', 'sky')).toBe(8)
  })
})

describe('computeNow', () => {
  const tz = doc.timezone
  it('開催前は最初の日の開始を返す', () => {
    const now = computeNow(doc, toEpochMs('2025-11-28', 12 * 60, tz))
    expect(now.phase).toBe('before')
    if (now.phase === 'before') {
      expect(now.firstAct.start).toBe('13:00')
      expect(now.startsAtMs).toBe(toEpochMs('2025-11-29', 13 * 60, tz))
    }
  })

  it('開催中は各会場の今と次', () => {
    const now = computeNow(doc, toEpochMs('2025-11-29', 15 * 60 + 10, tz))
    expect(now.phase).toBe('live')
    if (now.phase !== 'live') return
    expect(now.minutes).toBe(15 * 60 + 10)
    const sky = now.playing.find((p) => p.venue.id === 'sky')!
    expect(sky.current?.title).toBe('9m88')
    expect(sky.next?.title).toBe('阿肆')
    const breeze = now.playing.find((p) => p.venue.id === 'breeze')!
    expect(breeze.current).toBeNull()
    expect(breeze.next?.title).toBe('張溢勛 Giyu Tjuljaviya')
  })

  it('日と日の間の夜は次の日の前', () => {
    const now = computeNow(doc, toEpochMs('2025-11-30', 3 * 60, tz))
    expect(now.phase).toBe('before')
    if (now.phase === 'before') expect(now.day.id).toBe('d2')
  })

  it('終了後', () => {
    expect(computeNow(doc, toEpochMs('2025-12-01', 12 * 60, tz)).phase).toBe(
      'after',
    )
  })

  it('深夜表記(25:00)はその日の続き', () => {
    const night = normalizeTimetable({
      title: 'n',
      days: ['2026-11-08'],
      venues: ['A'],
      acts: [{ venue: 'A', start: '24:00', end: '26:00', title: 'late' }],
    }).doc!
    const now = computeNow(night, toEpochMs('2026-11-09', 60, 'Asia/Tokyo'))
    expect(now.phase).toBe('live')
    if (now.phase === 'live') {
      expect(now.minutes).toBe(25 * 60)
      expect(now.playing[0].current?.title).toBe('late')
    }
  })
})

describe('upcomingFavorites', () => {
  it('終わったものを除き、進行中を示す', () => {
    const favs = new Set([idOf('凹與山 Our Shame'), idOf('9m88'), idOf('阿肆')])
    const list = upcomingFavorites(
      doc,
      favs,
      toEpochMs('2025-11-29', 15 * 60, doc.timezone),
    )
    expect(list.map((u) => [u.act.title, u.inProgress])).toEqual([
      ['9m88', true],
      ['阿肆', false],
    ])
  })
})

describe('matchesQuery', () => {
  it('全角半角・大文字小文字を無視', () => {
    const act = doc.acts.find((a) => a.title === 'YELLOW黃宣')!
    expect(matchesQuery(act, 'ｙｅｌｌｏｗ')).toBe(true)
    expect(matchesQuery(act, 'cameo')).toBe(true)
    expect(matchesQuery(act, 'zzz')).toBe(false)
  })
})

describe('remapActIds', () => {
  it('時刻が直された出演のお気に入りを名前で引き継ぐ', () => {
    const fav = idOf('9m88')
    const raw = {
      ...doc,
      acts: doc.acts.map((a) =>
        a.id === fav
          ? {
              dayId: a.dayId,
              venueId: a.venueId,
              title: a.title,
              start: '14:45',
              end: a.end,
            }
          : a,
      ),
    }
    const next = normalizeTimetable(raw).doc!
    const { ids, lost } = remapActIds(doc, next, [fav, idOf('阿肆')])
    expect(lost).toEqual([])
    expect(ids).toHaveLength(2)
    expect(
      next.acts.find((a) => a.id === ids.find((i) => i !== idOf('阿肆')))!
        .start,
    ).toBe('14:45')
  })
})
