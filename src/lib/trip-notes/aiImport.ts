/**
 * AI が返した JSON を Booking / CountryInfo に取り込む層。
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
 * - 貼り付け口は 1 つに保つ。穴埋めプロンプト(backfillPrompt.ts)は予約のパッチと
 *   国情報のパッチを 1 つの配列に混ぜて返させるが、それを種類ごとに別の入力欄で
 *   受けたりはせず、parseImportedJson が要素ごとに振り分ける。
 *   取り込みの経路が 2 本になると、汚れた JSON の直し方・マッチ条件・検証の規則が
 *   いずれ食い違い、「片方の口からは入るのに、もう片方からは入らない」という
 *   追いにくい壊れ方をする(backfillPrompt.ts の冒頭にある同趣旨の判断と揃えてある)。
 *   利用者にとっても、AI の出力をどこに貼るか迷う理由が無いほうがよい。
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
  parseCountryInfo,
} from './storage'
import type {
  Booking,
  BookingKind,
  BookingStatus,
  CountryInfo,
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
  /**
   * 同じ貼り付けに含まれていた国情報。予約と別の配列に分けて返す。
   *
   * 1 つの配列に混ぜて「型で見分けてくれ」とすると、呼び出し側(プレビュー・reducer)が
   * 判別規則を自前で持つことになり、この層と食い違ったときに直す場所が 2 つになる。
   * 振り分けはここで 1 度だけ行い、以降は種類の分かれた配列として扱う。
   */
  countryInfos: Array<CountryInfo>
  issues: Array<ImportIssue>
  /**
   * タイムゾーンを読み取れず補完した予約の id。
   *
   * issues にも同じ内容の注記は載るが、あちらは人間が読む文章なので
   * UI から機械的に「どの予約が危ういか」を引くには使えない。
   * レビュー画面で「一括承認するにしても、ここだけは見て」を出すために、
   * 予約と結び付いた形で別に持つ。
   */
  tzFallbackIds: Array<string>
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

/**
 * status / payment が未指定のときの既定値。「まだ何も決まっていない」に寄せる。
 * importMerge.ts もこの値を「AI が読み取れなかった印」として参照している
 * (取り込み側がこの値のときは、既存の予約が持つ status/payment を上書きしない
 * ための判定に使う)ので export している。
 */
export const DEFAULT_STATUS: BookingStatus = 'idea'
export const DEFAULT_PAYMENT: PaymentStatus = 'unpaid'

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

/**
 * 未知の値を issues のメッセージに埋め込むための表現に変える。
 *
 * 文字列・数値・真偽値はそのまま見せる(LLM が返す値のほとんどはこれで、
 * 利用者は元の出力と突き合わせて原因を追える)。
 * オブジェクトや配列を素朴に String() すると '[object Object]' に潰れて
 * 何が来たのか分からなくなるので、JSON 表現にして中身を残す。
 */
function describeValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'object') {
    try {
      // 循環参照では例外が飛ぶ。表示のためだけの処理なので握りつぶす
      return JSON.stringify(value)
    } catch {
      return '不明な値'
    }
  }
  // symbol や bigint など、JSON でも文字列でも素直に表せない値
  return '不明な値'
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

/**
 * 取り込みの対象(予約または国情報)の配列として扱える形か。
 * 数値の配列などを誤って拾わないための門番。
 * どちらの種類として扱うかはここでは決めず、要素ごとに後で振り分ける
 * (isCountryInfoRecord 参照)。
 */
