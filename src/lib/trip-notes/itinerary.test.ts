import { describe, expect, it } from 'vitest'
import { formatDateJa, makeAllDayStamp, makeStamp } from './datetime'
import {
  SAME_PLACE_RADIUS_KM,
  findItineraryIssues,
  isSamePlace,
  placeAtEnd,
  placeAtStart,
} from './itinerary'
import type { Booking, Place, TripNotesState } from './types'

const TOKYO = 'Asia/Tokyo'
const PARIS = 'Europe/Paris'
const ROME = 'Europe/Rome'
const ZURICH = 'Europe/Zurich'

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

function place(name: string, extra: Partial<Place> = {}): Place {
  return { name, ...extra }
}

const issuesOf = (bookings: Array<Booking>) =>
  findItineraryIssues(makeState({ bookings }))

// よく使う予約。個々のテストではスプレッドで一部だけ差し替える
const parisHotel = booking({
  id: 'paris-hotel',
  kind: 'lodging',
  title: 'パリのホテル',
  start: at('2026-06-12', '15:00', PARIS),
  end: at('2026-06-14', '10:00', PARIS),
  place: place('パリ'),
})
const romeHotel = booking({
  id: 'rome-hotel',
  kind: 'lodging',
  title: 'ローマのホテル',
  start: at('2026-06-14', '15:00', ROME),
  end: at('2026-06-16', '10:00', ROME),
  place: place('ローマ'),
})
const parisToRome = booking({
  id: 'train',
  kind: 'train',
  title: 'パリ → ローマ',
  start: at('2026-06-14', '11:00', PARIS),
  end: at('2026-06-14', '20:00', ROME),
  from: place('パリ'),
  to: place('ローマ'),
})

describe('placeAtStart / placeAtEnd', () => {
  it('宿泊は開始も終了も place', () => {
    expect(placeAtStart(parisHotel)?.name).toBe('パリ')
    expect(placeAtEnd(parisHotel)?.name).toBe('パリ')
  })

  it('移動は開始が from、終了が to', () => {
    expect(placeAtStart(parisToRome)?.name).toBe('パリ')
    expect(placeAtEnd(parisToRome)?.name).toBe('ローマ')
  })

  it('アクティビティは開始も終了も place', () => {
    const museum = booking({
      id: 'louvre',
      kind: 'activity',
      title: 'ルーヴル美術館',
      start: at('2026-06-13', '10:00', PARIS),
      place: place('パリ'),
    })
    expect(placeAtStart(museum)?.name).toBe('パリ')
    expect(placeAtEnd(museum)?.name).toBe('パリ')
  })

  it('from/to を持たないレンタカーは place で代用する', () => {
    const car = booking({
      id: 'car',
      kind: 'car',
      title: 'レンタカー',
      start: at('2026-06-13', '09:00', ROME),
      end: at('2026-06-15', '18:00', ROME),
      place: place('ローマ'),
    })
    expect(placeAtStart(car)?.name).toBe('ローマ')
    expect(placeAtEnd(car)?.name).toBe('ローマ')
  })

  it('到着地が未入力の移動は、終了時の場所を place で埋めない', () => {
    const oneWay = { ...parisToRome, to: undefined, place: place('ローマ') }
    expect(placeAtStart(oneWay)?.name).toBe('パリ')
    expect(placeAtEnd(oneWay)).toBeNull()
  })

  it('場所がまったく入っていない予約は null', () => {
    const memo = booking({
      id: 'memo',
      kind: 'other',
      title: '予定未定',
      start: at('2026-06-13', '10:00', PARIS),
    })
    expect(placeAtStart(memo)).toBeNull()
    expect(placeAtEnd(memo)).toBeNull()
  })

  it('名前が空文字の Place は場所が無いものとして扱う', () => {
    const blank = { ...parisHotel, place: place('   ') }
    expect(placeAtStart(blank)).toBeNull()
  })
})

