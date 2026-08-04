import { describe, expect, it } from 'vitest'
import { makeAllDayStamp, makeStamp, stampToEpoch } from './datetime'
import {
  DEADLINE_SOON_MS,
  MILESTONE_LABELS,
  deriveMilestones,
  isCheckInOpen,
  isDeadlineMilestone,
} from './milestones'
import type { MilestoneKind } from './milestones'
import type { Booking } from './types'

const TOKYO = 'Asia/Tokyo'
const PARIS = 'Europe/Paris'

type BookingInit = Partial<Booking> &
  Pick<Booking, 'id' | 'kind' | 'title' | 'start'>

function booking(init: BookingInit): Booking {
  return { end: null, status: 'confirmed', payment: 'unpaid', ...init }
}

/** 現地時刻の Stamp */
const at = makeStamp
/** 終日の Stamp */
const allDay = makeAllDayStamp

describe('deriveMilestones', () => {
  describe('締切(移動の予約)', () => {
    it('締切が両方入った飛行機からは、手荷物締切→搭乗手続き締切→出発→到着の順に4つ出る', () => {
      const start = at('2026-09-12', '14:20', TOKYO)
      const end = at('2026-09-12', '20:05', PARIS)
      const flight = booking({
        id: 'af276',
        kind: 'flight',
        title: 'AF276 HND→CDG',
        start,
        end,
        bagDropClosesMinutesBefore: 60,
        checkInClosesMinutesBefore: 45,
      })
      const now = stampToEpoch(at('2026-09-12', '10:00', TOKYO))
      const milestones = deriveMilestones([flight], now)

      expect(milestones.map((m) => m.kind)).toEqual([
        'bagDrop',
        'checkIn',
        'departure',
        'arrival',
      ])

      // 「出発 - 分数」になっていること
      const startMs = stampToEpoch(start)
      expect(milestones[0].atMs).toBe(startMs - 60 * 60_000)
      expect(milestones[1].atMs).toBe(startMs - 45 * 60_000)
      expect(milestones[2].atMs).toBe(startMs)
      expect(milestones[3].atMs).toBe(stampToEpoch(end))
    })

    it('締切の分数が無い予約からは締切のマイルストーンが作られない(出発と到着だけ)', () => {
      const start = at('2026-09-12', '14:20', TOKYO)
      const end = at('2026-09-12', '20:05', PARIS)
      const flight = booking({
        id: 'af276',
        kind: 'flight',
        title: 'AF276 HND→CDG',
        start,
        end,
      })
      const now = stampToEpoch(at('2026-09-12', '10:00', TOKYO))
      expect(deriveMilestones([flight], now).map((m) => m.kind)).toEqual([
        'departure',
        'arrival',
      ])
    })

    it('bagDrop だけ入っていれば bagDrop だけ作られる(checkIn は作られない)', () => {
      const start = at('2026-09-12', '14:20', TOKYO)
      const flight = booking({
        id: 'af276',
        kind: 'flight',
        title: 'AF276',
        start,
        bagDropClosesMinutesBefore: 60,
      })
      const now = stampToEpoch(at('2026-09-12', '10:00', TOKYO))
      expect(deriveMilestones([flight], now).map((m) => m.kind)).toEqual([
        'bagDrop',
        'departure',
      ])
    })

    it('checkIn だけ入っていれば checkIn だけ作られる(bagDrop は作られない)', () => {
      const start = at('2026-09-12', '14:20', TOKYO)
      const flight = booking({
        id: 'af276',
        kind: 'flight',
        title: 'AF276',
        start,
        checkInClosesMinutesBefore: 45,
      })
      const now = stampToEpoch(at('2026-09-12', '10:00', TOKYO))
      expect(deriveMilestones([flight], now).map((m) => m.kind)).toEqual([
        'checkIn',
        'departure',
      ])
    })

    it('過ぎたマイルストーンは出ない(手荷物締切だけ過ぎていれば、搭乗手続き・出発・到着だけが残る)', () => {
      const start = at('2026-09-12', '14:20', TOKYO)
      const end = at('2026-09-12', '20:05', PARIS)
      const flight = booking({
        id: 'af276',
        kind: 'flight',
        title: 'AF276',
        start,
        end,
        bagDropClosesMinutesBefore: 60, // 13:20 締切
        checkInClosesMinutesBefore: 45, // 13:35 締切
      })
      // 13:20(bagDrop)は過ぎたが、13:35(checkIn)はまだ
      const now = stampToEpoch(at('2026-09-12', '13:30', TOKYO))
      expect(deriveMilestones([flight], now).map((m) => m.kind)).toEqual([
        'checkIn',
        'departure',
        'arrival',
      ])
    })

    it('ちょうどその瞬間は過ぎた扱いになる(atMs === nowMs のものは出ない)', () => {
      const start = at('2026-09-12', '14:20', TOKYO)
      const flight = booking({
        id: 'af276',
        kind: 'flight',
        title: 'AF276',
        start,
        checkInClosesMinutesBefore: 45,
      })
      const deadlineMs = stampToEpoch(start) - 45 * 60_000
      // now を締切ちょうどに合わせる。findCurrentAndNext の境界の向きに揃えて
      // 「ちょうどその瞬間」は既に過ぎた側として扱う
      const milestones = deriveMilestones([flight], deadlineMs)
      expect(milestones.map((m) => m.kind)).toEqual(['departure'])
    })
  })

  describe('終日・キャンセル・進行中', () => {
    it('終日の予定からは何も作られない(締切が入っていても、終了時刻からも作られない)', () => {
      const flight = booking({
        id: 'allday-flight',
        kind: 'flight',
        title: '終日表記の便',
        start: allDay('2026-09-12', TOKYO),
        end: allDay('2026-09-14', TOKYO),
        bagDropClosesMinutesBefore: 60,
        checkInClosesMinutesBefore: 45,
      })
      const now = stampToEpoch(at('2026-09-11', '00:00', TOKYO))
      expect(deriveMilestones([flight], now)).toEqual([])
    })

    it('キャンセル済みの予約からは何も作られない', () => {
      const flight = booking({
        id: 'af276',
        kind: 'flight',
        title: 'AF276',
        start: at('2026-09-12', '14:20', TOKYO),
        status: 'cancelled',
        checkInClosesMinutesBefore: 45,
      })
      const now = stampToEpoch(at('2026-09-12', '10:00', TOKYO))
      expect(deriveMilestones([flight], now)).toEqual([])
    })

    it('進行中の予約(start <= now < end)からは1つも作られない(進行中カードとの二重表示を避ける)', () => {
      const hotel = booking({
        id: 'hotel',
        kind: 'lodging',
        title: 'ホテル',
        start: at('2026-06-12', '15:00', PARIS),
        end: at('2026-06-14', '10:00', PARIS),
      })
      const now = stampToEpoch(at('2026-06-13', '09:00', PARIS))
      expect(deriveMilestones([hotel], now)).toEqual([])
    })
  })

  describe('宿泊', () => {
    it('宿泊からは チェックイン開始 と チェックアウト が出る', () => {
      const start = at('2026-09-10', '15:00', PARIS)
      const end = at('2026-09-13', '11:00', PARIS)
      const hotel = booking({
        id: 'hotel',
        kind: 'lodging',
        title: 'ホテル',
        start,
        end,
      })
      const now = stampToEpoch(at('2026-09-01', '00:00', PARIS))
      const milestones = deriveMilestones([hotel], now)
      expect(milestones.map((m) => m.kind)).toEqual([
        'lodgingCheckIn',
        'lodgingCheckOut',
      ])
      expect(milestones[0].atMs).toBe(stampToEpoch(start))
      expect(milestones[1].atMs).toBe(stampToEpoch(end))
    })
  })

  describe('移動でない予約の締切', () => {
    it('activity に締切の分数が入っていても締切は作られない', () => {
      const activity = booking({
        id: 'act',
        kind: 'activity',
        title: '観光',
        start: at('2026-09-12', '10:00', PARIS),
        checkInClosesMinutesBefore: 30,
        bagDropClosesMinutesBefore: 30,
      })
      const now = stampToEpoch(at('2026-09-01', '00:00', PARIS))
      expect(deriveMilestones([activity], now).map((m) => m.kind)).toEqual([
        'start',
      ])
    })

    it('lodging に締切の分数が入っていても締切は作られない', () => {
      const hotel = booking({
        id: 'hotel',
        kind: 'lodging',
        title: 'ホテル',
        start: at('2026-09-10', '15:00', PARIS),
        end: at('2026-09-13', '11:00', PARIS),
        checkInClosesMinutesBefore: 30,
        bagDropClosesMinutesBefore: 30,
      })
      const now = stampToEpoch(at('2026-09-01', '00:00', PARIS))
      expect(deriveMilestones([hotel], now).map((m) => m.kind)).toEqual([
        'lodgingCheckIn',
        'lodgingCheckOut',
      ])
    })
  })

  describe('複数予約の並び順', () => {
    it('タイムゾーンが違う予約が混ざっても絶対時刻の近い順に並ぶ', () => {
      // パリ 9/12 23:00 = UTC 9/12 21:00、東京 9/13 07:00 = UTC 9/12 22:00
      // なのでパリ発のほうが絶対時刻としては先
      const parisDeparture = booking({
        id: 'paris-train',
        kind: 'train',
        title: 'パリ発',
        start: at('2026-09-12', '23:00', PARIS),
      })
      const tokyoDeparture = booking({
        id: 'tokyo-flight',
        kind: 'flight',
        title: '東京発',
        start: at('2026-09-13', '07:00', TOKYO),
      })
      const now = stampToEpoch(at('2026-09-01', '00:00', PARIS))
      expect(
        deriveMilestones([tokyoDeparture, parisDeparture], now).map(
          (m) => m.bookingId,
        ),
      ).toEqual(['paris-train', 'tokyo-flight'])
    })
  })

  describe('夏時間', () => {
    it('夏時間の切り替わりを跨ぐ締切が実経過時間どおりになる', () => {
      // Europe/Paris は 2026-03-29 の 02:00(CET, +01:00)に時計が 03:00(CEST, +02:00)へ進む。
      // 03:30 発の 60 分前を暦どおりに引き算すると 02:30 になるが、その時刻は
      // 存在しない(スキップされる)。分の引き算は Temporal の実経過時間(instant)
      // ベースなので、実際には DST 切り替え前の 01:30(+01:00)になる。
      // node -e で Temporal.ZonedDateTime#subtract の挙動を確認済み:
      //   '2026-03-29T03:30:00[Europe/Paris]'.subtract({minutes: 60}).toString()
      //   === '2026-03-29T01:30:00+01:00[Europe/Paris]'
      const start = at('2026-03-29', '03:30', PARIS)
      const flight = booking({
        id: 'spring',
        kind: 'flight',
        title: '朝一の便',
        start,
        checkInClosesMinutesBefore: 60,
      })
      const now = stampToEpoch(at('2026-03-29', '00:00', PARIS))
      const milestones = deriveMilestones([flight], now)
      const deadline = milestones.find((m) => m.kind === 'checkIn')
      expect(deadline).toBeDefined()
      expect(deadline?.at.zdt).toBe('2026-03-29T01:30:00+01:00[Europe/Paris]')
      expect(deadline?.atMs).toBe(stampToEpoch(start) - 60 * 60_000)
    })
  })
})

