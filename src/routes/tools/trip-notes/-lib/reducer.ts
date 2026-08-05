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
import {
  normalizeText,
  planCountryInfoImport,
  planImport,
} from '../../../../lib/trip-notes/importMerge'
import { isSameAliasPair } from '../../../../lib/trip-notes/itinerary'
import { createInitialState } from '../../../../lib/trip-notes/storage'
import type {
  CountryInfoPlan,
  ImportPlan,
} from '../../../../lib/trip-notes/importMerge'
import type {
  Booking,
  CountryInfo,
  EmergencyContact,
  FieldKey,
  PlaceAlias,
  TravelDoc,
  TripNotesState,
  Wish,
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
   * 訪問国の基本情報(プラグ形状・電圧・チップ文化・緊急通報番号)の CRUD。
   * 予約単位ではなく旅程単位の情報なので別の入れ物に持つ(types.ts の CountryInfo 参照)。
   */
  | { type: 'addCountryInfo'; countryInfo: CountryInfo }
  | { type: 'updateCountryInfo'; countryInfo: CountryInfo }
  | { type: 'removeCountryInfo'; id: string }
  /**
   * 滞在先でやりたいことの CRUD。日付を持たない願望なので予約とは別の入れ物に持つ
   * (types.ts の Wish 参照)。
   */
  | { type: 'addWish'; wish: Wish }
  | { type: 'updateWish'; wish: Wish }
  | { type: 'removeWish'; id: string }
  /**
   * 済んだかどうかだけを裏返す。updateWish で代用しないのは、これが「今」タブから
   * 歩きながら 1 タップで押される操作だからである。画面側が Wish 全体を組み立てて
   * 送る形にすると、その画面が持っていない欄(メモ・URL)を落とす経路が生まれる。
   */
  | { type: 'toggleWishDone'; id: string }
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
   *
   * 国の基本情報(countryInfos)も同じアクションで受け、名前は importBookings のまま
   * 据え置く。AI に投げる口も貼り戻す口も 1 つで、1 回の貼り付けで返ってくるものが
   * 予約と国情報に分かれるだけだからである。別のアクションに割ると、1 回の貼り付けを
   * 取り消すのに Undo が 2 回要ることになり、まとめて取り込む機能そのものが
   * 取り返しの付かない操作になってしまう(verifyAllUnverified / mergeTrip と同じ理由)。
   * 主役は引き続き予約なので、名前は変えない。
   */
  | {
      type: 'importBookings'
      bookings: Array<Booking>
      countryInfos?: Array<CountryInfo>
    }
  /**
   * 共有URL・JSON で受け取った旅程を、いま開いている旅程に合流させる。
   *
   * 同行者と旅程を分担して組んでいると「相手が足した予約だけを自分の旅程に
   * 持ってきたい」場面がある。それまでの選択肢は 2 つしかなく、どちらも外していた。
   * replaceState(丸ごと置き換え)では自分が入れた予約が消えるし、新しい旅程として
   * 追加すると 2 つの旅程を人間が見比べて手で写す羽目になる。だから 3 つ目の道を用意する。
   *
   * 器(旅行の名前・期間・表示タイムゾーン)は自分のものを保つ。合流は
   * 「自分の旅程に相手の予約を入れる」操作であって、相手の旅程に乗り換える
   * 操作ではない。乗り換えたいなら replaceState がそれを表現できる。
   *
   * 1 アクションにするのは、Undo 1 回で合流の全体(予約・連絡先・手続き・
   * エイリアス・国の基本情報)を戻せるようにするため
   * (importBookings / verifyAllUnverified と同じ理由。取り消しに何回もの Undo を
   * 要求するのでは、実質的に取り返しの付かない操作になる)。
   */
  | { type: 'mergeTrip'; incoming: TripNotesState }
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
    'onlineCheckInOpensMinutesBefore',
    'checkInClosesMinutesBefore',
    'bagDropClosesMinutesBefore',
    'note',
  ]
  for (const key of keys) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      changed.push(key)
    }
  }
  return withoutUnverified(next, changed)
}

/**
 * planImport が出した計画を既存の予約列に適用する。
 * マッチした予約は既存の並び順の位置で差し替え、それ以外だけを末尾に追加する。
 * 並び順を保つのは、同じ日の予約カードの表示順が取り込みのたびに
 * 入れ替わるような不要な差分を出さないため。
 *
 * AI 取り込み(importBookings)と旅程の合流(mergeTrip)の両方が通る。
 * 適用のしかたが 2 箇所に分かれていると、同じ planImport の計画なのに
 * 経路によって並び順や差し替え先が変わりうるので、1 箇所に集約する。
 */
