/**
 * 「いまどこにいるか」の推定。
 *
 * 見たいのは 2 つ。旅程の時系列から現在地が動くことと、外れるときに
 * 何も返さない(嘘の現在地を作らない)ことである。
 * 名寄せそのもの(施設の語を落とす・包含を許す)は placeNames.test.ts が
 * 受け持つので、ここでは「どの予約から名前を集めるか」だけを固定する。
 */
import { describe, expect, it } from 'vitest'
import { normalizeName } from './placeNames'
import { estimateCurrentPlaces } from './whereabouts'
import type { Booking, TripNotesState } from './types'

function makeState(overrides: Partial<TripNotesState> = {}): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'テスト旅行',
    startDate: '2026-06-12',
    endDate: '2026-06-20',
    pinnedTz: null,
    bookings: [],
    emergencyContacts: [],
    ...overrides,
  }
}

function booking(id: string, overrides: Partial<Booking> = {}): Booking {
  return {
    id,
    kind: 'lodging',
    title: `予約 ${id}`,
    start: { zdt: '2026-06-12T15:00:00+02:00[Europe/Paris]', allDay: false },
    end: { zdt: '2026-06-14T10:00:00+02:00[Europe/Paris]', allDay: false },
    status: 'confirmed',
    payment: 'paid',
    ...overrides,
  }
}

const at = (iso: string) => Date.parse(iso)

/** 候補に含まれるか。候補は normalizeName を通った形で持たれている */
function hasCandidate(candidates: Array<string>, raw: string): boolean {
  return candidates.includes(normalizeName(raw))
}

describe('estimateCurrentPlaces / 最後に着いた場所', () => {
  const flight = booking('f1', {
    kind: 'flight',
    title: 'CX520',
    start: { zdt: '2026-06-12T18:50:00+08:00[Asia/Hong_Kong]', allDay: false },
    end: { zdt: '2026-06-12T20:45:00+08:00[Asia/Taipei]', allDay: false },
    from: { name: '香港国際空港' },
    to: { name: '台湾桃園国際空港' },
  })

  it('宿がまだ無くても、直前の便の到着地から推定できる', () => {
    // 深夜に着いてその日の宿を取っていない状態。進行中の予約は 1 つも無い
    const guess = estimateCurrentPlaces(
      makeState({ bookings: [flight] }),
      at('2026-06-12T14:00:00Z'),
    )
    expect(hasCandidate(guess.candidates, '台湾桃園国際空港')).toBe(true)
  })

  it('施設の語を落として都市名に寄せた形が area になる', () => {
    const hkFlight = booking('f2', {
      kind: 'flight',
      start: { zdt: '2026-06-12T10:00:00+09:00[Asia/Tokyo]', allDay: false },
      end: { zdt: '2026-06-12T13:30:00+08:00[Asia/Hong_Kong]', allDay: false },
      from: { name: '成田国際空港' },
      to: { name: '香港国際空港 T2' },
    })
    const guess = estimateCurrentPlaces(
      makeState({ bookings: [hkFlight] }),
      at('2026-06-12T07:00:00Z'),
    )
    expect(guess.area).toBe('香港')
  })

  it('ラテン文字表記も突き合わせの候補に載る', () => {
    const flightWithLatin = booking('f3', {
      kind: 'flight',
      start: { zdt: '2026-06-12T10:00:00+09:00[Asia/Tokyo]', allDay: false },
      end: { zdt: '2026-06-12T16:00:00+02:00[Europe/Rome]', allDay: false },
      from: { name: '羽田空港' },
      to: { name: 'ミラノ・リナーテ空港', latinName: 'Milano Linate' },
    })
    const guess = estimateCurrentPlaces(
      makeState({ bookings: [flightWithLatin] }),
      at('2026-06-12T15:00:00Z'),
    )
    expect(hasCandidate(guess.candidates, 'Milano Linate')).toBe(true)
  })

  it('時系列で場所が変わると推定も変わる', () => {
    const paris = booking('stay-paris', {
      place: { name: 'パリのホテル' },
    })
    const train = booking('train', {
      kind: 'train',
      start: { zdt: '2026-06-14T11:00:00+02:00[Europe/Paris]', allDay: false },
      end: { zdt: '2026-06-14T18:00:00+02:00[Europe/Rome]', allDay: false },
      from: { name: 'パリ・リヨン駅' },
      to: { name: 'ローマ・テルミニ駅' },
    })
    const rome = booking('stay-rome', {
      start: { zdt: '2026-06-14T19:00:00+02:00[Europe/Rome]', allDay: false },
      end: { zdt: '2026-06-16T10:00:00+02:00[Europe/Rome]', allDay: false },
      place: { name: 'ローマのホテル' },
    })
    const state = makeState({ bookings: [paris, train, rome] })

    // 6/13 はまだパリの宿に滞在中
    const before = estimateCurrentPlaces(state, at('2026-06-13T10:00:00Z'))
    expect(before.area).toBe('パリ')
    expect(hasCandidate(before.candidates, 'ローマのホテル')).toBe(false)

    // 6/14 の夜はローマに着いたあと。前の町の候補は残らない
    const after = estimateCurrentPlaces(state, at('2026-06-14T18:00:00Z'))
    expect(hasCandidate(after.candidates, 'ローマ・テルミニ駅')).toBe(true)
    expect(hasCandidate(after.candidates, 'ローマのホテル')).toBe(true)
    expect(hasCandidate(after.candidates, 'パリのホテル')).toBe(false)
  })

  it('乗車中・搭乗中の移動からは行き先を取らない(まだ着いていない)', () => {
    const paris = booking('stay-paris', { place: { name: 'パリのホテル' } })
    const train = booking('train', {
      kind: 'train',
      start: { zdt: '2026-06-14T11:00:00+02:00[Europe/Paris]', allDay: false },
      end: { zdt: '2026-06-14T18:00:00+02:00[Europe/Rome]', allDay: false },
      from: { name: 'パリ・リヨン駅' },
      to: { name: 'ローマ・テルミニ駅' },
    })
    // 6/14 14:00 CEST = 乗車中。着く前にローマへ切り替わってはいけない
    const guess = estimateCurrentPlaces(
      makeState({ bookings: [paris, train] }),
      at('2026-06-14T12:00:00Z'),
    )
    expect(hasCandidate(guess.candidates, 'ローマ・テルミニ駅')).toBe(false)
    expect(hasCandidate(guess.candidates, 'パリのホテル')).toBe(true)
  })
})

