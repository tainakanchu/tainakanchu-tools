import { describe, expect, it } from 'vitest'
import { makeAllDayStamp, makeStamp, stampToEpoch } from './datetime'
import {
  computeCancelDeadlines,
  computeSummary,
  countUnverified,
  findCurrentAndNext,
  findTransportGaps,
  groupByDay,
  sortBookings,
  summarizeBudget,
} from './derive'
import type { Booking, TripNotesState } from './types'

const TOKYO = 'Asia/Tokyo'
const PARIS = 'Europe/Paris'
const ROME = 'Europe/Rome'
const COPENHAGEN = 'Europe/Copenhagen'
const MALTA = 'Europe/Malta'

function makeState(overrides: Partial<TripNotesState> = {}): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'ヨーロッパ',
    startDate: '2026-06-12',
    endDate: '2026-06-16', // 4 泊 5 日
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

/** 現地時刻の Stamp */
const at = makeStamp
/** 終日の Stamp */
const allDay = makeAllDayStamp

describe('sortBookings', () => {
  it('タイムゾーンが違っても絶対時刻の順に並ぶ', () => {
    // パリ 6/12 23:00 = 東京 6/13 06:00 なので、東京 6/13 07:00 より前
    const paris = booking({
      id: 'p',
      kind: 'train',
      title: 'パリ発',
      start: at('2026-06-12', '23:00', PARIS),
    })
    const tokyo = booking({
      id: 't',
      kind: 'flight',
      title: '東京発',
      start: at('2026-06-13', '07:00', TOKYO),
    })
    expect(sortBookings([tokyo, paris]).map((b) => b.id)).toEqual(['p', 't'])
  })

  it('終日のアクティビティはその日の先頭に置かれる', () => {
    // 「6/13 は終日フリー」はその日の見出しのように読まれるので、
    // 現地 6/13 の始まりに置く(ordering.ts)。
    // 時差の都合で、パリの終日 6/13 の始まりは東京 6/13 09:00 より前になる
    const free = booking({
      id: 'free',
      kind: 'activity',
      title: '自由行動',
      start: allDay('2026-06-13', PARIS),
    })
    const morning = booking({
      id: 'morning',
      kind: 'activity',
      title: '朝の予定',
      start: at('2026-06-13', '09:00', TOKYO),
    })
    expect(sortBookings([morning, free]).map((b) => b.id)).toEqual([
      'free',
      'morning',
    ])
  })

  it('終日の宿は、同じ日の時刻付きの移動より後ろに並ぶ(着いてから泊まる)', () => {
    // 利用者からの報告: 9/9 が「マルタの知人宅(終日)」→「08:55 コペンハーゲン発」の
    // 順に並んでいた。終日をその日の 00:00 に置いていたので、着く前に泊まることになる
    const flight = booking({
      id: 'd83530',
      kind: 'flight',
      title: 'D83530 コペンハーゲン → マルタ',
      start: at('2026-09-09', '08:55', COPENHAGEN),
      end: at('2026-09-09', '11:55', MALTA),
    })
    const stay = booking({
      id: 'malta-stay',
      kind: 'lodging',
      title: 'マルタの知人宅',
      start: allDay('2026-09-09', MALTA),
      end: allDay('2026-09-12', MALTA),
    })
    expect(sortBookings([stay, flight]).map((b) => b.id)).toEqual([
      'd83530',
      'malta-stay',
    ])
  })

  it('夕方に着く便でも、終日の宿はその後ろに並ぶ', () => {
    // 終日の宿を現地 18:00 とみなしていたころは、20:15 発 21:50 着の便より
    // 宿のほうが先に来て、同じ「着く前に泊まる」並びが夕方以降の便で再発していた
    const evening = booking({
      id: 'evening',
      kind: 'flight',
      title: '夜の便',
      start: at('2026-09-23', '20:15', PARIS),
      end: at('2026-09-23', '21:50', PARIS),
    })
    const stay = booking({
      id: 'stay',
      kind: 'lodging',
      title: '知人宅',
      start: allDay('2026-09-23', PARIS),
      end: allDay('2026-09-25', PARIS),
    })
    expect(sortBookings([stay, evening]).map((b) => b.id)).toEqual([
      'evening',
      'stay',
    ])
  })

  it('壊れた Stamp の予約は末尾に回されるが消えない', () => {
    const broken = booking({
      id: 'broken',
      kind: 'other',
      title: '壊れた予約',
      start: { zdt: 'not-a-datetime', allDay: false },
    })
    const normal = booking({
      id: 'ok',
      kind: 'other',
      title: '正常',
      start: at('2026-06-13', '09:00', TOKYO),
    })
    expect(sortBookings([broken, normal]).map((b) => b.id)).toEqual([
      'ok',
      'broken',
    ])
  })
})

