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
const DELHI = 'Asia/Kolkata'
const ZURICH = 'Europe/Zurich'
const MALTA = 'Europe/Malta'
const NEW_YORK = 'America/New_York'
const LISBON = 'Europe/Lisbon'
const DOHA = 'Asia/Qatar'

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

  it('kind が other でも from / to があれば経路として扱う', () => {
    // AI 取り込みは手段の決まっていない移動を other に分類する。
    // 種別で経路かどうかを決めていた頃は、この予約の場所が取れずに
    // 判定から丸ごと外れ、前後が直接つながって移動の抜けを誤検出していた
    const undecided = booking({
      id: 'undecided',
      kind: 'other',
      title: 'パリ → ローマ(手段未定)',
      start: at('2026-06-14', '11:00', PARIS),
      end: at('2026-06-14', '20:00', ROME),
      from: place('パリ'),
      to: place('ローマ'),
    })
    expect(placeAtStart(undecided)?.name).toBe('パリ')
    expect(placeAtEnd(undecided)?.name).toBe('ローマ')
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

describe('isSamePlace: 施設名を落として地名で照合する', () => {
  it('「マルタ・ルア国際空港」と「マルタの知人宅」を同じ場所とみなす', () => {
    // 利用者から報告された実例。どちらも他方を含まないので包含判定だけでは繋がらない
    expect(
      isSamePlace(place('マルタ・ルア国際空港'), place('マルタの知人宅')),
    ).toBe(true)
  })

  it('駅・ホテル・実家などの語尾も落とす', () => {
    expect(isSamePlace(place('京都駅'), place('京都のホテル'))).toBe(true)
    expect(isSamePlace(place('金沢中央駅'), place('金沢の実家'))).toBe(true)
    expect(isSamePlace(place('博多港'), place('博多のゲストハウス'))).toBe(true)
  })

  it('英語表記でも施設の語を落とす', () => {
    expect(
      isSamePlace(place('Lisbon Airport'), place('Lisbon Marriott Hotel')),
    ).toBe(true)
    expect(
      isSamePlace(place('Porto Central Station'), place('Porto Apartment')),
    ).toBe(true)
    expect(
      isSamePlace(place('Dover Ferry Port'), place('Dover Guest House')),
    ).toBe(true)
  })

  it('-port で終わる地名は削らない(単独の port は落とす語に入れない)', () => {
    // 「Newport」から「new」を作ると「New York」に一致してしまい、
    // 本当に出るべき食い違いが消える。港を拾うために見逃しを作らない
    expect(isSamePlace(place('Newport'), place('New York'))).toBe(false)
    expect(isSamePlace(place('Southport'), place('South Kensington'))).toBe(
      false,
    )
    expect(isSamePlace(place('Stockport'), place('Stockholm'))).toBe(false)
  })

  it('落とすのは末尾の 1 語だけ(「国際空港」を「空港」で削らない)', () => {
    // 「◯◯国際」まで削れてしまうと、無関係な「◯◯国際会議場」などと繋がる
    expect(isSamePlace(place('関西国際空港'), place('関西'))).toBe(true)
    expect(isSamePlace(place('関西国際空港'), place('中部国際空港'))).toBe(
      false,
    )
  })

  it('地名が違えば、施設の語を落としても別の場所のまま', () => {
    expect(isSamePlace(place('羽田空港'), place('成田空港'))).toBe(false)
    expect(isSamePlace(place('パリ北駅'), place('ローマ'))).toBe(false)
    expect(isSamePlace(place('マルタの知人宅'), place('バレッタ'))).toBe(false)
  })

  it('施設の語しか無い名前からは候補を作らない', () => {
    // 「駅」から空文字の候補が生まれると、どの地名にも一致してしまう
    expect(isSamePlace(place('駅'), place('京都駅'))).toBe(false)
    expect(isSamePlace(place('宅'), place('マルタの知人宅'))).toBe(false)
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
    // 「ミラノ 13:15 着 → その日のうちに手段未定でスイスへ → スイスに泊まる」の形。
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
    const undecided = booking({
      id: 'undecided',
      kind: 'other',
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
    expect(issuesOf([arrival, undecided, zurichStay])).toEqual([])
  })

  it('夜に着く便とその晩の終日の宿でも「着いてから泊まる」順になる', () => {
    // 終日の滞在を現地 18:00 とみなしていたころは、20:15 発 21:50 着のような
    // 夜の便より宿のほうが先に並び、「ローマに泊まる → パリ発ローマ行き」の順になって
    // missing-transport と departure-mismatch がペアで誤検出されていた。
    // 終日の宿をその日の終わりに置いたことで、朝の便でも夜の便でも順序が安定する
    const eveningFlight = booking({
      id: 'evening',
      kind: 'flight',
      title: 'パリ → ローマ(夜行)',
      start: at('2026-06-14', '20:15', PARIS),
      end: at('2026-06-14', '21:50', ROME),
      from: place('パリ'),
      to: place('ローマ'),
    })
    const romeStay = booking({
      id: 'rome-stay',
      kind: 'lodging',
      title: 'ローマ滞在',
      start: allDay('2026-06-14', ROME),
      end: allDay('2026-06-16', ROME),
      place: place('ローマ'),
    })
    expect(issuesOf([parisStay, eveningFlight, romeStay])).toEqual([])
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

describe('findItineraryIssues: 時刻付きの宿の並び', () => {
  const TAIPEI = 'Asia/Taipei'
  const HONG_KONG = 'Asia/Hong_Kong'

  it('チェックイン時刻がその日の便より早くても、出発地の食い違いを出さない', () => {
    // 利用者からの報告: 8/16 の日程が
    // 「King's Mansion チェックアウト 12:00」→「台北の宿 16:00 チェックイン」→
    // 「HX282 香港 18:50 発 台北 20:45 着」の順に並んでいた。
    // チェックイン時刻で並べていたので「台北に泊まる → 香港発の便」の順になり、
    // 香港からの出発が departure-mismatch として誤検出されていた
    const hkHotel = booking({
      id: 'hk-hotel',
      kind: 'lodging',
      title: "King's Mansion",
      start: at('2026-08-14', '15:00', HONG_KONG),
      end: at('2026-08-16', '12:00', HONG_KONG),
      place: place('香港'),
    })
    const flight = booking({
      id: 'hx282',
      kind: 'flight',
      title: 'HX282 HKG→TPE',
      start: at('2026-08-16', '18:50', HONG_KONG),
      end: at('2026-08-16', '20:45', TAIPEI),
      from: place('香港'),
      to: place('台北'),
    })
    const taipeiHotel = booking({
      id: 'taipei-hotel',
      kind: 'lodging',
      title: 'セレクト新北三重水漾館',
      start: at('2026-08-16', '16:00', TAIPEI),
      end: at('2026-08-18', '11:00', TAIPEI),
      place: place('台北'),
    })

    const issues = issuesOf([hkHotel, taipeiHotel, flight])
    expect(issues.map((issue) => issue.kind)).toEqual([])
  })

  it('深夜着の便とその足でのチェックインは、前夜の宿として扱われる', () => {
    // 8/16 23:40 に着いて 8/17 01:00 にチェックイン。埋まっているのは 8/16 の夜。
    // 暦の日付どおり 8/17 から数えると、8/16 の夜だけ宿が無いことになって
    // missing-lodging が誤検出される(nights.ts の lodgingCoversNight を共有しているので、
    // 進捗タブの「寝る場所がない夜」とここの判定は必ず同じ答えになる)
    const inbound = booking({
      id: 'inbound',
      kind: 'flight',
      title: '香港 → 台北(深夜着)',
      start: at('2026-08-16', '20:00', HONG_KONG),
      end: at('2026-08-16', '23:40', TAIPEI),
      from: place('香港'),
      to: place('台北'),
    })
    const hotel = booking({
      id: 'late-hotel',
      kind: 'lodging',
      title: '台北の宿',
      start: at('2026-08-17', '01:00', TAIPEI),
      end: at('2026-08-18', '11:00', TAIPEI),
      place: place('台北'),
    })
    const outbound = booking({
      id: 'outbound',
      kind: 'flight',
      title: '台北 → 東京',
      start: at('2026-08-18', '13:00', TAIPEI),
      end: at('2026-08-18', '17:30', TOKYO),
      from: place('台北'),
      to: place('東京'),
    })

    expect(issuesOf([inbound, hotel, outbound])).toEqual([])
  })
})

describe('findItineraryIssues: 手段未定の移動', () => {
  const undecided = booking({
    id: 'undecided',
    kind: 'other',
    title: 'パリ → ローマ(手段未定)',
    start: at('2026-06-14', '11:00', PARIS),
    end: at('2026-06-14', '20:00', ROME),
    from: place('パリ'),
    to: place('ローマ'),
  })

  it('宿と宿の間を埋めるので missing-transport を出さない', () => {
    expect(issuesOf([parisHotel, undecided, romeHotel])).toEqual([])
  })

  it('到着地が食い違えば other でも location-mismatch を出す', () => {
    const wrong = { ...undecided, to: place('ミラノ') }
    const issues = issuesOf([parisHotel, wrong, romeHotel])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'location-mismatch',
      severity: 'warning',
      fromBookingId: 'undecided',
      toBookingId: 'rome-hotel',
    })
  })

  it('other どうしの間で夜をまたぐなら宿の抜けも検出する', () => {
    const leg1 = booking({
      id: 'leg1',
      kind: 'other',
      title: '東京 → パリ',
      start: at('2026-06-12', '10:00', TOKYO),
      end: at('2026-06-12', '17:00', PARIS),
      from: place('東京'),
      to: place('パリ'),
    })
    const leg2 = booking({
      id: 'leg2',
      kind: 'other',
      title: 'パリ → ローマ',
      start: at('2026-06-15', '09:00', PARIS),
      end: at('2026-06-15', '18:00', ROME),
      from: place('パリ'),
      to: place('ローマ'),
    })
    const issues = issuesOf([leg1, leg2])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'missing-lodging',
      severity: 'warning',
      date: '2026-06-12',
    })
  })
})

describe('findItineraryIssues: 同一地点での乗り継ぎ', () => {
  // 座標を持たせて、空港と市内を同じ場所として扱わせる(約 11km)
  const airport = place('インディラ・ガンディー国際空港 T3', {
    lat: 28.5562,
    lng: 77.1,
  })
  const city = place('ニューデリー', { lat: 28.6139, lng: 77.209 })

  const leg1 = booking({
    id: 'leg1',
    kind: 'flight',
    title: '羽田 → ニューデリー',
    start: at('2026-06-12', '11:15', TOKYO),
    end: at('2026-06-12', '17:35', DELHI),
    from: place('羽田空港'),
    to: airport,
  })
  const leg2 = booking({
    id: 'leg2',
    kind: 'flight',
    title: 'ニューデリー → パリ',
    start: at('2026-06-13', '12:20', DELHI),
    end: at('2026-06-13', '17:20', PARIS),
    from: airport,
    to: place('パリ'),
  })

  it('夜をまたいでも同じ空港での待ち合わせなら layover として情報で出す', () => {
    // 空港で夜を明かす前提なら宿は要らない。ただし「長い待ち時間なので宿を取りたい」
    // 人もいるので、黙って消さずに乗り継ぎであることだけ伝える
    const issues = issuesOf([leg1, leg2])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'layover',
      severity: 'info',
      date: '2026-06-12',
      fromBookingId: 'leg1',
      toBookingId: 'leg2',
    })
    expect(issues[0].message).toContain('乗り継ぎです')
  })

  it('24 時間以上空くなら乗り継ぎではなく宿の抜けとして警告する', () => {
    // 6/12 17:35 着 → 6/13 19:00 発 = 25 時間 25 分。同じ空港でも街に出て泊まる長さ
    const later = {
      ...leg2,
      start: at('2026-06-13', '19:00', DELHI),
      end: at('2026-06-14', '00:20', PARIS),
    }
    const issues = issuesOf([leg1, later])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'missing-lodging',
      severity: 'warning',
    })
  })

  it('間に別の予約が挟まれば乗り継ぎとみなさない', () => {
    // 空港を出る予定が入っているなら「待つだけ」ではないので、安全側に倒す
    const sightseeing = booking({
      id: 'sightseeing',
      kind: 'activity',
      title: '市内観光',
      start: at('2026-06-12', '20:00', DELHI),
      place: city,
    })
    const issues = issuesOf([leg1, sightseeing, leg2])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      kind: 'missing-lodging',
      severity: 'warning',
    })
  })

  it('間の夜が宿で埋まっていれば乗り継ぎとしても報告しない', () => {
    const hotel = booking({
      id: 'transit-hotel',
      kind: 'lodging',
      title: 'ターミナル内のトランジットホテル',
      start: at('2026-06-12', '19:00', DELHI),
      end: at('2026-06-13', '09:00', DELHI),
      place: airport,
    })
    expect(issuesOf([leg1, leg2, hotel])).toEqual([])
  })
})

