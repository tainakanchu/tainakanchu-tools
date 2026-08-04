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
  | 'checkInClosesMinutesBefore'
  | 'bagDropClosesMinutesBefore'
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
  /**
   * 搭乗手続き(チェックイン)の締切。出発の何分前かを分で持つ。
   *
   * ■ なぜ絶対時刻(Stamp)ではなく「出発の何分前」なのか
   *   予約確認書にも航空会社の規定にも、この締切は必ず「出発の 60 分前まで」という
   *   相対の形で書かれている。読み取った人が暗算で 14:20 - 60分 = 13:20 に直して
   *   保存すると、そのあと出発時刻を 14:20 → 16:05 に直したときに締切だけが 13:20 に
   *   取り残される。しかも画面には「13:20 搭乗手続きの締切」という、もっともらしい
   *   時刻が出続ける。直したつもりで嘘の締切が残るのが、この壊れ方のたちの悪いところで、
   *   時刻がずれていることに空港で気付くまで誰も気付けない。
   *   相対値で持てば、出発時刻を直した瞬間に締切も一緒に動く。表示のたびに
   *   出発時刻から引き算するので、両者が食い違う状態が構造的に作れない。
   *
   * 妥当な範囲(整数・1 分以上・上限)の検証は storage.ts の parseBooking に置いてある。
   */
  checkInClosesMinutesBefore?: number
  /**
   * 受託手荷物の預け締切(バッグドロップ)。出発の何分前かを分で持つ。
   * 相対値で持つ理由は checkInClosesMinutesBefore と同じ。
   *
   * 搭乗手続きの締切とは別に持つ。同じ便でも「手荷物は 60 分前まで、
   * 搭乗手続きは 45 分前まで」のように締切が 2 段になっていることが多く、
   * 預ける荷物があるかどうかで人が動くべき時刻が変わるため。
   */
  bagDropClosesMinutesBefore?: number
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

export type TravelDocKind = 'visa' | 'sim' | 'insurance' | 'permit' | 'other'

/** 手続きの進み具合。予約の BookingStatus とは別軸(申請してから発給までの待ちがある) */
export type TravelDocStatus = 'todo' | 'applied' | 'done'

/**
 * 旅行前に済ませておく手続き(ビザ・eSIM・保険・入域許可など)。
 *
 * ■ なぜ Booking の kind に足さないのか
 *   最初にそれを検討して捨てた。同じ道に戻らないよう理由を残しておく。
 *   - itinerary.ts は予約の場所を時系列につないで連続性を見ている。そこに
 *     「マルタのビザ」のような予約が混ざると、パリ → マルタ(ビザ) → パリ と読まれ、
 *     ありもしない場所の食い違いを警告してしまう。判定を緩めて誤検出を消しにいくと、
 *     今度は本物の移動の抜けまで見逃すようになる。
 *   - 日程タイムラインは「その日にやること」の一覧なので、有効期間が数ヶ月ある書類が
 *     そこに 1 行を占めると、当日の予定が書類に埋もれて読めなくなる。
 *   予約と手続きは「旅行前に潰すべき抜け」という点だけが同じで、
 *   場所も時刻も持たない別のものなので、最初から別の入れ物に置く。
 *
 * ■ なぜ Stamp ではなく YYYY-MM-DD なのか
 *   予約の時刻は「14:20 発の列車」のように分単位で意味を持ち、1 時間ずれると
 *   乗り遅れるので Stamp(現地時刻 + タイムゾーン)で持つ必要がある。
 *   一方この手続きの日付は「9/15 まで有効」「9/1 が申請期限」という粒度でしか
 *   使わず、時刻もタイムゾーンも入力のしようがない(ビザの有効期間に
 *   タイムゾーンを聞かれても答えられる利用者はいない)。
 *   持てない精度を型で要求すると、入力のたびに適当な時刻を選ばせることになる。
 */
export interface TravelDoc {
  id: string
  kind: TravelDocKind
  title: string
  /** 対象の国・地域。「マルタ」「シェンゲン圏」など自由入力 */
  region?: string
  status: TravelDocStatus
  /** 申請の期限 (YYYY-MM-DD)。カウントダウンの元 */
  dueDate?: string
  /** 有効期間 (YYYY-MM-DD)。旅程をカバーしているかの判定に使う */
  validFrom?: string
  validUntil?: string
  /** ビザ番号・eSIM の ICCID・申請 ID など */
  referenceNumber?: string
  price?: Money
  /** 申請サイトやマイページ */
  url?: string
  note?: string
}

/**
 * 利用者が「この 2 つは同じ場所だ」と教えた組。
 *
 * 地名の同一判定(itinerary.ts)は座標が無ければ文字列のヒューリスティックに頼るしかなく、
 * 住所も座標も入っていない予約ではどうしても外れる
 * (「マルタ・ルア国際空港」と「マルタの知人宅」など)。
 * かといって判定を緩めて誤検出を消しにいくと、本当に移動が抜けている穴まで
 * 見逃すようになる。だから判定は厳しいままにして、外れたときは
 * 利用者に教えてもらい、その 1 組だけを黙らせる。
 */
