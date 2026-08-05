import { describe, expect, it } from 'vitest'
import { googleCalendarUrl } from './calendarLinks'
import { makeAllDayStamp, makeStamp } from './datetime'
import type { Booking } from './types'

const PARIS = 'Europe/Paris'
const TOKYO = 'Asia/Tokyo'

/** 現地時刻の Stamp */
const at = makeStamp
/** 終日の Stamp */
const allDay = makeAllDayStamp

type BookingInit = Partial<Booking> &
  Pick<Booking, 'id' | 'kind' | 'title' | 'start'>

function booking(init: BookingInit): Booking {
  return { end: null, status: 'confirmed', payment: 'unpaid', ...init }
}

/** URL を組み立てて、検証しやすい URL オブジェクトに戻す */
function urlOf(b: Booking): URL {
  const url = googleCalendarUrl(b)
  if (url === null) throw new Error('リンクが生成されなかった')
  return new URL(url)
}

describe('googleCalendarUrl / 宛先とパラメータ', () => {
  const flight = booking({
    id: 'bk-1',
    kind: 'flight',
    title: 'AF275',
    start: at('2026-09-23', '20:15', PARIS),
    end: at('2026-09-23', '23:45', PARIS),
    from: { name: 'パリ', address: 'シャルル・ド・ゴール空港' },
    to: { name: '東京' },
    confirmationNumber: 'ABC123',
    provider: 'Air France',
  })

  it('イベント作成画面(action=TEMPLATE)を開く URL を返す', () => {
    const url = urlOf(flight)
    expect(url.origin + url.pathname).toBe(
      'https://calendar.google.com/calendar/render',
    )
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
  })

  it('text は .ics の SUMMARY と同じ(種別の絵文字 + タイトル)', () => {
    expect(urlOf(flight).searchParams.get('text')).toBe('✈️ AF275')
  })

  it('location は出発地、details は確認番号・予約先・区間', () => {
    const params = urlOf(flight).searchParams
    expect(params.get('location')).toBe('パリ シャルル・ド・ゴール空港')
    expect(params.get('details')).toBe(
      '確認番号: ABC123\n予約先: Air France\nパリ → 東京',
    )
  })

  it('日本語やスペースを含む値も URL エンコードされる', () => {
    const url = googleCalendarUrl(flight)
    if (url === null) throw new Error('リンクが生成されなかった')
    // URLSearchParams で組み立てているので、生の空白や & が混ざらない
    expect(url).not.toContain(' ')
  })

  it('場所もメモも無ければ location・details を付けない', () => {
    const params = urlOf(
      booking({
        id: 'bk-2',
        kind: 'activity',
        title: '予定',
        start: at('2026-09-23', '10:00', PARIS),
      }),
    ).searchParams
    expect(params.has('location')).toBe(false)
    expect(params.has('details')).toBe(false)
  })
})

describe('googleCalendarUrl / dates の書式', () => {
  it('時刻付きは UTC の開始/終了になる', () => {
    // パリ 20:15(夏時間 +02:00)は 18:15Z。.ics と同じ変換を通す
    const params = urlOf(
      booking({
        id: 'bk-1',
        kind: 'train',
        title: 'タリス',
        start: at('2026-09-23', '20:15', PARIS),
        end: at('2026-09-23', '23:45', PARIS),
      }),
    ).searchParams
    expect(params.get('dates')).toBe('20260923T181500Z/20260923T214500Z')
  })

  it('冬時間(標準時)でもその日のオフセットで変換される', () => {
    const params = urlOf(
      booking({
        id: 'bk-1',
        kind: 'train',
        title: 'タリス',
        start: at('2026-01-15', '20:15', PARIS),
        end: at('2026-01-15', '23:45', PARIS),
      }),
    ).searchParams
    expect(params.get('dates')).toBe('20260115T191500Z/20260115T224500Z')
  })

  it('タイムゾーンをまたぐ移動も UTC で通しになる', () => {
    const params = urlOf(
      booking({
        id: 'bk-1',
        kind: 'flight',
        title: 'パリ → 東京',
        start: at('2026-09-23', '20:15', PARIS),
        end: at('2026-09-24', '15:45', TOKYO),
      }),
    ).searchParams
    expect(params.get('dates')).toBe('20260923T181500Z/20260924T064500Z')
  })

  it('終日は YYYYMMDD で、終わりは排他になる', () => {
    const params = urlOf(
      booking({
        id: 'bk-1',
        kind: 'activity',
        title: '終日フリー',
        start: allDay('2026-09-23', PARIS),
      }),
    ).searchParams
    expect(params.get('dates')).toBe('20260923/20260924')
  })

  it('終日の宿はチェックアウト日を含む帯になる(.ics と同じ)', () => {
    const params = urlOf(
      booking({
        id: 'hotel',
        kind: 'lodging',
        title: 'パリのホテル',
        start: allDay('2026-09-23', PARIS),
        end: allDay('2026-09-26', PARIS),
      }),
    ).searchParams
    expect(params.get('dates')).toBe('20260923/20260927')
  })

  it('時刻付きで end が無ければ開始と同じ時刻を終わりにする', () => {
    const params = urlOf(
      booking({
        id: 'bk-1',
        kind: 'activity',
        title: '美術館',
        start: at('2026-09-23', '10:00', PARIS),
      }),
    ).searchParams
    expect(params.get('dates')).toBe('20260923T080000Z/20260923T080000Z')
  })

  it('end が start 以前という壊れたデータでも開始と同じ時刻に倒す', () => {
    const params = urlOf(
      booking({
        id: 'bk-1',
        kind: 'train',
        title: '逆転した予約',
        start: at('2026-09-23', '10:00', PARIS),
        end: at('2026-09-23', '08:00', PARIS),
      }),
    ).searchParams
    expect(params.get('dates')).toBe('20260923T080000Z/20260923T080000Z')
  })
})

describe('googleCalendarUrl / 作れない予約', () => {
  it('開始が壊れた Stamp なら null を返す', () => {
    expect(
      googleCalendarUrl(
        booking({
          id: 'broken',
          kind: 'train',
          title: 'こわれた予約',
          start: { zdt: 'こわれた時刻', allDay: false },
        }),
      ),
    ).toBeNull()
  })

  it('タイムゾーン名が未知の Stamp でも null を返す', () => {
    expect(
      googleCalendarUrl(
        booking({
          id: 'broken',
          kind: 'train',
          title: 'こわれた予約',
          start: {
            zdt: '2026-09-23T10:00:00+02:00[Europe/Nowhere]',
            allDay: false,
          },
        }),
      ),
    ).toBeNull()
  })
})
