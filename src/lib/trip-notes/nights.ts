/**
 * 「その夜、寝る場所が確保されているか」の計算。このツールで一番重要な判定。
 *
 * 旅行期間 startDate〜endDate の各夜について、宿があるか / 夜行移動の車中泊か /
 * どちらでもない(= 寝る場所がない) を出す。
 *
 * ■ 夜の数え方
 *   夜 N = startDate から N 日後の「晩」。N = 0 .. diffDays(startDate, endDate) - 1。
 *   最終日(endDate)の晩は旅行が終わっているので数えない。
 *
 * ■ 宿のカバー判定
 *   チェックイン日 <= 夜の日付 < チェックアウト日。
 *   チェックアウト日の晩はもうその宿にいないのでカバーしない。
 *   end が無い(または end <= start の壊れた)宿は 1 泊とみなす。
 *   ただし深夜のチェックインだけは、暦の日付ではなく前日の夜から数える
 *   (LATE_NIGHT_CHECKIN_HOUR 参照)。
 *
 * ■ 夜行移動のカバー判定
 *   出発地のタイムゾーンにおける出発日と、到着地のタイムゾーンにおける到着日を
 *   それぞれ ZonedDateTime.toPlainDate() で取り出して比較する。
 *   到着日が出発日より後なら「日をまたぐ移動 = 夜行」とみなし、
 *   宿と同じ形(出発日 <= 夜の日付 < 到着日)でカバーする夜を決める。
 *
 *   タイムゾーンごと持ち歩く ZonedDateTime から現地日付を取るので、
 *   時差のある区間(パリ 13:00 発 → 東京 翌 08:00 着)も素直に扱える。
 *   到着日が出発日より「前」になる場合(東京 08:00 発 → ホノルル 前日 20:00 着 のように
 *   日付変更線を西から東へ跨ぐ昼間の便)は夜をまたいでいないので夜行とみなさない。
 *
 * ■ 迷ったらカバーされていない側に倒す
 *   予約の抜けは金額の抜けより深刻なので、見逃すより誤警告のほうがまし。
 *   キャンセル済みの予約は「無いもの」として扱う。キャンセルしたのに宿があることに
 *   なっていると、寝る場所がないのに警告が出ないという最悪の壊れ方をする。
 */

import { addDays, diffDays, tryParseStamp } from './datetime'
import type {
  Booking,
  BookingKind,
  NightSlot,
  Stamp,
  TripNotesState,
} from './types'

/** 移動系の予約種別。夜行判定と「移動の穴」検出の対象 */
export const TRANSPORT_KINDS: Array<BookingKind> = [
  'flight',
  'train',
  'bus',
  'ferry',
  'car',
]

export function isTransportKind(kind: BookingKind): boolean {
  return TRANSPORT_KINDS.includes(kind)
}

/**
 * 深夜のチェックインを「前日の夜の続き」とみなす上限(その宿の現地の時)。
 * この時刻より前に始まる宿泊が対象。
 *
 * 深夜 02:00 に着いてそのまま入る旅程は珍しくないが、暦の上ではチェックイン日が
 * 翌日になる。人が寝たのは前の日の夜なので、暦の日付をそのまま最初の夜として数えると
 * 判定が両方向に狂う。実際に寝ている夜が「寝る場所がない夜」として警告に出て、
 * まだ空いている翌日の夜は埋まったことになり、本当の穴が見えなくなる。
 * ここは一番重要な判定なので、暦ではなく夜の側に寄せる。
 * (宿の側の慣行も同じで、深夜着はふつう前日からの 1 泊として扱われる)
 *
 * 5 時で切るのは、深夜便の到着が 0 時台〜4 時台に集中する一方、
 * 5 時を過ぎた到着は「朝に着いて、その日から泊まる」と読むほうが自然になるためである。
 * これより遅い時刻まで前夜扱いを広げると、朝に入る宿が前の夜を埋めたことになり、
 * 本当に空いている夜を見逃す。見逃しより誤警告に倒す方針からも、広げるほうが危ない。
 */
export const LATE_NIGHT_CHECKIN_HOUR = 5

/**
 * チェックインが深夜(= 前日の夜の続き)か。
 *
 * 終日の宿泊は対象外。終日は時刻を持たず現地 00:00 として保存されるだけなので
 * (types.ts の Stamp 参照)、0 時ちょうどとして扱うと終日の宿がすべて
 * 前日から始まることになる。
 *
 * 並び順(ordering.ts)もこの判定を使う。夜の数え方と並び順で答えが割れると、
 * 画面では 8/17 の頭に泊まっているのに進捗タブは 8/16 の夜を埋めたと言う、
 * という説明のつかない食い違いになる。
 */
export function isLateNightCheckIn(start: Stamp): boolean {
  if (start.allDay) return false
  const zdt = tryParseStamp(start)
  return zdt !== null && zdt.hour < LATE_NIGHT_CHECKIN_HOUR
}

/**
 * その宿がカバーする夜の範囲 [最初の夜, 最後の夜の翌日)。開始が壊れていれば undefined。
 * チェックアウト側は暦の日付をそのまま使う。「11:00 チェックアウト」は
 * 11:00 に出る以上の意味を持たないので、深夜側のような読み替えは要らない。
 */
