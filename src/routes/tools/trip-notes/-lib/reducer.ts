/**
 * 旅のしおりの状態遷移。
 *
 * 単一の真実は TripNotesState だけで、夜のカバレッジや進捗サマリは
 * すべて derive 側の計算で出す(状態として持たない)。
 * ここでやるのは「予約の CRUD と旅行の基本情報の更新」に限る。
 *
 * Undo/Redo を付けるのは、予約の削除が取り返しの付かない操作だからである。
 * 確認番号は予約確認メールを掘り返さないと復元できず、
 * 旅先で誤って消したときに戻せないと実害が出る。
 */

import { isValidISODate } from '../../../../lib/trip-notes/datetime'
import { newId } from '../../../../lib/trip-notes/id'
import { planImport } from '../../../../lib/trip-notes/importMerge'
import { isSameAliasPair } from '../../../../lib/trip-notes/itinerary'
import { createInitialState } from '../../../../lib/trip-notes/storage'
import type {
  Booking,
  EmergencyContact,
  FieldKey,
  TravelDoc,
  TripNotesState,
} from '../../../../lib/trip-notes/types'

/** Undo 履歴の上限 */
const HISTORY_LIMIT = 50

export type TripNotesAction =
  | { type: 'setTripTitle'; title: string }
  | { type: 'setStartDate'; date: string }
  | { type: 'setEndDate'; date: string }
  /** 表示タイムゾーンの手動固定。null でデバイス依存に戻す */
  | { type: 'setPinnedTz'; tz: string | null }
  | { type: 'addBooking'; booking: Booking }
  | { type: 'updateBooking'; booking: Booking }
  | { type: 'removeBooking'; id: string }
  /** 未確認フィールドを1つだけ「確認済み」にする */
  | { type: 'verifyField'; id: string; field: FieldKey }
  /** その予約の未確認フィールドをまとめて確認済みにする */
  | { type: 'verifyAllFields'; id: string }
  /**
   * 複数の予約の未確認フィールドをまとめて確認済みにする。
   * ids を省略すると全予約が対象。
   *
   * verifyAllFields を件数ぶん dispatch するのではなく 1 アクションにするのは、
   * Undo を 1 回で元に戻せるようにするため。AI 取り込み直後は数十件が
   * 一度に未確認になるので、取り消しに同じ回数の Undo を要求するのは実質不可逆になる。
   */
  | { type: 'verifyAllUnverified'; ids?: Array<string> }
  | { type: 'addContact'; contact: EmergencyContact }
  | { type: 'updateContact'; contact: EmergencyContact }
  | { type: 'removeContact'; id: string }
  /**
   * 旅行前の手続き(ビザ・eSIM など)の CRUD。
   * 予約と同じ「抜けを潰す」対象だが別の入れ物に持つ(types.ts の TravelDoc 参照)。
   */
  | { type: 'addTravelDoc'; doc: TravelDoc }
  | { type: 'updateTravelDoc'; doc: TravelDoc }
  | { type: 'removeTravelDoc'; id: string }
  /**
   * 「この 2 つは同じ場所」の登録。旅程の警告カードから、
   * そこに出ていた 2 つの地名をそのまま渡す(itinerary.ts の placeAliases)。
   */
  | { type: 'addPlaceAlias'; names: [string, string] }
  | { type: 'removePlaceAlias'; id: string }
  /**
   * AI 取り込みのバルク追加。
   * 既存の予約と同一とみなせるもの(importMerge.ts の planImport が判定)は
   * マージして差し替え、それ以外だけを新規に追加する。
   */
  | { type: 'importBookings'; bookings: Array<Booking> }
  /** 共有URL・JSON からの読み込み(現在のデータを丸ごと置き換える) */
  | { type: 'replaceState'; state: TripNotesState }
  | { type: 'resetAll'; today: string }
  /**
   * カンバンのドロップ / カード上の <select> からの、1 フィールドだけの状態変更。
   *
   * updateBooking を使わないのは、カンバンのカードが予約の全フィールドを
   * 持っていないためである。差分だけを渡すアクションにしておけば、
   * カード側が知らないフィールド(確認番号など)を undefined で潰す事故が起こりえない。
   *
   * 状態の型を Booking から引いているのは、この import 節に
   * BookingStatus / PaymentStatus を足さずに済ませるため。
   */
  | { type: 'setBookingStatus'; id: string; status: Booking['status'] }
  | { type: 'setBookingPayment'; id: string; payment: Booking['payment'] }
  /**
   * カンバンで複数選択したカードの、まとめての状態変更。
   *
   * 単数版を件数ぶん dispatch するのではなく 1 アクションにするのは、
   * verifyAllUnverified と同じ理由で、Undo 1 回で全部を元に戻せるようにするため。
   * 10 枚まとめて動かしたあとに取り消しを 10 回押させるのでは、
   * まとめて動かす機能そのものが「取り返しの付かない操作」になってしまう。
   *
   * 未確認マークの扱いを含めて、規則は単数版とまったく同じにする。
   * 1 件ずつやるかまとめてやるかで結果が変わると、利用者は
   * 「まとめると何か違うことが起きるのでは」と疑いながら使うことになる。
   */
  | { type: 'setBookingsStatus'; ids: Array<string>; status: Booking['status'] }
  | {
      type: 'setBookingsPayment'
      ids: Array<string>
      payment: Booking['payment']
    }