describe('isCheckInOpen', () => {
  const start = at('2026-09-10', '15:00', PARIS)
  const end = at('2026-09-13', '11:00', PARIS)
  const hotel = booking({
    id: 'hotel',
    kind: 'lodging',
    title: 'ホテル',
    start,
    end,
  })

  it('チェックイン開始を過ぎ、チェックアウト前なら true(受付中)', () => {
    const now = stampToEpoch(at('2026-09-11', '00:00', PARIS))
    expect(isCheckInOpen(hotel, now)).toBe(true)
  })

  it('チェックアウトを過ぎていれば false', () => {
    const now = stampToEpoch(at('2026-09-14', '00:00', PARIS))
    expect(isCheckInOpen(hotel, now)).toBe(false)
  })

  it('まだチェックイン開始前なら false', () => {
    const now = stampToEpoch(at('2026-09-01', '00:00', PARIS))
    expect(isCheckInOpen(hotel, now)).toBe(false)
  })

  it('キャンセル済みなら false', () => {
    const cancelled: Booking = { ...hotel, status: 'cancelled' }
    const now = stampToEpoch(at('2026-09-11', '00:00', PARIS))
    expect(isCheckInOpen(cancelled, now)).toBe(false)
  })

  it('終日の宿泊なら false(終日の 00:00 は「受付中」の事実ではない)', () => {
    const allDayHotel = booking({
      id: 'allday-hotel',
      kind: 'lodging',
      title: '終日表記の宿',
      start: allDay('2026-09-10', PARIS),
      end: allDay('2026-09-13', PARIS),
    })
    const now = stampToEpoch(at('2026-09-11', '00:00', PARIS))
    expect(isCheckInOpen(allDayHotel, now)).toBe(false)
  })

  it('宿泊以外なら false', () => {
    const flight = booking({
      id: 'flight',
      kind: 'flight',
      title: '便',
      start,
      end,
    })
    const now = stampToEpoch(at('2026-09-11', '00:00', PARIS))
    expect(isCheckInOpen(flight, now)).toBe(false)
  })
})

