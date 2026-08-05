/**
 * 旅のしおり(trip-notes)のローカル永続化層。
 *
 * trip-scheduler/storage.ts と同じ方針を踏襲する:
 * - スキーマの根幹(バージョン・必須の日付)が壊れている入力は復元を諦めて null を返す。
 * - 配列要素は 1 件ずつ検証し、不正な要素だけを黙って落として残りは活かす。
 *   1 件の予約が壊れているだけで旅程全体が読み込めなくなるのは、
 *   旅行直前の利用者にとって最悪の体験になる。
 *
 * 例外は booking.start / booking.end のタイムゾーン。壊れた tz を持つ booking は
 * フォールバックさせず booking ごと落とす。理由は parseBooking のコメントを参照。
 */

import { addDays, isValidISODate, isValidTz, tryParseStamp } from './datetime'
import type {
  Booking,
  BookingKind,
  BookingStatus,
  CountryInfo,
  EmergencyContact,
  FieldKey,
  Money,
  PaymentStatus,
  Place,
  PlaceAlias,
  Stamp,
  TravelDoc,
  TravelDocKind,
  TravelDocStatus,
  TripNotesState,
  Wish,
} from './types'

const STORAGE_KEY = 'trip-notes:v1'

/** unverified / evidence のキーに使える FieldKey の全量。UI のチェックボックス等でも使う */
export const FIELD_KEYS: Array<FieldKey> = [
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

/**
 * 締切(出発の何分前か)として受け付ける上限。24 時間 = 1440 分。
 *
 * 実在する搭乗手続きの締切は国際線でも出発の 60〜90 分前で、いちばん早い
 * 「前日預け入れ」の類を数えても出発の 24 時間より前に閉まる手続きは無い。
 * それを超える値が入るのは、分と時間を取り違えた(60 のつもりで 3600)か
 * 桁を打ち間違えたときで、そのまま採用すると「あと 2 日」で締切が来ると
 * 主張するマイルストーンが画面の先頭に居座る。
 * 締切は過ぎると取り返しがつかないぶん強調して見せる情報なので、
 * 疑わしい値は表示しない側に倒す。
 *
 * これより前(24〜72 時間前)にあるオンラインチェックインの *開放* は、
 * アプリが別の項目として持つようになったのでこの上限には含めない
 * (MAX_CHECK_IN_OPENS_MINUTES_BEFORE 参照)。
 */
export const MAX_DEADLINE_MINUTES_BEFORE = 24 * 60

/**
 * オンラインチェックインの開放(出発の何分前か)として受け付ける上限。
 * 72 時間 = 4320 分。
 *
 * ■ なぜ締切と上限を分けるのか
 *   上限の役目は「分と時間の取り違え(60 のつもりで 3600)や桁の打ち間違い」を
 *   弾くことなので、その項目に現実に存在しうる最大値のすぐ上に置かないと
 *   役に立たない。締切は 24 時間より前に閉まる手続きが存在しないので 1440 のままでよい。
 *   一方オンラインチェックインの開放は 24 / 48 / 72 時間前が実在するので、
 *   締切と同じ上限を当てると *正しい値*(4320)のほうが弾かれる。
 *   だから上限は項目ごとに持つ。
 *
 * ■ なぜ 72 時間で止めるのか
 *   実際に航空会社が公開している開放は 24 / 48 / 72 時間前に収まる。
 *   それより前から座席を選べる類のもの(予約時から座席指定できる運賃)は
 *   「開く瞬間」が存在せず、そもそもカウントダウンする対象にならない。
 *   72 時間を超える値は、開放時刻ではなく単位の取り違えである可能性のほうが高い。
 */
export const MAX_CHECK_IN_OPENS_MINUTES_BEFORE = 72 * 60

/**
 * 「出発の何分前か」として妥当か。上限だけが項目で違うので引数で受ける。
 *
 * - 整数だけを認める。「45.5 分前」という締切は現実に存在せず、
 *   小数が入るのは単位の取り違えか計算ミスのとき。
 * - 0 と負の数を弾く。0 は「出発時刻そのものが締切」を意味してしまい、
 *   出発のマイルストーンと同じ時刻に二重に並ぶだけで締切として機能しない。
 *   負の数(出発より後に閉まる締切)はそもそも意味を成さない。
 */
function isMinutesBefore(value: unknown, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= max
  )
}

