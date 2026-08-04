/**
 * 進捗タブのカンバン表示の、列の組み立て。
 *
 * 予約状況と支払状況を別々の軸として切り替えるのは、この 2 つが独立した状態だからである
 * (types.ts の BookingStatus / PaymentStatus)。「確定しているが現地払い」も
 * 「まだ検討中だが前金だけ払った」もごく普通に起きるので、1 本の進捗に畳むと
 * どちらの意味で止まっているのかが読めなくなる。
 *
 * 列見出しに件数と通貨別の小計を出すのは、このカンバンの主目的が
 * 「未払いがいくら残っているか」を一目で掴むことにあるため。
 * 為替レートは持たないので通貨をまたいだ合計は出さない(derive.ts の summarizeBudget と同じ方針)。
 *
 * DOM も dnd-kit も知らない純粋な計算だけを置く。列の振り分けが正しいかは
 * 描画を通さずに確かめたいし、ドロップ操作そのものはテストしづらいためである。
 */

import { sortBookings } from '../../../../lib/trip-notes/derive'
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../-components/StatusBadge'
import type { TripNotesAction } from './reducer'
import type {
  Booking,
  BookingStatus,
  PaymentStatus,
} from '../../../../lib/trip-notes/types'

/** カンバンの軸 */
export type KanbanAxis = 'status' | 'payment'

export const KANBAN_AXIS_LABELS: Record<KanbanAxis, string> = {
  status: '予約状況',
  payment: '支払状況',
}

/**
 * 列の並び。左から「まだ手を付けていない」→「片付いた」の順で固定する。
 * 支払状況の「現地払い」だけは片付き具合の軸に乗らない状態なので最後に置く。
 * ラベルはバッジと同じものを使う。画面ごとに呼び名が違うと、
 * 同じ状態を指しているのかどうかが利用者に伝わらない。
 */
export const BOOKING_STATUS_COLUMNS: Array<BookingStatus> = [
  'idea',
  'held',
  'confirmed',
  'cancelled',
]

export const PAYMENT_STATUS_COLUMNS: Array<PaymentStatus> = [
  'unpaid',
  'deposit',
  'paid',
  'onsite',
]

/**
 * 列のドロップ先 id。
 * 予約の id と衝突しないよう接頭辞を付ける。予約 id は保存データ由来なので、
 * 共有 URL や手書きの JSON から 'unpaid' のような値で入ってきうる。
 */
const COLUMN_ID_PREFIX = 'kanban-column:'

export function columnDropId(axis: KanbanAxis, value: string): string {
  return `${COLUMN_ID_PREFIX}${axis}:${value}`
}

/** その id がカンバンの列かどうか。キーボード操作で列だけを拾うのに使う */
export function isColumnDropId(id: string): boolean {
  return id.startsWith(COLUMN_ID_PREFIX)
}

/**
 * ドロップ先 id を予約状況に読み替える。軸違いの列や列以外の id なら null。
 * 文字列を型で名乗らせる(as で押し込む)のではなく、列の定義そのものと突き合わせる。
 * 列を増やしたときに、読み替え側の更新漏れが起きようがない形にしておく。
 */
export function bookingStatusOfDropId(id: string): BookingStatus | null {
  return (
    BOOKING_STATUS_COLUMNS.find(
      (value) => columnDropId('status', value) === id,
    ) ?? null
  )
}

export function paymentStatusOfDropId(id: string): PaymentStatus | null {
  return (
    PAYMENT_STATUS_COLUMNS.find(
      (value) => columnDropId('payment', value) === id,
    ) ?? null
  )
}

/** 通貨別の小計 1 件分 */
export interface CurrencyTotal {
  currency: string
  amount: number
}

export interface KanbanColumn {
  /** dnd-kit に渡すドロップ先 id。カード上の <select> の option 値も兼ねる */
  dropId: string
  label: string
  /** 開始が早い順。並びは日程タブと揃える */
  bookings: Array<Booking>
  /** 通貨別の小計。金額が入っていない予約は数えようがないので含まれない */
  totals: Array<CurrencyTotal>
  /** 金額未入力で小計に載っていない予約の数。小計を過小に読ませないための但し書き */
  untotaledCount: number
}

/**
 * その軸のカンバンに載せる予約。
 *
 * 支払状況の軸ではキャンセル済みを外す。キャンセルした予約が「未払」列に残ると
 * 「あといくら払うのか」の答えが狂うためで、derive.ts の予算集計と同じ扱いにしてある。
 * 予約状況の軸では「キャンセル」がそれ自体 1 つの列なので、当然ながら外さない。
 */
export function bookingsForAxis(
  bookings: Array<Booking>,
  axis: KanbanAxis,
): Array<Booking> {
  if (axis === 'status') return bookings
  return bookings.filter((booking) => booking.status !== 'cancelled')
}

function hasAmount(booking: Booking): boolean {
  const price = booking.price
  return price !== undefined && Number.isFinite(price.amount)
}