function toRecords(value: unknown): Array<Record<string, unknown>> | null {
  // 単一オブジェクトで返ってくることは珍しくないので配列に包む
  if (isRecord(value)) return [value]
  if (!Array.isArray(value)) return null
  const records = value.filter(isRecord)
  if (records.length !== value.length) return null
  return records
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
  /** tz を読み取れず fallbackTz で補ったか。レビュー画面の優先度付けに使う */
  tzFallback: boolean
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
    return {
      stamp: null,
      notes: [`${field} の日時が読み取れませんでした`],
      tzFallback: false,
    }
  }

  if (typeof dateRaw !== 'string' || !isValidISODate(dateRaw.trim())) {
    return {
      stamp: null,
      notes: [`${field}.date が 'YYYY-MM-DD' 形式ではありません`],
      tzFallback: false,
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
  let tzFallback = false
  if (isValidTz(tzRaw)) {
    tz = tzRaw
  } else {
    tzFallback = true
    notes.push(
      tzRaw === null || tzRaw === undefined
        ? `${field}.tz が無いため ${fallbackTz} として解釈しました`
        : `${field}.tz が IANA タイムゾーン名ではないため ${fallbackTz} として解釈しました`,
    )
  }

  const stamp = tryMakeStamp(date, time, tz)
  if (stamp === null) {
    return {
      stamp: null,
      notes: [`${field} の日時を解釈できませんでした`],
      tzFallback,
    }
  }
  return { stamp, notes, tzFallback }
}

/** Place。name だけ必須。文字列 1 本で返してくることもあるので拾う */
function toPlace(raw: unknown): Place | undefined {
  if (typeof raw === 'string') {
    const name = raw.trim()
    return name.length > 0 ? { name } : undefined
  }
  if (!isRecord(raw)) return undefined
  const { name, localName, latinName, address } = raw
  if (typeof name !== 'string' || name.trim().length === 0) return undefined

  const place: Place = { name: name.trim() }
  if (typeof localName === 'string' && localName.trim().length > 0) {
    place.localName = localName.trim()
  }
  if (typeof latinName === 'string' && latinName.trim().length > 0) {
    place.latinName = latinName.trim()
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
    const value = toOptionalString(raw[key])
    if (value !== undefined) evidence[key] = value
  }
  return Object.keys(evidence).length > 0 ? evidence : undefined
}

/**
 * 出発からの相対分を持つ 3 項目(オンラインチェックインの開放 1・締切 2)。
 * 数値でも '60' のような文字列でも受ける。
 *
 * ここでは「数として読めるか」までしか見ない。範囲や整数かどうかの判定は
 * storage.ts の parseBooking(= isCheckInOpensMinutesBefore /
 * isDeadlineMinutesBefore)に委ねる。項目によって上限が違う(開放は 72 時間前まで、
 * 締切は 24 時間前まで)ことも、その差ごと向こうに閉じ込めてある。
 * 取り込みと保存で許す値が食い違うと「取り込めたのに次回起動で消える」という
 * 最悪の壊れ方をするので、規則の置き場所は 1 つに保つ。
 *
 * '60分前' のような単位付きの文字列は数字だけを抜き出したりせず捨てる。
 * '1時間30分前' のような書き方から数字だけを拾うと 1 になってしまい、
 * 締切が実際より 89 分遅い、いちばん危ない側にずれた値を通してしまう。
 */
function toMinutesBefore(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/**
 * ChatGPT がウェブ検索の出典を差し込む内部引用マーカー
 * (":contentReference[oaicite:1]{index=1}" 等)。
 *
 * これはブラウザ上でだけリンクとして描画される内部表現で、テキストとしてコピーすると
 * 記号列がそのまま漏れてくる。evidence は「原文のどこにその記述があったか」を人間が
 * 読むための引用なので、この漏れは根拠の説得力を落とすノイズでしかない。
 * 一方 evidence の値自体が原文の引用である以上、このマーカー以外を 1 文字でも
 * 変えてはならない。そのため "contentReference" / "oaicite" / "index" という
 * 固定語と "[]" "{}" の構造は必須にしつつ、前置きの ":" の有無や空白の入り方の
 * 揺れだけを許容する、狭いパターンに留める(過剰に緩めると原文の一部を誤って
 * 消しかねない)。前後の空白も込みで消すのは、この空白自体がマーカーを
 * 差し込むために ChatGPT が挿入したもので、原文の一部ではないため。
 */
const AI_CITATION_MARKER_RE =
  /[ \t\u3000]*:?contentReference\[[ \t\u3000]*oaicite[ \t\u3000]*:[ \t\u3000]*\d+[ \t\u3000]*\][ \t\u3000]*\{[ \t\u3000]*index[ \t\u3000]*=[ \t\u3000]*\d+[ \t\u3000]*\}[ \t\u3000]*/g

function stripAiCitationMarkers(text: string): string {
  return text.replace(AI_CITATION_MARKER_RE, '')
}

function toOptionalString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = stripAiCitationMarkers(raw).trim()
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
  tzFallbackIds: Set<string>,
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
    push(
      `kind '${describeValue(raw.kind)}' は未知の種別なので 'other' にしました`,
    )
  }

  const startResult = toStamp(raw.start, 'start', fallbackTz)
  for (const note of startResult.notes) push(note)
  if (startResult.stamp === null) {
    push('start が読み取れないため取り込めませんでした', true)
    return null
  }
  const start = startResult.stamp
  let tzFallback = startResult.tzFallback

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
    if (endResult.tzFallback) tzFallback = true
    end = endResult.stamp
  }

  let status: BookingStatus = DEFAULT_STATUS
  if (isBookingStatus(raw.status)) {
    status = raw.status
  } else if (raw.status !== null && raw.status !== undefined) {
    push(
      `status '${describeValue(raw.status)}' は未知の値なので '${DEFAULT_STATUS}' にしました`,
    )
  }

  let payment: PaymentStatus = DEFAULT_PAYMENT
  if (isPaymentStatus(raw.payment)) {
    payment = raw.payment
  } else if (raw.payment !== null && raw.payment !== undefined) {
    push(
      `payment '${describeValue(raw.payment)}' は未知の値なので '${DEFAULT_PAYMENT}' にしました`,
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
    // 出発からの相対分は時系列の順(開いてから閉まる)に並べてある
    onlineCheckInOpensMinutesBefore: toMinutesBefore(
      raw.onlineCheckInOpensMinutesBefore,
    ),
    checkInClosesMinutesBefore: toMinutesBefore(raw.checkInClosesMinutesBefore),
    bagDropClosesMinutesBefore: toMinutesBefore(raw.bagDropClosesMinutesBefore),
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

  // id は parseBooking を通ったあとの booking から取る(候補の id をそのまま
  // 使うと、parseBooking が採番し直した場合に取り違える)
  if (tzFallback) tzFallbackIds.add(booking.id)

  return booking
}

/** その欄が埋まっているか。AI は空欄を undefined ではなく null で返してくる */
function isFilled(value: unknown): boolean {
  return value !== undefined && value !== null
}

/**
 * その要素を国情報のパッチとみなすか。
 *
 * 判別の根拠は「国らしさ」ではなく **予約の必須項目が無いこと** に置く。
 * kind / start / title のどれも持たず、name が空でない文字列である要素だけを
 * 国情報として扱う。
 *
 * ■ なぜこの向きなのか
 *   予約は title と start が無ければそもそも取り込めない(convertBooking が落とす)。
 *   つまりその 2 つが無い時点で、その要素は予約ではありえないと言い切れる。
 *   逆に「name があるかどうか」だけで判定すると、AI が予約の見出しを title ではなく
 *   name で返してきたときに、予約が丸ごと国情報に化ける。化けた予約は日付も場所も
 *   失った「国」として設定タブに現れ、利用者は予約が消えたようにしか見えない。
 *   外したときに失うものが小さいほうへ倒す。
 *
 * ■ どちらとも付かない形は予約として扱う
 *   未知の形を予約側に流せば、convertBooking が理由と原文を issues に残して落とす。
 *   「読めないものは issues に出す」という既存の寛容さを、種類が増えたからといって
 *   変えない。
 */
function isCountryInfoRecord(raw: Record<string, unknown>): boolean {
  if (isFilled(raw.kind) || isFilled(raw.start) || isFilled(raw.title)) {
    return false
  }
  return typeof raw.name === 'string' && raw.name.trim().length > 0
}

/**
 * 中間形式 1 件を CountryInfo に変換する。変換できなければ null。
 *
 * id は LLM が返したものを信用せず必ず採番し直す(予約と同じ理由。既存の国情報と
 * 衝突する id を返されると、取り込みが上書きになってしまう)。突き合わせは
 * 国名で行うので(importMerge.ts の planCountryInfoImport)、id を作り直しても
 * 既存の国情報への合流は失われない。
 *
 * 値は前後の空白を落とし、空文字ならキーごと付けない。空文字のまま通すと、
 * マージ側で既存の値を空で潰しにいく形になる。
 * 最終的な妥当性の判定は storage.ts の parseCountryInfo に委ねる
 * (取り込みと保存で規則を分けない、というこのファイルの方針)。
 */
function convertCountryInfo(
  raw: Record<string, unknown>,
  index: number,
  issues: Array<ImportIssue>,
): CountryInfo | null {
  const candidate: Record<string, unknown> = {
    id: newId('ci'),
    name: toOptionalString(raw.name),
    latinName: toOptionalString(raw.latinName),
    plugTypes: toOptionalString(raw.plugTypes),
    voltage: toOptionalString(raw.voltage),
    tipping: toOptionalString(raw.tipping),
    emergencyPolice: toOptionalString(raw.emergencyPolice),
    emergencyAmbulance: toOptionalString(raw.emergencyAmbulance),
    note: toOptionalString(raw.note),
  }

  const info = parseCountryInfo(candidate)
  if (info === null) {
    issues.push({
      index,
      message: '国情報として妥当ではないため取り込めませんでした',
      raw: rawOf(raw),
    })
    return null
  }
  return info
}

/**
 * AI が返したテキストから予約と国情報を取り込む。
 *
 * @param text AI の出力をそのまま貼り付けたもの。フェンスや前後の散文があってよい
 * @param fallbackTz tz が読み取れなかったときに使うタイムゾーン(通常はデバイスのもの)
 */
export function parseImportedJson(
  text: string,
  fallbackTz: string,
): ImportResult {
  const issues: Array<ImportIssue> = []
  const tzFallbackIds = new Set<string>()
  // 呼び出し元が壊れた tz を渡してきても、取り込み全体が空振りしないようにする
  const safeTz = isValidTz(fallbackTz) ? fallbackTz : FALLBACK_TZ

  // BOM はどの段階でも邪魔にしかならないので最初に落とす
  const cleaned = text.replace(/^\ufeff/, '').trim()
  if (cleaned.length === 0) {
    issues.push({ index: null, message: '入力が空です' })
    return { bookings: [], countryInfos: [], issues, tzFallbackIds: [] }
  }

  let records: Array<Record<string, unknown>> | null = null
  let sawEmptyArray = false

  for (const candidate of collectJsonCandidates(cleaned)) {
    const parsed = tryParseJson(candidate)
    if (parsed === undefined) continue
    const found = toRecords(parsed)
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
      // 「予約が」と言わない。この口は国情報も受けるので、国だけを埋めさせた
      // つもりの利用者に「予約の話をされている」と思わせない文面にする
      issues.push({
        index: null,
        message: '取り込めるものが 1 件も含まれていませんでした(空の配列)',
      })
      return { bookings: [], countryInfos: [], issues, tzFallbackIds: [] }
    }
    issues.push({
      index: null,
      message:
        'JSON として読み取れませんでした。AI の出力を ```json フェンスごとすべて貼り付けてください',
      raw: truncate(cleaned),
    })
    return { bookings: [], countryInfos: [], issues, tzFallbackIds: [] }
  }

  const bookings: Array<Booking> = []
  const countryInfos: Array<CountryInfo> = []
  records.forEach((record, index) => {
    // 種類の振り分けはここ 1 箇所だけで行う(isCountryInfoRecord 参照)
    if (isCountryInfoRecord(record)) {
      const info = convertCountryInfo(record, index, issues)
      if (info !== null) countryInfos.push(info)
      return
    }
    const booking = convertBooking(record, index, safeTz, issues, tzFallbackIds)
    if (booking !== null) bookings.push(booking)
  })

  return { bookings, countryInfos, issues, tzFallbackIds: [...tzFallbackIds] }
}
