/**
 * AI が返した JSON を Booking に取り込む層。
 *
 * 設計判断:
 * - LLM は素直に JSON だけを返さない。「はい、抽出しました!」という前置き、
 *   ```json フェンス、末尾カンマ、日本語入力由来の全角スペースやスマートクォート、
 *   配列で返すよう言ったのに単一オブジェクト……といった汚れは日常的に起きる。
 *   ここで弾いてしまうと、利用者は AI との往復をもう一度やる羽目になる。
 *   だから寛容にパースする。
 * - ただし「寛容」は「黙って直す」ではない。フォールバックした箇所は必ず
 *   issues に残し、UI で人間が追えるようにする。
 * - 部分成功を許す。3 件中 1 件が壊れていても残り 2 件は取り込む。
 *   全滅させると、利用者は正しく抽出できていた 2 件まで手入力する羽目になる。
 * - オフセットの計算は LLM にさせない。date / time / tz を受け取り、
 *   tryMakeStamp(= Temporal)経由で Stamp を組み立てる。
 *   夏時間の切り替わりを跨ぐ日付でも、これなら +02:00 / +01:00 を間違えない。
 * - 最終的な妥当性の判定は storage.ts の parseBooking に委ねる。
 *   保存データの検証と取り込みの検証で規則が食い違うと、
 *   「取り込めたのに次回起動で消える予約」という最悪の壊れ方をする。
 * - 取り込んだ予約は値の入った全フィールドを unverified にする。
 *   AI の抽出は人間が目視で確認するまで確定とみなさない。
 */

import {
  FALLBACK_TZ,
  isValidISODate,
  isValidTime,
  isValidTz,
  stampTz,
  tryMakeStamp,
} from './datetime'
import { newId } from './id'
import {
  BOOKING_KINDS,
  BOOKING_STATUSES,
  FIELD_KEYS,
  PAYMENT_STATUSES,
  parseBooking,
} from './storage'
import type {
  Booking,
  BookingKind,
  BookingStatus,
  FieldKey,
  Money,
  PaymentStatus,
  Place,
  Stamp,
} from './types'

export interface ImportIssue {
  /** 配列中の位置。全体の失敗なら null */
  index: number | null
  message: string
  /** 問題のあった生データ(UI で見せて原因を追えるように) */
  raw?: string
}

export interface ImportResult {
  bookings: Array<Booking>
  issues: Array<ImportIssue>
}

/** issues に載せる生データの上限。UI に貼るためのものなので長すぎても読めない */
const MAX_RAW_LENGTH = 400

const BOOKING_KIND_SET = new Set<string>(BOOKING_KINDS)
const BOOKING_STATUS_SET = new Set<string>(BOOKING_STATUSES)
const PAYMENT_STATUS_SET = new Set<string>(PAYMENT_STATUSES)

function isBookingKind(value: unknown): value is BookingKind {
  return typeof value === 'string' && BOOKING_KIND_SET.has(value)
}

function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === 'string' && BOOKING_STATUS_SET.has(value)
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string' && PAYMENT_STATUS_SET.has(value)
}

/** status / payment が未指定のときの既定値。「まだ何も決まっていない」に寄せる */
const DEFAULT_STATUS: BookingStatus = 'idea'
const DEFAULT_PAYMENT: PaymentStatus = 'unpaid'

