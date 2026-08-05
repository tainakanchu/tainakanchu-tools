/**
 * やりたいことの振り分け。
 *
 * 見たいのは 3 つ。
 * - いまの町のものが here に持ち上がること(施設の語・住所・エイリアス経由も含む)
 * - 当たらなかったものが消えず elsewhere / anywhere に残ること
 * - 済んだものが束の中で後ろに沈むこと
 *
 * 実際の旅程(28 日のヨーロッパ周遊)で確かめた形をそのままテストにしてある節がある。
 * 「〇〇滞在」「都市名の from/to」はほぼ当たり、外れるのは空港名に町の名前が
 * 入っていない場合だけ、という前提が崩れたらここが落ちる。
 */
import { describe, expect, it } from 'vitest'
import { estimateCurrentPlaces } from './whereabouts'
import {
  groupWishesByArea,
  matchesCurrentPlace,
  splitWishesForNow,
} from './wishes'
import type { Booking, TripNotesState, Wish } from './types'

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

/** 既定は 6/12 15:00 〜 6/14 10:00 (CEST) の宿泊 */
function stay(id: string, overrides: Partial<Booking> = {}): Booking {
  return {
    id,
    kind: 'lodging',
    title: `宿 ${id}`,
    start: { zdt: '2026-06-12T15:00:00+02:00[Europe/Paris]', allDay: false },
    end: { zdt: '2026-06-14T10:00:00+02:00[Europe/Paris]', allDay: false },
    status: 'confirmed',
    payment: 'paid',
    ...overrides,
  }
}

function wish(id: string, title: string, overrides: Partial<Wish> = {}): Wish {
  return { id, title, done: false, ...overrides }
}

const at = (iso: string) => Date.parse(iso)
/** 上の stay() の滞在中にあたる時刻 */
const DURING_STAY = at('2026-06-13T10:00:00Z')

/** 滞在中の宿 1 件から推定した「いまの町」 */
function guessFrom(bookings: Array<Booking>, nowMs = DURING_STAY) {
  return estimateCurrentPlaces(makeState({ bookings }), nowMs)
}

describe('matchesCurrentPlace / 実際の旅程で当たること', () => {
  it('宿の名前が都市名そのもの(「コペンハーゲン滞在」)なら当たる', () => {
    const guess = guessFrom([
      stay('b1', { place: { name: 'コペンハーゲン滞在' } }),
    ])
    expect(
      matchesCurrentPlace(
        wish('w1', 'ニューハウンを歩く', {
          area: 'コペンハーゲン',
        }),
        guess,
      ),
    ).toBe(true)
  })

  it('施設の語で終わる空港名(「ミラノ・リナーテ空港」)からも都市に届く', () => {
    const flight = stay('f1', {
      kind: 'flight',
      start: { zdt: '2026-06-12T10:00:00+02:00[Europe/Paris]', allDay: false },
      end: { zdt: '2026-06-12T12:00:00+02:00[Europe/Rome]', allDay: false },
      from: { name: 'パリ・シャルル・ド・ゴール空港' },
      to: { name: 'ミラノ・リナーテ空港' },
    })
    const guess = guessFrom([flight], at('2026-06-12T13:00:00Z'))
    expect(
      matchesCurrentPlace(
        wish('w1', 'ドゥオーモに登る', { area: 'ミラノ' }),
        guess,
      ),
    ).toBe(true)
  })

  it('施設の語で終わらない宿名(「東横インフランクフルト中央駅前」)も包含で当たる', () => {
    const guess = guessFrom([
      stay('b1', { place: { name: '東横インフランクフルト中央駅前' } }),
    ])
    expect(
      matchesCurrentPlace(
        wish('w1', 'レーマー広場に行く', { area: 'フランクフルト' }),
        guess,
      ),
    ).toBe(true)
  })

  it('空港名にも宿名にも町が入っていなくても、宿の住所から当たる', () => {
    // 実際の旅程で唯一外れた形。「インディラ・ガンディー国際空港」は
    // 施設の語を落としても「インディラガンディー」にしかならないが、
    // その晩の宿の住所には必ず町の名前が入っている
    const flight = stay('f1', {
      kind: 'flight',
      start: {
        zdt: '2026-06-12T18:00:00+08:00[Asia/Hong_Kong]',
        allDay: false,
      },
      end: { zdt: '2026-06-12T22:00:00+05:30[Asia/Kolkata]', allDay: false },
      from: { name: '香港国際空港' },
      to: { name: 'インディラ・ガンディー国際空港 T3' },
    })
    const hotel = stay('b1', {
      start: { zdt: '2026-06-12T23:30:00+05:30[Asia/Kolkata]', allDay: false },
      end: { zdt: '2026-06-14T11:00:00+05:30[Asia/Kolkata]', allDay: false },
      place: {
        name: 'HOTEL SHANDON',
        address:
          'Panchkuian Marg, Bharat Nagar, Paharganj, New Delhi, India, 110001',
      },
    })
    const guess = guessFrom([flight, hotel], at('2026-06-13T05:00:00Z'))
    expect(
      matchesCurrentPlace(
        wish('w1', 'パハールガンジの本屋に行く', { area: 'New Delhi' }),
        guess,
      ),
    ).toBe(true)
  })

  it('利用者が教えた組(空港 ⇔ 宿名)でも繋がる', () => {
    // 実際にこの使い方をしていた。機械が当てられない対応を人間が教えている
    const flight = stay('f1', {
      kind: 'flight',
      start: {
        zdt: '2026-06-12T18:00:00+08:00[Asia/Hong_Kong]',
        allDay: false,
      },
      end: { zdt: '2026-06-12T22:00:00+05:30[Asia/Kolkata]', allDay: false },
      from: { name: '香港国際空港' },
      to: { name: 'インディラ・ガンディー国際空港 T3' },
    })
    const state = makeState({
      bookings: [flight],
      placeAliases: [
        {
          id: 'pa1',
          names: ['インディラ・ガンディー国際空港 T3', 'HOTEL SHANDON'],
        },
      ],
    })
    const guess = estimateCurrentPlaces(state, at('2026-06-12T17:00:00Z'))
    expect(
      matchesCurrentPlace(
        wish('w1', '宿の近くで両替する', { area: 'HOTEL SHANDON' }),
        guess,
      ),
    ).toBe(true)
  })

  it('関係のない町のやりたいことは当たらない', () => {
    const guess = guessFrom([
      stay('b1', { place: { name: 'コペンハーゲン滞在' } }),
    ])
    expect(
      matchesCurrentPlace(wish('w1', '夜市を歩く', { area: '台北' }), guess),
    ).toBe(false)
  })

  it('推定できていない(候補が空)ときは何も当たらない', () => {
    const guess = estimateCurrentPlaces(makeState(), DURING_STAY)
    expect(
      matchesCurrentPlace(wish('w1', '夜市を歩く', { area: '台北' }), guess),
    ).toBe(false)
  })
})

