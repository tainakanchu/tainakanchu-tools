import { describe, expect, it } from 'vitest'
import { createHistory, historyReducer, tripNotesReducer } from './reducer'
import type {
  Booking,
  EmergencyContact,
  TravelDoc,
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

function travelDoc(id: string, overrides: Partial<TravelDoc> = {}): TravelDoc {
  return {
    id,
    kind: 'visa',
    title: `手続き ${id}`,
    status: 'todo',
    ...overrides,
  }
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
  it('既存と同一とみなせない予約は末尾へ足す', () => {
    const base = makeState({ bookings: [makeBooking('manual')] })
    const next = tripNotesReducer(base, {
      type: 'importBookings',
      bookings: [
        makeBooking('ai1', { title: '別の宿1' }),
        makeBooking('ai2', { title: '別の宿2' }),
      ],
    })
    expect(next.bookings.map((b) => b.id)).toEqual(['manual', 'ai1', 'ai2'])
  })

  it('空配列の取り込みは状態を変えない', () => {
    const base = makeState({ bookings: [makeBooking('manual')] })
    expect(
      tripNotesReducer(base, { type: 'importBookings', bookings: [] }),
    ).toBe(base)
  })

  it('既存と同一とみなせる予約は、既存の位置のままマージして差し替える', () => {
    // 同じ確認番号を持つ予約をもう一度取り込んでも、重複して増えてはいけない
    const base = makeState({
      bookings: [
        makeBooking('manual1', {
          title: '手入力の宿A',
          confirmationNumber: 'ABC123',
          note: '朝食付き',
        }),
        makeBooking('manual2', { title: '手入力の宿B' }),
      ],
    })
    const next = tripNotesReducer(base, {
      type: 'importBookings',
      bookings: [
        makeBooking('tmp', {
          title: 'AIが読み取った宿A',
          confirmationNumber: 'abc-123',
          note: undefined,
          price: { amount: 120, currency: 'EUR' },
        }),
      ],
    })

    // 件数は増えず、既存の並び順(先頭)のまま更新される
    expect(next.bookings).toHaveLength(2)
    expect(next.bookings[0].id).toBe('manual1')
    expect(next.bookings[1].id).toBe('manual2')
    // マージ結果: タイトル・確認番号は取り込み側(確認番号は一致判定こそ
    // 正規化するが、採用する値そのものは正規化しない取り込み側の生の値)、
    // 取り込み側に値の無かったメモは既存を維持、料金は取り込み側の値が新たに入る
    expect(next.bookings[0].title).toBe('AIが読み取った宿A')
    expect(next.bookings[0].confirmationNumber).toBe('abc-123')
    expect(next.bookings[0].note).toBe('朝食付き')
    expect(next.bookings[0].price).toEqual({ amount: 120, currency: 'EUR' })
  })

  it('新規追加ぶんとマージぶんが混在していても、undo 1回でまとめて取り消せる', () => {
    const base = makeState({
      bookings: [
        makeBooking('manual1', {
          title: '手入力の宿A',
          confirmationNumber: 'ABC123',
        }),
      ],
    })
    const history = createHistory(base)
    const imported = historyReducer(history, {
      type: 'importBookings',
      bookings: [
        makeBooking('tmp1', {
          title: '更新される宿A',
          confirmationNumber: 'ABC123',
        }),
        makeBooking('tmp2', { title: '新規の宿B' }),
      ],
    })
    expect(imported.present.bookings).toHaveLength(2)
    expect(imported.present.bookings[0].title).toBe('更新される宿A')

    const undone = historyReducer(imported, { type: 'undo' })
    expect(undone.present.bookings).toHaveLength(1)
    expect(undone.present.bookings[0].title).toBe('手入力の宿A')
  })

  it('status が cancelled の既存予約は取り込みでマッチせず、新規として別に追加される', () => {
    const base = makeState({
      bookings: [
        makeBooking('cancelled1', {
          status: 'cancelled',
          confirmationNumber: 'ABC123',
        }),
      ],
    })
    const next = tripNotesReducer(base, {
      type: 'importBookings',
      bookings: [makeBooking('tmp', { confirmationNumber: 'ABC123' })],
    })
    expect(next.bookings).toHaveLength(2)
    expect(next.bookings[0].status).toBe('cancelled')
    expect(next.bookings[1].id).not.toBe('cancelled1')
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

  it('同じ場所として扱う組を追加できる(id が振られる)', () => {
    const next = tripNotesReducer(makeState(), {
      type: 'addPlaceAlias',
      names: ['マルタ・ルア国際空港', 'マルタの知人宅'],
    })
    expect(next.placeAliases).toHaveLength(1)
    expect(next.placeAliases?.[0].names).toEqual([
      'マルタ・ルア国際空港',
      'マルタの知人宅',
    ])
    expect(next.placeAliases?.[0].id).not.toBe('')
  })

  it('同じ組の追加は状態を変えない(順不同・表記ゆれも同じ組とみなす)', () => {
    // 二度押しで Undo 履歴に空の 1 手が積まれると、「元に戻す」が空振りする
    const base = tripNotesReducer(makeState(), {
      type: 'addPlaceAlias',
      names: ['マルタ・ルア国際空港', 'マルタの知人宅'],
    })
    expect(
      tripNotesReducer(base, {
        type: 'addPlaceAlias',
        names: ['マルタ・ルア国際空港', 'マルタの知人宅'],
      }),
    ).toBe(base)
    expect(
      tripNotesReducer(base, {
        type: 'addPlaceAlias',
        names: ['マルタの知人宅', 'マルタルア国際空港'],
      }),
    ).toBe(base)
  })

  it('名前が空の組は登録しない(何にも一致しないので保存を膨らませるだけ)', () => {
    const base = makeState()
    expect(
      tripNotesReducer(base, { type: 'addPlaceAlias', names: ['パリ', '  '] }),
    ).toBe(base)
  })

  it('違う組なら並べて追加される', () => {
    const first = tripNotesReducer(makeState(), {
      type: 'addPlaceAlias',
      names: ['Faro', 'アルガルヴェ'],
    })
    const second = tripNotesReducer(first, {
      type: 'addPlaceAlias',
      names: ['Faro', 'セビリア'],
    })
    expect(second.placeAliases).toHaveLength(2)
  })

  it('削除で最後の 1 組が消えたらフィールドごと落ちる', () => {
    const first = tripNotesReducer(makeState(), {
      type: 'addPlaceAlias',
      names: ['Faro', 'アルガルヴェ'],
    })
    const second = tripNotesReducer(first, {
      type: 'addPlaceAlias',
      names: ['Faro', 'セビリア'],
    })
    const ids = (second.placeAliases ?? []).map((alias) => alias.id)

    const removedOne = tripNotesReducer(second, {
      type: 'removePlaceAlias',
      id: ids[0],
    })
    expect(removedOne.placeAliases?.map((alias) => alias.id)).toEqual([ids[1]])

    const removedAll = tripNotesReducer(removedOne, {
      type: 'removePlaceAlias',
      id: ids[1],
    })
    expect(removedAll).not.toHaveProperty('placeAliases')
  })

  it('存在しない組の削除は状態を変えない', () => {
    const base = tripNotesReducer(makeState(), {
      type: 'addPlaceAlias',
      names: ['Faro', 'アルガルヴェ'],
    })
    expect(
      tripNotesReducer(base, { type: 'removePlaceAlias', id: 'いない' }),
    ).toBe(base)
    // 1 組も無い状態でも同じ
    const empty = makeState()
    expect(
      tripNotesReducer(empty, { type: 'removePlaceAlias', id: 'いない' }),
    ).toBe(empty)
  })

  it('手続きを追加・更新・削除できる', () => {
    const added = tripNotesReducer(makeState(), {
      type: 'addTravelDoc',
      doc: travelDoc('td1'),
    })
    expect(added.travelDocs).toHaveLength(1)

    const updated = tripNotesReducer(added, {
      type: 'updateTravelDoc',
      doc: { ...travelDoc('td1'), status: 'done', referenceNumber: 'V-0001' },
    })
    expect(updated.travelDocs?.[0].status).toBe('done')
    expect(updated.travelDocs?.[0].referenceNumber).toBe('V-0001')

    const removed = tripNotesReducer(updated, {
      type: 'removeTravelDoc',
      id: 'td1',
    })
    expect(removed).not.toHaveProperty('travelDocs')
  })

  it('手続きの追加は末尾に積まれ、更新は id が一致するものだけを置き換える', () => {
    const base = makeState({
      travelDocs: [travelDoc('td1'), travelDoc('td2')],
    })
    const added = tripNotesReducer(base, {
      type: 'addTravelDoc',
      doc: travelDoc('td3'),
    })
    expect(added.travelDocs?.map((doc) => doc.id)).toEqual([
      'td1',
      'td2',
      'td3',
    ])

    const updated = tripNotesReducer(base, {
      type: 'updateTravelDoc',
      doc: { ...travelDoc('td2'), title: '書き換えた手続き' },
    })
    expect(updated.travelDocs?.[0].title).toBe('手続き td1')
    expect(updated.travelDocs?.[1].title).toBe('書き換えた手続き')
  })

  it('削除で最後の 1 件が消えたらフィールドごと落ちる', () => {
    // 「空配列が残っている state」と「一度も登録していない state」を
    // 別物にしない(placeAliases と同じ扱い)
    const base = makeState({
      travelDocs: [travelDoc('td1'), travelDoc('td2')],
    })
    const removedOne = tripNotesReducer(base, {
      type: 'removeTravelDoc',
      id: 'td1',
    })
    expect(removedOne.travelDocs?.map((doc) => doc.id)).toEqual(['td2'])

    const removedAll = tripNotesReducer(removedOne, {
      type: 'removeTravelDoc',
      id: 'td2',
    })
    expect(removedAll).not.toHaveProperty('travelDocs')
  })

  it('存在しない手続きの更新・削除は状態を変えない(同一参照を返す)', () => {
    const base = makeState({ travelDocs: [travelDoc('td1')] })
    expect(
      tripNotesReducer(base, {
        type: 'updateTravelDoc',
        doc: travelDoc('いない'),
      }),
    ).toBe(base)
    expect(
      tripNotesReducer(base, { type: 'removeTravelDoc', id: 'いない' }),
    ).toBe(base)

    // 1 件も無い(フィールドごと存在しない)状態でも同じ
    const empty = makeState()
    expect(
      tripNotesReducer(empty, { type: 'removeTravelDoc', id: 'いない' }),
    ).toBe(empty)
    expect(
      tripNotesReducer(empty, {
        type: 'updateTravelDoc',
        doc: travelDoc('td1'),
      }),
    ).toBe(empty)
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

describe('tripNotesReducer / カンバンのまとめて移動', () => {
  it('1 アクションで複数の予約の状態が変わる(選ばれていない予約は動かない)', () => {
    const base = makeState({
      bookings: [
        makeBooking('b1', { status: 'idea' }),
        makeBooking('b2', { status: 'held' }),
        makeBooking('b3', { status: 'idea' }),
      ],
    })
    const next = tripNotesReducer(base, {
      type: 'setBookingsStatus',
      ids: ['b1', 'b2'],
      status: 'confirmed',
    })
    expect(next.bookings.map((b) => b.status)).toEqual([
      'confirmed',
      'confirmed',
      'idea',
    ])
  })

  it('支払状況も同じくまとめて変わる', () => {
    const base = makeState({
      bookings: [
        makeBooking('b1', { payment: 'unpaid' }),
        makeBooking('b2', { payment: 'deposit' }),
      ],
    })
    const next = tripNotesReducer(base, {
      type: 'setBookingsPayment',
      ids: ['b1', 'b2'],
      payment: 'paid',
    })
    expect(next.bookings.map((b) => b.payment)).toEqual(['paid', 'paid'])
  })

  it('カードが持たないフィールドは巻き添えで消えない', () => {
    const base = makeState({
      bookings: [
        makeBooking('b1', {
          status: 'idea',
          confirmationNumber: 'ABC-123',
          note: '朝食付き',
        }),
      ],
    })
    const next = tripNotesReducer(base, {
      type: 'setBookingsStatus',
      ids: ['b1'],
      status: 'confirmed',
    })
    expect(next.bookings[0].confirmationNumber).toBe('ABC-123')
    expect(next.bookings[0].note).toBe('朝食付き')
    expect(next.bookings[0].payment).toBe('paid')
  })

  it('自分で選び直した軸の未確認マークだけが外れる(単数版と同じ規則)', () => {
    const base = makeState({
      bookings: [
        makeBooking('b1', {
          status: 'idea',
          unverified: ['status', 'payment', 'start'],
        }),
        makeBooking('b2', {
          status: 'idea',
          unverified: ['status', 'title'],
        }),
      ],
    })
    const next = tripNotesReducer(base, {
      type: 'setBookingsStatus',
      ids: ['b1', 'b2'],
      status: 'confirmed',
    })
    expect(next.bookings[0].unverified).toEqual(['payment', 'start'])
    expect(next.bookings[1].unverified).toEqual(['title'])
  })

  it('すでに移動先にいる予約と、存在しない id は状態を変えない(同一参照)', () => {
    // 一括の選択には「動かす必要のないカード」が普通に混ざる。
    // それだけを選んだ操作で空の1手を積むと、「元に戻す」が空振りに消費される
    const base = makeState({
      bookings: [
        makeBooking('b1', { status: 'confirmed' }),
        makeBooking('b2', { status: 'confirmed' }),
      ],
    })
    expect(
      tripNotesReducer(base, {
        type: 'setBookingsStatus',
        ids: ['b1', 'b2'],
        status: 'confirmed',
      }),
    ).toBe(base)
    expect(
      tripNotesReducer(base, {
        type: 'setBookingsPayment',
        ids: ['いない'],
        payment: 'unpaid',
      }),
    ).toBe(base)
    // 選択が空のまま届いても同じ
    expect(
      tripNotesReducer(base, {
        type: 'setBookingsStatus',
        ids: [],
        status: 'idea',
      }),
    ).toBe(base)
  })

  it('動く予約が1件でもあれば、動かない予約を巻き込まずに更新される', () => {
    const base = makeState({
      bookings: [
        makeBooking('already', { status: 'confirmed' }),
        makeBooking('moves', { status: 'idea' }),
      ],
    })
    const next = tripNotesReducer(base, {
      type: 'setBookingsStatus',
      ids: ['already', 'moves'],
      status: 'confirmed',
    })
    // 変わらない予約は元の参照のまま(無用な差分を作らない)
    expect(next.bookings[0]).toBe(base.bookings[0])
    expect(next.bookings[1].status).toBe('confirmed')
  })

  it('元の状態は書き換わらない(Undo で戻せる前提)', () => {
    const booking = makeBooking('b1', { status: 'idea' })
    const base = makeState({ bookings: [booking] })
    tripNotesReducer(base, {
      type: 'setBookingsStatus',
      ids: ['b1'],
      status: 'confirmed',
    })
    expect(booking.status).toBe('idea')
    expect(base.bookings[0].status).toBe('idea')
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

  it('カンバンのまとめて移動は件数によらず undo 1 回で全部戻る', () => {
    // 未確認の一括解除と同じ理由。まとめて動かせるのに戻すのは1件ずつ、では
    // 「まとめて動かす」こと自体が取り返しの付かない操作になってしまう
    const history = createHistory(
      makeState({
        bookings: [
          makeBooking('b1', { payment: 'unpaid' }),
          makeBooking('b2', { payment: 'deposit' }),
          makeBooking('b3', { payment: 'unpaid' }),
        ],
      }),
    )
    const moved = historyReducer(history, {
      type: 'setBookingsPayment',
      ids: ['b1', 'b2', 'b3'],
      payment: 'paid',
    })
    expect(moved.past).toHaveLength(1)
    expect(moved.present.bookings.map((b) => b.payment)).toEqual([
      'paid',
      'paid',
      'paid',
    ])

    const undone = historyReducer(moved, { type: 'undo' })
    expect(undone.present.bookings.map((b) => b.payment)).toEqual([
      'unpaid',
      'deposit',
      'unpaid',
    ])
  })

  it('1 件も動かないまとめて移動は履歴を積まない', () => {
    const history = createHistory(
      makeState({ bookings: [makeBooking('b1', { status: 'confirmed' })] }),
    )
    expect(
      historyReducer(history, {
        type: 'setBookingsStatus',
        ids: ['b1'],
        status: 'confirmed',
      }),
    ).toBe(history)
  })

  it('旅程の切り替え(loadTrip)は past も future も捨てる', () => {
    // 別の旅程を開いたあとに Ctrl+Z で前の旅程が戻ってくると、
    // いまどちらを編集しているのか分からなくなる。だから履歴は旅程ごとに閉じる
    const history = createHistory(makeState({ bookings: [makeBooking('a1')] }))
    const edited = historyReducer(history, {
      type: 'addBooking',
      booking: makeBooking('a2'),
    })
    const undone = historyReducer(edited, { type: 'undo' })
    expect(undone.past).toHaveLength(0)
    expect(undone.future).toHaveLength(1)

    const other = makeState({
      tripTitle: '台湾年末',
      bookings: [makeBooking('b1')],
    })
    const loaded = historyReducer(undone, { type: 'loadTrip', state: other })
    expect(loaded.present).toBe(other)
    expect(loaded.past).toHaveLength(0)
    expect(loaded.future).toHaveLength(0)

    // 切り替え直後の undo / redo は空振りし、前の旅程には戻らない
    expect(historyReducer(loaded, { type: 'undo' })).toBe(loaded)
    expect(historyReducer(loaded, { type: 'redo' })).toBe(loaded)
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