export type HistoryAction =
  | TripNotesAction
  | { type: 'undo' }
  | { type: 'redo' }
  /**
   * 別の旅程を開く(旅程セレクタでの切り替え・新規作成・複製・削除の着地点)。
   *
   * replaceState と別のアクションにしているのは、置き換えが「いまの旅程への編集」
   * なのに対して、こちらは「編集対象そのものの乗り換え」だからである。
   * 同じ扱いにして履歴を引き継ぐと、台湾の旅程を開いてから Ctrl+Z を押すと
   * マルタの旅程が戻ってくる、ということが起きる。
   * そのとき画面に出ているのがどちらの旅程なのか、
   * さらに続く編集がどちらに保存されるのかが利用者にも実装にも分からなくなる。
   * だから切り替えでは past も future も捨て、履歴は旅程ごとに閉じたものにする
   * (乗り換えを取り消したければ、セレクタで元の旅程を選び直せばよい。
   *  切り替えは非破壊なので、Undo で守るべきものがそもそも無い)。
   */
  | { type: 'loadTrip'; state: TripNotesState }

export interface HistoryState {
  past: Array<TripNotesState>
  present: TripNotesState
  future: Array<TripNotesState>
}

/** 子コンポーネントには編集アクションだけを渡す(Undo/Redo はページ側の責務) */
export type TripNotesDispatch = (action: TripNotesAction) => void

export function createHistory(present: TripNotesState): HistoryState {
  return { past: [], present, future: [] }
}

/**
 * 未確認フィールドの除去。
 * 空配列になったら `unverified` ごと落とす。
 * 「空配列が残っている予約」と「一度も AI を通っていない予約」を
 * 別物として扱う必要はなく、共有URLのサイズも無駄に増えるため。
 */
function withoutUnverified(
  booking: Booking,
  fields: Array<FieldKey> | 'all',
): Booking {
  const current = booking.unverified
  if (current === undefined || current.length === 0) return booking

  const next =
    fields === 'all' ? [] : current.filter((key) => !fields.includes(key))
  if (next.length === current.length) return booking

  const { unverified: _unverified, ...rest } = booking
  return next.length === 0 ? rest : { ...rest, unverified: next }
}

/**
 * 予約の更新。
 * 値が変わったフィールドは、その時点で人間が目を通したことになるので
 * 未確認リストから自動で外す。「編集したのに黄色い下線が残る」を避ける。
 */
function mergeUpdatedBooking(previous: Booking, next: Booking): Booking {
  const changed: Array<FieldKey> = []
  const keys: Array<FieldKey> = [
    'kind',
    'title',
    'start',
    'end',
    'from',
    'to',
    'place',
    'status',
    'payment',
    'confirmationNumber',
    'provider',
    'price',
    'freeCancelUntil',
    'note',
  ]
  for (const key of keys) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      changed.push(key)
    }
  }
  return withoutUnverified(next, changed)
}

