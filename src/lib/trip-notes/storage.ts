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
  EmergencyContact,
  FieldKey,
  Money,
  PaymentStatus,
  Place,
  Stamp,
  TripNotesState,
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
  'note',
]

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

const FIELD_KEY_SET = new Set<string>(FIELD_KEYS)
const BOOKING_KIND_SET = new Set<string>(BOOKING_KINDS)
const BOOKING_STATUS_SET = new Set<string>(BOOKING_STATUSES)
const PAYMENT_STATUS_SET = new Set<string>(PAYMENT_STATUSES)

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
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const { zdt, allDay } = record
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
  if (typeof raw !== 'object' || raw === null) return undefined
  const value = raw as Record<string, unknown>
  const { name, localName, address, lat, lng } = value
  if (typeof name !== 'string') return undefined

  const place: Place = { name }
  if (typeof localName === 'string') place.localName = localName
  if (typeof address === 'string') place.address = address
  if (typeof lat === 'number' && Number.isFinite(lat)) place.lat = lat
  if (typeof lng === 'number' && Number.isFinite(lng)) place.lng = lng
  return place
}

/** Money は amount が有限数、currency が文字列であることを要求する */
function parseMoney(raw: unknown): Money | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const value = raw as Record<string, unknown>
  const { amount, currency } = value
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
  if (typeof raw !== 'object' || raw === null) return undefined
  const value = raw as Record<string, unknown>
  const evidence: Partial<Record<FieldKey, string>> = {}
  for (const [key, v] of Object.entries(value)) {
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
 *   freeCancelUntil/note/unverified/evidence)は不正でもそのフィールドだけを
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
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>

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
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const { id, label, value, note } = record
  if (typeof id !== 'string') return null
  if (typeof label !== 'string') return null
  if (typeof value !== 'string') return null

  const contact: EmergencyContact = { id, label, value }
  if (typeof note === 'string') contact.note = note
  return contact
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
  if (typeof raw !== 'object' || raw === null) return null
  const data = raw as Record<string, unknown>
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

  return {
    schemaVersion: 1,
    tripTitle,
    startDate: data.startDate,
    endDate: data.endDate,
    pinnedTz,
    bookings,
    emergencyContacts,
  }
}

export function loadFromStorage(): TripNotesState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return parseTripNotesState(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveToStorage(state: TripNotesState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 容量超過・プライベートモード・window が無い環境でも編集自体は継続できるようにする
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
