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

import { createInitialState } from '../../../../lib/trip-notes/storage'
import type {
  Booking,
  EmergencyContact,
  FieldKey,
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
  | { type: 'addContact'; contact: EmergencyContact }
  | { type: 'updateContact'; contact: EmergencyContact }
  | { type: 'removeContact'; id: string }
  /** AI 取り込みのバルク追加 */
  | { type: 'importBookings'; bookings: Array<Booking> }
  /** 共有URL・JSON からの読み込み(現在のデータを丸ごと置き換える) */
  | { type: 'replaceState'; state: TripNotesState }
  | { type: 'resetAll'; today: string }

export type HistoryAction =
  | TripNotesAction
  | { type: 'undo' }
  | { type: 'redo' }

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

    case 'setStartDate':
      if (state.startDate === action.date) return state
      return { ...state, startDate: action.date }

    case 'setEndDate':
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

    case 'importBookings':
      // 既存の予約は消さずに足すだけにする。AI の抽出結果を信じて
      // 手入力済みの予約を巻き込むと、確認番号が失われて復元できない
      if (action.bookings.length === 0) return state
      return { ...state, bookings: [...state.bookings, ...action.bookings] }

    case 'replaceState':
      return action.state

    case 'resetAll':
      return createInitialState(action.today)
  }
}

export function historyReducer(
  history: HistoryState,
  action: HistoryAction,
): HistoryState {
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