/**
 * 締切の分数として妥当か。
 *
 * storage だけでなく入力フォームからも呼ぶ。保存時と入力時で許す範囲が
 * 食い違うと「入力できたのに保存されない値」が生まれるので、判定は 1 本にする。
 */
export function isDeadlineMinutesBefore(value: unknown): value is number {
  return isMinutesBefore(value, MAX_DEADLINE_MINUTES_BEFORE)
}

/**
 * オンラインチェックインの開放時刻(出発の何分前か)として妥当か。
 * isDeadlineMinutesBefore との違いは上限だけで、整数・1 分以上という条件は同じ。
 * 締切と同じく、入力フォームからも同じ判定を呼ぶこと。
 */
export function isCheckInOpensMinutesBefore(value: unknown): value is number {
  return isMinutesBefore(value, MAX_CHECK_IN_OPENS_MINUTES_BEFORE)
}

export const BOOKING_KINDS: Array<BookingKind> = [
  'lodging',
  'flight',
  'train',
  'bus',
  'ferry',
  'car',
  'activity',
  'other',
]

export const BOOKING_STATUSES: Array<BookingStatus> = [
  'idea',
  'held',
  'confirmed',
  'cancelled',
]

export const PAYMENT_STATUSES: Array<PaymentStatus> = [
  'unpaid',
  'deposit',
  'paid',
  'onsite',
]

/** 手続きの種別。UI の選択肢の並び順もこれをそのまま使う */
export const TRAVEL_DOC_KINDS: Array<TravelDocKind> = [
  'visa',
  'sim',
  'insurance',
  'permit',
  'other',
]

/** 申請してから発給までの待ちがあるので、予約状況とは別の 3 段階を持つ */
export const TRAVEL_DOC_STATUSES: Array<TravelDocStatus> = [
  'todo',
  'applied',
  'done',
]

const FIELD_KEY_SET = new Set<string>(FIELD_KEYS)
const BOOKING_KIND_SET = new Set<string>(BOOKING_KINDS)
const BOOKING_STATUS_SET = new Set<string>(BOOKING_STATUSES)
const PAYMENT_STATUS_SET = new Set<string>(PAYMENT_STATUSES)
const TRAVEL_DOC_KIND_SET = new Set<string>(TRAVEL_DOC_KINDS)
const TRAVEL_DOC_STATUS_SET = new Set<string>(TRAVEL_DOC_STATUSES)

function isFieldKey(value: unknown): value is FieldKey {
  return typeof value === 'string' && FIELD_KEY_SET.has(value)
}

function isBookingKind(value: unknown): value is BookingKind {
  return typeof value === 'string' && BOOKING_KIND_SET.has(value)
}

function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === 'string' && BOOKING_STATUS_SET.has(value)
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string' && PAYMENT_STATUS_SET.has(value)
}

function isTravelDocKind(value: unknown): value is TravelDocKind {
  return typeof value === 'string' && TRAVEL_DOC_KIND_SET.has(value)
}

function isTravelDocStatus(value: unknown): value is TravelDocStatus {
  return typeof value === 'string' && TRAVEL_DOC_STATUS_SET.has(value)
}

/**
 * unknown を「プロパティを読める形」に絞るための門番。
 * 外部由来 JSON を扱う各 parse 関数が最初に通す。
 *
 * typeof 'object' で見ているだけなので配列もここは通過する。
 * 意図的にそうしている: 各 parse 関数は必須プロパティの型
 * (name が文字列、id が文字列……)で弾くので、配列が来ても結局落ちる。
 * ここで配列を除外しても結果は変わらず、判定条件が二重になるだけになる。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Stamp の妥当性を検証する。
 * zdt が文字列、allDay が真偽値であることに加えて、tryParseStamp が実際に
 * Temporal.ZonedDateTime として解釈できることを要求する。
 * Temporal.ZonedDateTime.from() は不正な日時文字列・不正な IANA タイムゾーンの
 * どちらでも例外を投げるので、「日付が変」「時刻が変」「タイムゾーンが変」を
 * この 1 本のチェックだけでまとめて弾ける
 * (date/time/tz を個別フィールドとして検証していた頃と違い、
 *  各フィールド単体では妥当でも組み合わせると不正、というケースが構造的に起きない)。
 */
function isStamp(value: unknown): value is Stamp {
  if (!isRecord(value)) return false
  const { zdt, allDay } = value
  if (typeof zdt !== 'string') return false
  if (typeof allDay !== 'boolean') return false
  return tryParseStamp({ zdt, allDay }) !== null
}

