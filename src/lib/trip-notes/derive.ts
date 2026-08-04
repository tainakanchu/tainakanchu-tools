/**
 * TripNotesState からの派生値。状態としては持たず、必要になるたびに計算する。
 *
 * 設計原則:
 * - 並び順は必ず epoch(絶対時刻)で決める。タイムゾーンの違う予定が混ざるので、
 *   現地の壁時計時刻で並べると「パリ 23:00 発の次が東京 07:00 着」のような
 *   逆転が起きる。終日の予定と宿泊のみなしの時刻を含め、並び順の決め方は
 *   ordering.ts に集めてある(旅程の判定と 1 つの基準を共有するため)。
 * - 「何日の予定か」は、その予約自身の現地日付で決める。
 *   旅程は現地の暦で読むものだからである。「9/23 20:15 パリ発」の便は、
 *   日本時間では 9/24 03:15 になるが、利用者にとってはあくまで 9/23 の予定であって、
 *   9/24 の見出しの下に出てきたら旅程が 1 日ずれて見える。
 *   nights.ts の「寝る場所がある夜」も itinerary.ts の「何日の問題か」も
 *   もともとその予約自身の現地日付で動いており、画面だけが表示タイムゾーン基準だった。
 *   判定と画面で日付の定義が食い違っていたので、画面側をそろえた。
 * - 終日の予定も同じで、暦の日付そのものを事実として扱う。
 *   「6/12 は終日フリー」はどのタイムゾーンで見ても 6/12 の話。
 */