describe('findItineraryIssues: 施設名を落とした地名での照合', () => {
  it('マルタの空港に着いてマルタの知人宅に泊まる旅程は警告にならない', () => {
    // 利用者から報告された実例そのもの。
    // 「マルタ・ルア国際空港 に到着する予定ですが、次の予約は マルタの知人宅 です」
    const arrive = booking({
      id: 'to-malta',
      kind: 'flight',
      title: 'ローマ → マルタ',
      start: at('2026-09-08', '18:00', ROME),
      end: at('2026-09-08', '19:30', MALTA),
      from: place('ローマ'),
      to: place('マルタ・ルア国際空港'),
    })
    const stay = booking({
      id: 'malta-stay',
      kind: 'lodging',
      title: '知人宅に宿泊',
      start: at('2026-09-08', '21:00', MALTA),
      end: at('2026-09-09', '10:00', MALTA),
      place: place('マルタの知人宅'),
    })
    expect(issuesOf([arrive, stay])).toEqual([])
  })

  it('地名が違う空港どうしは今までどおり食い違いとして検出する', () => {
    const arrive = booking({
      id: 'arrive-haneda',
      kind: 'flight',
      title: 'ソウル → 羽田',
      start: at('2026-06-12', '09:00', TOKYO),
      end: at('2026-06-12', '11:00', TOKYO),
      from: place('ソウル'),
      to: place('羽田空港'),
    })
    const depart = booking({
      id: 'depart-narita',
      kind: 'flight',
      title: '成田 → パリ',
      start: at('2026-06-12', '14:00', TOKYO),
      end: at('2026-06-12', '19:00', PARIS),
      from: place('成田空港'),
      to: place('パリ'),
    })
    const issues = issuesOf([arrive, depart])
    expect(issues.map((issue) => issue.kind)).toEqual(['location-mismatch'])
  })

  it('「Newport」着 →「New York」の予約は今までどおり食い違いとして検出する', () => {
    // 英語の単独 port を落とす語に入れると「new」が候補に生まれ、
    // 「newyork」に包含判定で一致してこの警告が消えてしまう
    const arrive = booking({
      id: 'arrive-newport',
      kind: 'train',
      title: 'ボストン → ニューポート',
      start: at('2026-06-12', '09:00', NEW_YORK),
      end: at('2026-06-12', '12:00', NEW_YORK),
      from: place('Boston'),
      to: place('Newport'),
    })
    const stay = booking({
      id: 'ny-hotel',
      kind: 'lodging',
      title: 'ニューヨークの宿',
      start: at('2026-06-12', '18:00', NEW_YORK),
      end: at('2026-06-13', '10:00', NEW_YORK),
      place: place('New York'),
    })
    const issues = issuesOf([arrive, stay])
    expect(issues.map((issue) => issue.kind)).toEqual(['location-mismatch'])
    expect(issues[0]).toMatchObject({
      fromLabel: 'Newport',
      toLabel: 'New York',
    })
  })

  it('駅の地名部分が違えば今までどおり検出する', () => {
    const arriveNord = booking({
      id: 'arrive-nord',
      kind: 'train',
      title: 'リール → パリ',
      start: at('2026-06-14', '09:00', PARIS),
      end: at('2026-06-14', '12:00', PARIS),
      from: place('リール'),
      to: place('パリ北駅'),
    })
    const issues = issuesOf([arriveNord, romeHotel])
    expect(issues.map((issue) => issue.kind)).toEqual(['location-mismatch'])
  })
})

