import { describe, expect, it } from 'vitest'
import { diffDays, makeAllDayStamp, makeStamp } from './datetime'
import {
  TRANSPORT_KINDS,
  computeNights,
  countUncoveredNights,
  isTransportKind,
} from './nights'
import type { Booking, BookingKind, Stamp, TripNotesState } from './types'

function makeState(overrides: Partial<TripNotesState> = {}): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'テスト旅行',
    startDate: '2026-06-12',
    endDate: '2026-06-26', // 14 泊 15 日
    pinnedTz: null,
    bookings: [],
    emergencyContacts: [],
    ...overrides,
  }
}

function booking(
  id: string,
  kind: BookingKind,
  start: Stamp,
  end: Stamp | null,
  overrides: Partial<Booking> = {},
): Booking {
  return {
    id,
    kind,
    title: `予約-${id}`,
    start,
    end,
    status: 'confirmed',
    payment: 'unpaid',
    ...overrides,
  }
}

/** チェックイン/チェックアウトは終日として組み立てる(時刻はカバー判定に使われない) */
function lodging(
  id: string,
  checkIn: string,
  checkOut: string | null,
  overrides: Partial<Booking> = {},
): Booking {
  return booking(
    id,
    'lodging',
    makeAllDayStamp(checkIn, 'UTC'),
    checkOut === null ? null : makeAllDayStamp(checkOut, 'UTC'),
    overrides,
  )
}

function transport(
  id: string,
  kind: BookingKind,
  start: Stamp,
  end: Stamp | null,
  overrides: Partial<Booking> = {},
): Booking {
  return booking(id, kind, start, end, overrides)
}

describe('computeNights: 夜の数え方', () => {
  it('夜の数は diffDays(startDate, endDate) 件で、最終日の夜は含まれない', () => {
    const state = makeState()
    const nights = computeNights(state)
    expect(nights).toHaveLength(diffDays(state.startDate, state.endDate))
    expect(nights[0].date).toBe('2026-06-12')
    expect(nights.at(-1)?.date).toBe('2026-06-25')
    expect(nights.some((n) => n.date === state.endDate)).toBe(false)
  })

  it('startDate === endDate(0泊)なら空配列になる', () => {
    const state = makeState({ startDate: '2026-06-12', endDate: '2026-06-12' })
    expect(computeNights(state)).toEqual([])
  })
})

