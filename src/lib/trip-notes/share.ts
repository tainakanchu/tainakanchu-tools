/**
 * 旅のしおりを URL 1本で共有・退避するための層。
 *
 * 設計意図:
 * - 共有URLは「同行者に渡す」ことと「未来の自分へのバックアップ」の両方を兼ねる。
 *   そのためサーバには一切保存しない。全状態を URL のフラグメント(#以降)に詰め込む。
 *   フラグメントはブラウザからサーバへ送信されない(HTTP リクエストに乗らない)ので、
 *   予約確認番号のような機微情報を含んでいても外部(サーバのアクセスログ等)に漏れない。
 * - JSON をそのまま詰めるとフィールド名(title, confirmationNumber, ...)が
 *   payload の大半を占めてしまう。予約は複数件あり同じキーが繰り返されるため、
 *   1〜2文字の短縮キーに変換してから圧縮する。
 * - 一方で kind/status/payment のような列挙値はあえて短縮しない(文字列のまま送る)。
 *   理由は2つ:
 *   (1) 同じ文字列が予約間で繰り返されるため deflate の辞書圧縮がよく効き、
 *       短縮によるサイズ削減効果はもともと薄い。
 *   (2) 数値インデックス(0, 1, 2...)に変換すると、将来 enum の並びを変えたり
 *       値を1つ挿入しただけで既存の共有URLが「静かに」別の予約種別を指すようになる。
 *       文字列のままなら取り違えは起きず、万一キー対応がずれても
 *       parseTripNotesState 側のバリデーションで弾ける。可読性より安全性を優先した。
 * - Stamp の allDay は false が大多数(時刻指定ありの予定のほうが多い)なので、
 *   false のときだけキーごと省略し、デコード側で false を補う。旅程全体では
 *   予約数だけ繰り返すフィールドなので、この省略だけで数十〜数百バイト単位で効いてくる。
 */

import { parseTripNotesState } from './storage'
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

/**
 * QRコードに載せられる実用上限(文字数)。
 * これはあくまで payload 部分(baseUrl を除いた `#d=...` の中身)の長さであり、
 * baseUrl の長さは含まない。呼び出し側はこの値を超えたら
 * 「URLが長すぎるのでファイル書き出しを使ってください」と案内すること。
 */
export const QR_SAFE_LENGTH = 1500

const BASE64_CHUNK_SIZE = 0x8000

// --- 短縮キー形式の型定義 ---
// JSON.parse 直後は何が入っているか分からないので、ここでの型は
// 「こう解釈して組み立てる」という宣言に過ぎない。値の妥当性検証は二重に書かず、
// 最終的に parseTripNotesState に委ねる。
// kind/status/payment などを BookingKind といった具体的な型で宣言しているのも
// 同じ意味で、「検証済み」ではなく「そう解釈する」という宣言でしかない。

interface ShortStamp {
  z: string
  /** true のときだけ存在する。省略されていたら false として扱う */
  a?: boolean
}

interface ShortPlace {
  n: string
  l?: string
  a?: string
  t?: number
  g?: number
}

interface ShortMoney {
  a: number
  c: string
}

interface ShortBooking {
  i: string
  k: BookingKind
  t: string
  s: ShortStamp
  e?: ShortStamp
  f?: ShortPlace
  o?: ShortPlace
  p?: ShortPlace
  a: BookingStatus
  y: PaymentStatus
  c?: string
  v?: string
  r?: ShortMoney
  x?: string
  n?: string
  q?: Array<FieldKey>
}

interface ShortContact {
  i: string
  l: string
  v: string
  n?: string
}

interface ShortState {
  v: 1
  t: string
  s: string
  e: string
  z?: string
  b: Array<ShortBooking>
  c: Array<ShortContact>
}

// --- 内部形式 → 短縮形式 ---

/** zdt はそのまま(Temporal.ZonedDateTime の文字列表現)。allDay は false なら省略する */
function toShortStamp(stamp: Stamp): ShortStamp {
  return {
    z: stamp.zdt,
    ...(stamp.allDay ? { a: true } : {}),
  }
}

function toShortPlace(place: Place): ShortPlace {
  return {
    n: place.name,
    ...(place.localName !== undefined ? { l: place.localName } : {}),
    ...(place.address !== undefined ? { a: place.address } : {}),
    ...(place.lat !== undefined ? { t: place.lat } : {}),
    ...(place.lng !== undefined ? { g: place.lng } : {}),
  }
}

function toShortMoney(money: Money): ShortMoney {
  return { a: money.amount, c: money.currency }
}