describe('isSamePlace', () => {
  it('同じ名前なら同じ場所', () => {
    expect(isSamePlace(place('パリ'), place('パリ'))).toBe(true)
  })

  it('違う都市なら別の場所', () => {
    expect(isSamePlace(place('パリ'), place('ローマ'))).toBe(false)
  })

  it('「パリ」と「パリ シャルルドゴール空港」は同じ場所とみなす', () => {
    expect(isSamePlace(place('パリ'), place('パリ シャルルドゴール空港'))).toBe(
      true,
    )
  })

  it('中黒・ハイフン・全角半角の違いは無視する', () => {
    expect(
      isSamePlace(place('シャルル・ド・ゴール'), place('シャルルドゴール')),
    ).toBe(true)
    expect(isSamePlace(place('ＰＡＲＩＳ'), place('paris'))).toBe(true)
    expect(
      isSamePlace(place('Charles-de-Gaulle'), place('charles de gaulle')),
    ).toBe(true)
  })

  it('1 文字しかない名前は部分一致に載せない', () => {
    expect(isSamePlace(place('A'), place('Amsterdam'))).toBe(false)
  })

  it('座標が両方にあれば、名前が違っても 30km 以内なら同じ場所', () => {
    // パリ中心 (48.8566, 2.3522) とシャルル・ド・ゴール空港 (49.0097, 2.5479) は約 22km
    const cityCenter = place('パリ', { lat: 48.8566, lng: 2.3522 })
    const airport = place('ロワシー', { lat: 49.0097, lng: 2.5479 })
    expect(isSamePlace(cityCenter, airport)).toBe(true)
  })

  it('座標が両方にあれば、名前が似ていても遠ければ別の場所', () => {
    // 緯度 0.5 度 = 約 55km。閾値の外側
    const a = place('サンジョセフ', { lat: 48.8566, lng: 2.3522 })
    const b = place('サンジョセフ', { lat: 49.3566, lng: 2.3522 })
    expect(SAME_PLACE_RADIUS_KM).toBe(30)
    expect(isSamePlace(a, b)).toBe(false)
  })

  it('座標が片方にしか無ければ名前で判定する', () => {
    const withCoords = place('パリ', { lat: 48.8566, lng: 2.3522 })
    expect(isSamePlace(withCoords, place('パリ市内'))).toBe(true)
    expect(isSamePlace(withCoords, place('ローマ'))).toBe(false)
  })

  it('localName も比較の対象に含める', () => {
    // 言語ごと表記が違うと名前だけでは繋がらないが、localName を入れれば繋がる
    expect(isSamePlace(place('パリ'), place('Paris'))).toBe(false)
    expect(
      isSamePlace(place('パリ', { localName: 'Paris' }), place('Paris')),
    ).toBe(true)
  })
})

