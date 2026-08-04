/**
 * 実データ(2026 年 9 月の欧州旅程)を丸ごと流す回帰テスト。
 *
 * この旅程は itinerary.ts の誤検出を 3 つまとめて踏む。
 * - 終日の「◯◯滞在」が同じ日の時刻付きの便より前に並ぶ (9/6・9/9・9/14)
 * - 手段未定 (kind: 'other') の移動が経路として扱われない (ミラノ→スイス 以降の 4 件)
 * - 同一空港での乗り継ぎが「宿が未登録」として警告される (デリー T3 での 18 時間 50 分)
 *
 * 修正前は 11 件の警告が出て、そのうち 10 件が誤検出だった。
 * 個別のバグは itinerary.test.ts で最小ケースとして固定してあるので、
 * ここは「実際の旅程を通しで流したときに何が残るか」だけを見る。
 */

import { describe, expect, it } from 'vitest'
import { makeAllDayStamp, makeStamp } from './datetime'
import {
  findItineraryIssues,
  placeAtEnd,
  placeAtStart,
  warningIssuesOf,
} from './itinerary'
import type { Booking, Place, TripNotesState } from './types'

const TOKYO = 'Asia/Tokyo'
const DELHI = 'Asia/Kolkata'
const COPENHAGEN = 'Europe/Copenhagen'
const ROME = 'Europe/Rome'
const MALTA = 'Europe/Malta'
const ZURICH = 'Europe/Zurich'
const BERLIN = 'Europe/Berlin'
const PARIS = 'Europe/Paris'

const at = makeStamp
const allDay = makeAllDayStamp

function place(name: string): Place {
  return { name }
}

type BookingInit = Partial<Booking> &
  Pick<Booking, 'id' | 'kind' | 'title' | 'start'>

function booking(init: BookingInit): Booking {
  return { end: null, status: 'confirmed', payment: 'unpaid', ...init }
}

/**
 * 実データの予約一覧。
 * 「◯◯滞在」が終日なのは知人宅・民泊で時刻が決まっていないため、
 * ホテルは確認メールにチェックイン時刻が書いてあるので時刻付きになっている。
 * kind: 'other' の 4 件は、AI 取り込みが手段を決められなかった移動である。
 */