function truncate(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_RAW_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_RAW_LENGTH)}…`
}

function rawOf(value: unknown): string {
  try {
    // 循環参照や BigInt を含む値では例外が飛ぶ。issues 用の表示なので握りつぶす
    return truncate(JSON.stringify(value))
  } catch {
    return truncate(String(value))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// --- 寛容なテキスト → JSON 変換 ---

/** ```json ... ``` のフェンス。言語指定は任意で、閉じていることを前提とする */
const FENCE_RE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/g
/** 閉じていないフェンスも含めて、フェンスの開始マーカーだけを消すための表現 */
const FENCE_MARKER_RE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?/g

/**
 * 末尾カンマ([1,2,] や {"a":1,})を除去する。
 * 文字列リテラルの中身は触らない。evidence の引用文に ",]" のような並びが
 * 現れることは十分あり、それを削ると原文が変わってしまう。
 */
function stripTrailingCommas(text: string): string {
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      result += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      result += ch
      continue
    }
    if (ch === ',') {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j += 1
      // 次の非空白文字が閉じ括弧なら、このカンマは末尾カンマ
      if (text[j] === '}' || text[j] === ']') continue
    }
    result += ch
  }
  return result
}

/** 全角スペースと各種ノーブレークスペース。JSON の区切りとしては不正 */
const EXOTIC_SPACE_RE = /[\u3000\u00a0\u2007\u202f]/g
/** スマートクォート類。区切り記号として使われていると JSON.parse が通らない */
const SMART_QUOTE_RE = /[\u201c\u201d\u201e\u201f\u00ab\u00bb]/g

/**
 * JSON として不正になりうる文字を素朴に置換する。
 *
 * これは最終手段としてのみ使う。スマートクォートは evidence の引用文の中にも
 * 正当に現れうるため、無条件に置換すると正しい JSON を壊しかねない。
 * 素の JSON.parse が失敗したあとにだけ試すことで、その事故を避ける。
 */
function normalizeExoticChars(text: string): string {
  return text.replace(EXOTIC_SPACE_RE, ' ').replace(SMART_QUOTE_RE, '"')
}

/**
 * 修復の度合いを上げながら JSON.parse を試す。
 * 失敗したら undefined。JSON.parse が undefined を返すことはないので、
 * これを「読めなかった」の印として使って差し支えない。
 */
function tryParseJson(text: string): unknown {
  const attempts = [
    text,
    stripTrailingCommas(text),
    normalizeExoticChars(stripTrailingCommas(text)),
  ]
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as unknown
    } catch {
      // 次の修復段階へ
    }
  }
  return undefined
}

/**
 * 最初の open から、対応する close までを切り出す。
 * 文字列リテラル内の括弧は数えない。JSON のあとに散文が続いていても、
 * 散文側に括弧が含まれていても正しい範囲で切れる。
 */
function balancedSpan(
  text: string,
  open: string,
  close: string,
): string | null {
  const start = text.indexOf(open)
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** 最初の open から最後の close まで。文字列内に括弧があって balancedSpan が失敗したとき用 */
function outerSpan(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open)
  const end = text.lastIndexOf(close)
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}

/** 散文やフェンスに埋もれた JSON らしき部分を、確からしい順に列挙する */
function collectJsonCandidates(text: string): Array<string> {
  const sources: Array<string> = []
  for (const match of text.matchAll(FENCE_RE)) {
    sources.push(match[1])
  }
  // フェンスが閉じていない(出力が途中で切れた)場合に備えて、
  // マーカーだけを消したものと素のテキストも候補に入れる
  sources.push(text.replace(FENCE_MARKER_RE, ''))
  sources.push(text)

  const candidates: Array<string> = []
  for (const source of sources) {
    const trimmed = source.trim()
    if (trimmed.length === 0) continue
    const spans = [
      balancedSpan(trimmed, '[', ']'),
      balancedSpan(trimmed, '{', '}'),
      outerSpan(trimmed, '[', ']'),
      outerSpan(trimmed, '{', '}'),
      trimmed,
    ]
    for (const span of spans) {
      if (span !== null && !candidates.includes(span)) candidates.push(span)
    }
  }
  return candidates
}

/** 予約の配列として扱える形か。数値の配列などを誤って拾わないための門番 */
function toBookingRecords(value: unknown): Array<unknown> | null {
  // 単一オブジェクトで返ってくることは珍しくないので配列に包む
  if (isRecord(value)) return [value]
  if (!Array.isArray(value)) return null
  if (!value.every(isRecord)) return null
  return value
}

// --- 中間形式 → Booking ---

/** 'HH:mm' に正規化する。'9:05' や '14:20:00' のような揺れを吸収する */
function normalizeTime(raw: string): string | null {
  const trimmed = raw.trim()
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed)
  if (match === null) return null
  const time = `${match[1].padStart(2, '0')}:${match[2]}`
  return isValidTime(time) ? time : null
}

interface StampConversion {
  stamp: Stamp | null
  /** 呼び出し元が index を付けて issues に積むためのメッセージ */
  notes: Array<string>
}

/**
 * 中間形式の {date, time, tz} を Stamp に変換する。
 *
 * ここが「LLM にオフセットを計算させない」方針の要。壁時計時刻と IANA 名だけを
 * 受け取り、UTC オフセットの決定は Temporal に任せる。
 * 文字列 'YYYY-MM-DD' や 'YYYY-MM-DDTHH:mm' で返してくる場合も拾う。
 */
function toStamp(
  raw: unknown,
  field: 'start' | 'end',
  fallbackTz: string,
): StampConversion {
  const notes: Array<string> = []

  let dateRaw: unknown
  let timeRaw: unknown
  let tzRaw: unknown

  if (typeof raw === 'string') {
    // 'YYYY-MM-DDTHH:mm' 形式で 1 本の文字列にまとめてくることがある
    const parts = raw.trim().split(/[T ]/)
    dateRaw = parts[0]
    timeRaw = parts.length > 1 ? parts[1] : null
    tzRaw = null
  } else if (isRecord(raw)) {
    dateRaw = raw.date
    timeRaw = raw.time
    tzRaw = raw.tz
  } else {
    return { stamp: null, notes: [`${field} の日時が読み取れませんでした`] }
  }

  if (typeof dateRaw !== 'string' || !isValidISODate(dateRaw.trim())) {
    return {
      stamp: null,
      notes: [`${field}.date が 'YYYY-MM-DD' 形式ではありません`],
    }
  }
  const date = dateRaw.trim()

  let time: string | null = null
  if (typeof timeRaw === 'string' && timeRaw.trim().length > 0) {
    time = normalizeTime(timeRaw)
    if (time === null) {
      notes.push(
        `${field}.time が 'HH:mm' 形式ではないため終日として取り込みました`,
      )
    }
  }

  let tz = fallbackTz
  if (isValidTz(tzRaw)) {
    tz = tzRaw
  } else {
    notes.push(
      tzRaw === null || tzRaw === undefined
        ? `${field}.tz が無いため ${fallbackTz} として解釈しました`
        : `${field}.tz が IANA タイムゾーン名ではないため ${fallbackTz} として解釈しました`,
    )
  }

  const stamp = tryMakeStamp(date, time, tz)
  if (stamp === null) {
    return { stamp: null, notes: [`${field} の日時を解釈できませんでした`] }
  }
  return { stamp, notes }
}

/** Place。name だけ必須。文字列 1 本で返してくることもあるので拾う */
function toPlace(raw: unknown): Place | undefined {
  if (typeof raw === 'string') {
    const name = raw.trim()
    return name.length > 0 ? { name } : undefined
  }
  if (!isRecord(raw)) return undefined
  const { name, localName, address } = raw
  if (typeof name !== 'string' || name.trim().length === 0) return undefined

  const place: Place = { name: name.trim() }
  if (typeof localName === 'string' && localName.trim().length > 0) {
    place.localName = localName.trim()
  }
  if (typeof address === 'string' && address.trim().length > 0) {
    place.address = address.trim()
  }
  return place
}

/** 金額。'1,234.50' や '¥45,000' のような文字列で返してくることがある */
function toMoney(raw: unknown): Money | undefined {
  if (!isRecord(raw)) return undefined
  const { amount, currency } = raw
  if (typeof currency !== 'string' || currency.trim().length === 0) {
    return undefined
  }

  let value: number | undefined
  if (typeof amount === 'number' && Number.isFinite(amount)) {
    value = amount
  } else if (typeof amount === 'string') {
    const cleaned = amount.replace(/[^0-9.-]/g, '')
    const parsed = Number(cleaned)
    if (cleaned.length > 0 && Number.isFinite(parsed)) value = parsed
  }
  if (value === undefined) return undefined
  return { amount: value, currency: currency.trim() }
}

function toEvidence(
  raw: unknown,
): Partial<Record<FieldKey, string>> | undefined {
  if (!isRecord(raw)) return undefined
  const evidence: Partial<Record<FieldKey, string>> = {}
  for (const key of FIELD_KEYS) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      evidence[key] = value.trim()
    }
  }
  return Object.keys(evidence).length > 0 ? evidence : undefined
}

function toOptionalString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** そのフィールドに実際に値が入ったか。unverified の対象を決めるのに使う */
function hasFieldValue(booking: Booking, key: FieldKey): boolean {
  if (key === 'end') return booking.end !== null
  return booking[key] !== undefined
}

/**
 * 中間形式 1 件を Booking に変換する。変換できなければ null。
 *
 * kind / status / payment の未知の値は、予約ごと捨てずに既定値へ寄せて
 * issues に残す。'hotel' と書かれただけで宿泊の予約を丸ごと落とすのは、
 * 人間が確認する前提の取り込み処理としては厳しすぎる。
 * 一方 title と start は、無いと一覧に並べても識別できず日付軸にも置けないので、
 * 予約ごと落として issues で原文を返す(利用者はそれを見て手入力できる)。
 */
function convertBooking(
  raw: unknown,
  index: number,
  fallbackTz: string,
  issues: Array<ImportIssue>,
): Booking | null {
  const push = (message: string, withRaw = false): void => {
    issues.push({
      index,
      message,
      ...(withRaw ? { raw: rawOf(raw) } : {}),
    })
  }

  if (!isRecord(raw)) {
    push('オブジェクトではないため取り込めませんでした', true)
    return null
  }

  const title = toOptionalString(raw.title)
  if (title === undefined) {
    push('title が無いため取り込めませんでした', true)
    return null
  }

  let kind: BookingKind = 'other'
  if (isBookingKind(raw.kind)) {
    kind = raw.kind
  } else if (raw.kind !== null && raw.kind !== undefined) {
    push(`kind '${String(raw.kind)}' は未知の種別なので 'other' にしました`)
  }

  const startResult = toStamp(raw.start, 'start', fallbackTz)
  for (const note of startResult.notes) push(note)
  if (startResult.stamp === null) {
    push('start が読み取れないため取り込めませんでした', true)
    return null
  }
  const start = startResult.stamp

  // end のタイムゾーンが不明なら、デバイスのものより start のほうが近い。
  // 宿のチェックアウトは必ず現地時刻だし、移動でも到着地が不明なら
  // 出発地のタイムゾーンのほうがまだ実際に近い。
  let end: Stamp | null = null
  if (raw.end !== null && raw.end !== undefined) {
    const endResult = toStamp(raw.end, 'end', stampTz(start))
    for (const note of endResult.notes) push(note)
    if (endResult.stamp === null) {
      push('end を解釈できなかったため終了時刻なしとして取り込みました')
    }
    end = endResult.stamp
  }

  let status: BookingStatus = DEFAULT_STATUS
  if (isBookingStatus(raw.status)) {
    status = raw.status
  } else if (raw.status !== null && raw.status !== undefined) {
    push(
      `status '${String(raw.status)}' は未知の値なので '${DEFAULT_STATUS}' にしました`,
    )
  }

  let payment: PaymentStatus = DEFAULT_PAYMENT
  if (isPaymentStatus(raw.payment)) {
    payment = raw.payment
  } else if (raw.payment !== null && raw.payment !== undefined) {
    push(
      `payment '${String(raw.payment)}' は未知の値なので '${DEFAULT_PAYMENT}' にしました`,
    )
  }

  // id は LLM が返したものを信用せず必ず採番し直す。
  // 既存の予約と衝突する id を返されると、取り込みが上書きになってしまう。
  const candidate: Record<string, unknown> = {
    id: newId('booking'),
    kind,
    title,
    start,
    end,
    status,
    payment,
    from: toPlace(raw.from),
    to: toPlace(raw.to),
    place: toPlace(raw.place),
    confirmationNumber: toOptionalString(raw.confirmationNumber),
    provider: toOptionalString(raw.provider),
    price: toMoney(raw.price),
    freeCancelUntil: toOptionalString(raw.freeCancelUntil),
    note: toOptionalString(raw.note),
    evidence: toEvidence(raw.evidence),
  }

  // 最終判定は保存時と同じ規則に委ねる。ここを通ったものだけが取り込まれる
  const booking = parseBooking(candidate)
  if (booking === null) {
    push('予約として妥当ではないため取り込めませんでした', true)
    return null
  }

  // AI が埋めた値は人間が目視で確認するまで未確認のまま残す
  const unverified = FIELD_KEYS.filter((key) => hasFieldValue(booking, key))
  if (unverified.length > 0) booking.unverified = unverified

  return booking
}

/**
 * AI が返したテキストから予約を取り込む。
 *
 * @param text AI の出力をそのまま貼り付けたもの。フェンスや前後の散文があってよい
 * @param fallbackTz tz が読み取れなかったときに使うタイムゾーン(通常はデバイスのもの)
 */
export function parseImportedJson(
  text: string,
  fallbackTz: string,
): ImportResult {
  const issues: Array<ImportIssue> = []
  // 呼び出し元が壊れた tz を渡してきても、取り込み全体が空振りしないようにする
  const safeTz = isValidTz(fallbackTz) ? fallbackTz : FALLBACK_TZ

  // BOM はどの段階でも邪魔にしかならないので最初に落とす
  const cleaned = text.replace(/^\ufeff/, '').trim()
  if (cleaned.length === 0) {
    issues.push({ index: null, message: '入力が空です' })
    return { bookings: [], issues }
  }

  let records: Array<unknown> | null = null
  let sawEmptyArray = false

  for (const candidate of collectJsonCandidates(cleaned)) {
    const parsed = tryParseJson(candidate)
    if (parsed === undefined) continue
    const found = toBookingRecords(parsed)
    if (found === null) continue
    if (found.length === 0) {
      // 散文中の '[]' を拾っただけの可能性もあるので、他の候補を先に試す
      sawEmptyArray = true
      continue
    }
    records = found
    break
  }

  if (records === null) {
    if (sawEmptyArray) {
      issues.push({
        index: null,
        message: '予約が 1 件も含まれていませんでした(空の配列)',
      })
      return { bookings: [], issues }
    }
    issues.push({
      index: null,
      message:
        'JSON として読み取れませんでした。AI の出力を ```json フェンスごとすべて貼り付けてください',
      raw: truncate(cleaned),
    })
    return { bookings: [], issues }
  }

  const bookings: Array<Booking> = []
  records.forEach((record, index) => {
    const booking = convertBooking(record, index, safeTz, issues)
    if (booking !== null) bookings.push(booking)
  })

  return { bookings, issues }
}