function applyImportPlan(
  existing: Array<Booking>,
  plan: ImportPlan,
): Array<Booking> {
  const updates = new Map<string, Booking>()
  const additions: Array<Booking> = []
  const usedIds = new Set(existing.map((booking) => booking.id))

  for (const entry of plan.entries) {
    if (entry.replacesId !== null) {
      updates.set(entry.replacesId, entry.booking)
      continue
    }
    // 新規として足すぶんの id が既存と衝突したら振り直す。
    // 自分で書き出した JSON を自分の旅程に合流させると、id はそのまま重なりうる
    // (たとえばキャンセル済みの既存予約は planImport のマッチ対象から外れるので、
    //  同じ id の予約が「新規」として足される)。id が重複すると
    // updateBooking / removeBooking は先に見つかったほうを掴むので、
    // 直したつもりの編集が隣の予約に飛ぶ。AI 取り込み経路では毎回 newId が
    // 振られていて実害は無いが、判定を適用側に置いておけばどちらの経路でも起こらない
    const booking = usedIds.has(entry.booking.id)
      ? { ...entry.booking, id: newId('bk') }
      : entry.booking
    usedIds.add(booking.id)
    additions.push(booking)
  }

  return [
    ...existing.map((booking) => updates.get(booking.id) ?? booking),
    ...additions,
  ]
}

/**
 * planCountryInfoImport が出した計画を既存の国情報列に適用する。
 * 形も理由も applyImportPlan(予約)とまったく同じで、マッチしたものは既存の
 * 並び順の位置で差し替え、それ以外だけを末尾に追加する。並び順を保つのは、
 * 取り込みのたびに国の一覧の並びが入れ替わる不要な差分を出さないため。
 */
function applyCountryInfoPlan(
  existing: Array<CountryInfo>,
  plan: CountryInfoPlan,
): Array<CountryInfo> {
  const updates = new Map<string, CountryInfo>()
  const additions: Array<CountryInfo> = []
  const usedIds = new Set(existing.map((info) => info.id))

  for (const entry of plan.entries) {
    if (entry.replacesId !== null) {
      updates.set(entry.replacesId, entry.country)
      continue
    }
    // 新規ぶんの id が既存と衝突したら振り直す(理由は applyImportPlan のコメント参照。
    // 自分で書き出した JSON を取り込み直すと id はそのまま重なりうるし、id が重複すると
    // updateCountryInfo / removeCountryInfo が先に見つかったほうを掴む)
    const country = usedIds.has(entry.country.id)
      ? { ...entry.country, id: newId('ci') }
      : entry.country
    usedIds.add(country.id)
    additions.push(country)
  }

  return [...existing.map((info) => updates.get(info.id) ?? info), ...additions]
}

/**
 * 緊急連絡先の重複判定キー。ラベルと値の組を normalizeText で正規化して突き合わせる
 * (全角/半角や前後の空白の違いで同じ連絡先が二重に増えないようにする)。
 * 区切りに利用者が入力しえない制御文字を挟むのは、ラベルと値の境目がずれた別々の組
 * (「大使館」+「110」と「大使館110」+「」)を同じキーにしないため。
 */
function contactKey(contact: EmergencyContact): string {
  return `${normalizeText(contact.label)}\u0000${normalizeText(contact.value)}`
}

/**
 * 国情報の重複判定キー。国名の正規化だけで「同じ国」を見る。
 * 手続きの travelDocKey のように第 2 の軸(種別)を持たないのは、CountryInfo の
 * 同一性が国名そのもので、「同じ国の別種類の基本情報」が存在しないためである。
 */
function countryInfoKey(info: CountryInfo): string {
  return normalizeText(info.name)
}

/**
 * やりたいことの重複判定キー。やりたいこと + 場所の正規化で見る。
 *
 * 場所も鍵に入れるのは、同じ言葉のやりたいことが町ごとに並ぶのが普通だからである
 * (「市場を歩く」は行く先の数だけある)。題名だけで見ると、合流のときに
 * 相手の「市場を歩く(ローマ)」が自分の「市場を歩く(パリ)」と同一視されて落ちる。
 * 区切りに制御文字を挟む理由は contactKey と同じ。
 */