describe('isDeadlineMilestone', () => {
  it('bagDrop / checkIn だけ true になる', () => {
    const kinds: Array<MilestoneKind> = [
      'bagDrop',
      'checkIn',
      'departure',
      'arrival',
      'lodgingCheckIn',
      'lodgingCheckOut',
      'start',
      'end',
    ]
    expect(kinds.filter(isDeadlineMilestone)).toEqual(['bagDrop', 'checkIn'])
  })
})

describe('DEADLINE_SOON_MS', () => {
  it('45分をミリ秒で表す', () => {
    expect(DEADLINE_SOON_MS).toBe(45 * 60 * 1000)
  })
})

describe('MILESTONE_LABELS', () => {
  it('すべての種類にラベルが定義されている', () => {
    const kinds: Array<MilestoneKind> = [
      'bagDrop',
      'checkIn',
      'departure',
      'arrival',
      'lodgingCheckIn',
      'lodgingCheckOut',
      'start',
      'end',
    ]
    for (const kind of kinds) {
      expect(MILESTONE_LABELS[kind].length).toBeGreaterThan(0)
    }
  })

  it('締切2種のラベルは「締切」と分かる文言になっている', () => {
    expect(MILESTONE_LABELS.bagDrop).toBe('手荷物を預ける締切')
    expect(MILESTONE_LABELS.checkIn).toBe('搭乗手続きの締切')
  })
})
