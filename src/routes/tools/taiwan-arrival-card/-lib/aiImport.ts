/**
 * AI が返した JSON を旅程と旅行者に取り込む層。
 *
 * 設計判断:
 * - LLM は素直に JSON だけを返さない。「はい、抽出しました!」という前置き、
 *   \`\`\`json フェンス、末尾カンマ、日本語入力由来の全角スペースやスマートクォート、
 *   ChatGPT の内部引用マーカー……といった汚れは日常的に起きる。ここで弾いて
 *   しまうと、利用者は AI との往復をもう一度やる羽目になる。だから寛容にパースする。
 *   テキストを JSON に均す部分のヘルパ(フェンス除去・末尾カンマ除去・
 *   スマートクォート正規化・散文中からの切り出し・引用マーカー除去)は
 *   src/lib/trip-notes/aiImport.ts から写した。あちらで実際の LLM 出力に
 *   揉まれて出来上がった処理なので、同じ問題をここで作り直さない。
 * - ただし「寛容」は「黙って直す」ではない。フォールバックした箇所は必ず
 *   issues に残し、UI で人間が追えるようにする。
 * - 部分成功を許す。旅行者 3 人中 1 人が壊れていても残り 2 人は取り込む。
 *   便名が読めなくても日付とホテルは入れる。全滅させると、利用者は
 *   正しく抽出できていた項目まで手入力する羽目になる。
 * - **既存の入力を上書きしない。** 旅行者の欄は空のときだけ埋める。
 *   このツールの入力はパスポートを見ながら人が入れたものであり、
 *   AI が予約書類から読んだ値より確かである可能性が高い。旅程側は
 *   人が入れた覚えのない欄(便名など)が主なので抽出値を優先するが、
 *   何がどう変わるかは取り込み前に必ずプレビューで見せる。
 * - zod は使わない(依存に無い)。検証は素朴な typeof と正規表現で書く。
 */

import { isValidIsoDate } from './dates'
import { resolveFlightCode } from './options'
import { createEmptyTraveler, isPristineTraveler } from './storage'
import { MAX_TRAVELERS } from './types'
import { stripXmlIllegalChars } from './xlsx'
import type { ArrivalCardState, Traveler, TripInfo } from './types'

export interface ImportIssue {
  /** 旅行者の配列中の位置。全体に関わる問題なら null */
  index: number | null
  message: string
  /** 問題のあった生データ(UI で見せて原因を追えるように) */
  raw?: string
}

export interface ExtractedTraveler {
  englishName: string | null
  dateOfBirth: string | null
  passportNumber: string | null
  passportExpiry: string | null
  sex: 'Male' | 'Female' | null
}

export interface ExtractedArrivalInfo {
  dateOfEntry: string | null
  entryAirlineCode: string | null
  entryFlightNumber: string | null
  exitDate: string | null
  exitAirlineCode: string | null
  exitFlightNumber: string | null
  hotelName: string | null
  hotelAddress: string | null
  travelers: Array<ExtractedTraveler> | null
}

export interface ArrivalParseResult {
  extracted: ExtractedArrivalInfo
  issues: Array<ImportIssue>
}

/** 何も読み取れなかったときの形。すべて null */
export function emptyExtracted(): ExtractedArrivalInfo {
  return {
    dateOfEntry: null,
    entryAirlineCode: null,
    entryFlightNumber: null,
    exitDate: null,
    exitAirlineCode: null,
    exitFlightNumber: null,
    hotelName: null,
    hotelAddress: null,
    travelers: null,
  }
}

/** issues に載せる生データの上限。UI に貼るためのものなので長すぎても読めない */
const MAX_RAW_LENGTH = 400

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

// ---------------------------------------------------------------------------
// 寛容なテキスト → JSON 変換
// 以下 collectJsonCandidates までは src/lib/trip-notes/aiImport.ts からの写し。
// ---------------------------------------------------------------------------

/** ```json ... ``` のフェンス。言語指定は任意で、閉じていることを前提とする */
const FENCE_RE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/g
/** 閉じていないフェンスも含めて、フェンスの開始マーカーだけを消すための表現 */
const FENCE_MARKER_RE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?/g

