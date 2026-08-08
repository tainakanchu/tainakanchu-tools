/**
 * 過去の旅程を控えておき、次の旅行の下書きとして呼び戻す層。
 *
 * 設計判断:
 * - 台湾は何度も行く人が多く、そのたびに目的・宿泊先・航空会社を入れ直すのは
 *   ほぼ同じ作業の繰り返しになる。旅行者(パスポート情報)は消さずに残るので、
 *   残る手入力は旅程だけ。そこを埋められれば入力はほとんど終わる。
 * - **日付だけはコピーしない。** これがこのファイルでいちばん大事な判断で、
 *   コピーした旅程には前回の入国日と出国日が入っている。他の欄と違って
 *   日付は「見れば古いと分かる」ものではなく(2 か月前の日付も画面上は
 *   ふつうの日付に見える)、そのまま書き出すと**前回の日付で登録された
 *   入国カード**ができあがる。気付けるのは早くて空港のカウンターで、
 *   そこで直す手段はない。コピー直後に空欄になっていれば、必ず入力を促される。
 * - 履歴は書き出しの成功時と「旅程だけクリア」の直前にだけ足す。
 *   打つたびに履歴が増えると、似た旅程が 10 件並んで選べなくなる。
 * - 同じ内容を続けて足さない。書き出しを 2 回押しただけで履歴が
 *   同じもので埋まるのは、10 件しか持たない入れ物では致命的。
 */

import { createEmptyTrip, newTravelerId } from './storage'
import { MAX_PAST_TRIPS } from './types'
import type { PastTrip, TripInfo } from './types'

/** 2 つの旅程が同じ内容か。キーの並び順に左右されない形で比べる */
function isSameTrip(a: TripInfo, b: TripInfo): boolean {
  const left: Record<string, unknown> = { ...a }
  const right: Record<string, unknown> = { ...b }
  for (const key of Object.keys(right)) {
    if (left[key] !== right[key]) return false
  }
  return true
}

/** 旅程が初期状態のままか。何も入力していない旅程を履歴に残さないための判定 */
export function isPristineTrip(trip: TripInfo): boolean {
  return isSameTrip(trip, createEmptyTrip())
}

/**
 * 履歴に 1 件足した配列を返す(元の配列は書き換えない)。
 *
 * 直近の 1 件と内容が同じなら足さずにそのまま返す。判定を「直近の 1 件」に
 * 限っているのは、履歴を時系列の記録として保つため。過去のどれかと同じなら
 * 足さない、という規則にすると「行き先を変えて、また戻した」ときに
 * 最新の履歴が古い位置のまま埋もれる。
 */
export function pushPastTrip(
  pastTrips: ReadonlyArray<PastTrip>,
  trip: TripInfo,
  savedAt: string = new Date().toISOString(),
): Array<PastTrip> {
  if (pastTrips.length > 0 && isSameTrip(pastTrips[0].trip, trip)) {
    return [...pastTrips]
  }
  const entry: PastTrip = {
    id: newTravelerId(),
    savedAt,
    trip: { ...trip },
  }
  return [entry, ...pastTrips].slice(0, MAX_PAST_TRIPS)
}

/**
 * 履歴を現在の旅程に適用した形を返す。
 *
 * 入国日と出国日だけは**空にする**。理由はこのファイル冒頭のとおりで、
 * 前回の日付が残ったまま書き出されるのを構造的に防ぐ。
 */
export function applyPastTrip(past: PastTrip): TripInfo {
  return { ...past.trip, dateOfEntry: '', exitDate: '' }
}

/**
 * 履歴 1 件を 1 行で表す。「いつの、どこ行きの旅程か」が分かればよい。
 * 便名は 'BR 190' の形にする(リスト値の 'BR : EVA Air' をそのまま出すと
 * 行が長くなり、並べたときに見分けが付かない)。
 */
export function summarizePastTrip(past: PastTrip): string {
  const parts: Array<string> = []
  if (past.trip.dateOfEntry.length > 0) parts.push(past.trip.dateOfEntry)

  if (past.trip.entryMode === 'AIR') {
    const airline = past.trip.entryFlightCode.split(' : ')[0]
    const flight = [airline, past.trip.entryFlightNumber]
      .filter((part) => part.length > 0)
      .join(' ')
    if (flight.length > 0) parts.push(flight)
  } else if (past.trip.entryVesselNumber.length > 0) {
    parts.push(past.trip.entryVesselNumber)
  }

  if (past.trip.addressOrHotel.length > 0) parts.push(past.trip.addressOrHotel)
  return parts.length > 0 ? parts.join(' / ') : '(内容なし)'
}

/** 保存日時の表示。読めない値でも落ちないようにする */
export function formatSavedAt(savedAt: string): string {
  if (savedAt.length === 0) return '日時不明'
  const date = new Date(savedAt)
  if (Number.isNaN(date.getTime())) return '日時不明'
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
