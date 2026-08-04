/**
 * 予約 1 件分の「じゃあ実際どこで探すの」への外部リンク生成。
 *
 * 旅程パズル(trip-scheduler/travelLinks.ts)と同じ設計方針を踏襲する:
 * API 連携はせず、地名・日付をプリセットした検索 URL を組み立てるだけの純関数群で、
 * 意味のあるリンクにならない条件(地名が取れない等)では null / 空配列を返す。
 * 実際の空室・運賃は各サイトの検索結果に従う(このツールは検索先を用意するだけ)。
 *
 * ■ 旅程パズルとの違い
 *   旅程パズルの City は IATA コード・DB 駅名など、サイトが要求する「コード」を
 *   あらかじめカタログとして持っている。旅のしおりの Place(types.ts)は
 *   自由入力の name / localName / address / lat / lng しか持たず、
 *   コードに解決する手段が無い。
 *   そのため、コードが要る検索サイト(Skyscanner の /from/to/ パス等)は
 *   「たまたま入力が英字3文字で IATA コードらしく見えるとき」だけ条件付きで出し、
 *   それ以外は自由文字列のままでも検索できるサイト
 *   (Booking.com / Google 検索・フライト・マップ・Rome2Rio)を軸にする。
 *   3 文字でない自由入力の地名を Skyscanner の URL パスにそのまま渡すと
 *   壊れたリンクになるため、この条件は緩められない。
 *
 * ■ 日付の扱い
 *   予約の日付は必ずその予約自身のタイムゾーンで取る(datetime.ts の parseStamp /
 *   addDays を使う)。表示タイムゾーンに変換すると、現地の「何月何日にチェックイン」
 *   という検索意図とズレることがあるため。
 */

import { addDays, tryParseStamp } from './datetime'
import type { Booking, Place } from './types'

export interface SearchLink {
  label: string
  url: string
}

/** 'YYYY-MM-DD' → 'YYMMDD'(Skyscanner のパス形式) */
function toYYMMDD(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y.slice(2)}${m}${d}`
}

/** 英字3文字だけの文字列を IATA コードらしいとみなす */
function looksLikeIata(code: string): boolean {
  return /^[A-Za-z]{3}$/.test(code)
}

/** Place から表示用の地名を取り出す。空なら null */
function placeName(place: Place | undefined): string | null {
  const name = place?.name.trim()
  if (name !== undefined && name !== '') return name
  const localName = place?.localName?.trim()
  return localName !== undefined && localName !== '' ? localName : null
}

/**
 * 宿の検索リンク。地名が空なら空配列。
 *
 * Google ホテルは日付をプリセットする URL パラメータの仕様が公開されていないため、
 * 地名だけを渡す(チェックイン/アウトは開いた先で利用者に入れてもらう)。
 */
export function lodgingSearchLinks(
  area: string,
  checkIn: string,
  checkOut: string,
): Array<SearchLink> {
  const trimmedArea = area.trim()
  if (trimmedArea === '') return []

  const bookingParams = new URLSearchParams({
    ss: trimmedArea,
    checkin: checkIn,
    checkout: checkOut,
  })
  const googleParams = new URLSearchParams({ q: trimmedArea, hl: 'ja' })

  return [
    {
      label: 'Booking.com',
      url: `https://www.booking.com/searchresults.ja.html?${bookingParams.toString()}`,
    },
    {
      label: 'Google ホテル',
      url: `https://www.google.com/travel/search?${googleParams.toString()}`,
    },
  ]
}

/** 宿泊予約向けのリンク。place.name(無ければ title)を地名として使う */
function lodgingBookingLinks(booking: Booking): Array<SearchLink> {
  const start = tryParseStamp(booking.start)
  if (start === null) return []

  const area = placeName(booking.place) ?? booking.title.trim()
  if (area === '') return []

  const checkIn = start.toPlainDate().toString()
  const end = booking.end === null ? null : tryParseStamp(booking.end)
  const rawCheckOut = end?.toPlainDate().toString()
  // end が無い、または start 以前という壊れたデータなら 1 泊とみなす
  // (nights.ts / itinerary.ts の宿カバー判定と同じ倒し方)
  const checkOut =
    rawCheckOut !== undefined && rawCheckOut > checkIn
      ? rawCheckOut
      : addDays(checkIn, 1)

  return lodgingSearchLinks(area, checkIn, checkOut)
}

/**
 * 飛行機予約向けのリンク。
 * Google フライトは地名がテキストのままでも検索できるので from/to があれば出す。
 * Skyscanner は from/to の両方が IATA コードらしいときだけ出す。
 */