/**
 * 末尾カンマ([1,2,] や {"a":1,})を除去する。
 * 文字列リテラルの中身は触らない。氏名や住所に ",]" のような並びが
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
const EXOTIC_SPACE_RE = /[　   ]/g
/** スマートクォート類。区切り記号として使われていると JSON.parse が通らない */
const SMART_QUOTE_RE = /[“”„‟«»]/g

/**
 * JSON として不正になりうる文字を素朴に置換する。
 *
 * これは最終手段としてのみ使う。スマートクォートはホテル名の中にも
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

/**
 * 散文やフェンスに埋もれた JSON らしき部分を、確からしい順に列挙する。
 *
 * こちらが期待するのはオブジェクト 1 個なので、括弧の対応で切り出すのは
 * `{}` だけにする。`[]` を先に探すと、オブジェクトの中にある travelers の
 * 配列だけを掴んでしまう。
 * ソース全体をいちばん先に試すのは、AI が配列で返してきた場合に
 * それを配列として受け取り、注記を出せるようにするため(先にオブジェクトを
 * 切り出してしまうと、配列の 1 件目だけが黙って使われる)。
 */
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
      trimmed,
      balancedSpan(trimmed, '{', '}'),
      outerSpan(trimmed, '{', '}'),
    ]
    for (const span of spans) {
      if (span !== null && !candidates.includes(span)) candidates.push(span)
    }
  }
  return candidates
}

/**
 * ChatGPT がウェブ検索の出典を差し込む内部引用マーカー
 * (":contentReference[oaicite:1]{index=1}" 等)。
 * src/lib/trip-notes/aiImport.ts からの写し。
 *
 * これはブラウザ上でだけリンクとして描画される内部表現で、テキストとしてコピーすると
 * 記号列がそのまま漏れてくる。氏名やホテル名の末尾に付いたまま取り込むと、
 * そのまま入国カードに載ってしまう。
 */
const AI_CITATION_MARKER_RE =
  /[ \t　]*:?contentReference\[[ \t　]*oaicite[ \t　]*:[ \t　]*\d+[ \t　]*\][ \t　]*\{[ \t　]*index[ \t　]*=[ \t　]*\d+[ \t　]*\}[ \t　]*/g

function stripAiCitationMarkers(text: string): string {
  return text.replace(AI_CITATION_MARKER_RE, '')
}

/**
 * 文字列として意味のある値だけを拾う。空文字と 'null' 文字列は無いものとして扱う。
 *
 * XML が持てない制御文字もここで落とす。AI が PDF から読んだ住所には
 * 垂直タブや改ページが紛れ込むことがあり、そのまま取り込むと
 * **書き出した xlsx が誰にも開けなくなる**(xlsx.ts の stripXmlIllegalChars 参照)。
 * ただし黙って直さない。1 文字でも落としたら issues に残して、
 * 値が原文どおりでないことを人が確かめられるようにする。
 */
function toOptionalString(
  raw: unknown,
  field?: string,
  issues?: Array<ImportIssue>,
  index: number | null = null,
): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = stripAiCitationMarkers(raw).trim()
  if (trimmed.length === 0) return null
  // AI がスキーマの null を文字列として書いてくることがある
  if (trimmed.toLowerCase() === 'null') return null

  const cleaned = stripXmlIllegalChars(trimmed)
  if (cleaned !== trimmed && field !== undefined && issues !== undefined) {
    issues.push({
      index,
      message: `${field} に Excel が扱えない制御文字が含まれていたため取り除きました`,
      raw: truncate(cleaned),
    })
  }
  return cleaned.length > 0 ? cleaned : null
}

// ---------------------------------------------------------------------------
// 中間形式 → ExtractedArrivalInfo
// ---------------------------------------------------------------------------