describe('findItineraryIssues: 4 種類の不整合', () => {
  it('missing-transport: 宿の場所が変わるのに移動の予約がない', () => {
    const issues = issuesOf([parisHotel, romeHotel])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'missing-transport',
      date: '2026-06-14',
      fromBookingId: 'paris-hotel',
      toBookingId: 'rome-hotel',
      fromLabel: 'パリ',
      toLabel: 'ローマ',
    })
    expect(issues[0].message).toContain('パリ → ローマ')
    expect(issues[0].message).toContain('移動を追加')
  })

  it('location-mismatch: 移動の到着地と次の予約の場所が食い違う', () => {
    const inbound = booking({
      id: 'inbound',
      kind: 'flight',
      title: '東京 → パリ',
      start: at('2026-06-12', '10:00', TOKYO),
      end: at('2026-06-12', '17:00', PARIS),
      from: place('東京'),
      to: place('パリ'),
    })
    const issues = issuesOf([
      inbound,
      { ...romeHotel, start: at('2026-06-12', '20:00', ROME) },
    ])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'location-mismatch',
      date: '2026-06-12',
      fromBookingId: 'inbound',
      toBookingId: 'rome-hotel',
      fromLabel: 'パリ',
      toLabel: 'ローマ',
    })
    expect(issues[0].message).toContain('パリ に到着する予定')
  })

  it('departure-mismatch: 移動の出発地が直前にいた場所と食い違う', () => {
    const outbound = booking({
      id: 'outbound',
      kind: 'flight',
      title: 'パリ → 東京',
      start: at('2026-06-16', '12:00', PARIS),
      end: at('2026-06-17', '08:00', TOKYO),
      from: place('パリ'),
      to: place('東京'),
    })
    const issues = issuesOf([romeHotel, outbound])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'departure-mismatch',
      date: '2026-06-16',
      fromBookingId: 'rome-hotel',
      toBookingId: 'outbound',
      fromLabel: 'ローマ',
      toLabel: 'パリ',
    })
    expect(issues[0].message).toContain('パリ 発')
  })

  it('missing-lodging: 移動と移動の間に夜をまたぐのに宿泊予約がない', () => {
    const inbound = booking({
      id: 'inbound',
      kind: 'flight',
      title: '東京 → パリ',
      start: at('2026-06-12', '10:00', TOKYO),
      end: at('2026-06-13', '16:00', PARIS),
      from: place('東京'),
      to: place('パリ'),
    })
    const outbound = booking({
      id: 'outbound',
      kind: 'flight',
      title: 'パリ → 東京',
      start: at('2026-06-15', '12:00', PARIS),
      end: at('2026-06-16', '08:00', TOKYO),
      from: place('パリ'),
      to: place('東京'),
    })

    const issues = issuesOf([inbound, outbound])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'missing-lodging',
      date: '2026-06-13',
      fromBookingId: 'inbound',
      toBookingId: 'outbound',
      fromLabel: 'パリ',
      toLabel: 'パリ',
    })
    expect(issues[0].message).toBe(
      `${formatDateJa('2026-06-13')} に到着してから ${formatDateJa('2026-06-15')} の出発まで、宿泊の予約がありません。パリ 周辺の宿を追加してください`,
    )
  })

  it('missing-lodging: 間の夜が宿で埋まっていれば報告しない', () => {
    const inbound = booking({
      id: 'inbound',
      kind: 'flight',
      title: '東京 → パリ',
      start: at('2026-06-12', '10:00', TOKYO),
      end: at('2026-06-13', '16:00', PARIS),
      from: place('東京'),
      to: place('パリ'),
    })
    const outbound = booking({
      id: 'outbound',
      kind: 'flight',
      title: 'パリ → 東京',
      start: at('2026-06-15', '12:00', PARIS),
      end: at('2026-06-16', '08:00', TOKYO),
      from: place('パリ'),
      to: place('東京'),
    })
    const hotel = booking({
      id: 'stay',
      kind: 'lodging',
      title: 'パリのホテル',
      start: allDay('2026-06-13', PARIS),
      end: allDay('2026-06-15', PARIS),
      place: place('パリ'),
    })
    expect(issuesOf([inbound, outbound, hotel])).toEqual([])
  })

  it('missing-lodging: 同日中の乗り継ぎでは報告しない', () => {
    const leg1 = booking({
      id: 'leg1',
      kind: 'flight',
      title: '東京 → パリ',
      start: at('2026-06-12', '10:00', TOKYO),
      end: at('2026-06-12', '16:00', PARIS),
      from: place('東京'),
      to: place('パリ'),
    })
    const leg2 = booking({
      id: 'leg2',
      kind: 'flight',
      title: 'パリ → ローマ',
      start: at('2026-06-12', '19:00', PARIS),
      end: at('2026-06-12', '21:00', ROME),
      from: place('パリ'),
      to: place('ローマ'),
    })
    expect(issuesOf([leg1, leg2])).toEqual([])
  })
})

describe('findItineraryIssues: 場所が同じなら警告を出さない', () => {
  it('同じ都市で宿を移るだけなら移動が無くても警告しない', () => {
    const first = { ...parisHotel, id: 'paris-a', place: place('パリ') }
    const second = booking({
      id: 'paris-b',
      kind: 'lodging',
      title: 'パリのホテル(2軒目)',
      start: at('2026-06-14', '15:00', PARIS),
      end: at('2026-06-16', '10:00', PARIS),
      place: place('パリ市内'),
    })
    expect(issuesOf([first, second])).toEqual([])
  })

  it('間に移動の予約があれば前後がつながって警告しない', () => {
    expect(issuesOf([parisHotel, parisToRome, romeHotel])).toEqual([])
  })

  it('滞在中のアクティビティが挟まっても警告しない', () => {
    const museum = booking({
      id: 'louvre',
      kind: 'activity',
      title: 'ルーヴル美術館',
      start: at('2026-06-13', '10:00', PARIS),
      place: place('パリ'),
    })
    expect(issuesOf([parisHotel, museum, parisToRome, romeHotel])).toEqual([])
  })
})