function wishKey(wish: Wish): string {
  return `${normalizeText(wish.title)}\u0000${normalizeText(wish.area ?? '')}`
}

/** 手続きの重複判定キー。種別 + 名前の正規化で「同じ手続き」を見る */
function travelDocKey(doc: TravelDoc): string {
  return `${doc.kind}\u0000${normalizeText(doc.title)}`
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

    case 'addCountryInfo': {
      // travelDocs と同じ任意フィールドなので、1 件も無いときはフィールドごと
      // 存在しない。そこから積み直す
      const current = state.countryInfos ?? []
      return { ...state, countryInfos: [...current, action.countryInfo] }
    }

    case 'updateCountryInfo': {
      const current = state.countryInfos ?? []
      const index = current.findIndex((c) => c.id === action.countryInfo.id)
      if (index === -1) return state
      const countryInfos = [...current]
      countryInfos[index] = action.countryInfo
      return { ...state, countryInfos }
    }

    case 'removeCountryInfo': {
      const current = state.countryInfos ?? []
      const countryInfos = current.filter((c) => c.id !== action.id)
      if (countryInfos.length === current.length) return state
      // 最後の 1 件を消したらフィールドごと落とす(removeTravelDoc と同じ理由)
      if (countryInfos.length === 0) {
        const { countryInfos: _countryInfos, ...rest } = state
        return rest
      }
      return { ...state, countryInfos }
    }

    case 'addWish': {
      // travelDocs / countryInfos と同じ任意フィールドなので、1 件も無いときは
      // フィールドごと存在しない。そこから積み直す
      const current = state.wishes ?? []
      return { ...state, wishes: [...current, action.wish] }
    }

    case 'updateWish': {
      const current = state.wishes ?? []
      const index = current.findIndex((w) => w.id === action.wish.id)
      if (index === -1) return state
      const wishes = [...current]
      wishes[index] = action.wish
      return { ...state, wishes }
    }

    case 'removeWish': {
      const current = state.wishes ?? []
      const wishes = current.filter((w) => w.id !== action.id)
      if (wishes.length === current.length) return state
      // 最後の 1 件を消したらフィールドごと落とす(removeTravelDoc と同じ理由)
      if (wishes.length === 0) {
        const { wishes: _wishes, ...rest } = state
        return rest
      }
      return { ...state, wishes }
    }

    case 'toggleWishDone': {
      const current = state.wishes ?? []
      const index = current.findIndex((w) => w.id === action.id)
      if (index === -1) return state
      const wishes = [...current]
      wishes[index] = { ...wishes[index], done: !wishes[index].done }
      return { ...state, wishes }
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
      const incomingCountries = action.countryInfos ?? []
      // 予約も国情報も 1 件も無いなら同一参照を返す。Undo 履歴に空の 1 手を積まない
      // (取り込む中身が片方だけのこともあるので、それぞれ別に見る)
      if (action.bookings.length === 0 && incomingCountries.length === 0) {
        return state
      }

      const next: TripNotesState = { ...state }

      if (action.bookings.length > 0) {
        const plan = planImport(state.bookings, action.bookings)
        // 計画の適用そのものは applyImportPlan に集約してある(合流と共通)
        next.bookings = applyImportPlan(state.bookings, plan)
      }

      // 国情報も予約と同じ姿勢で、同一とみなす条件(国名の一致)は
      // importMerge.ts の planCountryInfoImport に委ね、ここで再実装しない。
      // 足すものが無ければフィールドを生やさない(types.ts の
      // 「空なら配列ではなくフィールドごと存在しない」方針)
      if (incomingCountries.length > 0) {
        const currentCountries = state.countryInfos ?? []
        next.countryInfos = applyCountryInfoPlan(
          currentCountries,
          planCountryInfoImport(currentCountries, incomingCountries),
        )
      }

      return next
    }

    case 'mergeTrip': {
      const incoming = action.incoming

      // 予約: マッチ条件は importMerge.ts の planImport に集約されていて、ここで
      // 再実装しない。AI 取り込みとまったく同じ判定を通すことで、経路によって
      // 「同じ予約」の定義が変わるということが起こらない。
      // incoming 側の unverified は planImport がそのまま扱うので、相手が AI に
      // 読ませたままの未確認マークは合流後も未確認のまま残る(相手が目視で
      // 確認していない値を、こちらの画面で確認済みとして見せない)
      const bookings =
        incoming.bookings.length === 0
          ? state.bookings
          : applyImportPlan(
              state.bookings,
              planImport(state.bookings, incoming.bookings),
            )
      const bookingsChanged =
        bookings.length !== state.bookings.length ||
        bookings.some((booking, i) => booking !== state.bookings[i])

      /**
       * 緊急連絡先: ラベルと値の組が同じものは足さない。値が違えば、同じラベルでも
       * 別の連絡先として足す(既存を上書きしない)。
       *
       * 緊急連絡先は現地で本当に電話をかける先なので、同じラベル(「大使館」)で
       * 番号が違うときに、どちらが正しいかを機械が決めてはいけない。黙って上書きすると
       * 間違った番号に置き換わったことに誰も気付けないまま旅行に出ることになる。
       * 2 つ並べておけば、人間がどちらに掛けるかを選べるし、要らないほうは手で消せる。
       * 取り返しのつかない側には倒さない。
       */
      const seenContacts = new Set(state.emergencyContacts.map(contactKey))
      const usedContactIds = new Set(
        state.emergencyContacts.map((contact) => contact.id),
      )
      const addedContacts: Array<EmergencyContact> = []
      for (const candidate of incoming.emergencyContacts) {
        const key = contactKey(candidate)
        // 判定済みのキーを足しながら回すので、incoming の中に同じ組が
        // 2 件あっても足されるのは 1 件だけになる
        if (seenContacts.has(key)) continue
        seenContacts.add(key)
        const id = usedContactIds.has(candidate.id) ? newId('ec') : candidate.id
        usedContactIds.add(id)
        addedContacts.push(
          id === candidate.id ? candidate : { ...candidate, id },
        )
      }

      /**
       * 手続き: 種別 + 名前が一致するものは既存を残し、incoming のほうを捨てる。
       *
       * 手続き(ビザ・eSIM)の status は「自分が申請したかどうか」の進捗であって、
       * 相手の旅程に書いてある status は相手の進捗でしかない。合流のたびに
       * 相手の 'todo' で自分の 'done' が巻き戻ると、済ませたはずの手続きが
       * 未了として警告に戻ってきて、警告そのものが信用されなくなる。
       * だから同じ手続きは既存を正とする。
       */
      const currentDocs = state.travelDocs ?? []
      const seenDocs = new Set(currentDocs.map(travelDocKey))
      const usedDocIds = new Set(currentDocs.map((doc) => doc.id))
      const addedDocs: Array<TravelDoc> = []
      for (const candidate of incoming.travelDocs ?? []) {
        const key = travelDocKey(candidate)
        if (seenDocs.has(key)) continue
        seenDocs.add(key)
        // id の振り直しは予約と同じ理由(applyImportPlan のコメント参照)
        const id = usedDocIds.has(candidate.id) ? newId('td') : candidate.id
        usedDocIds.add(id)
        addedDocs.push(id === candidate.id ? candidate : { ...candidate, id })
      }

      /**
       * 同じ場所の組: 判定は addPlaceAlias とまったく同じ isSameAliasPair に委ねる。
       * 「同じ組」の定義が 2 箇所に分かれると、手で登録すると弾かれるのに合流では
       * 二重に入る、といったズレが出る。
       */
      const currentAliases = state.placeAliases ?? []
      const addedAliases: Array<PlaceAlias> = []
      for (const candidate of incoming.placeAliases ?? []) {
        // 名前が空になる組は何にも一致しないので捨てる(addPlaceAlias と同じ)
        if (candidate.names.some((name) => name.trim() === '')) continue
        // 追加済みのぶんも判定対象に入れて、incoming 内の重複も 1 組に畳む
        const known = [...currentAliases, ...addedAliases]
        if (
          known.some((alias) => isSameAliasPair(alias.names, candidate.names))
        ) {
          continue
        }
        // id は必ず振り直す(addPlaceAlias と揃える。組の同一性は names で見ており、
        // id は消すときの目印でしかないので、持ち込んだ値を使う理由が無い)
        addedAliases.push({ id: newId('pa'), names: candidate.names })
      }

      /**
       * 国の基本情報: 国名が一致するものは既存を残し、incoming のほうを捨てる。
       * 名前が違えば別の国として足す。
       *
       * 手続きと同じ「既存を正とする」だが、理由は違う。ここにある値は利用者が
       * 現地の情報を自分で確かめて書き直しているかもしれないもので、とくに
       * 緊急通報番号は現地で本当にかける番号である。同じ国について相手の旅程が
       * 別の値を持っていたときに、どちらが正しいかを機械が決めて黙って上書きすると、
       * 間違った番号に置き換わったことに誰も気付けないまま旅行に出ることになる。
       * 緊急連絡先で既存を上書きしないのとまったく同じ、取り返しのつかない側には
       * 倒さないという判断である。
       */
      const currentCountries = state.countryInfos ?? []
      const seenCountries = new Set(currentCountries.map(countryInfoKey))
      const usedCountryIds = new Set(currentCountries.map((info) => info.id))
      const addedCountries: Array<CountryInfo> = []
      for (const candidate of incoming.countryInfos ?? []) {
        const key = countryInfoKey(candidate)
        // 判定済みのキーを足しながら回すので、incoming の中に同じ国が
        // 2 件あっても足されるのは 1 件だけになる(連絡先・手続きと同じ)
        if (seenCountries.has(key)) continue
        seenCountries.add(key)
        // id の振り直しは予約・手続きと同じ理由(applyImportPlan のコメント参照)
        const id = usedCountryIds.has(candidate.id) ? newId('ci') : candidate.id
        usedCountryIds.add(id)
        addedCountries.push(
          id === candidate.id ? candidate : { ...candidate, id },
        )
      }

      /**
       * やりたいこと: やりたいこと + 場所が一致するものは既存を残し、incoming を捨てる。
       *
       * 手続きとまったく同じ「既存を正とする」で、理由も同じ。done は
       * 「自分が済ませたかどうか」の記録であって、相手の旅程に書いてある done は
       * 相手の進捗でしかない。合流のたびに相手の未完了で自分のチェックが外れると、
       * 行ったはずの店がまた「やりたいこと」に戻ってきて、この一覧が
       * 「自分がどこまでやったか」の記録として信用できなくなる。
       */
      const currentWishes = state.wishes ?? []
      const seenWishes = new Set(currentWishes.map(wishKey))
      const usedWishIds = new Set(currentWishes.map((wish) => wish.id))
      const addedWishes: Array<Wish> = []
      for (const candidate of incoming.wishes ?? []) {
        const key = wishKey(candidate)
        // 判定済みのキーを足しながら回すので、incoming の中に同じ組が
        // 2 件あっても足されるのは 1 件だけになる(連絡先・手続き・国情報と同じ)
        if (seenWishes.has(key)) continue
        seenWishes.add(key)
        // id の振り直しは予約と同じ理由(applyImportPlan のコメント参照)
        const id = usedWishIds.has(candidate.id) ? newId('w') : candidate.id
        usedWishIds.add(id)
        addedWishes.push(id === candidate.id ? candidate : { ...candidate, id })
      }

      // どれ 1 つ変わらないなら同一参照を返す。既に取り込み済みの共有URLを
      // もう一度開いたときに、Undo 履歴へ空の 1 手を積まないため
      // (verifyAllUnverified と同じ流儀)
      if (
        !bookingsChanged &&
        addedContacts.length === 0 &&
        addedDocs.length === 0 &&
        addedAliases.length === 0 &&
        addedCountries.length === 0 &&
        addedWishes.length === 0
      ) {
        return state
      }

      // tripTitle / startDate / endDate / pinnedTz / schemaVersion は一切触らない。
      // 合流は「自分の旅程に相手の予約を入れる」操作なので、器は自分のものを保つ。
      // 相手の旅行の名前や期間で自分の期間が書き換わると、「寝る場所がない夜」の
      // 計算の起点(startDate/endDate)まで相手のものになり、自分の旅程の警告が
      // 意味を失う。名前や期間ごと相手のものにしたいなら、それは合流ではなく
      // 置き換え(replaceState)で表現できる
      const next: TripNotesState = { ...state }
      if (bookingsChanged) next.bookings = bookings
      if (addedContacts.length > 0) {
        next.emergencyContacts = [...state.emergencyContacts, ...addedContacts]
      }
      // 足すものが 1 件も無ければフィールドごと生やさない
      // (types.ts の「空なら配列ではなくフィールドごと存在しない」方針)
      if (addedDocs.length > 0) next.travelDocs = [...currentDocs, ...addedDocs]
      if (addedAliases.length > 0) {
        next.placeAliases = [...currentAliases, ...addedAliases]
      }
      if (addedCountries.length > 0) {
        next.countryInfos = [...currentCountries, ...addedCountries]
      }
      if (addedWishes.length > 0) {
        next.wishes = [...currentWishes, ...addedWishes]
      }
      return next
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