/**
 * 'YYYY-MM-DD' として読めて、かつ**実在する日付**だけを通す。
 *
 * '2026/03/15' や 'March 15, 2026' のような形は直さずに落とす。
 * 直そうとすると 03/04 が 3 月 4 日なのか 4 月 3 日なのかを推測することになり、
 * 入国日が 1 か月ずれた入国カードができあがる。
 *
 * 形だけでなく実在するかまで見るのは、'2026-02-30' のような値を通すと
 * どの層にも引っかからないまま「日付が空の Excel」になるため
 * (理由の全体は -lib/dates.ts の冒頭)。判定は isValidIsoDate に一本化してある。
 */
function toIsoDate(
  raw: unknown,
  field: string,
  issues: Array<ImportIssue>,
  index: number | null = null,
): string | null {
  const text = toOptionalString(raw, field, issues, index)
  if (text === null) return null
  if (!isValidIsoDate(text)) {
    issues.push({
      index,
      message: `${field} が 'YYYY-MM-DD' 形式の実在する日付ではないため取り込みませんでした`,
      raw: truncate(text),
    })
    return null
  }
  return text
}

/** IATA の 2 レターコードらしさ。英数字 2 文字(例 'BR', '7C') */
const AIRLINE_CODE_RE = /^[A-Z0-9]{2}$/

function toAirlineCode(
  raw: unknown,
  field: string,
  issues: Array<ImportIssue>,
): string | null {
  const text = toOptionalString(raw, field, issues)
  if (text === null) return null
  const upper = text.toUpperCase()
  if (!AIRLINE_CODE_RE.test(upper)) {
    issues.push({
      index: null,
      message: `${field} が IATA の 2 レターコードではないため取り込みませんでした`,
      raw: truncate(text),
    })
    return null
  }
  return upper
}

/**
 * 便番号の数字部分だけを取り出す。
 *
 * 'BR190' のように航空会社コードごと返してくることがあるので、末尾の数字列を拾う。
 * 数字が 1 つも無ければ落とす。テンプレートの便番号欄は数字を入れる欄で、
 * 'BR190' をそのまま入れると航空会社コードが二重になる。
 */
function toFlightNumber(
  raw: unknown,
  field: string,
  issues: Array<ImportIssue>,
): string | null {
  const text = toOptionalString(raw, field, issues)
  if (text === null) return null
  const match = /(\d{1,5})\s*$/.exec(text)
  if (match === null) {
    issues.push({
      index: null,
      message: `${field} から便番号の数字を読み取れませんでした`,
      raw: truncate(text),
    })
    return null
  }
  if (match[1] !== text) {
    issues.push({
      index: null,
      message: `${field} '${text}' から数字の部分 '${match[1]}' を取り出しました`,
    })
  }
  return match[1]
}

function toSex(
  raw: unknown,
  index: number,
  issues: Array<ImportIssue>,
): 'Male' | 'Female' | null {
  const text = toOptionalString(raw, 'sex', issues, index)
  if (text === null) return null
  const lower = text.toLowerCase()
  if (lower === 'male' || lower === 'm') return 'Male'
  if (lower === 'female' || lower === 'f') return 'Female'
  issues.push({
    index,
    message: `sex '${text}' は Male / Female のどちらとも読めないため取り込みませんでした`,
  })
  return null
}

/**
 * 旅行者 1 件の変換。オブジェクトでなければ null を返してその 1 件だけ落とす。
 * 氏名も含めて全項目が null なら、取り込んでも何も起きないので落とす。
 */
function toExtractedTraveler(
  raw: unknown,
  index: number,
  issues: Array<ImportIssue>,
): ExtractedTraveler | null {
  if (!isRecord(raw)) {
    issues.push({
      index,
      message: 'オブジェクトではないため取り込めませんでした',
      raw: rawOf(raw),
    })
    return null
  }
  const traveler: ExtractedTraveler = {
    englishName: toOptionalString(
      raw.englishName,
      'englishName',
      issues,
      index,
    ),
    dateOfBirth: toIsoDate(raw.dateOfBirth, 'dateOfBirth', issues, index),
    passportNumber: toOptionalString(
      raw.passportNumber,
      'passportNumber',
      issues,
      index,
    ),
    passportExpiry: toIsoDate(
      raw.passportExpiry,
      'passportExpiry',
      issues,
      index,
    ),
    sex: toSex(raw.sex, index, issues),
  }
  const hasAnything = Object.values(traveler).some((value) => value !== null)
  if (!hasAnything) {
    issues.push({
      index,
      message: '読み取れた項目が 1 つもないため取り込めませんでした',
      raw: rawOf(raw),
    })
    return null
  }
  return traveler
}