function flightBookingLinks(booking: Booking): Array<SearchLink> {
  const start = tryParseStamp(booking.start)
  if (start === null) return []

  const from = placeName(booking.from)
  const to = placeName(booking.to)
  if (from === null || to === null) return []

  const dateISO = start.toPlainDate().toString()
  const links: Array<SearchLink> = []

  const q = encodeURIComponent(`Flights from ${from} to ${to} on ${dateISO}`)
  links.push({
    label: 'Google フライト',
    url: `https://www.google.com/travel/flights?q=${q}&hl=ja&curr=JPY`,
  })

  if (looksLikeIata(from) && looksLikeIata(to)) {
    const origin = from.toLowerCase()
    const destination = to.toLowerCase()
    links.push({
      label: 'Skyscanner',
      url: `https://www.skyscanner.jp/transport/flights/${origin}/${destination}/${toYYMMDD(dateISO)}/`,
    })
  }

  return links
}

/**
 * 鉄道・バス・船・車の予約向けのリンク。
 * from / to のどちらかが取れないなら、比較のしようがないので出さない。
 */
function transitBookingLinks(booking: Booking): Array<SearchLink> {
  const from = placeName(booking.from)
  const to = placeName(booking.to)
  if (from === null || to === null) return []

  const rome2rioBase = `https://www.rome2rio.com/map/${encodeURIComponent(from)}/${encodeURIComponent(to)}`
  const start = tryParseStamp(booking.start)
  // 開始時刻が壊れているデータでも区間の比較はできるので、リンクごと消さずに
  // 日付なしのまま返す。
  // accom_comparison(宿の比較パネルの表示切り替え)は区間を探すという目的とは
  // 別物なので付けない。
  const rome2rio =
    start === null
      ? rome2rioBase
      : `${rome2rioBase}?${new URLSearchParams({ departureDate: start.toPlainDate().toString() }).toString()}`
  const mapsParams = new URLSearchParams({
    api: '1',
    origin: from,
    destination: to,
    travelmode: 'transit',
  })

  return [
    { label: 'Rome2Rio', url: rome2rio },
    {
      label: 'Google マップ(経路)',
      url: `https://www.google.com/maps/dir/?${mapsParams.toString()}`,
    },
  ]
}

/**
 * アクティビティ向け(および経路が特定できない kind: 'other' のフォールバック)のリンク。
 * 手段を問わず「タイトル + 場所名」の Google 検索だけを出す
 * (アクティビティの予約サイトは千差万別で、汎用的に組み立てられる URL が無いため)。
 * 場所が分からなくてもタイトルだけで検索は成立する。
 */
function activityBookingLinks(booking: Booking): Array<SearchLink> {
  const title = booking.title.trim()
  const place = placeName(booking.place)
  const query = [title, place]
    .filter((part) => part !== null && part !== '')
    .join(' ')
    .trim()
  if (query === '') return []

  const params = new URLSearchParams({ q: query, hl: 'ja' })
  return [
    {
      label: 'Google 検索',
      url: `https://www.google.com/search?${params.toString()}`,
    },
  ]
}

/**
 * kind: 'other' の予約向けのリンク。
 *
 * itinerary.ts の isMoveBooking() が説明している通り、AI 取り込みは手段が
 * 決まっていない移動を kind: 'other' に分類する。種別が未確定なだけで、
 * from / to が両方入っていれば利用者にとってはただの移動である。
 * そのため from / to が両方取れるときは、鉄道・バス等と同じ経路検索
 * (Rome2Rio / Google マップ)を出す。移動として比較する起点・終点が
 * 揃わないときだけ、アクティビティと同じ Google 検索にフォールバックする。
 */
function otherBookingLinks(booking: Booking): Array<SearchLink> {
  const from = placeName(booking.from)
  const to = placeName(booking.to)
  if (from !== null && to !== null) return transitBookingLinks(booking)
  return activityBookingLinks(booking)
}

/** 予約の種別に応じた検索リンク。作れなければ空配列 */
export function bookingSearchLinks(booking: Booking): Array<SearchLink> {
  switch (booking.kind) {
    case 'lodging':
      return lodgingBookingLinks(booking)
    case 'flight':
      return flightBookingLinks(booking)
    case 'train':
    case 'bus':
    case 'ferry':
    case 'car':
      return transitBookingLinks(booking)
    case 'activity':
      return activityBookingLinks(booking)
    case 'other':
      return otherBookingLinks(booking)
  }
}
