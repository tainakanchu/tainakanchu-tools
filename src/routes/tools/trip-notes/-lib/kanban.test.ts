/**
 * カンバンの列振り分けと、ドロップで走る状態更新のテスト。
 *
 * ドラッグ&ドロップそのもの(ポインタの座標や dnd-kit の内部状態)は
 * jsdom で再現しても実物の保証にならないので追わない。
 * 代わりに「どの列にどのカードが載るか」と
 * 「列をまたいだ結果どんなアクションになり、状態がどう変わるか」を分けて固める。
 * この 2 つが正しければ、間にあるのは dnd-kit が座標を渡すところだけになる。
 */

import { describe, expect, it } from 'vitest'
import {
  BOOKING_STATUS_COLUMNS,
  PAYMENT_STATUS_COLUMNS,
  axisOptions,
  bookingStatusOfDropId,
  bookingsForAxis,
  buildKanbanColumns,
  columnDropId,
  currentDropId,
  dropToAction,
  dropToBulkAction,
  isColumnDropId,
  paymentStatusOfDropId,
} from './kanban'
import { tripNotesReducer } from './reducer'
import type { KanbanColumn } from './kanban'
import type { Booking, TripNotesState } from '../../../../lib/trip-notes/types'

const TZ = 'Asia/Tokyo'

function makeBooking(id: string, overrides: Partial<Booking> = {}): Booking {
  return {
    id,
    kind: 'lodging',
    title: `宿 ${id}`,
    start: { zdt: '2026-06-12T15:00:00+09:00[Asia/Tokyo]', allDay: false },
    end: { zdt: '2026-06-14T10:00:00+09:00[Asia/Tokyo]', allDay: false },
    status: 'confirmed',
    payment: 'paid',
    ...overrides,
  }
}

function makeState(bookings: Array<Booking>): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'テスト旅行',
    startDate: '2026-06-12',
    endDate: '2026-06-16',
    pinnedTz: TZ,
    bookings,
    emergencyContacts: [],
  }
}

/** 列の中身を id の配列で取り出す。ラベル→カード の対応表にして読みやすくする */
function idsByLabel(
  columns: Array<KanbanColumn>,
): Record<string, Array<string>> {
  const map: Record<string, Array<string>> = {}
  for (const column of columns) {
    map[column.label] = column.bookings.map((booking) => booking.id)
  }
  return map
}

describe('buildKanbanColumns / 予約状況の軸', () => {
  it('4つの列がラベル込みで常に返る(空の列も消えない)', () => {
    const columns = buildKanbanColumns([], 'status')
    expect(columns.map((c) => c.label)).toEqual([
      '検討中',
      '仮押さえ',
      '確定',
      'キャンセル',
    ])
    expect(columns.every((c) => c.bookings.length === 0)).toBe(true)
  })

  it('予約が status ごとの列に振り分けられる', () => {
    const columns = buildKanbanColumns(
      [
        makeBooking('b1', { status: 'idea' }),
        makeBooking('b2', { status: 'held' }),
        makeBooking('b3', { status: 'confirmed' }),
        makeBooking('b4', { status: 'cancelled' }),
      ],
      'status',
    )
    expect(idsByLabel(columns)).toEqual({
      検討中: ['b1'],
      仮押さえ: ['b2'],
      確定: ['b3'],
      キャンセル: ['b4'],
    })
  })

  it('列の中は開始が早い順に並ぶ', () => {
    const columns = buildKanbanColumns(
      [
        makeBooking('late', {
          start: {
            zdt: '2026-06-15T09:00:00+09:00[Asia/Tokyo]',
            allDay: false,
          },
        }),
        makeBooking('early', {
          start: {
            zdt: '2026-06-12T09:00:00+09:00[Asia/Tokyo]',
            allDay: false,
          },
        }),
      ],
      'status',
    )
    expect(idsByLabel(columns)['確定']).toEqual(['early', 'late'])
  })
})