/**
 * AI が返したテキストから抽出結果を読み取る。
 *
 * 全体として JSON にならなければ、空の抽出結果と「読めなかった」issue を返す。
 * 例外は投げない。取り込みボタンを押しただけで画面が落ちるのは最悪の体験で、
 * しかも貼り付けたテキストごと失われる。
 */
export function parseArrivalJson(text: string): ArrivalParseResult {
  const issues: Array<ImportIssue> = []

  // BOM はどの段階でも邪魔にしかならないので最初に落とす
  const cleaned = text.replace(/^﻿/, '').trim()
  if (cleaned.length === 0) {
    issues.push({ index: null, message: '入力が空です' })
    return { extracted: emptyExtracted(), issues }
  }

  let record: Record<string, unknown> | null = null
  for (const candidate of collectJsonCandidates(cleaned)) {
    const parsed = tryParseJson(candidate)
    if (isRecord(parsed)) {
      record = parsed
      break
    }
    // オブジェクト 1 個で返すよう指示していても配列で返してくることがある。
    // 捨てずに最初の要素を使うが、2 件以上あれば残りを見ていないことを必ず伝える
    // (往復の便を 2 件の配列で返されたときに、復路が黙って消えるのを防ぐ)
    if (Array.isArray(parsed) && parsed.length > 0 && isRecord(parsed[0])) {
      record = parsed[0]
      issues.push({
        index: null,
        message:
          parsed.length === 1
            ? 'JSON が配列で返っていたため、その中身を取り込みました'
            : `JSON が ${parsed.length} 件の配列で返っていたため、最初の 1 件だけを取り込みました`,
      })
      break
    }
  }

  if (record === null) {
    issues.push({
      index: null,
      message:
        'JSON として読み取れませんでした。AI の出力を ```json フェンスごとすべて貼り付けてください',
      raw: truncate(cleaned),
    })
    return { extracted: emptyExtracted(), issues }
  }

  let travelers: Array<ExtractedTraveler> | null = null
  if (Array.isArray(record.travelers)) {
    const converted = record.travelers
      .map((item, index) => toExtractedTraveler(item, index, issues))
      .filter((item): item is ExtractedTraveler => item !== null)
    travelers = converted.length > 0 ? converted : null
  } else if (record.travelers !== null && record.travelers !== undefined) {
    issues.push({
      index: null,
      message: 'travelers が配列ではないため取り込みませんでした',
      raw: rawOf(record.travelers),
    })
  }

  const extracted: ExtractedArrivalInfo = {
    dateOfEntry: toIsoDate(record.dateOfEntry, 'dateOfEntry', issues),
    entryAirlineCode: toAirlineCode(
      record.entryAirlineCode,
      'entryAirlineCode',
      issues,
    ),
    entryFlightNumber: toFlightNumber(
      record.entryFlightNumber,
      'entryFlightNumber',
      issues,
    ),
    exitDate: toIsoDate(record.exitDate, 'exitDate', issues),
    exitAirlineCode: toAirlineCode(
      record.exitAirlineCode,
      'exitAirlineCode',
      issues,
    ),
    exitFlightNumber: toFlightNumber(
      record.exitFlightNumber,
      'exitFlightNumber',
      issues,
    ),
    hotelName: toOptionalString(record.hotelName, 'hotelName', issues),
    hotelAddress: toOptionalString(record.hotelAddress, 'hotelAddress', issues),
    travelers,
  }

  return { extracted, issues }
}

// ---------------------------------------------------------------------------
// 取り込みの適用
// ---------------------------------------------------------------------------

/** プレビューの 1 行。「何がどう変わるか」を人が読む形で持つ */
export interface FieldChange {
  label: string
  /** 変更前の値。空欄だったなら空文字 */
  before: string
  after: string
}