/**
 * Place を検証する。name だけが必須。
 * lat/lng は有限数のときだけ採用する。欠落や NaN を 0 として扱うと、
 * 地図表示が赤道とグリニッジ子午線の交点というまったく見当違いの位置を指してしまう。
 */
function parsePlace(raw: unknown): Place | undefined {
  if (!isRecord(raw)) return undefined
  const { name, localName, latinName, address, lat, lng } = raw
  if (typeof name !== 'string') return undefined

  const place: Place = { name }
  if (typeof localName === 'string') place.localName = localName
  if (typeof latinName === 'string') place.latinName = latinName
  if (typeof address === 'string') place.address = address
  if (typeof lat === 'number' && Number.isFinite(lat)) place.lat = lat
  if (typeof lng === 'number' && Number.isFinite(lng)) place.lng = lng
  return place
}

/** Money は amount が有限数、currency が文字列であることを要求する */
function parseMoney(raw: unknown): Money | undefined {
  if (!isRecord(raw)) return undefined
  const { amount, currency } = raw
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined
  if (typeof currency !== 'string') return undefined
  return { amount, currency }
}

/** 既知の FieldKey だけに絞り込む。空になったら undefined にして UI 側の分岐を減らす */
function parseUnverified(raw: unknown): Array<FieldKey> | undefined {
  if (!Array.isArray(raw)) return undefined
  const keys = raw.filter(isFieldKey)
  return keys.length > 0 ? keys : undefined
}

/**
 * 既知の FieldKey かつ値が文字列のエントリだけ残す。空になったら undefined にする。
 * evidence は「AI がどのテキストを根拠に抽出したか」という機微情報寄りの内容を
 * 含みうるので、共有URL用のエンコード側(別ファイル)で別途除外される。
 */
function parseEvidence(
  raw: unknown,
): Partial<Record<FieldKey, string>> | undefined {
  if (!isRecord(raw)) return undefined
  const evidence: Partial<Record<FieldKey, string>> = {}
  for (const [key, v] of Object.entries(raw)) {
    if (isFieldKey(key) && typeof v === 'string') {
      evidence[key] = v
    }
  }
  return Object.keys(evidence).length > 0 ? evidence : undefined
}

/**
 * Booking の検証方針:
 * - 必須フィールド(id/kind/title/start/status/payment)が欠けている・不正な値なら
 *   その booking ごと黙って落とす。1 件の壊れた予約のために保存全体を諦めるよりは、
 *   直せる予約だけでも表示できたほうが利用者にとって実利がある。
 * - 任意フィールド(from/to/place/confirmationNumber/provider/price/
 *   freeCancelUntil/onlineCheckInOpensMinutesBefore/checkInClosesMinutesBefore/
 *   bagDropClosesMinutesBefore/note/unverified/evidence)は不正でもそのフィールドだけを
 *   落として undefined にする。booking 自体は残す。
 * - end は Stamp として妥当なら採用し、それ以外(欠落・不正)は null にする
 *   (end は「単発の予定なら null」が正常値なので、start と違って落とす理由にならない)。
 *
 * ただし start(および end)のタイムゾーンだけは特別扱いする。不正な IANA
 * タイムゾーンを持つ booking は、デバイスのタイムゾーンや Asia/Tokyo に
 * フォールバックさせず、booking ごと落とす(isStamp が tryParseStamp 経由で
 * 判定するので、ここで個別に tz を見る必要はなく自然にそうなる)。
 *
 * 理由: 時刻の取り違えは「列車に乗り遅れる」という直接の実害につながる。
 * タイムゾーンを勝手に差し替えると、画面には正しそうな時刻が表示されるのに
 * 実際は何時間もずれる、という一番気づきにくい壊れ方をする。
 * 予約が消えていれば利用者はすぐに気づいて入れ直せるが、
 * 静かにずれた時刻には気づけない。だから「(気づける形で)消える」ほうを選ぶ。
 */
