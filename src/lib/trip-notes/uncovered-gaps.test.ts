import { describe, expect, it } from 'vitest'
import { makeAllDayStamp, makeStamp } from './datetime'
import {
  computeGapAlerts,
  computeUncoveredNightGaps,
  estimateAreaLabelForNight,
  estimateStayPlaceForNight,
} from './uncovered-gaps'
import type { Booking, Place, TripNotesState } from './types'

const TOKYO = 'Asia/Tokyo'
const DELHI = 'Asia/Kolkata'
const COPENHAGEN = 'Europe/Copenhagen'
const MALTA = 'Europe/Malta'

function makeState(overrides: Partial<TripNotesState> = {}): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'テスト旅行',
    startDate: '2026-09-05',
    endDate: '2026-09-12',
    pinnedTz: null,
    bookings: [],
    emergencyContacts: [],
    ...overrides,
  }
}

type BookingInit = Partial<Booking> &
  Pick<Booking, 'id' | 'kind' | 'title' | 'start'>

function booking(init: BookingInit): Booking {
  return { end: null, status: 'confirmed', payment: 'unpaid', ...init }
}

function place(name: string, extra: Partial<Place> = {}): Place {
  return { name, ...extra }
}

/**
 * 実例シナリオ:
 *   9/5 AI357 羽田→ニューデリー
 *   9/6 AI157 ニューデリー→コペンハーゲン
 *   9/9 マルタの知人宅(宿泊)
 * 未確保は 9/5〜9/8 の 4 泊。
 */
function indiaDenmarkScenario(): TripNotesState {
  return makeState({
    startDate: '2026-09-05',
    endDate: '2026-09-12',
    bookings: [
      booking({
        id: 'ai357',
        kind: 'flight',
        title: 'AI357 羽田→ニューデリー',
        start: makeStamp('2026-09-05', '11:00', TOKYO),
        end: makeStamp('2026-09-05', '17:30', DELHI),
        from: place('羽田'),
        to: place('ニューデリー'),
      }),
      booking({
        id: 'ai157',
        kind: 'flight',
        title: 'AI157 ニューデリー→コペンハーゲン',
        start: makeStamp('2026-09-06', '02:30', DELHI),
        end: makeStamp('2026-09-06', '08:00', COPENHAGEN),
        from: place('ニューデリー'),
        to: place('コペンハーゲン'),
      }),
      booking({
        id: 'malta-friend',
        kind: 'lodging',
        title: 'マルタの知人宅',
        start: makeAllDayStamp('2026-09-09', MALTA),
        end: makeAllDayStamp('2026-09-12', MALTA),
        place: place('マルタの知人宅'),
      }),
    ],
  })
}

describe('estimateStayPlaceForNight / estimateAreaLabelForNight', () => {
  it('ニューデリー／コペンハーゲンの実例: 各夜の滞在地を直前の到着地から推定する', () => {
    const state = indiaDenmarkScenario()
    const { bookings } = state

    // 9/5 の夜 → AI357 到着のニューデリー
    expect(estimateAreaLabelForNight(bookings, '2026-09-05')).toBe(
      'ニューデリー',
    )
    expect(estimateStayPlaceForNight(bookings, '2026-09-05')?.name).toBe(
      'ニューデリー',
    )

    // 9/6〜9/8 の夜 → AI157 到着のコペンハーゲン
    // (直後 9/9 の「マルタの知人宅」はまだ着いていないので使わない)
    expect(estimateAreaLabelForNight(bookings, '2026-09-06')).toBe(
      'コペンハーゲン',
    )
    expect(estimateAreaLabelForNight(bookings, '2026-09-07')).toBe(
      'コペンハーゲン',
    )
    expect(estimateAreaLabelForNight(bookings, '2026-09-08')).toBe(
      'コペンハーゲン',
    )
  })

  it('予約が無ければ null / undefined', () => {
    expect(estimateStayPlaceForNight([], '2026-09-05')).toBeNull()
    expect(estimateAreaLabelForNight([], '2026-09-05')).toBeUndefined()
  })

  it('キャンセル済みの予約は推定に使わない', () => {
    const bookings = [
      booking({
        id: 'cancelled-flight',
        kind: 'flight',
        title: '欠航便',
        start: makeStamp('2026-09-05', '10:00', TOKYO),
        end: makeStamp('2026-09-05', '18:00', DELHI),
        to: place('ニューデリー'),
        status: 'cancelled',
      }),
    ]
    expect(estimateAreaLabelForNight(bookings, '2026-09-05')).toBeUndefined()
  })

  it('同じ日に複数到着がある場合は、より遅い到着を採用する', () => {
    const bookings = [
      booking({
        id: 'morning',
        kind: 'flight',
        title: '朝便',
        start: makeStamp('2026-09-05', '08:00', TOKYO),
        end: makeStamp('2026-09-05', '12:00', DELHI),
        to: place('ニューデリー'),
      }),
      booking({
        id: 'evening',
        kind: 'flight',
        title: '夕便',
        start: makeStamp('2026-09-05', '14:00', DELHI),
        end: makeStamp('2026-09-05', '20:00', COPENHAGEN),
        to: place('コペンハーゲン'),
      }),
    ]
    expect(estimateAreaLabelForNight(bookings, '2026-09-05')).toBe(
      'コペンハーゲン',
    )
  })

  it('宿のチェックアウト後の夜は、直前の宿の場所を使う', () => {
    const bookings = [
      booking({
        id: 'hotel',
        kind: 'lodging',
        title: 'パリのホテル',
        start: makeAllDayStamp('2026-09-05', 'Europe/Paris'),
        end: makeAllDayStamp('2026-09-07', 'Europe/Paris'),
        place: place('パリ'),
      }),
    ]
    // チェックアウト日 9/7 の夜は未カバー想定。到着(チェックアウト)日 <= 9/7 なのでパリ
    expect(estimateAreaLabelForNight(bookings, '2026-09-07')).toBe('パリ')
    // チェックイン前の夜にはまだ着いていない
    expect(estimateAreaLabelForNight(bookings, '2026-09-04')).toBeUndefined()
  })

  it('place 名が空なら localName を使う', () => {
    const bookings = [
      booking({
        id: 'f1',
        kind: 'flight',
        title: '便',
        start: makeStamp('2026-09-05', '10:00', TOKYO),
        end: makeStamp('2026-09-05', '18:00', DELHI),
        to: place('', { localName: 'New Delhi' }),
      }),
    ]
    expect(estimateAreaLabelForNight(bookings, '2026-09-05')).toBe('New Delhi')
  })
})