export interface TravelerChange {
  /** 見出しに出す名前。名前が無ければ「旅行者N」 */
  name: string
  /** 既存の旅行者に足すのではなく、新しく増える人か */
  isNew: boolean
  fields: Array<FieldChange>
}

export interface ImportPlan {
  /** 取り込み後の状態。そのまま setState すればよい */
  next: ArrivalCardState
  tripChanges: Array<FieldChange>
  travelerChanges: Array<TravelerChange>
  /** 適用の過程で出た問題(航空会社コードが未知だった等) */
  issues: Array<ImportIssue>
}

/** 突き合わせ用に氏名を均す。全角・半角の空白と大文字小文字の違いを無視する */
function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/[\s　]+/g, ' ')
    .toUpperCase()
}

/**
 * 抽出結果を現在の状態に当てはめた結果を組み立てる(まだ適用はしない)。
 *
 * 旅程は「抽出できた欄だけ」上書きする。null の欄は触らない。
 * 旅行者は氏名で既存とつき合わせ、既存がいれば**空欄だけ**を埋める。
 * 上書きしないのは、既存の値がパスポートを見ながら人が入れたものである
 * 可能性が高いため(このファイル冒頭の方針)。
 */
export function planArrivalImport(
  state: ArrivalCardState,
  extracted: ExtractedArrivalInfo,
): ImportPlan {
  const issues: Array<ImportIssue> = []
  const tripChanges: Array<FieldChange> = []
  const trip: TripInfo = { ...state.trip }

  const setTrip = <K extends keyof TripInfo>(
    key: K,
    label: string,
    value: TripInfo[K],
  ): void => {
    if (trip[key] === value) return
    // TripInfo の値はすべて文字列なので、そのままプレビューの行に載せられる
    tripChanges.push({ label, before: trip[key], after: value })
    trip[key] = value
  }

  if (extracted.dateOfEntry !== null) {
    setTrip('dateOfEntry', '入国日', extracted.dateOfEntry)
  }
  if (extracted.exitDate !== null) {
    setTrip('exitDate', '出国日', extracted.exitDate)
  }

  // 航空会社は 2 レターコードからリスト値に解決する。解決できなければ
  // 便番号だけを入れて、会社は未設定のまま人に選んでもらう。
  // 近い名前で代用すると、別の航空会社の便として登録された入国カードができる
  const applyAirline = (
    code: string | null,
    key: 'entryFlightCode' | 'exitFlightCode',
    label: string,
  ): void => {
    if (code === null) return
    const resolved = resolveFlightCode(code)
    if (resolved === null) {
      issues.push({
        index: null,
        message: `航空会社コード '${code}' は公式の選択肢に見つかりませんでした。${label}は手で選んでください`,
      })
      return
    }
    setTrip(key, label, resolved)
  }
  applyAirline(
    extracted.entryAirlineCode,
    'entryFlightCode',
    '入国便の航空会社',
  )
  applyAirline(extracted.exitAirlineCode, 'exitFlightCode', '出国便の航空会社')

  if (extracted.entryFlightNumber !== null) {
    setTrip('entryFlightNumber', '入国便の便番号', extracted.entryFlightNumber)
  }
  if (extracted.exitFlightNumber !== null) {
    setTrip('exitFlightNumber', '出国便の便番号', extracted.exitFlightNumber)
  }

  // 宿泊先の欄はテンプレート上 1 つしかなく(AH 列)、そこに何を書くかは
  // 滞在先の種別(AG 列)が決める。いま選ばれている種別に合う値を優先し、
  // 無ければもう一方で代用する(ホテル名しか読めなかったのに住所を選んで
  // いるからといって、空欄のままにするほうが親切とは言えない)
  const preferred =
    trip.accommodation === 'Residential Address'
      ? (extracted.hotelAddress ?? extracted.hotelName)
      : (extracted.hotelName ?? extracted.hotelAddress)
  if (trip.accommodation !== 'Transfer' && preferred !== null) {
    setTrip('addressOrHotel', '宿泊先', preferred)
  }

  // 住所とホテル名の両方が読めていて、欄には片方しか入らない場合は、
  // もう片方を捨てたことを伝える。あとから自分で貼り直せるように値ごと残す
  if (
    trip.accommodation !== 'Transfer' &&
    extracted.hotelName !== null &&
    extracted.hotelAddress !== null
  ) {
    const dropped =
      trip.accommodation === 'Residential Address'
        ? extracted.hotelName
        : extracted.hotelAddress
    if (dropped !== preferred) {
      issues.push({
        index: null,
        message: `宿泊先の欄は 1 つしかないため、もう一方は取り込みませんでした: ${dropped}`,
      })
    }
  }

  const travelers = state.travelers.map((traveler) => ({ ...traveler }))
  const travelerChanges: Array<TravelerChange> = []

  for (const [index, incoming] of (extracted.travelers ?? []).entries()) {
    const name = incoming.englishName
    const matched =
      name === null
        ? undefined
        : travelers.find(
            (traveler) =>
              traveler.englishName.length > 0 &&
              normalizeName(traveler.englishName) === normalizeName(name),
          )

    /*
      氏名で一致する人がいなければ、次に「まだ何も入力されていない行」を探す。
      画面は最初から空の 1 行を出しているので、そこを飛ばして append すると
      1 行目に空行が残る。空行といっても国籍などの既定値は入っているので、
      Excel には**氏名もパスポート番号も無いのに国籍だけ入った行**が
      書き出され、TWAC 側で弾かれる。16 名の枠も空行に食われる。
      「増やす前に、空いている席から埋める」ほうが利用者の期待にも合う。
    */
    const vacant =
      matched === undefined
        ? travelers.find((traveler) => isPristineTraveler(traveler))
        : undefined
    const existing = matched ?? vacant

    const target = existing ?? createEmptyTraveler()
    const isNew = existing === undefined
    if (isNew && travelers.length >= MAX_TRAVELERS) {
      issues.push({
        index,
        message: `旅行者は最大 ${MAX_TRAVELERS} 名までのため、これ以上は追加できませんでした`,
        raw: name ?? undefined,
      })
      continue
    }

    const fields: Array<FieldChange> = []
    /** 空欄のときだけ埋める。既存の入力は上書きしない */
    const fill = <
      K extends
        | 'englishName'
        | 'chineseName'
        | 'passportNumber'
        | 'passportExpiry'
        | 'sex'
        | 'dateOfBirth',
    >(
      key: K,
      label: string,
      value: Traveler[K] | null,
    ): void => {
      if (value === null || value === '') return
      if (target[key].length > 0) return
      fields.push({ label, before: '', after: value })
      target[key] = value
    }

    fill('englishName', '氏名', incoming.englishName)
    fill('dateOfBirth', '生年月日', incoming.dateOfBirth)
    fill('passportNumber', 'パスポート番号', incoming.passportNumber)
    fill('passportExpiry', 'パスポート有効期限', incoming.passportExpiry)
    fill('sex', '性別', incoming.sex)

    if (isNew) travelers.push(target)
    // 既存の人で埋まる欄が 1 つも無いなら、プレビューに出しても
    // 「何も起きません」という行が並ぶだけなので出さない
    if (isNew || fields.length > 0) {
      travelerChanges.push({
        name:
          target.englishName.length > 0
            ? target.englishName
            : `旅行者${travelers.indexOf(target) + 1}`,
        // 空いていた行を埋めた場合も、利用者から見れば新しい人が現れる。
        // 行が増えたかどうか(isNew)ではなく、既存の誰かに足したのかどうかで出し分ける
        isNew: matched === undefined,
        fields,
      })
    }
  }

  // pastTrips のように取り込みが関知しない欄まで作り直さないよう、
  // 元の state を広げてから差し替える。ここで欄を並べ直すと、
  // 状態に欄が増えるたびに取り込みが黙ってそれを捨てる形になる
  return {
    next: { ...state, trip, travelers },
    tripChanges,
    travelerChanges,
    issues,
  }
}
