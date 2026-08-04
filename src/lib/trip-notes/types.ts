/**
 * 旅のしおりのデータモデル。
 *
 * 設計原則:
 * - 時刻は必ず「現地の壁時計時刻 + IANA タイムゾーン」で保持する。
 *   予約確認メールに書いてあるのは常に現地時刻なので、UTC 単一で持つと
 *   入力のたびに人間が時差を暗算する羽目になり、そこで事故る。
 *   比較・ソート・カウントダウンに使う epoch は Stamp からの導出値であって、
 *   保存する値ではない。実体は Temporal.ZonedDateTime(datetime.ts 参照)。
 * - 「未確認フィールド」を型で表現する。AI が予約メールから抽出した値は
 *   人間が目視で確認するまで `unverified` に残り続ける。
 *   1時間ずれた出発時刻を「確定済み」として表示するくらいなら、
 *   未確認であることを画面に出し続けるほうが安全。
 * - 導出値(NightSlot / DayGroup / TripSummary 等)は状態として持たない。
 *   単一の真実は TripNotesState だけで、残りはすべて計算で出す。
 */

export type BookingKind =
  | 'lodging'
  | 'flight'
  | 'train'
  | 'bus'
  | 'ferry'
  | 'car'
  | 'activity'
  | 'other'

/** 予約の確定度。支払い状況とは独立した軸 */
export type BookingStatus = 'idea' | 'held' | 'confirmed' | 'cancelled'

/** 支払い状況。「確定済みだが現地払い」を表現するため予約状況と分離する */
export type PaymentStatus = 'unpaid' | 'deposit' | 'paid' | 'onsite'

/**
 * 予定の時刻。Temporal.ZonedDateTime の文字列表現で保持する。
 *
 * 「現地の壁時計時刻 + IANA タイムゾーン」を 1 つの文字列で表現できるため、
 * tz を別フィールドに持つ必要がなく、復元時の検証も
 * Temporal.ZonedDateTime.from() が投げる例外だけで済む。
 * 日付と時刻とタイムゾーンを別々のフィールドに分けて持つと、
 * 3 つのうち 1 つだけ更新し忘れた中途半端な状態が型として作れてしまう。
 */
export interface Stamp {
  /**
   * 例: "2026-09-12T14:20:00+02:00[Europe/Paris]"。
   * 終日の場合も現地 00:00 の ZonedDateTime として保持する。
   */
  zdt: string
  /** true なら時刻部分を表示しない(zdt には現地 00:00 が入っている) */
  allDay: boolean
}

export interface Place {
  name: string
  /** 現地語表記。タクシー運転手に画面を見せる用 */
  localName?: string
  address?: string
  lat?: number
  lng?: number
}

export interface Money {
  amount: number
  currency: string // ISO 4217 (例: 'EUR')
}

/** unverified / evidence のキーに使う、利用者が目視確認しうるフィールド名 */
export type FieldKey =
  | 'kind'
  | 'title'
  | 'start'
  | 'end'
  | 'from'
  | 'to'
  | 'place'
  | 'status'
  | 'payment'
  | 'confirmationNumber'
  | 'provider'
  | 'price'
  | 'freeCancelUntil'
  | 'note'

export interface Booking {
  id: string
  kind: BookingKind
  title: string
  start: Stamp
  /** 移動なら到着、宿泊ならチェックアウト。単発の予定なら null */
  end: Stamp | null
  from?: Place // 移動の出発地
  to?: Place // 移動の到着地
  place?: Place // 宿泊・アクティビティの場所
  status: BookingStatus
  payment: PaymentStatus
  confirmationNumber?: string
  provider?: string
  price?: Money
  /** 無料キャンセル期限 (YYYY-MM-DD)。カウントダウンの元 */
  freeCancelUntil?: string
  note?: string
  /** AI が埋めたまま人間が未確認のフィールド。確認したら取り除く */
  unverified?: Array<FieldKey>
  /** AI が抽出根拠として引用した元テキスト。共有URLからは除外する */
  evidence?: Partial<Record<FieldKey, string>>
}

export interface EmergencyContact {
  id: string
  label: string
  value: string
  note?: string
}

export interface TripNotesState {
  schemaVersion: 1
  tripTitle: string
  /** 旅行期間。「寝る場所がない夜」の計算に使う */
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  /** 表示タイムゾーンの手動固定。null ならデバイスのタイムゾーン */
  pinnedTz: string | null
  bookings: Array<Booking>
  emergencyContacts: Array<EmergencyContact>
}