export function parseBooking(raw: unknown): Booking | null {
  if (!isRecord(raw)) return null
  const value = raw

  const { id, kind, title, status, payment } = value
  if (typeof id !== 'string') return null
  if (!isBookingKind(kind)) return null
  if (typeof title !== 'string') return null
  if (!isBookingStatus(status)) return null
  if (!isPaymentStatus(payment)) return null

  const start = value.start
  if (!isStamp(start)) return null

  const end = value.end
  const booking: Booking = {
    id,
    kind,
    title,
    start,
    end: isStamp(end) ? end : null,
    status,
    payment,
  }

  const from = parsePlace(value.from)
  if (from !== undefined) booking.from = from

  const to = parsePlace(value.to)
  if (to !== undefined) booking.to = to

  const place = parsePlace(value.place)
  if (place !== undefined) booking.place = place

  if (typeof value.confirmationNumber === 'string') {
    booking.confirmationNumber = value.confirmationNumber
  }
  if (typeof value.provider === 'string') {
    booking.provider = value.provider
  }

  const price = parseMoney(value.price)
  if (price !== undefined) booking.price = price

  if (
    typeof value.freeCancelUntil === 'string' &&
    isValidISODate(value.freeCancelUntil)
  ) {
    booking.freeCancelUntil = value.freeCancelUntil
  }

  // 出発からの相対分を持つ 3 項目(開放 1・締切 2)は、不正なら
  // 「そのフィールドだけ落とす」(予約は残す)。落とせばマイルストーンが
  // 1 つ出なくなるだけで、利用者は自分で時刻を確かめに行く。逆に怪しい値を通すと、
  // 確かめずに済むと思わせる嘘の時刻を出してしまう。無いより悪い。
  // 開放だけは上限が違う判定を使う(isCheckInOpensMinutesBefore 参照)。
  if (isCheckInOpensMinutesBefore(value.onlineCheckInOpensMinutesBefore)) {
    booking.onlineCheckInOpensMinutesBefore =
      value.onlineCheckInOpensMinutesBefore
  }
  if (isDeadlineMinutesBefore(value.checkInClosesMinutesBefore)) {
    booking.checkInClosesMinutesBefore = value.checkInClosesMinutesBefore
  }
  if (isDeadlineMinutesBefore(value.bagDropClosesMinutesBefore)) {
    booking.bagDropClosesMinutesBefore = value.bagDropClosesMinutesBefore
  }

  if (typeof value.note === 'string') {
    booking.note = value.note
  }

  const unverified = parseUnverified(value.unverified)
  if (unverified !== undefined) booking.unverified = unverified

  const evidence = parseEvidence(value.evidence)
  if (evidence !== undefined) booking.evidence = evidence

  return booking
}

/** EmergencyContact: id/label/value が必須。note は文字列のときだけ採用する */
function parseEmergencyContact(raw: unknown): EmergencyContact | null {
  if (!isRecord(raw)) return null
  const { id, label, value, note } = raw
  if (typeof id !== 'string') return null
  if (typeof label !== 'string') return null
  if (typeof value !== 'string') return null

  const contact: EmergencyContact = { id, label, value }
  if (typeof note === 'string') contact.note = note
  return contact
}

/**
 * PlaceAlias: id が文字列、names がちょうど 2 つの文字列であることを要求する。
 * 3 つ以上や 1 つだけの組は、どの 2 地点を同じとみなすのかが決まらないので落とす。
 * 判定を黙らせる側のデータなので、壊れた要素を無理に活かすと
 * 意図しない指摘まで消えて「なぜ警告が出ないのか」が説明できなくなる。
 */
function parsePlaceAlias(raw: unknown): PlaceAlias | null {
  if (!isRecord(raw)) return null
  const { id, names } = raw
  if (typeof id !== 'string') return null
  if (!Array.isArray(names) || names.length !== 2) return null
  const [first, second] = names
  if (typeof first !== 'string' || typeof second !== 'string') return null
  return { id, names: [first, second] }
}

/**
 * TravelDoc の検証方針は parseBooking と同じで、必須(id/kind/title/status)が
 * 壊れていればその 1 件だけを落とし、任意フィールドは不正ならそのフィールドだけを
 * 落として手続き自体は残す。
 *
 * 日付(dueDate/validFrom/validUntil)は isValidISODate を通ったものだけ採用する。
 * 壊れた日付を残すと docs.ts の判定が「数えられないので警告」に倒れ続け、
 * 直しようのない警告が画面に居座ることになる。値ごと落としておけば、
 * 少なくとも「日付が入っていない手続き」として素直に扱える。
 */
