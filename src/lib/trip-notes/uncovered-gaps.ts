/**
 * 未確保の夜のグルーピングと滞在地推定。
 *
 * computeNights は「その夜に寝る場所があるか」だけを返す。
 * 画面の GapAlert では、未確保の各夜について「どこにいるはずか」を出し、
 * 連続する未確保でも滞在地が変わったら別カードに分ける必要がある。
 *
 * ■ 滞在地の推定
 *   その夜より前(その日の到着を含む)で最も近い予約の placeAtEnd を使う。
 *   移動なら到着地(to)、宿泊・アクティビティなら place。
 *   「直後の宿」を借りると、数日先の別都市の宿名でラベルが付いてしまう
 *   (例: デリー→コペンハーゲン移動中なのに、先のマルタの知人宅名が出る)。
 *
 * ■ グルーピング
 *   日付が連続し、かつ推定した滞在地ラベルが同じ未確保の夜だけを 1 区間にする。
 *   滞在地が変わったらそこで切る(別の穴として扱う)。
 */

import { stampDate, stampToEndEpoch, tryParseStamp } from './datetime'
import { placeAtEnd } from './itinerary'
import { computeNights } from './nights'
import type { Booking, Place, TripNotesState } from './types'

/** 連続する未確保の夜で、滞在地が同じ 1 区間 */
export interface UncoveredNightGap {
  /** 未確保の夜の日付(YYYY-MM-DD)。1 件以上・昇順 */
  dates: Array<string>
  /** 推定した滞在地名。分からなければ undefined */
  areaLabel?: string
}

/** 日程タイムラインに差し込む 1 日分のアラート */
export type GapAlertVariant = 'primary' | 'continuation'

export interface GapAlert {
  /** このアラートを表示する日 */
  date: string
  /** 同じ連続区間の全日付。primary で「9/6〜9/8 の 3 泊」と出すのに使う */
  rangeDates: Array<string>
  areaLabel?: string
  /**
   * primary = 区間の初日(目立つカード)
   * continuation = 2 日目以降(控えめな 1 行)
   */
  variant: GapAlertVariant
}

/** Place から表示用の地名を取り出す。空なら undefined */
function placeName(place: Place): string | undefined {
  const name = place.name.trim()
  if (name !== '') return name
  const localName = place.localName?.trim()
  if (localName !== undefined && localName !== '') return localName
  return undefined
}

/**
 * その予約が「到着して滞在地を確定した」瞬間の Stamp。
 * 終了時刻があればそれ(移動の到着・宿のチェックアウト)、なければ開始。
 */
function arrivalStamp(booking: Booking): Booking['start'] {
  return booking.end ?? booking.start
}

/**
 * 指定した夜について、その時点でいるはずの滞在地を推定する。
 *
 * キャンセル済みを除く予約のうち、到着日(現地)がその夜の日付以前で、
 * 絶対時刻が最も遅いものの placeAtEnd を返す。
 * 該当が無ければ null。
 */
export function estimateStayPlaceForNight(
  bookings: Array<Booking>,
  nightDate: string,
): Place | null {
  let best: { epochMs: number; place: Place } | null = null

  for (const booking of bookings) {
    if (booking.status === 'cancelled') continue

    const place = placeAtEnd(booking)
    if (place === null) continue

    const stamp = arrivalStamp(booking)
    if (tryParseStamp(stamp) === null) continue

    // 到着の現地日付がその夜より後なら、まだそこに着いていない
    const arriveDate = stampDate(stamp)
    if (arriveDate > nightDate) continue

    const epochMs = stampToEndEpoch(stamp)
    if (best === null || epochMs > best.epochMs) {
      best = { epochMs, place }
    }
  }

  return best?.place ?? null
}

/** その夜の滞在地ラベル。推定できなければ undefined */
export function estimateAreaLabelForNight(
  bookings: Array<Booking>,
  nightDate: string,
): string | undefined {
  const place = estimateStayPlaceForNight(bookings, nightDate)
  if (place === null) return undefined
  return placeName(place)
}

/**
 * 未確保の夜を、滞在地が同じ連続区間ごとにまとめる。
 * 日付が途切れるか、推定滞在地が変わったら新しい区間を始める。
 */
export function computeUncoveredNightGaps(
  state: TripNotesState,
): Array<UncoveredNightGap> {
  const nights = computeNights(state)
  const groups: Array<UncoveredNightGap> = []
  let current: UncoveredNightGap | null = null

  const flush = () => {
    if (current === null) return
    groups.push(current)
    current = null
  }

  for (const night of nights) {
    if (night.covered !== null) {
      flush()
      continue
    }

    const areaLabel = estimateAreaLabelForNight(state.bookings, night.date)

    if (current !== null && current.areaLabel === areaLabel) {
      current.dates.push(night.date)
    } else {
      flush()
      current = { dates: [night.date], areaLabel }
    }
  }
  flush()

  return groups
}

/**
 * 区間ごとに「初日は primary、2 日目以降は continuation」のアラート列を作る。
 * SchedulePanel は date をキーにその日のセクションへ差し込む。
 */
export function computeGapAlerts(state: TripNotesState): Array<GapAlert> {
  const gaps = computeUncoveredNightGaps(state)
  const alerts: Array<GapAlert> = []

  for (const gap of gaps) {
    for (let i = 0; i < gap.dates.length; i++) {
      alerts.push({
        date: gap.dates[i],
        rangeDates: gap.dates,
        areaLabel: gap.areaLabel,
        variant: i === 0 ? 'primary' : 'continuation',
      })
    }
  }

  return alerts
}
