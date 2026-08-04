import { describe, expect, it } from 'vitest'
import { createHistory, historyReducer, tripNotesReducer } from './reducer'
import type {
  Booking,
  EmergencyContact,
  TripNotesState,
} from '../../../../lib/trip-notes/types'

function makeState(overrides: Partial<TripNotesState> = {}): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'ヨーロッパ周遊',
    startDate: '2026-06-12',
    endDate: '2026-06-19',
    pinnedTz: null,
    bookings: [],
    emergencyContacts: [],
    ...overrides,
  }
}

function makeBooking(id: string, overrides: Partial<Booking> = {}): Booking {
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

function contact(id: string, label: string): EmergencyContact {
  return { id, label, value: '+33-1-2345-6789' }
}

describe('tripNotesReducer / 予約の CRUD', () => {
  it('追加した予約が末尾に積まれる', () => {
    const next = tripNotesReducer(makeState(), {
      type: 'addBooking',
      booking: makeBooking('b1'),
    })
    expect(next.bookings.map((b) => b.id)).toEqual(['b1'])
  })

  it('更新は id が一致する予約だけを置き換える', () => {
    const base = makeState({
      bookings: [makeBooking('b1'), makeBooking('b2')],
    })
    const next = tripNotesReducer(base, {
      type: 'updateBooking',
      booking: makeBooking('b2', { title: '書き換えた宿' }),
    })
    expect(next.bookings[0].title).toBe('宿 b1')
    expect(next.bookings[1].title).toBe('書き換えた宿')
  })

  it('存在しない id の更新・削除は状態を変えない(同一参照を返す)', () => {
    const base = makeState({ bookings: [makeBooking('b1')] })
    expect(
      tripNotesReducer(base, {
        type: 'updateBooking',
        booking: makeBooking('nope'),
      }),
    ).toBe(base)
    expect(tripNotesReducer(base, { type: 'removeBooking', id: 'nope' })).toBe(
      base,
    )
  })

  it('削除すると残りだけになる', () => {
    const base = makeState({
      bookings: [makeBooking('b1'), makeBooking('b2')],
    })
    const next = tripNotesReducer(base, { type: 'removeBooking', id: 'b1' })
    expect(next.bookings.map((b) => b.id)).toEqual(['b2'])
  })
})

describe('tripNotesReducer / 未確認フィールド', () => {
  const base = makeState({
    bookings: [
      makeBooking('b1', { unverified: ['start', 'confirmationNumber'] }),
    ],
  })

  it('verifyField は指定したフィールドだけを外す', () => {
    const next = tripNotesReducer(base, {
      type: 'verifyField',
      id: 'b1',
      field: 'start',
    })
    expect(next.bookings[0].unverified).toEqual(['confirmationNumber'])
  })

  it('最後の1つを外すと unverified プロパティごと消える', () => {
    const one = makeState({
      bookings: [makeBooking('b1', { unverified: ['start'] })],
    })
    const next = tripNotesReducer(one, {
      type: 'verifyField',
      id: 'b1',
      field: 'start',
    })
    expect('unverified' in next.bookings[0]).toBe(false)
  })

  it('verifyAllFields でまとめて確認済みになる', () => {
    const next = tripNotesReducer(base, { type: 'verifyAllFields', id: 'b1' })
    expect('unverified' in next.bookings[0]).toBe(false)
  })

  it('verifyAllUnverified は ids で指定した予約だけをまとめて確認済みにする', () => {
    const many = makeState({
      bookings: [
        makeBooking('b1', { unverified: ['start', 'title'] }),
        makeBooking('b2', { unverified: ['title'] }),
        makeBooking('b3', { unverified: ['note'] }),
      ],
    })
    const next = tripNotesReducer(many, {
      type: 'verifyAllUnverified',
      ids: ['b1', 'b3'],
    })
    expect('unverified' in next.bookings[0]).toBe(false)
    expect(next.bookings[1].unverified).toEqual(['title'])
    expect('unverified' in next.bookings[2]).toBe(false)
  })

  it('verifyAllUnverified を ids 無しで呼ぶと全予約が対象になる', () => {
    const many = makeState({
      bookings: [
        makeBooking('b1', { unverified: ['start'] }),
        makeBooking('b2', { unverified: ['title', 'note'] }),
      ],
    })
    const next = tripNotesReducer(many, { type: 'verifyAllUnverified' })
    expect(next.bookings.every((b) => !('unverified' in b))).toBe(true)
  })

  it('外すものが1つも無い verifyAllUnverified は状態を変えない(同一参照)', () => {
    // 空の1手を Undo 履歴に積むと、「元に戻す」が何も起きないまま消費される
    const clean = makeState({ bookings: [makeBooking('b1')] })
    expect(tripNotesReducer(clean, { type: 'verifyAllUnverified' })).toBe(clean)
    expect(
      tripNotesReducer(base, { type: 'verifyAllUnverified', ids: ['nope'] }),
    ).toBe(base)
  })

  it('値を書き換えて更新すると、そのフィールドは自動で未確認から外れる', () => {
    // AI が入れた出発時刻を人間が直したのに黄色い下線が残るのは筋が通らない
    const updated = makeBooking('b1', {
      unverified: ['start', 'confirmationNumber'],
      start: { zdt: '2026-06-12T18:30:00+02:00[Europe/Paris]', allDay: false },
    })
    const next = tripNotesReducer(base, {
      type: 'updateBooking',
      booking: updated,
    })
    expect(next.bookings[0].unverified).toEqual(['confirmationNumber'])
  })

  it('値が変わっていないフィールドは未確認のまま残る', () => {
    const next = tripNotesReducer(base, {
      type: 'updateBooking',
      booking: makeBooking('b1', {
        unverified: ['start', 'confirmationNumber'],
        note: '追記しただけ',
      }),
    })
    expect(next.bookings[0].unverified).toEqual(['start', 'confirmationNumber'])
  })
})

describe('tripNotesReducer / AI 取り込みのバルク追加', () => {
  it('既存の予約を消さずに末尾へ足す', () => {
    // 手入力済みの予約を巻き込むと確認番号が失われて復元できない
    const base = makeState({ bookings: [makeBooking('manual')] })
    const next = tripNotesReducer(base, {
      type: 'importBookings',
      bookings: [makeBooking('ai1'), makeBooking('ai2')],
    })
    expect(next.bookings.map((b) => b.id)).toEqual(['manual', 'ai1', 'ai2'])
  })

  it('空配列の取り込みは状態を変えない', () => {
    const base = makeState({ bookings: [makeBooking('manual')] })
    expect(
      tripNotesReducer(base, { type: 'importBookings', bookings: [] }),
    ).toBe(base)
  })
})

describe('tripNotesReducer / 旅行の基本情報と緊急連絡先', () => {
  it('同じ値のセットは状態を変えない', () => {
    const base = makeState()
    expect(
      tripNotesReducer(base, { type: 'setTripTitle', title: base.tripTitle }),
    ).toBe(base)
    expect(tripNotesReducer(base, { type: 'setPinnedTz', tz: null })).toBe(base)
  })

  it('旅行期間の日付を有効な日付に更新できる', () => {
    const next = tripNotesReducer(makeState(), {
      type: 'setStartDate',
      date: '2026-06-13',
    })
    expect(next.startDate).toBe('2026-06-13')
  })

  it('空文字や不正な日付は無視して直前の期間を保つ', () => {
    // <input type="date"> のクリア操作で空文字が飛んでくる。
    // これを状態に入れると computeNights が Temporal の RangeError で落ち、
    // 画面全体が白くなってしまう
    const base = makeState()
    expect(tripNotesReducer(base, { type: 'setStartDate', date: '' })).toBe(
      base,
    )
    expect(tripNotesReducer(base, { type: 'setEndDate', date: '' })).toBe(base)
    expect(
      tripNotesReducer(base, { type: 'setStartDate', date: '2026-02-30' }),
    ).toBe(base)
  })

  it('表示タイムゾーンを固定できる', () => {
    const next = tripNotesReducer(makeState(), {
      type: 'setPinnedTz',
      tz: 'Europe/Paris',
    })
    expect(next.pinnedTz).toBe('Europe/Paris')
  })

  it('緊急連絡先を追加・更新・削除できる', () => {
    const added = tripNotesReducer(makeState(), {
      type: 'addContact',
      contact: contact('c1', '大使館'),
    })
    expect(added.emergencyContacts).toHaveLength(1)

    const updated = tripNotesReducer(added, {
      type: 'updateContact',
      contact: { ...contact('c1', 'カード紛失窓口'), note: '24時間' },
    })
    expect(updated.emergencyContacts[0].label).toBe('カード紛失窓口')

    const removed = tripNotesReducer(updated, {
      type: 'removeContact',
      id: 'c1',
    })
    expect(removed.emergencyContacts).toHaveLength(0)
  })

  it('resetAll は初期状態に戻す', () => {
    const base = makeState({ bookings: [makeBooking('b1')] })
    const next = tripNotesReducer(base, {
      type: 'resetAll',
      today: '2026-08-01',
    })
    expect(next.bookings).toHaveLength(0)
    expect(next.startDate).toBe('2026-08-01')
  })
})

describe('historyReducer / Undo・Redo', () => {
  it('編集を取り消して、やり直せる', () => {
    const history = createHistory(makeState())
    const added = historyReducer(history, {
      type: 'addBooking',
      booking: makeBooking('b1'),
    })
    expect(added.present.bookings).toHaveLength(1)
    expect(added.past).toHaveLength(1)

    const undone = historyReducer(added, { type: 'undo' })
    expect(undone.present.bookings).toHaveLength(0)
    expect(undone.future).toHaveLength(1)

    const redone = historyReducer(undone, { type: 'redo' })
    expect(redone.present.bookings).toHaveLength(1)
    expect(redone.future).toHaveLength(0)
  })

  it('履歴が無いときの undo / redo は何もしない', () => {
    const history = createHistory(makeState())
    expect(historyReducer(history, { type: 'undo' })).toBe(history)
    expect(historyReducer(history, { type: 'redo' })).toBe(history)
  })

  it('undo のあとに新しい編集をすると redo 先は捨てられる', () => {
    const history = createHistory(makeState())
    const added = historyReducer(history, {
      type: 'addBooking',
      booking: makeBooking('b1'),
    })
    const undone = historyReducer(added, { type: 'undo' })
    const branched = historyReducer(undone, {
      type: 'addBooking',
      booking: makeBooking('b2'),
    })
    expect(branched.future).toHaveLength(0)
    expect(branched.present.bookings.map((b) => b.id)).toEqual(['b2'])
  })

  it('状態が変わらないアクションは履歴を積まない', () => {
    // 「元に戻す」を押したのに何も起きない空振りを作らないため
    const history = createHistory(makeState())
    const same = historyReducer(history, {
      type: 'setTripTitle',
      title: 'ヨーロッパ周遊',
    })
    expect(same).toBe(history)
  })

  it('共有データの読み込みは丸ごと上書きし、undo で元に戻せる', () => {
    // 上書きは取り返しが付かない操作なので、必ず戻せることを保証する
    const history = createHistory(
      makeState({ bookings: [makeBooking('mine')] }),
    )
    const shared = makeState({
      tripTitle: '同行者から共有された旅程',
      bookings: [makeBooking('shared1'), makeBooking('shared2')],
    })
    const replaced = historyReducer(history, {
      type: 'replaceState',
      state: shared,
    })
    expect(replaced.present.tripTitle).toBe('同行者から共有された旅程')
    expect(replaced.present.bookings.map((b) => b.id)).toEqual([
      'shared1',
      'shared2',
    ])

    const undone = historyReducer(replaced, { type: 'undo' })
    expect(undone.present.bookings.map((b) => b.id)).toEqual(['mine'])
  })

  it('未確認の一括解除は件数によらず undo 1 回で元に戻る', () => {
    // 予約ごとに1手ずつ積むと、10件取り込んだあとの取り消しに
    // 10回の「元に戻す」が要る。それは実質的に取り消せないのと同じ
    const history = createHistory(
      makeState({
        bookings: [
          makeBooking('b1', { unverified: ['start', 'title'] }),
          makeBooking('b2', { unverified: ['title'] }),
          makeBooking('b3', { unverified: ['note'] }),
        ],
      }),
    )
    const cleared = historyReducer(history, { type: 'verifyAllUnverified' })
    expect(cleared.past).toHaveLength(1)
    expect(cleared.present.bookings.every((b) => !('unverified' in b))).toBe(
      true,
    )

    const undone = historyReducer(cleared, { type: 'undo' })
    expect(undone.present.bookings.map((b) => b.unverified)).toEqual([
      ['start', 'title'],
      ['title'],
      ['note'],
    ])
  })

  it('Undo 履歴は上限(50)を超えて伸び続けない', () => {
    let history = createHistory(makeState())
    for (let i = 0; i < 60; i++) {
      history = historyReducer(history, {
        type: 'setTripTitle',
        title: `旅 ${i}`,
      })
    }
    expect(history.past).toHaveLength(50)
  })
})