/**
 * 夜が何でカバーされているか。
 * 'lodging' = 宿がある / 'overnight' = 夜行移動の車中泊 / null = 寝る場所がない
 */
export type NightCoverage = 'lodging' | 'overnight' | null

export interface NightSlot {
  /** その夜が始まる日付。「6/12 の夜」= 6/12 の晩に寝る夜 */
  date: string
  covered: NightCoverage
  /** カバーしている予約の id。covered が null のときは undefined */
  bookingId?: string
}

/** 表示タイムゾーン基準の日付で束ねた 1 日分 */
export interface DayGroup {
  date: string
  /** その日に始まる予約(開始日基準)。終了側は各カードの end で示す */
  bookings: Array<Booking>
  /** その日の晩の夜。旅行最終日と旅行期間外の日は null */
  night: NightSlot | null
}

/** 「今」と「次」。旅行中トップ画面の主役 */
export interface CurrentAndNext {
  /** いま進行中のもの(滞在中の宿、乗車中の列車など) */
  current: Array<Booking>
  /** 次に来るもの。upcoming の先頭と同じ */
  next: Booking | null
  /** これから来るものすべて(開始が早い順) */
  upcoming: Array<Booking>
}

/** 宿が変わるのに移動の予約がない箇所 */
export interface TransportGap {
  /** 移動が必要になる日 = 前の宿のチェックアウト日 */
  date: string
  fromBookingId: string
  toBookingId: string
  /** 前の宿の場所名 */
  fromLabel: string
  /** 次の宿の場所名 */
  toLabel: string
}

/**
 * 旅程の場所の連続性が壊れている箇所の種別。
 * TransportGap が宿と宿の間だけを見るのに対し、こちらは
 * 「予約の終わりにいる場所」と「次の予約の始まりにいる場所」を通しで見る。
 */
export type ItineraryIssueKind =
  /** 場所が変わるのに、その間に移動の予約がない */
  | 'missing-transport'
  /** 移動の到着地と、次の予約の場所が食い違う */
  | 'location-mismatch'
  /** 移動と移動の間に夜をまたぐのに、宿泊予約がない */
  | 'missing-lodging'
  /** 移動の出発地が、直前にいた場所と食い違う */
  | 'departure-mismatch'

export interface ItineraryIssue {
  kind: ItineraryIssueKind
  /** 問題が起きる日 (YYYY-MM-DD) */
  date: string
  /** 手前側の予約。旅程の先頭など該当がなければ null */
  fromBookingId: string | null
  /** 後ろ側の予約。該当がなければ null */
  toBookingId: string | null
  fromLabel: string
  toLabel: string
  /** 利用者向けの説明文。「次に何をすればよいか」まで含める */
  message: string
}

export interface CancelDeadline {
  bookingId: string
  title: string
  /** 無料キャンセル期限 (YYYY-MM-DD) */
  date: string
  /** 残り日数。切り捨てなので「あと 0 日」= 今日中 */
  daysLeft: number
}

/** 通貨別の予算集計 */
export interface BudgetByCurrency {
  currency: string
  /** キャンセル済みを除いた総額 */
  total: number
  /** 予約状況別の内訳(cancelled も記録する) */
  byStatus: Record<BookingStatus, number>
  /** 支払い状況別の内訳(cancelled は除く) */
  byPayment: Record<PaymentStatus, number>
  /** status が confirmed のものの合計 */
  confirmed: number
  /** 支払い済み(payment = 'paid')の合計 */
  paid: number
  /**
   * これから払う額。deposit は内金の額を保持しないので全額を残額として数える。
   * 予算は過大に見積もっておくほうが旅先で困らない。
   */
  outstanding: number
}

/** 進捗サマリ。「あと何を予約すればいいか」を 1 画面で出すための束 */
export interface TripSummary {
  /** 旅行の総泊数 */
  totalNights: number
  nights: Array<NightSlot>
  /** 寝る場所がない夜の数。0 でないなら最優先の警告 */
  uncoveredNights: number
  /** キャンセル済みを除いた予約数 */
  bookingCount: number
  /** 予約状況別の件数 */
  statusCounts: Record<BookingStatus, number>
  /** 未確認フィールドが残っている予約数 */
  unverifiedCount: number
  transportGaps: Array<TransportGap>
  /**
   * 旅程全体の場所の連続性から出た不整合。
   * transportGaps(宿と宿の間だけ)の上位互換だが、UI の移行が済むまで両方持つ。
   */
  itineraryIssues: Array<ItineraryIssue>
  cancelDeadlines: Array<CancelDeadline>
  budget: Array<BudgetByCurrency>
  currentAndNext: CurrentAndNext
}