export interface PlaceAlias {
  id: string
  /** 同じ場所とみなす 2 つの表記。順序に意味は無い */
  names: [string, string]
}

export interface TripNotesState {
  schemaVersion: 1
  tripTitle: string
  /** 旅行期間。「寝る場所がない夜」の計算に使う */
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  /**
   * 表示タイムゾーンの手動固定。null ならデバイスのタイムゾーン。
   *
   * 効くのは「時刻の見せ方」(日本時間を併記するか)と、予約を追加するときの
   * 既定のタイムゾーン、そして「今日」の判定まで。
   * 予定がどの日付に属するかは動かさない。旅程は現地の暦で読むものなので、
   * 日付は常にその予約自身の現地日付で決める(derive.ts 参照)。
   */
  pinnedTz: string | null
  bookings: Array<Booking>
  emergencyContacts: Array<EmergencyContact>
  /**
   * 場所の同一判定が外れたときに、利用者が個別に黙らせた組。
   *
   * 必須にせず任意にしているのは、保存済みの localStorage や発行済みの共有URLに
   * このフィールドが無いうえ、大多数の利用者はこの逃げ道を一度も使わないため。
   * 「空なら配列ではなくフィールドごと存在しない」という形にしておけば、
   * JSON の書き出しや共有URLの中身がこの機能の追加で無駄に膨らまない
   * (share.ts の「値が無ければ省く」という方針とも揃う)。
   */
  placeAliases?: Array<PlaceAlias>
  /**
   * 旅行前に済ませておく手続き(ビザ・eSIM など)。
   *
   * placeAliases と同じ理由で必須にせず任意にしている。保存済みの localStorage にも
   * 発行済みの共有URLにもこのフィールドは無く、手続きを 1 件も登録しない利用者の
   * JSON や共有URLを `"travelDocs":[]` で膨らませたくない
   * (share.ts の「値が無ければ省く」という方針とも揃う)。
   */
  travelDocs?: Array<TravelDoc>
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

/** その予約自身の現地日付で束ねた 1 日分 */
export interface DayGroup {
  date: string
  /** その日に始まる予約(開始日基準)。終了側は各カードの end で示す */
  bookings: Array<Booking>
  /**
   * その日に始まってはいないが、その日も継続している予約
   * (連泊中の宿・日をまたぐ移動)。
   */
  ongoing: Array<Booking>
  /** その日の晩の夜。旅行最終日と旅行期間外の日は null */
  night: NightSlot | null
}

/**
 * 日程タイムラインの 1 行。その日に始まる予約と、前日から続いている予約が
 * 同じ 1 本の列に混ざる(derive.ts の dayTimeline)。
 */
export interface DayTimelineRow {
  /**
   * 'booking' = その日に始まる予約(カードで出す)
   * 'ongoing' = 前日から続いている予約(控えめな 1 行で出す)
   */
  row: 'booking' | 'ongoing'
  booking: Booking
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
  /**
   * 同じ場所に着いて同じ場所から発つ、夜をまたぐ乗り継ぎ。
   * 空港で夜を明かす前提なら宿は要らないので警告ではないが、
   * 「長い待ち時間なので宿を取りたい」人のために存在だけ知らせる。
   */
  | 'layover'

/**
 * 指摘の強さ。
 * 'warning' は旅程が壊れている(直さないと現地で困る)、
 * 'info' は壊れてはいないが利用者に判断してほしいもの。
 * 画面の「穴アラート」の点灯や件数は warning だけで数える。
 */
export type ItineraryIssueSeverity = 'warning' | 'info'

export interface ItineraryIssue {
  kind: ItineraryIssueKind
  severity: ItineraryIssueSeverity
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

/**
 * 手続き(TravelDoc)の抜けの種別。判定の本体は docs.ts。
 *
 * ItineraryIssue と同じくここに置いてあるのは、これも「状態ではない導出値」で、
 * 画面と判定の両方から参照される型だからである(判定側だけが知っていればよい
 * 定数やしきい値は docs.ts の中に閉じている)。
 */
export type TravelDocIssueKind =
  /** 取得できていない(旅行開始までに間に合わせる必要がある) */
  | 'not-done'
  /** 申請期限が過ぎている / 迫っている */
  | 'due-soon'
  /** 有効期間が旅程をカバーしていない */
  | 'coverage-gap'

export interface TravelDocIssue {
  docId: string
  kind: TravelDocIssueKind
  /** ItineraryIssueSeverity と同じ意味。'warning' は直さないと現地で困るもの */
  severity: 'warning' | 'info'
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
  /**
   * 手続き(ビザ・eSIM など)の抜け。itineraryIssues と同じ扱いで、
   * 状態としては持たず computeSummary のたびに計算する。
   * 手続きを 1 件も登録していなければ常に空になる。
   */
  travelDocIssues: Array<TravelDocIssue>
  cancelDeadlines: Array<CancelDeadline>
  budget: Array<BudgetByCurrency>
  currentAndNext: CurrentAndNext
}