export function parseTravelDoc(raw: unknown): TravelDoc | null {
  if (!isRecord(raw)) return null
  const value = raw

  const { id, kind, title, status } = value
  if (typeof id !== 'string') return null
  if (!isTravelDocKind(kind)) return null
  if (typeof title !== 'string') return null
  if (!isTravelDocStatus(status)) return null

  const doc: TravelDoc = { id, kind, title, status }

  if (typeof value.region === 'string') doc.region = value.region

  if (typeof value.dueDate === 'string' && isValidISODate(value.dueDate)) {
    doc.dueDate = value.dueDate
  }
  if (typeof value.validFrom === 'string' && isValidISODate(value.validFrom)) {
    doc.validFrom = value.validFrom
  }
  if (
    typeof value.validUntil === 'string' &&
    isValidISODate(value.validUntil)
  ) {
    doc.validUntil = value.validUntil
  }

  if (typeof value.referenceNumber === 'string') {
    doc.referenceNumber = value.referenceNumber
  }

  const price = parseMoney(value.price)
  if (price !== undefined) doc.price = price

  if (typeof value.url === 'string') doc.url = value.url
  if (typeof value.note === 'string') doc.note = value.note

  return doc
}

/**
 * CountryInfo の検証方針は parseTravelDoc と同じ。必須(id/name)が壊れていれば
 * その 1 件だけを落とし、任意フィールドは文字列でなければそのフィールドだけを
 * 落として国自体は残す(プラグ形状が壊れていても緊急通報番号は見せたい)。
 * 値の中身までは見ない。「230V 50Hz」も「230 ボルト」も利用者の書き方でよく、
 * 形式を決めて弾くと、書けたはずの情報が保存されないほうの損が大きい。
 *
 * name が空文字(空白だけを含む)のときは、必須が欠けているのと同じく 1 件ごと落とす。
 * name はこの国情報の唯一の識別子で、画面の見出しにも AI パッチの照合キー
 * (backfillPrompt.ts)にもなる。空だと何にも結び付けられない
 * 「名前の無い国」が一覧に並び、消すことしかできない行になる。
 */
export function parseCountryInfo(raw: unknown): CountryInfo | null {
  if (!isRecord(raw)) return null
  const value = raw

  const { id, name } = value
  if (typeof id !== 'string') return null
  if (typeof name !== 'string' || name.trim().length === 0) return null

  const info: CountryInfo = { id, name }

  if (typeof value.latinName === 'string') info.latinName = value.latinName
  if (typeof value.plugTypes === 'string') info.plugTypes = value.plugTypes
  if (typeof value.voltage === 'string') info.voltage = value.voltage
  if (typeof value.tipping === 'string') info.tipping = value.tipping
  if (typeof value.emergencyPolice === 'string') {
    info.emergencyPolice = value.emergencyPolice
  }
  if (typeof value.emergencyAmbulance === 'string') {
    info.emergencyAmbulance = value.emergencyAmbulance
  }
  if (typeof value.note === 'string') info.note = value.note

  return info
}

/**
 * Wish の検証方針は parseCountryInfo と同じ。必須(id/title)が壊れていれば
 * その 1 件だけを落とし、任意フィールドは文字列でなければそのフィールドだけを落とす。
 *
 * title が空文字(空白だけ)のときは 1 件ごと落とす。CountryInfo の name と同じ理由で、
 * これがその行の唯一の中身であり、空だと画面に「消すことしかできない空の行」が並ぶ。
 *
 * done は真偽値でなければ false に寄せる。壊れた値を「済んだこと」として復元すると、
 * まだやっていないことが済んだ扱いで下に沈み、しかも本人は気付けない。
 * 逆(済んだものが未完了に戻る)なら、チェックを 1 回入れ直せば済む。
 */
export function parseWish(raw: unknown): Wish | null {
  if (!isRecord(raw)) return null
  const value = raw

  const { id, title } = value
  if (typeof id !== 'string') return null
  if (typeof title !== 'string' || title.trim().length === 0) return null

  const wish: Wish = { id, title, done: value.done === true }

  if (typeof value.area === 'string') wish.area = value.area
  if (typeof value.note === 'string') wish.note = value.note
  if (typeof value.url === 'string') wish.url = value.url

  return wish
}

/**
 * 初期状態。3泊4日を既定の旅程長にする
 * (週末+1日ずらした程度の、もっとも当たり障りのない旅行日数)。
 */
export function createInitialState(today: string): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: '',
    startDate: today,
    endDate: addDays(today, 3),
    pinnedTz: null,
    bookings: [],
    emergencyContacts: [],
  }
}

/**
 * 外部由来 JSON(localStorage / ファイル読込 / 共有URL)を検証・正規化する。
 * トップレベルの整合性(バージョン・必須の日付)が壊れているものは復元を諦めて null。
 * bookings / emergencyContacts は要素単位で検証し、不正な要素だけを黙って落とす。
 */