describe('groupByDay', () => {
  it('旅行期間の全日が、予約がなくても並ぶ', () => {
    const state = makeState()
    const groups = groupByDay([], state)
    expect(groups.map((g) => g.date)).toEqual([
      '2026-06-12',
      '2026-06-13',
      '2026-06-14',
      '2026-06-15',
      '2026-06-16',
    ])
  })

  it('最終日以外の日には夜が付き、最終日には付かない', () => {
    const groups = groupByDay([], makeState())
    expect(groups.slice(0, 4).every((g) => g.night !== null)).toBe(true)
    expect(groups[4].night).toBeNull()
  })

  it('その予約自身の現地日付で束ねる', () => {
    // パリ 6/12 20:00 は日本時間では 6/13 03:00 だが、現地の暦では 6/12 の予定。
    // 端末のタイムゾーンで束ねていた頃は、日本にいる利用者の画面で
    // 6/13 の見出しの下に出ていた
    const b = booking({
      id: 'x',
      kind: 'activity',
      title: 'ディナー',
      start: at('2026-06-12', '20:00', PARIS),
    })
    const state = makeState({ bookings: [b] })

    const groups = groupByDay([b], state)
    expect(groups.find((g) => g.date === '2026-06-12')?.bookings).toHaveLength(
      1,
    )
    expect(groups.find((g) => g.date === '2026-06-13')?.bookings).toHaveLength(
      0,
    )
  })

  it('終日の予定はその暦の日付に置かれる', () => {
    const b = booking({
      id: 'x',
      kind: 'activity',
      title: '自由行動',
      start: allDay('2026-06-13', PARIS),
    })
    const state = makeState({ bookings: [b] })
    const group = groupByDay([b], state).find((g) => g.date === '2026-06-13')
    expect(group?.bookings.map((x) => x.id)).toEqual(['x'])
  })

  it('夜に発つ便は、日本時間で翌日になっても現地の当日に並ぶ', () => {
    // 利用者からの報告: 9/23 20:15 パリ発の便が 9/24(木)の見出しの下に出ていた。
    // 端末が Asia/Tokyo だと 9/24 03:15 になるため、表示タイムゾーンで束ねると
    // 旅程が丸ごと 1 日ずれて読める
    const flight = booking({
      id: 'evening',
      kind: 'flight',
      title: '夜の便',
      start: at('2026-09-23', '20:15', PARIS),
      end: at('2026-09-23', '21:50', PARIS),
    })
    const state = makeState({
      startDate: '2026-09-23',
      endDate: '2026-09-25',
      bookings: [flight],
    })
    const groups = groupByDay([flight], state)
    expect(
      groups.find((g) => g.date === '2026-09-23')?.bookings.map((b) => b.id),
    ).toEqual(['evening'])
    expect(groups.find((g) => g.date === '2026-09-24')?.bookings).toEqual([])
  })

  it('旅行期間外の予約もその日を作って表示する(期間の指定ミスで消えない)', () => {
    const b = booking({
      id: 'pre',
      kind: 'lodging',
      title: '前泊',
      start: at('2026-06-10', '15:00', TOKYO),
    })
    const state = makeState({ bookings: [b] })
    const groups = groupByDay([b], state)
    expect(groups[0].date).toBe('2026-06-10')
    expect(groups[0].bookings.map((x) => x.id)).toEqual(['pre'])
    expect(groups[0].night).toBeNull()
    expect(groups).toHaveLength(6)
  })

  it('複数泊の宿は開始日の 1 か所にだけ置く', () => {
    const b = booking({
      id: 'hotel',
      kind: 'lodging',
      title: 'ホテル',
      start: at('2026-06-12', '15:00', TOKYO),
      end: at('2026-06-15', '10:00', TOKYO),
    })
    const state = makeState({ bookings: [b] })
    const groups = groupByDay([b], state)
    expect(
      groups.filter((g) => g.bookings.length > 0).map((g) => g.date),
    ).toEqual(['2026-06-12'])
  })

  describe('ongoing(連泊・日をまたぐ移動の継続表示)', () => {
    const hotel = booking({
      id: 'hotel',
      kind: 'lodging',
      title: 'ホテル',
      start: at('2026-06-12', '15:00', TOKYO),
      end: at('2026-06-15', '10:00', TOKYO),
    })

    it('開始日は bookings 側にだけ出て、ongoing には出ない(重複させない)', () => {
      const state = makeState({ bookings: [hotel] })
      const groups = groupByDay([hotel], state)
      const day12 = groups.find((g) => g.date === '2026-06-12')
      expect(day12?.bookings.map((b) => b.id)).toEqual(['hotel'])
      expect(day12?.ongoing).toEqual([])
    })

    it('連泊中の中日には ongoing として出る', () => {
      const state = makeState({ bookings: [hotel] })
      const groups = groupByDay([hotel], state)
      const day13 = groups.find((g) => g.date === '2026-06-13')
      const day14 = groups.find((g) => g.date === '2026-06-14')
      expect(day13?.bookings).toEqual([])
      expect(day13?.ongoing.map((b) => b.id)).toEqual(['hotel'])
      expect(day14?.ongoing.map((b) => b.id)).toEqual(['hotel'])
    })

    it('チェックアウト日にも ongoing として出る', () => {
      const state = makeState({ bookings: [hotel] })
      const groups = groupByDay([hotel], state)
      const day15 = groups.find((g) => g.date === '2026-06-15')
      expect(day15?.ongoing.map((b) => b.id)).toEqual(['hotel'])
    })

    it('チェックアウト日の翌日には出ない', () => {
      const state = makeState({ bookings: [hotel] })
      const groups = groupByDay([hotel], state)
      const day16 = groups.find((g) => g.date === '2026-06-16')
      expect(day16?.ongoing).toEqual([])
    })

    it('キャンセル済みの予約は ongoing に出ない', () => {
      const cancelled = { ...hotel, status: 'cancelled' as const }
      const state = makeState({ bookings: [cancelled] })
      const groups = groupByDay([cancelled], state)
      expect(groups.every((g) => g.ongoing.length === 0)).toBe(true)
    })

    it('end が null の予約は ongoing に出ない(継続の終わりが定義できない)', () => {
      const meeting = booking({
        id: 'meet',
        kind: 'activity',
        title: '集合',
        start: at('2026-06-12', '09:00', TOKYO),
      })
      const state = makeState({ bookings: [meeting] })
      const groups = groupByDay([meeting], state)
      expect(groups.every((g) => g.ongoing.length === 0)).toBe(true)
    })
  })
})