describe('splitWishesForNow / 3 つの束', () => {
  const guess = () =>
    guessFrom([stay('b1', { place: { name: 'コペンハーゲン滞在' } })])

  it('いまの町 / 他の町 / 場所なし に分かれる', () => {
    const wishes = [
      wish('w1', 'ニューハウンを歩く', { area: 'コペンハーゲン' }),
      wish('w2', '夜市を歩く', { area: '台北' }),
      wish('w3', '本屋に入る'),
      // 空白だけの場所は「どこでも」として扱う
      wish('w4', '絵葉書を書く', { area: '   ' }),
    ]
    const split = splitWishesForNow(wishes, guess())
    expect(split.here.map((w) => w.id)).toEqual(['w1'])
    expect(split.elsewhere.map((w) => w.id)).toEqual(['w2'])
    expect(split.anywhere.map((w) => w.id)).toEqual(['w3', 'w4'])
  })

  it('当たらなかったものも消えない(合計は必ず元の件数)', () => {
    // マッチは持ち上げであってフィルタではない、が守られているかはここで気付ける
    const wishes = [
      wish('w1', 'ニューハウンを歩く', { area: 'コペンハーゲン' }),
      wish('w2', '夜市を歩く', { area: '台北' }),
      wish('w3', '本屋に入る'),
    ]
    const split = splitWishesForNow(wishes, guess())
    expect(
      split.here.length + split.elsewhere.length + split.anywhere.length,
    ).toBe(wishes.length)
  })

  it('推定できていないときは here が空になり、他の町の束に全部残る', () => {
    const wishes = [
      wish('w1', 'ニューハウンを歩く', { area: 'コペンハーゲン' }),
      wish('w2', '本屋に入る'),
    ]
    const split = splitWishesForNow(
      wishes,
      estimateCurrentPlaces(makeState(), DURING_STAY),
    )
    expect(split.here).toEqual([])
    expect(split.elsewhere.map((w) => w.id)).toEqual(['w1'])
    expect(split.anywhere.map((w) => w.id)).toEqual(['w2'])
  })

  it('済んだものは束の中で後ろに沈む(消えはしない)', () => {
    const wishes = [
      wish('w1', '済んだこと', { area: 'コペンハーゲン', done: true }),
      wish('w2', 'まだのこと', { area: 'コペンハーゲン' }),
      wish('w3', 'もう1つ済んだこと', { area: 'コペンハーゲン', done: true }),
      wish('w4', 'もう1つまだのこと', { area: 'コペンハーゲン' }),
    ]
    const split = splitWishesForNow(wishes, guess())
    // 未完了が先。同じ側どうしは足した順のまま
    expect(split.here.map((w) => w.id)).toEqual(['w2', 'w4', 'w1', 'w3'])
  })
})

describe('groupWishesByArea', () => {
  it('表記ゆれを吸収して同じ場所にまとめ、見出しは元の表記のまま出す', () => {
    const groups = groupWishesByArea([
      wish('w1', '夜市を歩く', { area: '台北' }),
      wish('w2', '小籠包を食べる', { area: ' 台 北 ' }),
      wish('w3', '本屋に入る'),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].area).toBe('台北')
    expect(groups[0].wishes.map((w) => w.id)).toEqual(['w1', 'w2'])
    expect(groups[1].area).toBeNull()
    expect(groups[1].wishes.map((w) => w.id)).toEqual(['w3'])
  })
})