describe('computeNights: 宿によるカバー', () => {
  it('宿が無ければ全ての夜が covered: null になる', () => {
    const nights = computeNights(makeState())
    expect(nights.every((n) => n.covered === null)).toBe(true)
  })

  it('1泊の宿はチェックイン日の夜だけをカバーする', () => {
    const state = makeState({
      bookings: [lodging('l1', '2026-06-12', '2026-06-13')],
    })
    const nights = computeNights(state)
    expect(nights[0]).toEqual({
      date: '2026-06-12',
      covered: 'lodging',
      bookingId: 'l1',
    })
    expect(nights[1].covered).toBe(null)
  })

  it('チェックアウト日の夜はカバーされない(3泊の宿なら3夜だけカバー)', () => {
    const state = makeState({
      bookings: [lodging('l1', '2026-06-12', '2026-06-15')],
    })
    const nights = computeNights(state)
    const coveredDates = nights
      .filter((n) => n.bookingId === 'l1')
      .map((n) => n.date)
    expect(coveredDates).toEqual(['2026-06-12', '2026-06-13', '2026-06-14'])
    expect(nights.find((n) => n.date === '2026-06-15')?.covered).not.toBe(
      'lodging',
    )
  })

  it('宿が連続する(前のチェックアウト日 = 次のチェックイン日)場合、全ての夜が埋まる', () => {
    const state = makeState({
      startDate: '2026-06-12',
      endDate: '2026-06-16',
      bookings: [
        lodging('l1', '2026-06-12', '2026-06-14'),
        lodging('l2', '2026-06-14', '2026-06-16'),
      ],
    })
    const nights = computeNights(state)
    expect(nights.every((n) => n.covered === 'lodging')).toBe(true)
    expect(nights.map((n) => n.bookingId)).toEqual(['l1', 'l1', 'l2', 'l2'])
  })

  it('宿と宿の間が1泊だけ空く場合、その夜だけ covered: null になり countUncoveredNights が 1 を返す', () => {
    const state = makeState({
      startDate: '2026-06-12',
      endDate: '2026-06-17',
      bookings: [
        lodging('l1', '2026-06-12', '2026-06-14'),
        lodging('l2', '2026-06-15', '2026-06-17'),
      ],
    })
    const nights = computeNights(state)
    expect(nights.find((n) => n.date === '2026-06-14')?.covered).toBe(null)
    expect(countUncoveredNights(nights)).toBe(1)
  })

  it('end が null の宿は1泊とみなされる', () => {
    const state = makeState({
      bookings: [lodging('l1', '2026-06-12', null)],
    })
    const nights = computeNights(state)
    expect(nights[0].covered).toBe('lodging')
    expect(nights[1].covered).toBe(null)
  })

  it('end.date <= start.date の壊れた宿も1泊とみなされる', () => {
    const sameDay = computeNights(
      makeState({ bookings: [lodging('l1', '2026-06-12', '2026-06-12')] }),
    )
    expect(sameDay[0].covered).toBe('lodging')
    expect(sameDay[1].covered).toBe(null)

    const earlierEnd = computeNights(
      makeState({ bookings: [lodging('l2', '2026-06-12', '2026-06-10')] }),
    )
    expect(earlierEnd[0].covered).toBe('lodging')
    expect(earlierEnd[1].covered).toBe(null)
  })

  it('start の zdt が壊れている宿はカバー判定から除外される(パースに失敗するので無いものとして扱う)', () => {
    const broken = booking(
      'l1',
      'lodging',
      { zdt: 'not-a-valid-zdt', allDay: true },
      makeAllDayStamp('2026-06-15', 'UTC'),
    )
    const nights = computeNights(makeState({ bookings: [broken] }))
    expect(nights.every((n) => n.covered === null)).toBe(true)
  })

  it("status: 'cancelled' の宿はカバー判定から除外される", () => {
    const state = makeState({
      bookings: [
        lodging('l1', '2026-06-12', '2026-06-15', { status: 'cancelled' }),
      ],
    })
    const nights = computeNights(state)
    expect(nights.every((n) => n.covered === null)).toBe(true)
  })
})