/** evidence は意図的に payload から除外する(サイズを食う上、同行者に渡す価値がない) */
function toShortBooking(booking: Booking): ShortBooking {
  return {
    i: booking.id,
    k: booking.kind,
    t: booking.title,
    s: toShortStamp(booking.start),
    ...(booking.end !== null ? { e: toShortStamp(booking.end) } : {}),
    ...(booking.from !== undefined ? { f: toShortPlace(booking.from) } : {}),
    ...(booking.to !== undefined ? { o: toShortPlace(booking.to) } : {}),
    ...(booking.place !== undefined ? { p: toShortPlace(booking.place) } : {}),
    a: booking.status,
    y: booking.payment,
    ...(booking.confirmationNumber !== undefined
      ? { c: booking.confirmationNumber }
      : {}),
    ...(booking.provider !== undefined ? { v: booking.provider } : {}),
    ...(booking.price !== undefined ? { r: toShortMoney(booking.price) } : {}),
    ...(booking.freeCancelUntil !== undefined
      ? { x: booking.freeCancelUntil }
      : {}),
    ...(booking.note !== undefined ? { n: booking.note } : {}),
    ...(booking.unverified !== undefined ? { q: booking.unverified } : {}),
  }
}

function toShortContact(contact: EmergencyContact): ShortContact {
  return {
    i: contact.id,
    l: contact.label,
    v: contact.value,
    ...(contact.note !== undefined ? { n: contact.note } : {}),
  }
}

/**
 * end(Stamp | null) や pinnedTz(string | null) のように、型上は必須だが
 * null を許容するフィールドも、undefined/null な任意フィールドと同じ扱いで省略する。
 * 「optional かどうか」で場合分けを増やすより、「値が無ければ省く」で統一したほうが
 * 変換コードがシンプルに保てる。デコード側で省略時のデフォルト(null)に戻す。
 */
function toShortState(state: TripNotesState): ShortState {
  return {
    v: state.schemaVersion,
    t: state.tripTitle,
    s: state.startDate,
    e: state.endDate,
    ...(state.pinnedTz !== null ? { z: state.pinnedTz } : {}),
    b: state.bookings.map(toShortBooking),
    c: state.emergencyContacts.map(toShortContact),
  }
}

// --- 短縮形式 → 内部形式 ---
// ここでの変換は「緩く」組み立てるだけで、フィールドの型や enum の値までは検証しない。
// 検証は呼び出し元で必ず parseTripNotesState に通すため、ここで二重にチェックしない。

function fromShortStamp(short: ShortStamp): Stamp {
  return { zdt: short.z, allDay: short.a ?? false }
}

function fromShortPlace(short: ShortPlace): Place {
  return {
    name: short.n,
    ...(short.l !== undefined ? { localName: short.l } : {}),
    ...(short.a !== undefined ? { address: short.a } : {}),
    ...(short.t !== undefined ? { lat: short.t } : {}),
    ...(short.g !== undefined ? { lng: short.g } : {}),
  }
}

function fromShortMoney(short: ShortMoney): Money {
  return { amount: short.a, currency: short.c }
}

function fromShortBooking(short: ShortBooking): Booking {
  return {
    id: short.i,
    kind: short.k,
    title: short.t,
    start: fromShortStamp(short.s),
    end: short.e !== undefined ? fromShortStamp(short.e) : null,
    ...(short.f !== undefined ? { from: fromShortPlace(short.f) } : {}),
    ...(short.o !== undefined ? { to: fromShortPlace(short.o) } : {}),
    ...(short.p !== undefined ? { place: fromShortPlace(short.p) } : {}),
    status: short.a,
    payment: short.y,
    ...(short.c !== undefined ? { confirmationNumber: short.c } : {}),
    ...(short.v !== undefined ? { provider: short.v } : {}),
    ...(short.r !== undefined ? { price: fromShortMoney(short.r) } : {}),
    ...(short.x !== undefined ? { freeCancelUntil: short.x } : {}),
    ...(short.n !== undefined ? { note: short.n } : {}),
    ...(short.q !== undefined ? { unverified: short.q } : {}),
  }
}

function fromShortContact(short: ShortContact): EmergencyContact {
  return {
    id: short.i,
    label: short.l,
    value: short.v,
    ...(short.n !== undefined ? { note: short.n } : {}),
  }
}

function fromShortState(short: ShortState): TripNotesState {
  return {
    schemaVersion: short.v,
    tripTitle: short.t,
    startDate: short.s,
    endDate: short.e,
    pinnedTz: short.z !== undefined ? short.z : null,
    bookings: short.b.map(fromShortBooking),
    emergencyContacts: short.c.map(fromShortContact),
  }
}

// --- 圧縮の可否判定 ---

/**
 * CompressionStream/DecompressionStream の有無をここ1箇所で判定する。
 * 分岐をあちこちに書くと、テストからのフォールバック経路の検証がしづらくなるため
 * 判定関数として切り出す。エンコードとデコードは対で使うものなので両方の存在を見る。
 */
function canUseCompressionStream(): boolean {
  return (
    typeof CompressionStream !== 'undefined' &&
    typeof DecompressionStream !== 'undefined'
  )
}