describe('findItineraryIssues: 同じ場所として扱う組(placeAliases)', () => {
  // 語尾の除去では繋がらない組。利用者に教えてもらうしかない場面
  const arriveFaro = booking({
    id: 'arrive-faro',
    kind: 'flight',
    title: 'リスボン → ファーロ',
    start: at('2026-06-12', '10:00', LISBON),
    end: at('2026-06-12', '11:00', LISBON),
    from: place('リスボン'),
    to: place('Faro'),
  })
  const departAlgarve = booking({
    id: 'depart-algarve',
    kind: 'bus',
    title: 'アルガルヴェ → セビリア',
    start: at('2026-06-14', '09:00', LISBON),
    end: at('2026-06-14', '14:00', 'Europe/Madrid'),
    from: place('アルガルヴェ'),
    to: place('セビリア'),
  })

  const issuesWithAliases = (names: Array<[string, string]>) =>
    findItineraryIssues(
      makeState({
        bookings: [arriveFaro, departAlgarve],
        placeAliases: names.map((pair, index) => ({
          id: `alias-${index}`,
          names: pair,
        })),
      }),
    )

  it('登録前は宿の抜けと場所の食い違いが両方出る', () => {
    expect(
      issuesOf([arriveFaro, departAlgarve]).map((issue) => issue.kind),
    ).toEqual(['missing-lodging', 'location-mismatch'])
  })

  it('組を登録すると場所の食い違いだけが消え、宿の抜けは残る', () => {
    // 同じ場所だと教わっても、その夜に寝る場所が要ることは変わらない
    const issues = issuesWithAliases([['Faro', 'アルガルヴェ']])
    expect(issues.map((issue) => issue.kind)).toEqual(['missing-lodging'])
  })

  it('組の順番が逆でも、表記が揺れていても効く', () => {
    const issues = issuesWithAliases([['アルガルヴェ', 'ＦＡＲＯ']])
    expect(issues.map((issue) => issue.kind)).toEqual(['missing-lodging'])
  })

  it('別の組を登録しても、その指摘は消えない', () => {
    const issues = issuesWithAliases([['Faro', 'セビリア']])
    expect(issues.map((issue) => issue.kind)).toEqual([
      'missing-lodging',
      'location-mismatch',
    ])
  })

  it('missing-transport も落とせる', () => {
    const stayFaro = booking({
      id: 'faro-hotel',
      kind: 'lodging',
      title: 'ファーロの宿',
      start: at('2026-06-12', '15:00', LISBON),
      end: at('2026-06-13', '10:00', LISBON),
      place: place('Faro'),
    })
    const stayAlgarve = booking({
      id: 'algarve-house',
      kind: 'lodging',
      title: 'アルガルヴェの家',
      start: at('2026-06-13', '15:00', LISBON),
      end: at('2026-06-14', '10:00', LISBON),
      place: place('アルガルヴェ'),
    })
    const bookings = [stayFaro, stayAlgarve]
    expect(issuesOf(bookings).map((issue) => issue.kind)).toEqual([
      'missing-transport',
    ])
    expect(
      findItineraryIssues(
        makeState({
          bookings,
          placeAliases: [{ id: 'alias-1', names: ['Faro', 'アルガルヴェ'] }],
        }),
      ),
    ).toEqual([])
  })

  it('乗り継ぎ(layover)は組を登録しても消えない', () => {
    // 「同じ場所か」ではなく「その夜どこで寝るか」の話なので、教えても結論は変わらない
    const terminal1 = place('ドーハ国際空港', { lat: 25.2731, lng: 51.6081 })
    const terminal2 = place('ハマド国際空港', { lat: 25.2609, lng: 51.6138 })
    const leg1 = booking({
      id: 'leg1',
      kind: 'flight',
      title: '東京 → ドーハ',
      start: at('2026-06-12', '10:00', TOKYO),
      end: at('2026-06-12', '20:00', DOHA),
      from: place('東京'),
      to: terminal1,
    })
    const leg2 = booking({
      id: 'leg2',
      kind: 'flight',
      title: 'ドーハ → ローマ',
      start: at('2026-06-13', '08:00', DOHA),
      end: at('2026-06-13', '13:00', ROME),
      from: terminal2,
      to: place('ローマ'),
    })
    const issues = findItineraryIssues(
      makeState({
        bookings: [leg1, leg2],
        placeAliases: [
          { id: 'alias-1', names: ['ドーハ国際空港', 'ハマド国際空港'] },
        ],
      }),
    )
    expect(issues.map((issue) => issue.kind)).toEqual(['layover'])
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