describe('findCurrentAndNext', () => {
  const hotel = booking({
    id: 'hotel',
    kind: 'lodging',
    title: 'ホテル',
    start: at('2026-06-12', '15:00', PARIS),
    end: at('2026-06-14', '10:00', PARIS),
  })
  const train = booking({
    id: 'train',
    kind: 'train',
    title: '列車',
    start: at('2026-06-14', '12:00', PARIS),
    end: at('2026-06-14', '15:00', ROME),
  })

  it('期間の途中なら current、まだなら upcoming', () => {
    const now = stampToEpoch(at('2026-06-13', '09:00', PARIS))
    const result = findCurrentAndNext([hotel, train], now)
    expect(result.current.map((b) => b.id)).toEqual(['hotel'])
    expect(result.next?.id).toBe('train')
    expect(result.upcoming.map((b) => b.id)).toEqual(['train'])
  })

  it('開始のちょうどその瞬間は current に入る', () => {
    const now = stampToEpoch(at('2026-06-12', '15:00', PARIS))
    const result = findCurrentAndNext([hotel], now)
    expect(result.current.map((b) => b.id)).toEqual(['hotel'])
  })

  it('終了のちょうどその瞬間は current から外れる', () => {
    const now = stampToEpoch(at('2026-06-14', '10:00', PARIS))
    const result = findCurrentAndNext([hotel], now)
    expect(result.current).toEqual([])
    expect(result.upcoming).toEqual([])
  })

  it('終了時刻のない時刻付きの予定は current にならない(所要時間を勝手に作らない)', () => {
    const meeting = booking({
      id: 'meet',
      kind: 'activity',
      title: '集合',
      start: at('2026-06-13', '09:00', PARIS),
    })
    const now = stampToEpoch(at('2026-06-13', '09:30', PARIS))
    expect(findCurrentAndNext([meeting], now).current).toEqual([])
  })

  it('終了時刻のない終日の予定はその日いっぱい current', () => {
    const free = booking({
      id: 'free',
      kind: 'activity',
      title: '自由行動',
      start: allDay('2026-06-13', PARIS),
    })
    const noon = stampToEpoch(at('2026-06-13', '12:00', PARIS))
    expect(findCurrentAndNext([free], noon).current.map((b) => b.id)).toEqual([
      'free',
    ])
    const nextDay = stampToEpoch(at('2026-06-14', '00:00', PARIS))
    expect(findCurrentAndNext([free], nextDay).current).toEqual([])
  })

  it('キャンセル済みは current にも next にも出ない', () => {
    const cancelled = { ...hotel, status: 'cancelled' as const }
    const now = stampToEpoch(at('2026-06-13', '09:00', PARIS))
    const result = findCurrentAndNext([cancelled, train], now)
    expect(result.current).toEqual([])
    expect(result.next?.id).toBe('train')
  })

  it('next は upcoming の先頭と一致する', () => {
    const now = stampToEpoch(at('2026-06-10', '00:00', PARIS))
    const result = findCurrentAndNext([train, hotel], now)
    expect(result.upcoming.map((b) => b.id)).toEqual(['hotel', 'train'])
    expect(result.next).toBe(result.upcoming[0])
  })
})