function lodgingNightRange(
  booking: Booking,
): { from: string; to: string } | undefined {
  const start = tryParseStamp(booking.start)
  if (start === null) return undefined
  const checkInDate = start.toPlainDate().toString()
  const from = isLateNightCheckIn(booking.start)
    ? addDays(checkInDate, -1)
    : checkInDate

  const end = booking.end === null ? null : tryParseStamp(booking.end)
  const to = end === null ? undefined : end.toPlainDate().toString()
  return { from, to: to !== undefined && to > from ? to : addDays(from, 1) }
}

/**
 * その宿がその夜をカバーするか。
 *
 * itinerary.ts の「移動と移動の間に宿があるか」もこれを使う。
 * 同じ問いに 2 つの実装があると、進捗タブの「寝る場所がない夜」と
 * 旅程の指摘とで言うことが食い違い、どちらを信じればよいのか分からなくなる。
 */
export function lodgingCoversNight(
  booking: Booking,
  nightDate: string,
): boolean {
  const range = lodgingNightRange(booking)
  if (range === undefined) return false
  return range.from <= nightDate && nightDate < range.to
}

/** その移動がその夜をカバーするか(車中泊・機内泊) */
function transportCoversNight(booking: Booking, nightDate: string): boolean {
  if (booking.end === null) return false
  const start = tryParseStamp(booking.start)
  const end = tryParseStamp(booking.end)
  if (start === null || end === null) return false

  const departDate = start.toPlainDate().toString()
  const arriveDate = end.toPlainDate().toString()
  // 日をまたいでいない移動(同日着・日付変更線を跨いで前日着)は夜行ではない
  if (arriveDate <= departDate) return false

  return departDate <= nightDate && nightDate < arriveDate
}

/** 旅行期間の各夜のカバー状況 */
export function computeNights(state: TripNotesState): Array<NightSlot> {
  const nightCount = Math.max(0, diffDays(state.startDate, state.endDate))
  const alive = state.bookings.filter((b) => b.status !== 'cancelled')
  const lodgings = alive.filter((b) => b.kind === 'lodging')
  const transports = alive.filter((b) => isTransportKind(b.kind))

  const slots: Array<NightSlot> = []
  for (let i = 0; i < nightCount; i++) {
    const date = addDays(state.startDate, i)

    // 宿が優先。夜行移動と宿が同じ夜にあるなら、寝るのは宿のほう
    const lodging = lodgings.find((b) => lodgingCoversNight(b, date))
    if (lodging) {
      slots.push({ date, covered: 'lodging', bookingId: lodging.id })
      continue
    }

    const overnight = transports.find((b) => transportCoversNight(b, date))
    if (overnight) {
      slots.push({ date, covered: 'overnight', bookingId: overnight.id })
      continue
    }

    slots.push({ date, covered: null })
  }
  return slots
}

export function countUncoveredNights(nights: Array<NightSlot>): number {
  return nights.filter((n) => n.covered === null).length
}

/**
 * その夜をカバーしているのが「まだ仮」の予約か(検討中・仮押さえ、または status が読めない)。
 *
 * bookingId から予約が引けない夜は仮の側に倒す。予約が消えた・id が食い違ったなどで
 * status が読めないだけなのに「確定済み」と言い切るほうが危ないためで、
 * NightCoverageStrip の resolveCellState も同じ判断をしている。
 * ここで流儀を変えると、帯のセルは破線(仮)なのに文言だけ「全泊確定」と言う、
 * 同じ画面の中で食い違う表示になる。
 */
function isTentativeNight(
  night: NightSlot,
  bookingsById: Map<string, Booking>,
): boolean {
  // 何もカバーしていない夜は「仮」ではなく「未確保」。countUncoveredNights の担当
  if (night.covered === null) return false
  const booking =
    night.bookingId === undefined
      ? undefined
      : bookingsById.get(night.bookingId)
  return booking?.status !== 'confirmed'
}

/**
 * 仮(検討中・仮押さえ)の予約でしか埋まっていない夜。宿でも夜行移動でも同じ扱いで、
 * まだ取っていない夜行便で埋まっている夜は「確保できた夜」ではない。
 *
 * ■ なぜカバー判定そのものを変えず、数え直すだけなのか
 *   仮の宿を「カバーされていない」側に倒すと、仮押さえだらけの旅程では
 *   夜カバレッジ帯も上段のアラートも赤で埋まる。そうなると本当に何も入っていない夜の
 *   赤がその中に埋もれて読み飛ばされる。このファイル冒頭の
 *   「見逃しより誤警告のほうがまし」という方針は、警告が読み飛ばされないことを
 *   前提にして初めて成立するので、警告の量を増やす方向の変更は方針に反する。
 *   一方で「すべて確保できています」と言い切るのは、仮押さえしかしていない夜まで
 *   含めると実態を超えた嘘になる(利用者からの指摘はここ)。
 *   そこでカバー判定(= 赤い警告を出すかどうか)は据え置いたまま、
 *   「確保できたと言い切ってよいか」を決めるための数だけを別に出す。
 *   画面はこれを使って、未確保あり=赤 / 仮あり=琥珀 / 全確定=緑 の 3 段階にする。
 */
export function findTentativeNights(
  nights: Array<NightSlot>,
  bookings: Array<Booking>,
): Array<NightSlot> {
  const bookingsById = new Map(bookings.map((b) => [b.id, b]))
  return nights.filter((night) => isTentativeNight(night, bookingsById))
}

export function countTentativeNights(
  nights: Array<NightSlot>,
  bookings: Array<Booking>,
): number {
  return findTentativeNights(nights, bookings).length
}