/**
 * ArrayBuffer 由来であることを型で明示した Uint8Array。
 * CompressionStream が受け取る BufferSource は SharedArrayBuffer 由来を許さないため、
 * 既定の Uint8Array<ArrayBufferLike> のままでは渡せない。
 */
type Bytes = Uint8Array<ArrayBuffer>

// --- ストリーム ↔ バイト列 ---
// Blob を経由すると環境によっては余計なコピーやエンコーディング推測が入るため、
// ReadableStream を直接組み立てて reader.read() で読み切る素朴な実装にする。

/**
 * 要素型を BufferSource にしているのは CompressionStream に合わせるため。
 * lib.dom の CompressionStream.writable は WritableStream<BufferSource> なので、
 * ReadableStream<Bytes> のままだと pipeThrough で型が合わない。
 */
function bytesToStream(bytes: Bytes): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

async function readAllBytes(stream: ReadableStream<Bytes>): Promise<Bytes> {
  const reader = stream.getReader()
  const chunks: Array<Bytes> = []
  let totalLength = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    totalLength += value.length
  }
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

async function compressBytes(bytes: Bytes): Promise<Bytes> {
  const stream = bytesToStream(bytes).pipeThrough(
    new CompressionStream('deflate-raw'),
  )
  return readAllBytes(stream)
}

async function decompressBytes(bytes: Bytes): Promise<Bytes> {
  const stream = bytesToStream(bytes).pipeThrough(
    new DecompressionStream('deflate-raw'),
  )
  return readAllBytes(stream)
}

// --- バイト列 ↔ base64url ---

/**
 * String.fromCharCode(...bytes) を巨大な配列にそのまま使うと、
 * 引数展開で呼び出しスタックを溢れさせることがある(数万バイト程度から発生しうる)。
 * 0x8000 バイトずつに区切って文字列に変換してから連結することで回避する。
 */
function bytesToBase64Url(bytes: Bytes): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(base64url: string): Bytes {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padding = (4 - (base64.length % 4)) % 4
  const binary = atob(base64 + '='.repeat(padding))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// --- payload の組み立て ---

/**
 * 先頭1文字は圧縮の有無を表すマーカー。
 * '1' = deflate-raw で圧縮済み、'0' = 無圧縮。
 * 未知の先頭文字は decode 側で null 扱いにする(将来フォーマットを増やす余地を残す)。
 */
async function buildPayload(state: TripNotesState): Promise<string> {
  const json = JSON.stringify(toShortState(state))
  const bytes = new TextEncoder().encode(json)

  if (canUseCompressionStream()) {
    const compressed = await compressBytes(bytes)
    return `1${bytesToBase64Url(compressed)}`
  }
  return `0${bytesToBase64Url(bytes)}`
}

function stripHash(url: string): string {
  const hashIndex = url.indexOf('#')
  return hashIndex === -1 ? url : url.slice(0, hashIndex)
}

/**
 * 共有URLを組み立てる。baseUrl に既にハッシュが付いていても、
 * ここで生成する `#d=...` に置き換わる(二重に付かない)。
 */
export async function encodeShareUrl(
  state: TripNotesState,
  baseUrl: string,
): Promise<string> {
  const payload = await buildPayload(state)
  return `${stripHash(baseUrl)}#d=${payload}`
}

/**
 * 共有URLのフラグメントから状態を復元する。
 * 先頭の '#' はあってもなくてもよい。壊れた入力(不正な base64、解凍失敗、
 * JSON パース失敗、parseTripNotesState によるスキーマ不一致)はすべて
 * 例外を投げずに null を返す。ブラウザの戻る/共有元の手打ち編集など
 * 不正な入力が現実的に起こりうる経路なので、呼び出し側に例外処理を強制しない。
 */
export async function decodeShareState(
  hash: string,
): Promise<TripNotesState | null> {
  try {
    const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash
    const payload = new URLSearchParams(withoutHash).get('d')
    if (payload === null || payload.length === 0) return null

    const marker = payload[0]
    const body = payload.slice(1)
    const bytes = base64UrlToBytes(body)

    let jsonBytes: Bytes
    if (marker === '1') {
      jsonBytes = await decompressBytes(bytes)
    } else if (marker === '0') {
      jsonBytes = bytes
    } else {
      return null
    }

    const json = new TextDecoder().decode(jsonBytes)
    // ShortState として受けるが、URL の中身を信用しているわけではない。
    // 型は組み立て方を決めるためだけのもので、実際の値の妥当性は直後の
    // parseTripNotesState が検証する(壊れていれば null になる)。
    // JSON.parse 自体が失敗した場合も、この関数全体の catch で null に落ちる。
    const short: ShortState = JSON.parse(json)
    return parseTripNotesState(fromShortState(short))
  } catch {
    return null
  }
}

/** 共有payload(baseUrlを含まない `d=` の中身)の文字数を返す */
export async function estimateShareSize(
  state: TripNotesState,
): Promise<number> {
  return (await buildPayload(state)).length
}