describe('computeUncoveredNightGaps', () => {
  it('滞在地が変わったら区間を分割する(ニューデリー 1 泊 + コペンハーゲン 3 泊)', () => {
    const gaps = computeUncoveredNightGaps(indiaDenmarkScenario())

    expect(gaps).toEqual([
      { dates: ['2026-09-05'], areaLabel: 'ニューデリー' },
      {
        dates: ['2026-09-06', '2026-09-07', '2026-09-08'],
        areaLabel: 'コペンハーゲン',
      },
    ])
  })

  it('同じ滞在地の連続未確保は 1 区間にまとめる', () => {
    const state = makeState({
      startDate: '2026-09-05',
      endDate: '2026-09-09',
      bookings: [
        booking({
          id: 'f1',
          kind: 'flight',
          title: '到着',
          start: makeStamp('2026-09-05', '10:00', TOKYO),
          end: makeStamp('2026-09-05', '18:00', COPENHAGEN),
          to: place('コペンハーゲン'),
        }),
      ],
    })
    const gaps = computeUncoveredNightGaps(state)
    expect(gaps).toEqual([
      {
        dates: ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08'],
        areaLabel: 'コペンハーゲン',
      },
    ])
  })

  it('宿でカバーされた夜は区間を区切る', () => {
    const state = makeState({
      startDate: '2026-09-05',
      endDate: '2026-09-10',
      bookings: [
        booking({
          id: 'f1',
          kind: 'flight',
          title: '到着',
          start: makeStamp('2026-09-05', '10:00', TOKYO),
          end: makeStamp('2026-09-05', '18:00', COPENHAGEN),
          to: place('コペンハーゲン'),
        }),
        booking({
          id: 'hotel',
          kind: 'lodging',
          title: '宿',
          start: makeAllDayStamp('2026-09-07', COPENHAGEN),
          end: makeAllDayStamp('2026-09-08', COPENHAGEN),
          place: place('コペンハーゲン'),
        }),
      ],
    })
    // 9/5, 9/6 未確保 → 9/7 宿 → 9/8, 9/9 未確保
    const gaps = computeUncoveredNightGaps(state)
    expect(gaps.map((g) => g.dates)).toEqual([
      ['2026-09-05', '2026-09-06'],
      ['2026-09-08', '2026-09-09'],
    ])
  })

  it('未確保が無ければ空配列', () => {
    const state = makeState({
      startDate: '2026-09-05',
      endDate: '2026-09-07',
      bookings: [
        booking({
          id: 'hotel',
          kind: 'lodging',
          title: '宿',
          start: makeAllDayStamp('2026-09-05', COPENHAGEN),
          end: makeAllDayStamp('2026-09-07', COPENHAGEN),
          place: place('コペンハーゲン'),
        }),
      ],
    })
    expect(computeUncoveredNightGaps(state)).toEqual([])
  })
})

describe('computeGapAlerts', () => {
  it('区間の初日は primary、2 日目以降は continuation になる', () => {
    const alerts = computeGapAlerts(indiaDenmarkScenario())

    expect(alerts).toEqual([
      {
        date: '2026-09-05',
        rangeDates: ['2026-09-05'],
        areaLabel: 'ニューデリー',
        variant: 'primary',
      },
      {
        date: '2026-09-06',
        rangeDates: ['2026-09-06', '2026-09-07', '2026-09-08'],
        areaLabel: 'コペンハーゲン',
        variant: 'primary',
      },
      {
        date: '2026-09-07',
        rangeDates: ['2026-09-06', '2026-09-07', '2026-09-08'],
        areaLabel: 'コペンハーゲン',
        variant: 'continuation',
      },
      {
        date: '2026-09-08',
        rangeDates: ['2026-09-06', '2026-09-07', '2026-09-08'],
        areaLabel: 'コペンハーゲン',
        variant: 'continuation',
      },
    ])
  })
})