const REAL_TRIP_BOOKINGS: Array<Booking> = [
  booking({
    id: 'ai357',
    kind: 'flight',
    title: 'AI357 羽田 → ニューデリー',
    start: at('2026-09-05', '11:15', TOKYO),
    end: at('2026-09-05', '17:35', DELHI),
    from: place('羽田空港 第3ターミナル'),
    to: place('インディラ・ガンディー国際空港 T3'),
    note: 'ニューデリーで18時間50分乗り継ぎ',
  }),
  booking({
    id: 'ai157',
    kind: 'flight',
    title: 'AI157 ニューデリー → コペンハーゲン',
    start: at('2026-09-06', '12:20', DELHI),
    end: at('2026-09-06', '17:20', COPENHAGEN),
    from: place('インディラ・ガンディー国際空港 T3'),
    to: place('コペンハーゲン空港'),
  }),
  booking({
    id: 'cph-stay',
    kind: 'lodging',
    title: 'コペンハーゲン滞在',
    start: allDay('2026-09-06', COPENHAGEN),
    end: allDay('2026-09-09', COPENHAGEN),
    place: place('コペンハーゲン'),
  }),
  booking({
    id: 'sk681',
    kind: 'flight',
    title: 'SK681 コペンハーゲン → ローマ',
    start: at('2026-09-09', '09:35', COPENHAGEN),
    end: at('2026-09-09', '11:55', ROME),
    from: place('コペンハーゲン空港'),
    to: place('ローマ・フィウミチーノ空港'),
  }),
  booking({
    id: 'rome-stay',
    kind: 'lodging',
    title: 'ローマ滞在',
    start: allDay('2026-09-09', ROME),
    end: allDay('2026-09-14', ROME),
    place: place('ローマ'),
  }),
  booking({
    id: 'km613',
    kind: 'flight',
    title: 'KM613 ローマ → マルタ',
    start: at('2026-09-14', '14:10', ROME),
    end: at('2026-09-14', '15:35', MALTA),
    from: place('ローマ・フィウミチーノ空港'),
    to: place('マルタ国際空港'),
  }),
  booking({
    id: 'malta-stay',
    kind: 'lodging',
    title: 'マルタ滞在',
    start: allDay('2026-09-14', MALTA),
    end: allDay('2026-09-16', MALTA),
    place: place('マルタ'),
  }),
  booking({
    id: 'km0624',
    kind: 'flight',
    title: 'KM0624 マルタ → ミラノ',
    start: at('2026-09-16', '11:20', MALTA),
    end: at('2026-09-16', '13:15', ROME),
    from: place('マルタ国際空港'),
    to: place('ミラノ・マルペンサ空港'),
  }),
  // 手段未定かつ終日。バグ A とバグ B を同時に踏む 1 件
  booking({
    id: 'milan-swiss',
    kind: 'other',
    title: 'ミラノ → スイス',
    start: allDay('2026-09-16', ROME),
    end: allDay('2026-09-16', ZURICH),
    from: place('ミラノ・マルペンサ空港'),
    to: place('スイス'),
  }),
  booking({
    id: 'swiss-stay',
    kind: 'lodging',
    title: 'スイス滞在',
    start: at('2026-09-16', '20:00', ZURICH),
    end: at('2026-09-19', '10:00', ZURICH),
    place: place('スイス'),
  }),
  booking({
    id: 'swiss-frankfurt',
    kind: 'other',
    title: 'スイス → フランクフルト',
    start: at('2026-09-19', '10:30', ZURICH),
    end: at('2026-09-19', '15:00', BERLIN),
    from: place('スイス'),
    to: place('フランクフルト'),
  }),
  booking({
    id: 'toyoko-inn',
    kind: 'lodging',
    title: '東横INNフランクフルト中央駅前',
    start: at('2026-09-19', '15:00', BERLIN),
    end: at('2026-09-21', '10:00', BERLIN),
    place: place('東横インフランクフルト中央駅前'),
  }),
  booking({
    id: 'frankfurt-strasbourg',
    kind: 'other',
    title: 'フランクフルト → ストラスブール',
    start: at('2026-09-21', '09:00', BERLIN),
    end: at('2026-09-21', '11:00', PARIS),
    from: place('フランクフルト'),
    to: place('ストラスブール'),
  }),
  booking({
    id: 'strasbourg-stay',
    kind: 'lodging',
    title: 'ストラスブール滞在',
    start: at('2026-09-21', '15:00', PARIS),
    end: at('2026-09-24', '10:00', PARIS),
    place: place('ストラスブール'),
  }),
  booking({
    id: 'strasbourg-bordeaux',
    kind: 'other',
    title: 'ストラスブール → ボルドー',
    start: at('2026-09-24', '08:20', PARIS),
    end: at('2026-09-24', '16:40', PARIS),
    from: place('ストラスブール'),
    to: place('ボルドー'),
  }),
  booking({
    id: 'bordeaux-stay',
    kind: 'lodging',
    title: 'ボルドー滞在',
    start: at('2026-09-24', '17:00', PARIS),
    end: at('2026-09-26', '10:00', PARIS),
    place: place('ボルドー'),
  }),
  booking({
    id: 'tgv8514',
    kind: 'train',
    title: 'TGV8514 ボルドー → パリ',
    start: at('2026-09-26', '10:12', PARIS),
    end: at('2026-09-26', '12:26', PARIS),
    from: place('ボルドー'),
    to: place('パリ'),
  }),
  booking({
    id: 'paris-stay',
    kind: 'lodging',
    title: 'パリ滞在',
    start: allDay('2026-09-26', PARIS),
    end: allDay('2026-09-30', PARIS),
    place: place('パリ'),
  }),
  booking({
    id: 'af274',
    kind: 'flight',
    title: 'AF274 パリ → 羽田',
    start: at('2026-09-30', '13:30', PARIS),
    end: at('2026-10-01', '08:30', TOKYO),
    from: place('パリ・シャルル・ド・ゴール空港'),
    to: place('羽田空港 第3ターミナル'),
  }),
]

const REAL_TRIP: TripNotesState = {
  schemaVersion: 1,
  tripTitle: '2026 秋 欧州',
  startDate: '2026-09-05',
  endDate: '2026-10-01',
  pinnedTz: null,
  bookings: REAL_TRIP_BOOKINGS,
  emergencyContacts: [],
}