describe('buildKanbanColumns / 支払状況の軸', () => {
  it('予約が payment ごとの列に振り分けられる', () => {
    const columns = buildKanbanColumns(
      [
        makeBooking('b1', { payment: 'unpaid' }),
        makeBooking('b2', { payment: 'deposit' }),
        makeBooking('b3', { payment: 'paid' }),
        makeBooking('b4', { payment: 'onsite' }),
      ],
      'payment',
    )
    expect(idsByLabel(columns)).toEqual({
      未払: ['b1'],
      デポジットのみ: ['b2'],
      完済: ['b3'],
      現地払い: ['b4'],
    })
  })

  it('キャンセル済みは支払の軸には出ない(残額の答えが狂うため)', () => {
    const bookings = [
      makeBooking('alive', { payment: 'unpaid' }),
      makeBooking('dead', { payment: 'unpaid', status: 'cancelled' }),
    ]
    expect(bookingsForAxis(bookings, 'payment').map((b) => b.id)).toEqual([
      'alive',
    ])
    // 予約状況の軸では「キャンセル」が列そのものなので外さない
    expect(bookingsForAxis(bookings, 'status')).toHaveLength(2)

    const columns = buildKanbanColumns(bookings, 'payment')
    expect(idsByLabel(columns)['未払']).toEqual(['alive'])
  })
})

describe('buildKanbanColumns / 列見出しの集計', () => {
  it('通貨別に小計が出る(為替をまたいだ合計は作らない)', () => {
    const columns = buildKanbanColumns(
      [
        makeBooking('b1', {
          payment: 'unpaid',
          price: { amount: 120, currency: 'EUR' },
        }),
        makeBooking('b2', {
          payment: 'unpaid',
          price: { amount: 80, currency: 'EUR' },
        }),
        makeBooking('b3', {
          payment: 'unpaid',
          price: { amount: 30000, currency: 'JPY' },
        }),
      ],
      'payment',
    )
    const unpaid = columns.find((c) => c.label === '未払')
    expect(unpaid?.totals).toEqual([
      { currency: 'EUR', amount: 200 },
      { currency: 'JPY', amount: 30000 },
    ])
    expect(unpaid?.untotaledCount).toBe(0)
  })

  it('金額未入力の予約は小計に混ぜず、件数だけ別に数える', () => {
    const columns = buildKanbanColumns(
      [
        makeBooking('b1', {
          payment: 'unpaid',
          price: { amount: 120, currency: 'EUR' },
        }),
        makeBooking('b2', { payment: 'unpaid' }),
      ],
      'payment',
    )
    const unpaid = columns.find((c) => c.label === '未払')
    expect(unpaid?.totals).toEqual([{ currency: 'EUR', amount: 120 }])
    expect(unpaid?.untotaledCount).toBe(1)
    expect(unpaid?.bookings).toHaveLength(2)
  })

  it('キャンセル済みは支払の軸の小計にも入らない', () => {
    const columns = buildKanbanColumns(
      [
        makeBooking('alive', {
          payment: 'unpaid',
          price: { amount: 100, currency: 'EUR' },
        }),
        makeBooking('dead', {
          payment: 'unpaid',
          status: 'cancelled',
          price: { amount: 900, currency: 'EUR' },
        }),
      ],
      'payment',
    )
    expect(columns.find((c) => c.label === '未払')?.totals).toEqual([
      { currency: 'EUR', amount: 100 },
    ])
  })
})

describe('列のドロップ先 id', () => {
  it('予約 id と取り違えないよう接頭辞が付く', () => {
    expect(isColumnDropId(columnDropId('status', 'confirmed'))).toBe(true)
    // 予約 id が 'confirmed' や 'unpaid' でも列とは判定されない
    expect(isColumnDropId('confirmed')).toBe(false)
    expect(isColumnDropId('bk-1')).toBe(false)
  })

  it('自分の軸の列だけを読み替える', () => {
    for (const value of BOOKING_STATUS_COLUMNS) {
      expect(bookingStatusOfDropId(columnDropId('status', value))).toBe(value)
      expect(paymentStatusOfDropId(columnDropId('status', value))).toBeNull()
    }
    for (const value of PAYMENT_STATUS_COLUMNS) {
      expect(paymentStatusOfDropId(columnDropId('payment', value))).toBe(value)
      expect(bookingStatusOfDropId(columnDropId('payment', value))).toBeNull()
    }
  })

  it('列以外の id は null になる', () => {
    expect(bookingStatusOfDropId('bk-1')).toBeNull()
    expect(paymentStatusOfDropId('kanban-column:payment:unknown')).toBeNull()
  })

  it('<select> の選択肢は列と同じ順・同じ値になる', () => {
    const columns = buildKanbanColumns([], 'payment')
    expect(axisOptions('payment')).toEqual(
      columns.map((c) => ({ value: c.dropId, label: c.label })),
    )
    expect(
      currentDropId(makeBooking('b1', { payment: 'deposit' }), 'payment'),
    ).toBe(columnDropId('payment', 'deposit'))
  })
})