describe('findItineraryIssues: 判定から外す予約', () => {
  it('キャンセル済みの移動は無いものとして扱い、穴として検出する', () => {
    const cancelled = { ...parisToRome, status: 'cancelled' as const }
    const issues = issuesOf([parisHotel, cancelled, romeHotel])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'missing-transport',
      fromBookingId: 'paris-hotel',
      toBookingId: 'rome-hotel',
    })
  })

  it('キャンセル済みの予約は不整合の当事者にならない', () => {
    const cancelled = { ...romeHotel, status: 'cancelled' as const }
    expect(issuesOf([parisHotel, cancelled])).toEqual([])
  })

  it('場所情報のない予約は連続性の判定から外れ、その前後が直接つながる', () => {
    const noPlace = booking({
      id: 'free',
      kind: 'activity',
      title: '自由行動',
      start: at('2026-06-13', '10:00', PARIS),
    })
    const issues = issuesOf([parisHotel, noPlace, romeHotel])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'missing-transport',
      fromBookingId: 'paris-hotel',
      toBookingId: 'rome-hotel',
    })
  })

  it('到着地が未入力の移動は、その後ろとの境目だけ判定を諦める', () => {
    const halfFilled = { ...parisToRome, to: undefined }
    // パリのホテル → 移動(パリ発) はつながる。移動 → ローマのホテル は判定できない
    expect(issuesOf([parisHotel, halfFilled, romeHotel])).toEqual([])
  })

  it('開始時刻が壊れている予約は判定から外れる', () => {
    const broken = {
      ...parisToRome,
      start: { zdt: 'not-a-datetime', allDay: false },
    }
    const issues = issuesOf([parisHotel, broken, romeHotel])
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe('missing-transport')
  })
})

describe('findItineraryIssues: 予約が少ない場合', () => {
  it('予約が 0 件でも落ちない', () => {
    expect(findItineraryIssues(makeState())).toEqual([])
  })

  it('予約が 1 件でも落ちない', () => {
    expect(issuesOf([parisHotel])).toEqual([])
    expect(issuesOf([parisToRome])).toEqual([])
  })
})

describe('findItineraryIssues: タイムゾーンをまたぐ移動', () => {
  const tokyoHotel = booking({
    id: 'tokyo-hotel',
    kind: 'lodging',
    title: '成田前泊',
    start: at('2026-06-11', '15:00', TOKYO),
    end: at('2026-06-12', '10:00', TOKYO),
    place: place('東京'),
  })
  const inbound = booking({
    id: 'inbound',
    kind: 'flight',
    title: '東京 → パリ',
    start: at('2026-06-12', '11:00', TOKYO),
    end: at('2026-06-12', '17:00', PARIS),
    from: place('東京'),
    to: place('パリ'),
  })

  it('東京発 → パリ着 が正しくつながれば警告は出ない', () => {
    const parisArrival = {
      ...parisHotel,
      start: at('2026-06-12', '19:00', PARIS),
    }
    expect(issuesOf([tokyoHotel, inbound, parisArrival])).toEqual([])
  })

  it('日付は到着地の現地日付で答える(出発地の日付に引きずられない)', () => {
    // 東京 6/12 11:00 発 → パリ 6/12 17:00 着。ローマの宿は現地 6/12 チェックイン
    const romeArrival = { ...romeHotel, start: at('2026-06-12', '20:00', ROME) }
    const issues = issuesOf([tokyoHotel, inbound, romeArrival])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'location-mismatch',
      date: '2026-06-12',
    })
  })

  it('泊数は現地日付で数える(深夜発の翌朝着でも 1 泊増えない)', () => {
    // 東京 6/12 23:00 発 → パリ 6/13 05:30 着。次の出発は 6/14 なので泊まる夜は 6/13 の 1 泊
    const redEye = booking({
      id: 'red-eye',
      kind: 'flight',
      title: '東京 → パリ(深夜便)',
      start: at('2026-06-12', '23:00', TOKYO),
      end: at('2026-06-13', '05:30', PARIS),
      from: place('東京'),
      to: place('パリ'),
    })
    const nextLeg = booking({
      id: 'next-leg',
      kind: 'train',
      title: 'パリ → ローマ',
      start: at('2026-06-14', '08:00', PARIS),
      end: at('2026-06-14', '18:00', ROME),
      from: place('パリ'),
      to: place('ローマ'),
    })

    const issues = issuesOf([redEye, nextLeg])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'missing-lodging',
      date: '2026-06-13',
    })
    expect(issues[0].message).toContain(formatDateJa('2026-06-13'))
    expect(issues[0].message).toContain(formatDateJa('2026-06-14'))
  })
})