/** 見比べやすいように 1 行に潰す */
function digest(state: TripNotesState): Array<string> {
  return findItineraryIssues(state).map(
    (issue) =>
      `${issue.date} ${issue.kind} ${issue.fromLabel} → ${issue.toLabel}`,
  )
}

function bookingOf(id: string): Booking {
  const found = REAL_TRIP_BOOKINGS.find((b) => b.id === id)
  if (found === undefined) throw new Error(`予約が見つからない: ${id}`)
  return found
}

describe('findItineraryIssues: 実データの旅程', () => {
  it('警告は 1 件も残らない', () => {
    // 修正前は 13 件出ていた。内訳は
    // 終日の並び順による食い違いのペアが 4 組 (9/6・9/9・9/14・9/26) で 8 件、
    // 手段未定の移動が経路として扱われないことによるものが 4 件、
    // デリー T3 での乗り継ぎに対する「宿が未登録」が 1 件。
    // 前の 12 件は誤検出、最後の 1 件は事実だが直す対象ではないので情報に落とした。
    expect(warningIssuesOf(findItineraryIssues(REAL_TRIP))).toEqual([])
  })

  it('残るのはデリーでの乗り継ぎの案内 1 件だけ', () => {
    expect(digest(REAL_TRIP)).toEqual([
      '2026-09-05 layover インディラ・ガンディー国際空港 T3 → インディラ・ガンディー国際空港 T3',
    ])

    const [layover] = findItineraryIssues(REAL_TRIP)
    expect(layover.severity).toBe('info')
    expect(layover.fromBookingId).toBe('ai357')
    expect(layover.toBookingId).toBe('ai157')
    // 宿が無いこと自体は事実なので、取りたい人のために宿を足す道は残す
    expect(layover.message).toContain('乗り継ぎです')
    expect(layover.message).toContain('宿を追加してください')
  })

  it('終日の滞在は、同じ日の時刻付きの便より後ろに並ぶ', () => {
    // コペンハーゲン滞在(終日 9/6)は epoch では 9/5 22:00 UTC で、
    // AI157(9/6 12:20 デリー発 = 9/6 06:50 UTC)より前に来てしまう。
    // 9/9・9/14 の滞在、9/26 のパリ滞在も同じ形をしている
    for (const id of ['cph-stay', 'rome-stay', 'malta-stay', 'paris-stay']) {
      expect(bookingOf(id).start.allDay).toBe(true)
    }
    // デリーでの乗り継ぎの案内だけが残り、場所の食い違いは出ない
    expect(
      digest({
        ...REAL_TRIP,
        bookings: [
          bookingOf('ai357'),
          bookingOf('ai157'),
          bookingOf('cph-stay'),
        ],
      }),
    ).toEqual([
      '2026-09-05 layover インディラ・ガンディー国際空港 T3 → インディラ・ガンディー国際空港 T3',
    ])
  })

  it('手段未定 (kind: other) の 4 件も経路として扱われる', () => {
    const others = REAL_TRIP_BOOKINGS.filter((b) => b.kind === 'other')
    expect(others.map((b) => b.id)).toEqual([
      'milan-swiss',
      'swiss-frankfurt',
      'frankfurt-strasbourg',
      'strasbourg-bordeaux',
    ])
    for (const move of others) {
      expect(placeAtStart(move)).toEqual(move.from)
      expect(placeAtEnd(move)).toEqual(move.to)
    }
  })

  it('キャンセルすれば、その区間だけ移動の抜けとして戻ってくる', () => {
    // 誤検出を消したせいで本物の穴まで見えなくなっていないことの確認
    const bookings = REAL_TRIP_BOOKINGS.map((b) =>
      b.id === 'swiss-frankfurt' ? { ...b, status: 'cancelled' as const } : b,
    )
    expect(digest({ ...REAL_TRIP, bookings })).toEqual([
      '2026-09-05 layover インディラ・ガンディー国際空港 T3 → インディラ・ガンディー国際空港 T3',
      '2026-09-19 missing-transport スイス → 東横インフランクフルト中央駅前',
    ])
  })
})