describe('dropToAction / ドロップの読み替え', () => {
  it('予約状況の軸では setBookingStatus になる', () => {
    expect(
      dropToAction(
        makeBooking('b1', { status: 'idea' }),
        'status',
        columnDropId('status', 'confirmed'),
      ),
    ).toEqual({ type: 'setBookingStatus', id: 'b1', status: 'confirmed' })
  })

  it('支払状況の軸では setBookingPayment になる', () => {
    expect(
      dropToAction(
        makeBooking('b1', { payment: 'unpaid' }),
        'payment',
        columnDropId('payment', 'paid'),
      ),
    ).toEqual({ type: 'setBookingPayment', id: 'b1', payment: 'paid' })
  })

  it('同じ列に戻したときと、列以外に落としたときは何もしない', () => {
    const booking = makeBooking('b1', { status: 'confirmed' })
    expect(
      dropToAction(booking, 'status', columnDropId('status', 'confirmed')),
    ).toBeNull()
    expect(dropToAction(booking, 'status', 'bk-9')).toBeNull()
    // 軸違いの列に落ちても取り違えて更新しない
    expect(
      dropToAction(booking, 'status', columnDropId('payment', 'unpaid')),
    ).toBeNull()
  })
})

describe('dropToBulkAction / まとめて動かすときの読み替え', () => {
  it('予約状況の軸では ids をまとめた setBookingsStatus 1 つになる', () => {
    expect(
      dropToBulkAction(
        [
          makeBooking('b1', { status: 'idea' }),
          makeBooking('b2', { status: 'held' }),
        ],
        'status',
        columnDropId('status', 'confirmed'),
      ),
    ).toEqual({
      type: 'setBookingsStatus',
      ids: ['b1', 'b2'],
      status: 'confirmed',
    })
  })

  it('支払状況の軸では setBookingsPayment になる', () => {
    expect(
      dropToBulkAction(
        [
          makeBooking('b1', { payment: 'unpaid' }),
          makeBooking('b2', { payment: 'deposit' }),
        ],
        'payment',
        columnDropId('payment', 'paid'),
      ),
    ).toEqual({
      type: 'setBookingsPayment',
      ids: ['b1', 'b2'],
      payment: 'paid',
    })
  })

  it('すでに移動先の列にいるカードは対象から外れる(選択に混ざっても壊れない)', () => {
    expect(
      dropToBulkAction(
        [
          makeBooking('already', { status: 'confirmed' }),
          makeBooking('moves', { status: 'idea' }),
        ],
        'status',
        columnDropId('status', 'confirmed'),
      ),
    ).toEqual({
      type: 'setBookingsStatus',
      ids: ['moves'],
      status: 'confirmed',
    })
  })

  it('全員がすでに移動先にいるなら何もしない(空の 1 手を履歴に積まない)', () => {
    expect(
      dropToBulkAction(
        [
          makeBooking('b1', { payment: 'paid' }),
          makeBooking('b2', { payment: 'paid' }),
        ],
        'payment',
        columnDropId('payment', 'paid'),
      ),
    ).toBeNull()
  })

  it('選択が空のときは何もしない', () => {
    expect(
      dropToBulkAction([], 'status', columnDropId('status', 'confirmed')),
    ).toBeNull()
  })

  it('列以外の id と軸違いの列には反応しない(単数版と同じ)', () => {
    const bookings = [makeBooking('b1', { status: 'idea' })]
    expect(dropToBulkAction(bookings, 'status', 'bk-9')).toBeNull()
    expect(
      dropToBulkAction(bookings, 'status', columnDropId('payment', 'unpaid')),
    ).toBeNull()
  })

  it('1 枚だけでも単数版と同じ結果になる(操作手段で挙動が変わらない)', () => {
    const booking = makeBooking('b1', { status: 'idea' })
    const dropId = columnDropId('status', 'held')
    expect(dropToAction(booking, 'status', dropId)).toEqual({
      type: 'setBookingStatus',
      id: 'b1',
      status: 'held',
    })
    expect(dropToBulkAction([booking], 'status', dropId)).toEqual({
      type: 'setBookingsStatus',
      ids: ['b1'],
      status: 'held',
    })

    // アクションの形は違っても、通したあとの状態は同じでなければならない
    const before = makeState([booking])
    expect(
      tripNotesReducer(before, {
        type: 'setBookingStatus',
        id: 'b1',
        status: 'held',
      }),
    ).toEqual(
      tripNotesReducer(before, {
        type: 'setBookingsStatus',
        ids: ['b1'],
        status: 'held',
      }),
    )
  })
})