describe('computeNights: 夜行移動によるカバー', () => {
  it('夜行列車がその夜をカバーする', () => {
    const state = makeState({
      bookings: [
        transport(
          't1',
          'train',
          makeStamp('2026-06-13', '21:00', 'Europe/Paris'),
          makeStamp('2026-06-14', '08:00', 'Europe/Paris'),
        ),
      ],
    })
    const nights = computeNights(state)
    const night = nights.find((n) => n.date === '2026-06-13')
    expect(night?.covered).toBe('overnight')
    expect(night?.bookingId).toBe('t1')
    expect(nights.filter((n) => n.covered === 'overnight')).toHaveLength(1)
  })

  it('2泊にまたがる移動は該当する両方の夜をカバーする(出発日 <= 夜 < 到着日)', () => {
    const state = makeState({
      bookings: [
        transport(
          't1',
          'ferry',
          makeStamp('2026-06-13', '20:00', 'Europe/Paris'),
          makeStamp('2026-06-15', '07:00', 'Europe/Paris'),
        ),
      ],
    })
    const nights = computeNights(state)
    expect(nights.find((n) => n.date === '2026-06-13')?.covered).toBe(
      'overnight',
    )
    expect(nights.find((n) => n.date === '2026-06-14')?.covered).toBe(
      'overnight',
    )
    expect(nights.find((n) => n.date === '2026-06-15')?.covered).toBe(null)
    const overnightIds = nights
      .filter((n) => n.covered === 'overnight')
      .map((n) => n.bookingId)
    expect(overnightIds).toEqual(['t1', 't1'])
  })

  it('夜行移動より宿の方が優先される(同じ夜に両方あれば covered: lodging)', () => {
    const state = makeState({
      bookings: [
        lodging('l1', '2026-06-13', '2026-06-14'),
        transport(
          't1',
          'train',
          makeStamp('2026-06-13', '21:00', 'Europe/Paris'),
          makeStamp('2026-06-14', '08:00', 'Europe/Paris'),
        ),
      ],
    })
    const nights = computeNights(state)
    const night = nights.find((n) => n.date === '2026-06-13')
    expect(night?.covered).toBe('lodging')
    expect(night?.bookingId).toBe('l1')
  })

  it('昼行移動(同日発着)は夜をカバーしない', () => {
    const state = makeState({
      bookings: [
        transport(
          't1',
          'train',
          makeStamp('2026-06-13', '09:00', 'Europe/Paris'),
          makeStamp('2026-06-13', '12:00', 'Europe/Paris'),
        ),
      ],
    })
    const nights = computeNights(state)
    expect(nights.every((n) => n.covered === null)).toBe(true)
  })

  it('早朝発の便は前夜をカバーしない(同日発着なので夜行ではない)', () => {
    const state = makeState({
      bookings: [
        transport(
          't1',
          'flight',
          makeStamp('2026-06-14', '05:00', 'Europe/Paris'),
          makeStamp('2026-06-14', '09:00', 'Europe/Paris'),
        ),
      ],
    })
    const nights = computeNights(state)
    expect(nights.find((n) => n.date === '2026-06-13')?.covered).toBe(null)
    expect(nights.find((n) => n.date === '2026-06-14')?.covered).toBe(null)
  })

  it('日付変更線を跨いで前日に着く昼間の便は夜行とみなさない(到着日が出発日より前)', () => {
    const state = makeState({
      bookings: [
        transport(
          't1',
          'flight',
          makeStamp('2026-06-13', '08:00', 'Asia/Tokyo'),
          makeStamp('2026-06-12', '20:00', 'Pacific/Honolulu'),
        ),
      ],
    })
    const nights = computeNights(state)
    // 東京 6/13 08:00 発 → ホノルル 6/12 20:00 着で到着日(6/12)が出発日(6/13)より前。
    // 「到着日 > 出発日」を満たさないので夜行ではなく、6/12 の夜も 6/13 の夜もカバーしない。
    expect(nights.find((n) => n.date === '2026-06-12')?.covered).toBe(null)
    expect(nights.find((n) => n.date === '2026-06-13')?.covered).toBe(null)
  })

  it('タイムゾーンを跨ぐ夜行便はカバーする', () => {
    const state = makeState({
      bookings: [
        transport(
          't1',
          'flight',
          makeStamp('2026-06-13', '13:00', 'Europe/Paris'),
          makeStamp('2026-06-14', '08:00', 'Asia/Tokyo'),
        ),
      ],
    })
    const nights = computeNights(state)
    // 出発地(Paris)の現地日付 6/13 < 到着地(Tokyo)の現地日付 6/14 なので夜行
    const night = nights.find((n) => n.date === '2026-06-13')
    expect(night?.covered).toBe('overnight')
    expect(night?.bookingId).toBe('t1')
  })

  it("status: 'cancelled' の夜行移動も除外される", () => {
    const state = makeState({
      bookings: [
        transport(
          't1',
          'train',
          makeStamp('2026-06-13', '21:00', 'Europe/Paris'),
          makeStamp('2026-06-14', '08:00', 'Europe/Paris'),
          { status: 'cancelled' },
        ),
      ],
    })
    const nights = computeNights(state)
    expect(nights.every((n) => n.covered === null)).toBe(true)
  })

  it("kind が 'activity' や 'other' の日跨ぎ予約は夜行移動とみなされない", () => {
    const state = makeState({
      bookings: [
        booking(
          't1',
          'activity',
          makeStamp('2026-06-13', '21:00', 'Europe/Paris'),
          makeStamp('2026-06-14', '08:00', 'Europe/Paris'),
        ),
        booking(
          't2',
          'other',
          makeStamp('2026-06-13', '21:00', 'Europe/Paris'),
          makeStamp('2026-06-14', '08:00', 'Europe/Paris'),
        ),
      ],
    })
    const nights = computeNights(state)
    expect(nights.every((n) => n.covered === null)).toBe(true)
  })
})

describe('isTransportKind / TRANSPORT_KINDS', () => {
  it('移動系の kind を判定する', () => {
    expect(isTransportKind('flight')).toBe(true)
    expect(isTransportKind('train')).toBe(true)
    expect(isTransportKind('bus')).toBe(true)
    expect(isTransportKind('ferry')).toBe(true)
    expect(isTransportKind('car')).toBe(true)
    expect(isTransportKind('lodging')).toBe(false)
    expect(isTransportKind('activity')).toBe(false)
    expect(isTransportKind('other')).toBe(false)
  })

  it('TRANSPORT_KINDS の内容', () => {
    expect([...TRANSPORT_KINDS].sort()).toEqual(
      ['bus', 'car', 'ferry', 'flight', 'train'].sort(),
    )
  })
})