describe('findItineraryIssues: 終日の予定の並び', () => {
  const tokyoHotel = booking({
    id: 'tokyo-hotel',
    kind: 'lodging',
    title: '成田前泊',
    start: at('2026-06-11', '15:00', TOKYO),
    end: at('2026-06-12', '10:00', TOKYO),
    place: place('東京'),
  })
  const inbound = booking({
    id: 'inbound',
    kind: 'flight',
    title: '東京 → パリ',
    start: at('2026-06-12', '11:00', TOKYO),
    end: at('2026-06-12', '17:00', PARIS),
    from: place('東京'),
    to: place('パリ'),
  })
  /** 終日の宿。現地 00:00 として保存されるので epoch は前日の夜になる */
  const parisStay = booking({
    id: 'paris-stay',
    kind: 'lodging',
    title: 'パリ滞在',
    start: allDay('2026-06-12', PARIS),
    end: allDay('2026-06-14', PARIS),
    place: place('パリ'),
  })

  it('同じ日に終日の滞在と時刻付きの移動があっても食い違いを出さない', () => {
    // 終日の epoch(6/11 22:00 UTC)は、その日の便(6/12 02:00 UTC)より前になる。
    // 素の epoch で並べると「パリに泊まる → 東京発パリ行き」の順になり、
    // 到着地の食い違いと出発地の食い違いが必ずペアで出ていた
    expect(issuesOf([tokyoHotel, inbound, parisStay])).toEqual([])
  })

  it('終日の移動は、同じ日の時刻付きの移動と終日の滞在の間に並ぶ', () => {
    // 「ミラノ 13:15 着 → その日のうちに終日扱いの移動でスイスへ → スイスに泊まる」の形。
    // 終日の移動を滞在と同じ時刻に寄せると、この 3 つの順序が決まらない
    const arrival = booking({
      id: 'arrival',
      kind: 'flight',
      title: 'パリ → ローマ',
      start: at('2026-06-12', '11:15', PARIS),
      end: at('2026-06-12', '13:15', ROME),
      from: place('パリ'),
      to: place('ローマ'),
    })
    const onward = booking({
      id: 'onward',
      kind: 'train',
      title: 'ローマ → チューリッヒ',
      start: allDay('2026-06-12', ROME),
      end: allDay('2026-06-12', ZURICH),
      from: place('ローマ'),
      to: place('チューリッヒ'),
    })
    const zurichStay = booking({
      id: 'zurich-stay',
      kind: 'lodging',
      title: 'チューリッヒ滞在',
      start: allDay('2026-06-12', ZURICH),
      end: allDay('2026-06-14', ZURICH),
      place: place('チューリッヒ'),
    })
    expect(issuesOf([arrival, onward, zurichStay])).toEqual([])
  })

  it('終日の滞在の翌朝に発つ移動は、これまでどおり滞在の後ろに来る', () => {
    const outbound = booking({
      id: 'outbound',
      kind: 'flight',
      title: 'パリ → 東京',
      start: at('2026-06-14', '12:00', PARIS),
      end: at('2026-06-15', '08:00', TOKYO),
      from: place('パリ'),
      to: place('東京'),
    })
    expect(issuesOf([parisStay, outbound])).toEqual([])
  })
})

describe('findItineraryIssues: 並び順', () => {
  it('日付の昇順で返る', () => {
    const outbound = booking({
      id: 'outbound',
      kind: 'flight',
      title: 'パリ → 東京',
      start: at('2026-06-16', '12:00', PARIS),
      end: at('2026-06-17', '08:00', TOKYO),
      from: place('パリ'),
      to: place('東京'),
    })
    // パリの宿 → ローマの宿(移動なし) → パリ発の便(ローマにいるはず)
    const issues = issuesOf([parisHotel, romeHotel, outbound])
    expect(issues.map((issue) => issue.kind)).toEqual([
      'missing-transport',
      'departure-mismatch',
    ])
    expect(issues.map((issue) => issue.date)).toEqual([
      '2026-06-14',
      '2026-06-16',
    ])
  })
})