export function tripNotesReducer(
  state: TripNotesState,
  action: TripNotesAction,
): TripNotesState {
  switch (action.type) {
    case 'setTripTitle':
      if (state.tripTitle === action.title) return state
      return { ...state, tripTitle: action.title }

    // 旅行期間は「寝る場所がない夜」の計算の起点なので、不正な日付を
    // 状態に入れてはならない。<input type="date"> はクリア操作で空文字を
    // 返してくるが、それをそのまま入れると computeNights → diffDays が
    // Temporal の RangeError で落ち、画面全体が白くなる。
    // 入力を無視して直前の日付を保つ(表示は制御された input が元に戻す)。
    case 'setStartDate':
      if (!isValidISODate(action.date)) return state
      if (state.startDate === action.date) return state
      return { ...state, startDate: action.date }

    case 'setEndDate':
      if (!isValidISODate(action.date)) return state
      if (state.endDate === action.date) return state
      return { ...state, endDate: action.date }

    case 'setPinnedTz':
      if (state.pinnedTz === action.tz) return state
      return { ...state, pinnedTz: action.tz }

    case 'addBooking':
      return { ...state, bookings: [...state.bookings, action.booking] }

    case 'updateBooking': {
      const index = state.bookings.findIndex((b) => b.id === action.booking.id)
      if (index === -1) return state
      const bookings = [...state.bookings]
      bookings[index] = mergeUpdatedBooking(bookings[index], action.booking)
      return { ...state, bookings }
    }

    case 'removeBooking': {
      const bookings = state.bookings.filter((b) => b.id !== action.id)
      if (bookings.length === state.bookings.length) return state
      return { ...state, bookings }
    }

    case 'verifyField': {
      const index = state.bookings.findIndex((b) => b.id === action.id)
      if (index === -1) return state
      const updated = withoutUnverified(state.bookings[index], [action.field])
      if (updated === state.bookings[index]) return state
      const bookings = [...state.bookings]
      bookings[index] = updated
      return { ...state, bookings }
    }

    case 'verifyAllFields': {
      const index = state.bookings.findIndex((b) => b.id === action.id)
      if (index === -1) return state
      const updated = withoutUnverified(state.bookings[index], 'all')
      if (updated === state.bookings[index]) return state
      const bookings = [...state.bookings]
      bookings[index] = updated
      return { ...state, bookings }
    }

    case 'verifyAllUnverified': {
      const targets = action.ids === undefined ? null : new Set(action.ids)
      const bookings = state.bookings.map((booking) =>
        targets !== null && !targets.has(booking.id)
          ? booking
          : withoutUnverified(booking, 'all'),
      )
      // 1 件も変わらないなら同一参照を返す。Undo 履歴に空の 1 手を積まない
      // (withoutUnverified は外すものが無ければ元の参照をそのまま返す)
      if (bookings.every((booking, i) => booking === state.bookings[i])) {
        return state
      }
      return { ...state, bookings }
    }

    case 'addContact':
      return {
        ...state,
        emergencyContacts: [...state.emergencyContacts, action.contact],
      }

    case 'updateContact': {
      const index = state.emergencyContacts.findIndex(
        (c) => c.id === action.contact.id,
      )
      if (index === -1) return state
      const emergencyContacts = [...state.emergencyContacts]
      emergencyContacts[index] = action.contact
      return { ...state, emergencyContacts }
    }

    case 'removeContact': {
      const emergencyContacts = state.emergencyContacts.filter(
        (c) => c.id !== action.id,
      )
      if (emergencyContacts.length === state.emergencyContacts.length) {
        return state
      }
      return { ...state, emergencyContacts }
    }

    case 'addTravelDoc': {
      // 1 件も無いときはフィールドごと存在しないので、そこから積み直す
      const current = state.travelDocs ?? []
      return { ...state, travelDocs: [...current, action.doc] }
    }

    case 'updateTravelDoc': {
      const current = state.travelDocs ?? []
      const index = current.findIndex((d) => d.id === action.doc.id)
      if (index === -1) return state
      const travelDocs = [...current]
      travelDocs[index] = action.doc
      return { ...state, travelDocs }
    }

    case 'removeTravelDoc': {
      const current = state.travelDocs ?? []
      const travelDocs = current.filter((d) => d.id !== action.id)
      if (travelDocs.length === current.length) return state
      // 最後の 1 件を消したらフィールドごと落とす(removePlaceAlias と同じ理由)
      if (travelDocs.length === 0) {
        const { travelDocs: _travelDocs, ...rest } = state
        return rest
      }
      return { ...state, travelDocs }
    }

    case 'addPlaceAlias': {
      // 名前が空になる組は何にも一致しないので、登録しても保存を膨らませるだけになる
      // (判定側も空文字を含む組は常に不一致として扱う)
      if (action.names.some((name) => name.trim() === '')) return state

      const current = state.placeAliases ?? []
      // 同じ組を二度押しても状態を変えない(同一参照を返して Undo 履歴に空の 1 手を積まない)。
      // 表記ゆれや順番の違いは isSameAliasPair が正規化して吸収するので、
      // 「マルタ・ルア国際空港 / マルタの知人宅」と「マルタルア国際空港 / マルタの知人宅」は
      // 同じ 1 組として扱われる。
      if (current.some((alias) => isSameAliasPair(alias.names, action.names))) {
        return state
      }
      return {
        ...state,
        placeAliases: [...current, { id: newId('pa'), names: action.names }],
      }
    }

    case 'removePlaceAlias': {
      const current = state.placeAliases ?? []
      const placeAliases = current.filter((alias) => alias.id !== action.id)
      if (placeAliases.length === current.length) return state
      // 最後の 1 組を消したらフィールドごと落とす。
      // 「空配列が残っている state」と「一度も登録していない state」を
      // 別物として扱う必要はなく、共有URLも無駄に伸びる(unverified と同じ扱い)
      if (placeAliases.length === 0) {
        const { placeAliases: _placeAliases, ...rest } = state
        return rest
      }
      return { ...state, placeAliases }
    }

    case 'importBookings': {
      // 既存の予約と同一とみなせるものはマージして差し替え、それ以外だけを
      // 末尾に追加する。判定は importMerge.ts の planImport に集約し、ここで
      // 条件を再実装しない(UI のプレビューと実際の取り込み結果がズレるのを防ぐ)。
      //
      // 以前は「既存の予約は消さずに足すだけ」にしていたが、それだと同じ
      // 予約確認メールをもう一度 AI に読ませて貼り付けたときに同じ予定が
      // 二重に増えてしまっていた。マージは 1 アクションの中で完結させ、
      // Undo 1 回で取り込み全体(新規追加ぶんもマージぶんも)を戻せるようにする。
      if (action.bookings.length === 0) return state

      const plan = planImport(state.bookings, action.bookings)

      // マッチした予約は既存の並び順の位置で差し替え、それ以外だけを
      // 末尾に追加する。並び順を保つのは、同じ日の予約カードの表示順が
      // 取り込みのたびに入れ替わるような不要な差分を出さないため
      const updates = new Map<string, Booking>()
      const additions: Array<Booking> = []
      for (const entry of plan.entries) {
        if (entry.replacesId === null) {
          additions.push(entry.booking)
        } else {
          updates.set(entry.replacesId, entry.booking)
        }
      }

      const bookings = [
        ...state.bookings.map((booking) => updates.get(booking.id) ?? booking),
        ...additions,
      ]
      return { ...state, bookings }
    }

    case 'replaceState':
      return action.state

    case 'resetAll':
      return createInitialState(action.today)

    case 'setBookingStatus': {
      const index = state.bookings.findIndex((b) => b.id === action.id)
      if (index === -1) return state
      const current = state.bookings[index]
      if (current.status === action.status) return state
      const bookings = [...state.bookings]
      // 利用者が自分で選び直した値なので、AI 由来の未確認マークは外す
      // (updateBooking の mergeUpdatedBooking と同じ考え方)
      bookings[index] = withoutUnverified(
        { ...current, status: action.status },
        ['status'],
      )
      return { ...state, bookings }
    }

    case 'setBookingPayment': {
      const index = state.bookings.findIndex((b) => b.id === action.id)
      if (index === -1) return state
      const current = state.bookings[index]
      if (current.payment === action.payment) return state
      const bookings = [...state.bookings]
      bookings[index] = withoutUnverified(
        { ...current, payment: action.payment },
        ['payment'],
      )
      return { ...state, bookings }
    }

    case 'setBookingsStatus': {
      const targets = new Set(action.ids)
      const bookings = state.bookings.map((booking) =>
        !targets.has(booking.id) || booking.status === action.status
          ? booking
          : // 単数版とまったく同じ規則で、選び直した軸の未確認マークだけを外す
            withoutUnverified({ ...booking, status: action.status }, [
              'status',
            ]),
      )
      // すでに移動先の列にいたカードだけが選ばれていた場合など、1 件も変わらないなら
      // 同一参照を返して Undo 履歴に空の 1 手を積まない(verifyAllUnverified と同じ)
      if (bookings.every((booking, i) => booking === state.bookings[i])) {
        return state
      }
      return { ...state, bookings }
    }

    case 'setBookingsPayment': {
      const targets = new Set(action.ids)
      const bookings = state.bookings.map((booking) =>
        !targets.has(booking.id) || booking.payment === action.payment
          ? booking
          : withoutUnverified({ ...booking, payment: action.payment }, [
              'payment',
            ]),
      )
      if (bookings.every((booking, i) => booking === state.bookings[i])) {
        return state
      }
      return { ...state, bookings }
    }
  }
}

export function historyReducer(
  history: HistoryState,
  action: HistoryAction,
): HistoryState {
  // 旅程の乗り換えなので、いまの旅程で積んだ履歴は持ち越さない(HistoryAction の解説を参照)
  if (action.type === 'loadTrip') {
    return createHistory(action.state)
  }

  if (action.type === 'undo') {
    if (history.past.length === 0) return history
    const previous = history.past[history.past.length - 1]
    return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future].slice(0, HISTORY_LIMIT),
    }
  }

  if (action.type === 'redo') {
    if (history.future.length === 0) return history
    const [next, ...rest] = history.future
    return {
      past: [...history.past, history.present].slice(-HISTORY_LIMIT),
      present: next,
      future: rest,
    }
  }

  const present = tripNotesReducer(history.present, action)
  if (present === history.present) return history
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
  }
}