import {
  FALLBACK_TZ,
  addDays,
  diffDays,
  getDeviceTz,
  parseStamp,
  stampDate,
  stampToEndEpoch,
  stampToEpoch,
  tryParseStamp,
} from './datetime'
import { findTravelDocIssues } from './docs'
import { findItineraryIssues, isMoveBooking } from './itinerary'
import {
  computeNights,
  countTentativeNights,
  countUncoveredNights,
  isTransportKind,
} from './nights'
import { sortEpochOf } from './ordering'
import type {
  Booking,
  BookingStatus,
  BudgetByCurrency,
  CancelDeadline,
  CurrentAndNext,
  DayGroup,
  DayTimelineRow,
  NightSlot,
  PaymentStatus,
  TransportGap,
  TripNotesState,
  TripSummary,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 集計の器。キーを並べたリテラルで作る。
 * 空オブジェクトを Record として押し込む書き方だと、状態の種類が増えたときに
 * 初期化漏れが undefined のまま素通りして「合計だけ NaN」のような壊れ方をする。
 * リテラルで書いておけば、型が増えた時点で tsc がここを指してくれる。
 * 並び順は画面での列挙順にそのまま出るので、軽い順 → 重い順で固定しておく。
 */
function zeroByBookingStatus(): Record<BookingStatus, number> {
  return { idea: 0, held: 0, confirmed: 0, cancelled: 0 }
}

function zeroByPaymentStatus(): Record<PaymentStatus, number> {
  return { unpaid: 0, deposit: 0, paid: 0, onsite: 0 }
}

/**
 * 並べ替えの基準になる瞬間。終日と宿泊のみなしの時刻を含めて ordering.ts に任せる。
 * 画面の並びと旅程の判定(itinerary.ts)で基準が違うと、
 * 「画面では着いてから泊まっているのに、警告は泊まってから着くと言う」ことになる。
 */
function sortKey(booking: Booking): number {
  const zdt = tryParseStamp(booking.start)
  if (zdt === null) return Number.NaN
  return sortEpochOf(booking, zdt, isMoveBooking(booking))
}

/** 開始が早い順。壊れた Stamp は末尾に寄せて、画面から消えないようにする */
export function sortBookings(bookings: Array<Booking>): Array<Booking> {
  return bookings.toSorted((a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
    if (Number.isNaN(ka)) return Number.isNaN(kb) ? 0 : 1
    if (Number.isNaN(kb)) return -1
    if (ka !== kb) return ka - kb
    // 同時刻なら終日を先に(終日は「その日の見出し」の側なので前に出す)
    if (a.start.allDay !== b.start.allDay) return a.start.allDay ? -1 : 1
    return a.title.localeCompare(b.title, 'ja')
  })
}

/** ongoing 判定の下準備。開始日・終了日を文字列として 1 回だけ計算しておく */
interface OngoingCandidate {
  booking: Booking
  startDate: string
  endDate: string
}

/**
 * ongoing の対象候補。end が無い予約は「継続の終わり」が定義できないので除外し、
 * キャンセル済みも除外する(簡易行は「その日どこにいるか」を示すものなので、
 * キャンセルした宿を滞在中と出すのは誤りになる)。
 * Stamp が壊れている(パースできない)ものも安全側に倒して除外する。
 */
function findOngoingCandidates(
  sorted: Array<Booking>,
): Array<OngoingCandidate> {
  const candidates: Array<OngoingCandidate> = []
  for (const booking of sorted) {
    if (booking.status === 'cancelled') continue
    if (booking.end === null) continue
    if (tryParseStamp(booking.start) === null) continue
    if (tryParseStamp(booking.end) === null) continue
    candidates.push({
      booking,
      // 開始も終了もその予約自身の現地日付。日付の見出し側と同じ物差しで比べないと、
      // 「継続中」の行が 1 日ずれた見出しの下に出る
      startDate: stampDate(booking.start),
      endDate: stampDate(booking.end),
    })
  }
  return candidates
}

/**
 * その予約自身の現地日付で束ねる。
 *
 * 予約は「開始日」の 1 か所にだけ置く。3 泊の宿を 3 日分に複製すると
 * 一覧が宿で埋まって当日の予定が読めなくなるため。
 * 終了側(チェックアウト・到着)は各カードの end と、その日の夜のカバー表示で分かる。
 *
 * ただし開始日だけに置くと、連泊中の宿(2 泊目以降)や日をまたぐ移動の
 * 「その日は何もない」ように見えてしまう。実際にはその宿に滞在中/その移動の
 * 途中なので、bookings とは別に ongoing として同じ日に添える。
 * ongoing は「その日開始日ではないが、その日も continue している」もの
 * (開始日 < その日 <= 終了日、いずれもその予約自身の現地日付)で、終了日当日
 * (チェックアウト・到着の日)も含む。bookings 側と重複しないよう、
 * 開始日そのものは ongoing に含めない。
 *
 * 旅行期間外の日付に予約がある場合(前泊や延泊)もその日を作る。
 * 期間の指定ミスで予約が画面から消えるのが一番困る。
 */
export function groupByDay(
  bookings: Array<Booking>,
  state: TripNotesState,
): Array<DayGroup> {
  const sorted = sortBookings(bookings)
  const byDate = new Map<string, Array<Booking>>()
  for (const booking of sorted) {
    if (tryParseStamp(booking.start) === null) continue
    const date = stampDate(booking.start)
    const list = byDate.get(date)
    if (list) list.push(booking)
    else byDate.set(date, [booking])
  }

  const nightByDate = new Map(computeNights(state).map((n) => [n.date, n]))
  const ongoingCandidates = findOngoingCandidates(sorted)

  const dates = new Set<string>(byDate.keys())
  const tripDays = Math.max(0, diffDays(state.startDate, state.endDate))
  for (let i = 0; i <= tripDays; i++) dates.add(addDays(state.startDate, i))

  return [...dates].toSorted().map((date) => ({
    date,
    bookings: byDate.get(date) ?? [],
    // sortBookings 済みの sorted から作っているので、ここでも開始が早い順を保つ
    ongoing: ongoingCandidates
      .filter((c) => c.startDate < date && date <= c.endDate)
      .map((c) => c.booking),
    night: nightByDate.get(date) ?? null,
  }))
}

/**
 * 継続行(ongoing)の並び順の鍵。分からなければ null。
 *
 * その日が終了日の行は「チェックアウト 12:00」「到着 06:00」と時刻まで出るので、
 * その終了時刻が並び順の根拠になる。まだ継続中の行(滞在中・移動中・継続中)は
 * その日のどこにも点を持たないので鍵を作らず、その日の先頭に置く。
 */
function ongoingSortKey(booking: Booking, date: string): number | null {
  const end = booking.end
  // 終日の終了は時刻を持たない(画面にも時刻が出ない)ので、先頭側に寄せる
  if (end === null || end.allDay) return null
  const zdt = tryParseStamp(end)
  if (zdt === null) return null
  // その日が終了日でなければ、この日はまだ滞在/移動の途中
  if (zdt.toPlainDate().toString() !== date) return null
  return zdt.epochMilliseconds
}

/**
 * その日に表示する行を、時刻順に 1 本の列にまとめる。
 *
 * 継続行をまとめて先頭に出していたころは、「12:00 チェックアウト」の行が
 * その日の朝 09:00 の予定より前に並んでいた。前日から続いているという事実と、
 * その行がその日のいつの出来事かは別の話なので、同じ時間軸に載せる。
 *
 * 時刻の鍵を持たない継続行(まだ滞在中・移動中)はその日の先頭に固める。
 * 同じ時刻に並んだときは継続行を先に出す(入力の順を保つ安定ソート)。
 * 「12:00 にチェックアウトして、12:00 の列車に乗る」は、出てから乗る順に読める。
 */
export function dayTimeline(day: DayGroup): Array<DayTimelineRow> {
  const rows: Array<DayTimelineRow & { sortKey: number | null }> = [
    ...day.ongoing.map((booking) => ({
      row: 'ongoing' as const,
      booking,
      sortKey: ongoingSortKey(booking, day.date),
    })),
    // groupByDay が壊れた Stamp の予約を落としているので、ここに NaN は来ない
    ...day.bookings.map((booking) => ({
      row: 'booking' as const,
      booking,
      sortKey: sortKey(booking),
    })),
  ]

  return rows
    .toSorted((a, b) => {
      if (a.sortKey === null || b.sortKey === null) {
        if (a.sortKey === b.sortKey) return 0
        return a.sortKey === null ? -1 : 1
      }
      return a.sortKey - b.sortKey
    })
    .map(({ row, booking }) => ({ row, booking }))
}

/**
 * 予約が占める時間帯 [開始, 終了]。
 * end が無い時刻付きの予定は瞬間(所要時間を勝手に作らない)。
 * end が無い終日の予定はその日いっぱい。
 */
function intervalOf(booking: Booking): { from: number; to: number } | null {
  const start = tryParseStamp(booking.start)
  if (start === null) return null
  const from = start.epochMilliseconds

  if (booking.end !== null && tryParseStamp(booking.end) !== null) {
    const to = stampToEpoch(booking.end)
    return { from, to: Math.max(from, to) }
  }
  return {
    from,
    to: booking.start.allDay ? stampToEndEpoch(booking.start) : from,
  }
}

/**
 * 「今」進行中のものと「次」に来るもの。旅行中トップ画面の主役。
 * キャンセル済みは対象外(キャンセルした宿に「滞在中」と出ては困る)。
 */
export function findCurrentAndNext(
  bookings: Array<Booking>,
  nowMs: number,
): CurrentAndNext {
  const alive = sortBookings(bookings.filter((b) => b.status !== 'cancelled'))

  const current: Array<Booking> = []
  const upcoming: Array<Booking> = []
  for (const booking of alive) {
    const interval = intervalOf(booking)
    if (interval === null) continue
    if (interval.from > nowMs) upcoming.push(booking)
    else if (interval.to > nowMs) current.push(booking)
  }

  return { current, next: upcoming[0] ?? null, upcoming }
}

/** 宿の場所の同一性。場所が未入力なら題名で代用する */
function lodgingLabel(booking: Booking): string {
  return (booking.place?.name ?? booking.title).trim()
}

/**
 * 連続する宿で場所が変わるのに、その間に移動の予約が無い箇所。
 *
 * 「宿は 2 つとも取ったが、その間の列車を取り忘れている」を拾うためのもの。
 * 前の宿のチェックアウト日の 00:00 から次の宿のチェックイン日の終わりまでの間に
 * 始まる移動が 1 つでもあれば埋まっているとみなす。チェックアウトと
 * チェックインが同じ日とは限らない(間に夜行を挟むなど)ので、
 * 移動日をチェックアウト当日に限定せず幅を持たせている。
 */
export function findTransportGaps(state: TripNotesState): Array<TransportGap> {
  const alive = state.bookings.filter((b) => b.status !== 'cancelled')
  const lodgings = alive
    .filter((b) => b.kind === 'lodging' && tryParseStamp(b.start) !== null)
    .toSorted((a, b) => stampToEpoch(a.start) - stampToEpoch(b.start))
  const transports = alive.filter(
    (b) => isTransportKind(b.kind) && tryParseStamp(b.start) !== null,
  )

  const gaps: Array<TransportGap> = []
  for (let i = 0; i + 1 < lodgings.length; i++) {
    const prev = lodgings[i]
    const next = lodgings[i + 1]
    if (lodgingLabel(prev) === lodgingLabel(next)) continue

    const checkOutDate =
      prev.end !== null && tryParseStamp(prev.end) !== null
        ? parseStamp(prev.end).toPlainDate().toString()
        : addDays(parseStamp(prev.start).toPlainDate().toString(), 1)
    const checkInDate = parseStamp(next.start).toPlainDate().toString()
    if (checkInDate < checkOutDate) continue

    const tz = parseStamp(next.start).timeZoneId
    const windowFrom =
      Temporal.PlainDate.from(checkOutDate).toZonedDateTime(
        tz,
      ).epochMilliseconds
    const windowTo = Temporal.PlainDate.from(checkInDate)
      .add({ days: 1 })
      .toZonedDateTime(tz).epochMilliseconds

    const filled = transports.some((t) => {
      const at = stampToEpoch(t.start)
      return at >= windowFrom && at < windowTo
    })
    if (filled) continue

    gaps.push({
      date: checkOutDate,
      fromBookingId: prev.id,
      toBookingId: next.id,
      fromLabel: lodgingLabel(prev),
      toLabel: lodgingLabel(next),
    })
  }
  return gaps
}

/**
 * 無料キャンセル期限が近い順。過ぎたものは除く。
 *
 * 期限はその宿の現地時間の日末まで有効とみなす。日本時間の 00:00 で切ると
 * まだ間に合う予約を「期限切れ」と表示してしまい、慌てて損切りしかねない。
 */
export function computeCancelDeadlines(
  bookings: Array<Booking>,
  nowMs: number,
): Array<CancelDeadline> {
  const deadlines: Array<CancelDeadline> = []
  for (const booking of bookings) {
    if (booking.status === 'cancelled') continue
    const until = booking.freeCancelUntil
    if (until === undefined) continue
    const start = tryParseStamp(booking.start)
    if (start === null) continue

    let endOfDay: number
    try {
      endOfDay =
        Temporal.PlainDate.from(until)
          .add({ days: 1 })
          .toZonedDateTime(start.timeZoneId).epochMilliseconds - 1
    } catch {
      continue
    }
    if (endOfDay <= nowMs) continue

    deadlines.push({
      bookingId: booking.id,
      title: booking.title,
      date: until,
      // 切り捨て。「あと 0 日」= 今日中に決めないと課金される
      daysLeft: Math.max(0, Math.floor((endOfDay - nowMs) / DAY_MS)),
    })
  }
  return deadlines.toSorted((a, b) => a.date.localeCompare(b.date))
}

function emptyBudget(currency: string): BudgetByCurrency {
  return {
    currency,
    total: 0,
    byStatus: zeroByBookingStatus(),
    byPayment: zeroByPaymentStatus(),
    confirmed: 0,
    paid: 0,
    outstanding: 0,
  }
}

/**
 * 通貨別の集計。為替レートは持たない。
 * レートは日々動くうえ、利用者がどのレートで両替したかはアプリには分からない。
 * 適当なレートで合計した「それらしい 1 つの数字」を出すより、
 * 通貨ごとに正確な数字を並べるほうが判断に使える。
 */
export function summarizeBudget(
  bookings: Array<Booking>,
): Array<BudgetByCurrency> {
  const byCurrency = new Map<string, BudgetByCurrency>()

  for (const booking of bookings) {
    const price = booking.price
    if (price === undefined || !Number.isFinite(price.amount)) continue

    const entry = byCurrency.get(price.currency) ?? emptyBudget(price.currency)
    byCurrency.set(price.currency, entry)

    entry.byStatus[booking.status] += price.amount
    if (booking.status === 'cancelled') continue

    entry.total += price.amount
    entry.byPayment[booking.payment] += price.amount
    if (booking.status === 'confirmed') entry.confirmed += price.amount
    if (booking.payment === 'paid') entry.paid += price.amount
    // deposit は内金の額を持たないので全額を残額として数える。
    // 予算は過大に見積もっておくほうが旅先で困らない
    else entry.outstanding += price.amount
  }

  return [...byCurrency.values()].toSorted((a, b) =>
    a.currency.localeCompare(b.currency),
  )
}

/**
 * 手続き(docs.ts)の判定に使う「今日」。
 *
 * 手続きは時刻を持たない日付だけのデータなので(types.ts の TravelDoc 参照)、
 * 「今日」がどのタイムゾーンの今日なのかを外から決めてやる必要がある。
 * 予約の期限(computeCancelDeadlines)はその予約自身の現地時間で数えられるが、
 * 手続きには紐づく場所が無いので同じ手は使えない。
 *
 * 表示タイムゾーン(pinnedTz、無ければデバイス)に合わせるのは、画面に出る
 * 「あと 3 日」と利用者が見ているカレンダーの日付をずらさないため。
 */
function todayISOIn(state: TripNotesState, nowMs: number): string {
  const instant = Temporal.Instant.fromEpochMilliseconds(nowMs)
  try {
    return instant
      .toZonedDateTimeISO(state.pinnedTz ?? getDeviceTz())
      .toPlainDate()
      .toString()
  } catch {
    return instant.toZonedDateTimeISO(FALLBACK_TZ).toPlainDate().toString()
  }
}

/** AI 由来の未確認フィールドが残っている予約数。キャンセル済みは数えない */
export function countUnverified(bookings: Array<Booking>): number {
  return bookings.filter(
    (b) =>
      b.status !== 'cancelled' &&
      b.unverified !== undefined &&
      b.unverified.length > 0,
  ).length
}

/** 進捗サマリ。「あと何を予約すればいいか」を 1 画面で出すための束 */
export function computeSummary(
  state: TripNotesState,
  nowMs: number,
): TripSummary {
  const nights: Array<NightSlot> = computeNights(state)

  const statusCounts = zeroByBookingStatus()
  for (const booking of state.bookings) statusCounts[booking.status] += 1

  return {
    totalNights: nights.length,
    nights,
    uncoveredNights: countUncoveredNights(nights),
    tentativeNights: countTentativeNights(nights, state.bookings),
    bookingCount: state.bookings.filter((b) => b.status !== 'cancelled').length,
    statusCounts,
    unverifiedCount: countUnverified(state.bookings),
    transportGaps: findTransportGaps(state),
    itineraryIssues: findItineraryIssues(state),
    travelDocIssues: findTravelDocIssues(state, todayISOIn(state, nowMs)),
    cancelDeadlines: computeCancelDeadlines(state.bookings, nowMs),
    budget: summarizeBudget(state.bookings),
    currentAndNext: findCurrentAndNext(state.bookings, nowMs),
  }
}