describe('estimateCurrentPlaces / 推定できないとき', () => {
  it('予約が 1 件も無ければ何も返さない', () => {
    const guess = estimateCurrentPlaces(makeState(), at('2026-06-13T10:00:00Z'))
    expect(guess.area).toBeNull()
    expect(guess.candidates).toEqual([])
  })

  it('これから始まる予約しか無い(旅行前)なら何も返さない', () => {
    // 出発前の画面で、行ってもいない町のやりたいことを持ち上げないため
    const guess = estimateCurrentPlaces(
      makeState({ bookings: [booking('b1', { place: { name: 'パリ' } })] }),
      at('2026-06-01T00:00:00Z'),
    )
    expect(guess.area).toBeNull()
    expect(guess.candidates).toEqual([])
  })

  it('キャンセル済みの予約は推定の根拠にしない', () => {
    const cancelled = booking('b1', {
      status: 'cancelled',
      place: { name: 'パリのホテル' },
    })
    const guess = estimateCurrentPlaces(
      makeState({ bookings: [cancelled] }),
      at('2026-06-13T10:00:00Z'),
    )
    expect(guess.area).toBeNull()
  })
})

describe('estimateCurrentPlaces / 利用者が教えた組(placeAliases)', () => {
  it('エイリアスの相方も候補に足す', () => {
    // 宿の名前に町の名前が入っていないケース。機械が当てられない対応を
    // 利用者が既に教えてくれているなら、それを使う
    const stay = booking('b1', { place: { name: "King's Mansion" } })
    const guess = estimateCurrentPlaces(
      makeState({
        bookings: [stay],
        placeAliases: [{ id: 'pa1', names: ["King's Mansion", '香港'] }],
      }),
      at('2026-06-13T10:00:00Z'),
    )
    expect(hasCandidate(guess.candidates, '香港')).toBe(true)
  })

  it('エイリアスの相方は area(プリセット)には出さない', () => {
    // 入力欄の既定値には、当てにいかず素直な形だけを使う
    const stay = booking('b1', { place: { name: "King's Mansion" } })
    const guess = estimateCurrentPlaces(
      makeState({
        bookings: [stay],
        placeAliases: [{ id: 'pa1', names: ["King's Mansion", '香港'] }],
      }),
      at('2026-06-13T10:00:00Z'),
    )
    expect(guess.area).toBe("King's Mansion")
  })
})

describe('estimateCurrentPlaces / 住所', () => {
  const stay = booking('b1', {
    place: {
      name: 'HOTEL SHANDON',
      address: 'Panchkuian Marg, Bharat Nagar, Paharganj, New Delhi, India',
    },
  })

  it('住所をカンマで割ったトークンも候補になる', () => {
    // 空港名にも宿名にも町の名前が入っていないが、住所には必ず入っている
    const guess = estimateCurrentPlaces(
      makeState({ bookings: [stay] }),
      at('2026-06-13T10:00:00Z'),
    )
    expect(hasCandidate(guess.candidates, 'New Delhi')).toBe(true)
    expect(hasCandidate(guess.candidates, 'India')).toBe(true)
  })

  it('郵便番号(数字だけのトークン)は候補にしない', () => {
    // 何にでも一致する候補を作ると、持ち上げが「全部持ち上げ」になる
    const withZip = booking('b2', {
      place: { name: 'HOTEL SHANDON', address: 'New Delhi, India, 110001' },
    })
    const guess = estimateCurrentPlaces(
      makeState({ bookings: [withZip] }),
      at('2026-06-13T10:00:00Z'),
    )
    expect(guess.candidates).not.toContain('110001')
  })

  it('住所は area(プリセット)には使わない', () => {
    // 「Bharat Nagar」が入力欄の既定値になっては困る
    const guess = estimateCurrentPlaces(
      makeState({ bookings: [stay] }),
      at('2026-06-13T10:00:00Z'),
    )
    expect(guess.area).toBe('HOTEL SHANDON')
  })
})