describe('findTransportGaps', () => {
  const paris = booking({
    id: 'paris',
    kind: 'lodging',
    title: 'パリのホテル',
    start: at('2026-06-12', '15:00', PARIS),
    end: at('2026-06-14', '10:00', PARIS),
    place: { name: 'パリ' },
  })
  const rome = booking({
    id: 'rome',
    kind: 'lodging',
    title: 'ローマのホテル',
    start: at('2026-06-14', '15:00', ROME),
    end: at('2026-06-16', '10:00', ROME),
    place: { name: 'ローマ' },
  })

  it('宿が変わるのに移動がなければ穴として検出する', () => {
    const gaps = findTransportGaps(makeState({ bookings: [paris, rome] }))
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({
      date: '2026-06-14',
      fromBookingId: 'paris',
      toBookingId: 'rome',
      fromLabel: 'パリ',
      toLabel: 'ローマ',
    })
  })

  it('間に移動の予約があれば穴にならない', () => {
    const train = booking({
      id: 'train',
      kind: 'train',
      title: 'パリ→ローマ',
      start: at('2026-06-14', '11:00', PARIS),
      end: at('2026-06-14', '20:00', ROME),
    })
    expect(
      findTransportGaps(makeState({ bookings: [paris, rome, train] })),
    ).toEqual([])
  })

  it('チェックアウトとチェックインが別日でも、その間の夜行移動で埋まる', () => {
    const later = {
      ...rome,
      start: at('2026-06-15', '15:00', ROME),
    }
    const nightTrain = booking({
      id: 'night',
      kind: 'train',
      title: '夜行',
      start: at('2026-06-14', '21:00', PARIS),
      end: at('2026-06-15', '08:00', ROME),
    })
    expect(
      findTransportGaps(makeState({ bookings: [paris, later, nightTrain] })),
    ).toEqual([])
  })

  it('同じ場所に連泊しているだけなら穴ではない', () => {
    const second = {
      ...rome,
      id: 'paris2',
      title: 'パリのホテル(延泊)',
      place: { name: 'パリ' },
    }
    expect(findTransportGaps(makeState({ bookings: [paris, second] }))).toEqual(
      [],
    )
  })

  it('キャンセル済みの移動では穴が埋まらない', () => {
    const cancelledTrain = booking({
      id: 'train',
      kind: 'train',
      title: 'パリ→ローマ',
      start: at('2026-06-14', '11:00', PARIS),
      end: at('2026-06-14', '20:00', ROME),
      status: 'cancelled',
    })
    expect(
      findTransportGaps(makeState({ bookings: [paris, rome, cancelledTrain] })),
    ).toHaveLength(1)
  })

  it('場所が未入力なら題名で同一性を判断する', () => {
    const a = { ...paris, place: undefined }
    const b = { ...rome, place: undefined }
    const gaps = findTransportGaps(makeState({ bookings: [a, b] }))
    expect(gaps[0].fromLabel).toBe('パリのホテル')
    expect(gaps[0].toLabel).toBe('ローマのホテル')
  })
})