export function parseTripNotesState(raw: unknown): TripNotesState | null {
  if (!isRecord(raw)) return null
  const data = raw
  if (data.schemaVersion !== 1) return null
  if (
    typeof data.startDate !== 'string' ||
    !isValidISODate(data.startDate) ||
    typeof data.endDate !== 'string' ||
    !isValidISODate(data.endDate)
  ) {
    return null
  }

  const tripTitle = typeof data.tripTitle === 'string' ? data.tripTitle : ''

  // pinnedTz は表示の好みでしかなく、壊れていても実害がない
  // (booking の tz と違い、間違った時刻を「正しそうに」見せることがないため)。
  // 不正なら「デバイスのタイムゾーンを使う」を意味する null に寄せる。
  const pinnedTz = isValidTz(data.pinnedTz) ? data.pinnedTz : null

  const bookings = Array.isArray(data.bookings)
    ? data.bookings.map(parseBooking).filter((b): b is Booking => b !== null)
    : []

  const emergencyContacts = Array.isArray(data.emergencyContacts)
    ? data.emergencyContacts
        .map(parseEmergencyContact)
        .filter((c): c is EmergencyContact => c !== null)
    : []

  // 空なら配列ではなくフィールドごと付けない。
  // 一度も使われていない逃げ道のために、JSON や共有URLに `"placeAliases":[]` が
  // 混ざり続けるのを避ける(types.ts で任意フィールドにしたのと同じ理由)。
  const placeAliases = Array.isArray(data.placeAliases)
    ? data.placeAliases
        .map(parsePlaceAlias)
        .filter((a): a is PlaceAlias => a !== null)
    : []

  // travelDocs も placeAliases と同じ扱い(空ならフィールドごと付けない)
  const travelDocs = Array.isArray(data.travelDocs)
    ? data.travelDocs
        .map(parseTravelDoc)
        .filter((d): d is TravelDoc => d !== null)
    : []

  // 国の基本情報も同じ扱い(空ならフィールドごと付けない)
  const countryInfos = Array.isArray(data.countryInfos)
    ? data.countryInfos
        .map(parseCountryInfo)
        .filter((c): c is CountryInfo => c !== null)
    : []

  // やりたいことも同じ扱い(空ならフィールドごと付けない)
  const wishes = Array.isArray(data.wishes)
    ? data.wishes.map(parseWish).filter((w): w is Wish => w !== null)
    : []

  return {
    schemaVersion: 1,
    tripTitle,
    startDate: data.startDate,
    endDate: data.endDate,
    pinnedTz,
    bookings,
    emergencyContacts,
    ...(placeAliases.length > 0 ? { placeAliases } : {}),
    ...(travelDocs.length > 0 ? { travelDocs } : {}),
    ...(countryInfos.length > 0 ? { countryInfos } : {}),
    ...(wishes.length > 0 ? { wishes } : {}),
  }
}

/**
 * 旧キー(旅程が 1 つしか無かった頃の保存)の読み取り。
 *
 * 現在の保存先は trips.ts の trip-notes:trips:v1 で、このキーは
 * そちらへの移行元としてしか使われない読み取り専用の入口になった。
 * 対になる書き込み関数を置いていないのは意図的で、新旧の両方に書くと
 * 静かに食い違ったときにどちらが正しいのか誰にも分からなくなるためである
 * (旧キーを消さない理由と合わせて trips.ts の冒頭コメントを参照)。
 */
export function loadFromStorage(): TripNotesState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return parseTripNotesState(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * ストレージの永続化をブラウザに要求する。
 *
 * 予約を入力し始めてから実際に旅行に出るまで数ヶ月空くのが普通で、
 * その間アプリを一度も開かない期間が長い。iOS Safari は 7 日間アクセスのない
 * サイトの localStorage を消すことがあり、旅行直前に全予約が消えるのは致命的。
 * 永続化を要求しておくことで、消される確率を下げられる。
 *
 * navigator.storage.persist() が無い/呼べない環境(API 非対応、navigator 自体が
 * 無い環境)もあるため、window.localStorage と同じ流儀で直接呼んで例外を
 * try/catch で握りつぶす。ユーザー操作の文脈でないと許可されない環境もあるが、
 * 拒否されても失敗として扱わず false を返すだけにする
 * (呼び出し側にとっては「ダメ元で呼ぶ」以上の意味を持たせない)。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