function sumByCurrency(bookings: Array<Booking>): Array<CurrencyTotal> {
  const byCurrency = new Map<string, number>()
  for (const booking of bookings) {
    const price = booking.price
    if (price === undefined || !Number.isFinite(price.amount)) continue
    byCurrency.set(
      price.currency,
      (byCurrency.get(price.currency) ?? 0) + price.amount,
    )
  }
  return [...byCurrency.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .toSorted((a, b) => a.currency.localeCompare(b.currency))
}

function makeColumn(
  dropId: string,
  label: string,
  bookings: Array<Booking>,
): KanbanColumn {
  return {
    dropId,
    label,
    bookings,
    totals: sumByCurrency(bookings),
    untotaledCount: bookings.filter((booking) => !hasAmount(booking)).length,
  }
}

/**
 * 軸ごとの列。空の列も必ず返す。
 * 「未払が 0 件」は列そのものが消えるより、0 と書いてあるほうが安心できるうえ、
 * 列が消えるとドロップ先も消えて、そこへ戻す操作ができなくなる。
 */
export function buildKanbanColumns(
  bookings: Array<Booking>,
  axis: KanbanAxis,
  displayTz: string,
): Array<KanbanColumn> {
  const target = sortBookings(bookingsForAxis(bookings, axis), displayTz)

  if (axis === 'status') {
    return BOOKING_STATUS_COLUMNS.map((value) =>
      makeColumn(
        columnDropId('status', value),
        BOOKING_STATUS_LABELS[value],
        target.filter((booking) => booking.status === value),
      ),
    )
  }
  return PAYMENT_STATUS_COLUMNS.map((value) =>
    makeColumn(
      columnDropId('payment', value),
      PAYMENT_STATUS_LABELS[value],
      target.filter((booking) => booking.payment === value),
    ),
  )
}

/**
 * ドロップ(あるいはカード上の <select> の選択)を 1 つのアクションに読み替える。
 *
 * 値が変わらない場合と、列以外に落とした場合は null を返して何もしない。
 * アクションを 1 つに絞っているのは、Undo 1 回で元の列に戻せるようにするため。
 * ドラッグとセレクトで同じ関数を通すので、2 つの操作手段が食い違いようがない。
 */
export function dropToAction(
  booking: Booking,
  axis: KanbanAxis,
  dropId: string,
): TripNotesAction | null {
  if (axis === 'status') {
    const status = bookingStatusOfDropId(dropId)
    if (status === null || status === booking.status) return null
    return { type: 'setBookingStatus', id: booking.id, status }
  }
  const payment = paymentStatusOfDropId(dropId)
  if (payment === null || payment === booking.payment) return null
  return { type: 'setBookingPayment', id: booking.id, payment }
}

/**
 * 複数の予約をまとめて動かすときの読み替え。
 * カードを選択したままドラッグしたときも、一括操作バーで移動先を選んだときも、
 * この 1 つの関数を通す。dropToAction が「ドラッグとカード内の <select> で
 * 食い違いようがない」ことを保証しているのと同じ理由で、
 * 複数選択の 2 つの操作手段も 1 か所に集める。
 *
 * 何件動かしても返すアクションは 1 つにする。まとめて動かした結果を
 * Undo 1 回で戻せないと、10 件動かした人は 10 回取り消しを押すことになり、
 * それは実質「戻せない」のと変わらない(reducer.ts の verifyAllUnverified と同じ判断)。
 *
 * すでに移動先の列にいる予約は対象から外す。「この列のカードを全部選ぶ」を通ると
 * 動かす必要のないカードが選択に混ざるのはむしろ普通の使い方であり、
 * それでも結果は「動くものだけが動く」に落ち着かせる。
 * 動くものが 1 件も無ければ null を返し、空の 1 手を Undo 履歴に積ませない。
 */
export function dropToBulkAction(
  bookings: Array<Booking>,
  axis: KanbanAxis,
  dropId: string,
): TripNotesAction | null {
  if (axis === 'status') {
    const status = bookingStatusOfDropId(dropId)
    if (status === null) return null
    const ids = bookings
      .filter((booking) => booking.status !== status)
      .map((booking) => booking.id)
    if (ids.length === 0) return null
    return { type: 'setBookingsStatus', ids, status }
  }
  const payment = paymentStatusOfDropId(dropId)
  if (payment === null) return null
  const ids = bookings
    .filter((booking) => booking.payment !== payment)
    .map((booking) => booking.id)
  if (ids.length === 0) return null
  return { type: 'setBookingsPayment', ids, payment }
}

/** カードの <select> に出す選択肢。列と同じ順・同じ値にする */
export function axisOptions(
  axis: KanbanAxis,
): Array<{ value: string; label: string }> {
  if (axis === 'status') {
    return BOOKING_STATUS_COLUMNS.map((value) => ({
      value: columnDropId('status', value),
      label: BOOKING_STATUS_LABELS[value],
    }))
  }
  return PAYMENT_STATUS_COLUMNS.map((value) => ({
    value: columnDropId('payment', value),
    label: PAYMENT_STATUS_LABELS[value],
  }))
}

/** その予約がいま入っている列の dropId。<select> の現在値に使う */
export function currentDropId(booking: Booking, axis: KanbanAxis): string {
  return axis === 'status'
    ? columnDropId('status', booking.status)
    : columnDropId('payment', booking.payment)
}