describe('computeCancelDeadlines', () => {
  const hotel = booking({
    id: 'hotel',
    kind: 'lodging',
    title: 'パリのホテル',
    start: at('2026-06-12', '15:00', PARIS),
    freeCancelUntil: '2026-06-01',
  })

  it('現地時間の日末まで有効として残り日数を出す', () => {
    // パリ 6/1 の 10:00 時点では、期限(6/1 の日末)まで 14 時間弱 → 切り捨てて 0 日
    const now = stampToEpoch(at('2026-06-01', '10:00', PARIS))
    const [deadline] = computeCancelDeadlines([hotel], now)
    expect(deadline).toMatchObject({
      bookingId: 'hotel',
      date: '2026-06-01',
      daysLeft: 0,
    })
  })

  it('期限日の前日なら 1 日残っている', () => {
    const now = stampToEpoch(at('2026-05-31', '10:00', PARIS))
    expect(computeCancelDeadlines([hotel], now)[0].daysLeft).toBe(1)
  })

  it('日本時間で日付が変わっていても現地の日末までは残る', () => {
    // 東京 6/2 01:00 = パリ 6/1 18:00。まだパリでは 6/1 なので期限内
    const now = stampToEpoch(at('2026-06-02', '01:00', TOKYO))
    expect(computeCancelDeadlines([hotel], now)).toHaveLength(1)
  })

  it('過ぎたものは除く', () => {
    const now = stampToEpoch(at('2026-06-02', '00:01', PARIS))
    expect(computeCancelDeadlines([hotel], now)).toEqual([])
  })

  it('期限が近い順に並ぶ', () => {
    const later = {
      ...hotel,
      id: 'later',
      title: 'ローマのホテル',
      freeCancelUntil: '2026-06-05',
    }
    const now = stampToEpoch(at('2026-05-20', '00:00', PARIS))
    expect(
      computeCancelDeadlines([later, hotel], now).map((d) => d.bookingId),
    ).toEqual(['hotel', 'later'])
  })

  it('キャンセル済みと期限未設定は対象外', () => {
    const cancelled = { ...hotel, id: 'c', status: 'cancelled' as const }
    const noDeadline = { ...hotel, id: 'n', freeCancelUntil: undefined }
    const now = stampToEpoch(at('2026-05-20', '00:00', PARIS))
    expect(computeCancelDeadlines([cancelled, noDeadline], now)).toEqual([])
  })
})

describe('summarizeBudget', () => {
  const bookings: Array<Booking> = [
    booking({
      id: 'a',
      kind: 'lodging',
      title: 'ホテル',
      start: at('2026-06-12', '15:00', PARIS),
      status: 'confirmed',
      payment: 'paid',
      price: { amount: 100, currency: 'EUR' },
    }),
    booking({
      id: 'b',
      kind: 'activity',
      title: '美術館',
      start: at('2026-06-13', '10:00', PARIS),
      status: 'held',
      payment: 'unpaid',
      price: { amount: 50, currency: 'EUR' },
    }),
    booking({
      id: 'c',
      kind: 'flight',
      title: '航空券',
      start: at('2026-06-12', '09:00', TOKYO),
      status: 'confirmed',
      payment: 'onsite',
      price: { amount: 30000, currency: 'JPY' },
    }),
    booking({
      id: 'd',
      kind: 'lodging',
      title: 'キャンセルした宿',
      start: at('2026-06-14', '15:00', ROME),
      status: 'cancelled',
      payment: 'paid',
      price: { amount: 200, currency: 'EUR' },
    }),
  ]

  it('通貨別に集計し、通貨コード順に並ぶ', () => {
    expect(summarizeBudget(bookings).map((b) => b.currency)).toEqual([
      'EUR',
      'JPY',
    ])
  })

  it('キャンセル済みは総額に入らないが、状況別の内訳には残る', () => {
    const [eur] = summarizeBudget(bookings)
    expect(eur.total).toBe(150)
    expect(eur.byStatus.cancelled).toBe(200)
    expect(eur.byStatus.confirmed).toBe(100)
    expect(eur.byStatus.held).toBe(50)
  })

  it('支払い済みと残額を分けて出す', () => {
    const [eur, jpy] = summarizeBudget(bookings)
    expect(eur.paid).toBe(100)
    expect(eur.outstanding).toBe(50)
    expect(eur.confirmed).toBe(100)
    // 現地払いは「まだ払っていない」側に数える
    expect(jpy.paid).toBe(0)
    expect(jpy.outstanding).toBe(30000)
    expect(jpy.byPayment.onsite).toBe(30000)
  })

  it('金額のない予約は無視する', () => {
    const free = booking({
      id: 'free',
      kind: 'activity',
      title: '散歩',
      start: at('2026-06-13', '14:00', PARIS),
    })
    expect(summarizeBudget([free])).toEqual([])
  })
})