describe('ドロップ後の状態更新 (reducer)', () => {
  it('setBookingStatus はその予約の status だけを書き換える', () => {
    const before = makeState([
      makeBooking('b1', { status: 'idea' }),
      makeBooking('b2', { status: 'idea' }),
    ])
    const after = tripNotesReducer(before, {
      type: 'setBookingStatus',
      id: 'b1',
      status: 'held',
    })
    expect(after.bookings[0].status).toBe('held')
    expect(after.bookings[0].payment).toBe('paid')
    expect(after.bookings[0].title).toBe('宿 b1')
    expect(after.bookings[1].status).toBe('idea')
  })

  it('setBookingPayment はその予約の payment だけを書き換える', () => {
    const before = makeState([makeBooking('b1', { payment: 'unpaid' })])
    const after = tripNotesReducer(before, {
      type: 'setBookingPayment',
      id: 'b1',
      payment: 'deposit',
    })
    expect(after.bookings[0].payment).toBe('deposit')
    expect(after.bookings[0].status).toBe('confirmed')
  })

  it('確認番号などカードが持たないフィールドは消えない', () => {
    const before = makeState([
      makeBooking('b1', {
        status: 'idea',
        confirmationNumber: 'ABC-123',
        provider: 'Booking.com',
        note: '朝食付き',
      }),
    ])
    const after = tripNotesReducer(before, {
      type: 'setBookingStatus',
      id: 'b1',
      status: 'confirmed',
    })
    expect(after.bookings[0].confirmationNumber).toBe('ABC-123')
    expect(after.bookings[0].provider).toBe('Booking.com')
    expect(after.bookings[0].note).toBe('朝食付き')
  })

  it('自分で選び直した軸の未確認マークは外れる(もう一方は残る)', () => {
    const before = makeState([
      makeBooking('b1', {
        status: 'idea',
        unverified: ['status', 'payment', 'start'],
      }),
    ])
    const after = tripNotesReducer(before, {
      type: 'setBookingStatus',
      id: 'b1',
      status: 'confirmed',
    })
    expect(after.bookings[0].unverified).toEqual(['payment', 'start'])
  })

  it('値が変わらない更新と、存在しない id は状態を変えない(同一参照)', () => {
    const before = makeState([makeBooking('b1', { status: 'confirmed' })])
    expect(
      tripNotesReducer(before, {
        type: 'setBookingStatus',
        id: 'b1',
        status: 'confirmed',
      }),
    ).toBe(before)
    expect(
      tripNotesReducer(before, {
        type: 'setBookingPayment',
        id: 'missing',
        payment: 'unpaid',
      }),
    ).toBe(before)
  })

  it('元の状態は書き換わらない(Undo で戻せる前提)', () => {
    const booking = makeBooking('b1', { status: 'idea' })
    const before = makeState([booking])
    tripNotesReducer(before, {
      type: 'setBookingStatus',
      id: 'b1',
      status: 'confirmed',
    })
    expect(booking.status).toBe('idea')
    expect(before.bookings[0].status).toBe('idea')
  })
})