describe('countUnverified', () => {
  it('未確認フィールドが残っている予約だけを数える', () => {
    const base = {
      kind: 'activity' as const,
      title: 'x',
      start: at('2026-06-13', '10:00', PARIS),
    }
    const bookings = [
      booking({ id: 'a', ...base, unverified: ['start'] }),
      booking({ id: 'b', ...base, unverified: [] }),
      booking({ id: 'c', ...base }),
      booking({
        id: 'd',
        ...base,
        unverified: ['price'],
        status: 'cancelled',
      }),
    ]
    expect(countUnverified(bookings)).toBe(1)
  })
})

describe('computeSummary', () => {
  it('進捗をまとめて返す', () => {
    const hotel = booking({
      id: 'hotel',
      kind: 'lodging',
      title: 'パリのホテル',
      start: at('2026-06-12', '15:00', PARIS),
      end: at('2026-06-14', '10:00', PARIS),
      place: { name: 'パリ' },
      status: 'confirmed',
      payment: 'paid',
      price: { amount: 300, currency: 'EUR' },
      unverified: ['confirmationNumber'],
    })
    const cancelled = booking({
      id: 'x',
      kind: 'activity',
      title: '中止した予定',
      start: at('2026-06-13', '10:00', PARIS),
      status: 'cancelled',
    })
    const state = makeState({ bookings: [hotel, cancelled] })
    const now = stampToEpoch(at('2026-06-13', '09:00', PARIS))
    const summary = computeSummary(state, now)

    expect(summary.totalNights).toBe(4)
    // 6/12・6/13 はホテルがカバー、6/14・6/15 は寝る場所がない
    expect(summary.uncoveredNights).toBe(2)
    expect(summary.nights.map((n) => n.covered)).toEqual([
      'lodging',
      'lodging',
      null,
      null,
    ])
    expect(summary.bookingCount).toBe(1)
    expect(summary.statusCounts).toEqual({
      idea: 0,
      held: 0,
      confirmed: 1,
      cancelled: 1,
    })
    expect(summary.unverifiedCount).toBe(1)
    expect(summary.budget[0].total).toBe(300)
    expect(summary.currentAndNext.current.map((b) => b.id)).toEqual(['hotel'])
    expect(summary.currentAndNext.next).toBeNull()
  })

  it('宿が 1 つだけなら移動の穴は出ない', () => {
    const hotel = booking({
      id: 'hotel',
      kind: 'lodging',
      title: 'ホテル',
      start: at('2026-06-12', '15:00', PARIS),
      end: at('2026-06-16', '10:00', PARIS),
    })
    const state = makeState({ bookings: [hotel] })
    const now = stampToEpoch(at('2026-06-13', '09:00', PARIS))
    const summary = computeSummary(state, now)
    expect(summary.transportGaps).toEqual([])
    expect(summary.uncoveredNights).toBe(0)
  })

  it('旅程の場所の連続性から出た不整合も併せて返す', () => {
    const paris = booking({
      id: 'paris',
      kind: 'lodging',
      title: 'パリのホテル',
      start: at('2026-06-12', '15:00', PARIS),
      end: at('2026-06-14', '10:00', PARIS),
      place: { name: 'パリ' },
    })
    const rome = booking({
      id: 'rome',
      kind: 'lodging',
      title: 'ローマのホテル',
      start: at('2026-06-14', '15:00', ROME),
      end: at('2026-06-16', '10:00', ROME),
      place: { name: 'ローマ' },
    })
    const state = makeState({ bookings: [paris, rome] })
    const now = stampToEpoch(at('2026-06-13', '09:00', PARIS))
    const summary = computeSummary(state, now)

    // transportGaps は従来どおりの内容を保つ
    expect(summary.transportGaps.map((gap) => gap.toBookingId)).toEqual([
      'rome',
    ])
    expect(summary.itineraryIssues.map((issue) => issue.kind)).toEqual([
      'missing-transport',
    ])
  })
})
