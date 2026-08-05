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
 *
 * ## payload のフォーマット
 *
 * 先頭 1 文字がフォーマットのマーカー。
 *
 *   '0' = 無圧縮 + base64url (短縮キー v1)
 *   '1' = 短縮キー v1 + deflate-raw + base64url
 *   '2' = 短縮キー v2 + deflate-raw + base64url  ← 既定
 *   '3' = 短縮キー v2 + deflate-raw + CJK-16384  ← 面白い版(opt-in)
 *
 * v2 は v1 に対して次の 3 つを足したもの。実測で 10% 前後小さくなる。
 *   - 予約・連絡先の id を落とす(復元側で newId() を振り直す)
 *   - タイムゾーン名を辞書の添字に置き換える(辞書に無ければ生文字列)
 *   - zdt(40文字前後の文字列)を「分単位 epoch + タイムゾーン」に分解する
 *
 * その後に足したフィールド(placeAliases / travelDocs / countryInfos /
 * 予約の締切 2 種とオンラインチェックインの開放時刻)は v2 にだけ載せる。
 * v1 の形式は発行済みURLを読むための固定された形なので、書き足さない(ShortState 参照)。
 *
 * **'0' と '1' のデコード経路は消してはいけない。** 共有URLはサーバに保存して
 * いないため、一度発行したURLを回収する手段がない。古い形式のURLが読めなくなると
 * 利用者の旅程が失われる。エンコード側だけを新しい形式に進める。
 *
 * 未知のマーカーでは例外を投げず null を返す。古いビルドが新しい形式のURLを
 * 受け取っても「壊れたURL」として安全に扱われる。この性質も維持すること。
 */

import { newId } from './id'
import { bytesToCjk, cjkToBytes } from './shareCjk'
import { decodeShareTz, encodeShareTz } from './shareTimezones'
import { parseTripNotesState } from './storage'
import { tryParseStamp } from './datetime'
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
  Stamp,
  TravelDoc,
  TravelDocKind,
  TravelDocStatus,
  TripNotesState,
} from './types'

/**
 * QRコードに載せられる実用上限(base64url での文字数)。
 * これはあくまで payload 部分(baseUrl を除いた `#d=...` の中身)の長さであり、
 * baseUrl の長さは含まない。
 *
 * 表示用の目安として残しているが、QR を出すかどうかの判定には使わない
 * (CJK-16384 形式では String.length と QR 容量がまったく相関しないため)。
 * 判定は QR_SAFE_BYTES を使うこと。
 */
export const QR_SAFE_LENGTH = 1500

/**
 * QRコードに載せられる実用上限(圧縮後のバイト数)。
 * base64url は 3 バイトを 4 文字に膨らませるので、
 * 従来の 1500 文字はおよそ 1125 バイトに相当する。
 *
 * 文字数ではなくバイト数を基準にするのは、CJK-16384 形式だと
 * 1 文字が 14bit を運ぶうえ、URL に載るときは 1 文字 3 バイトに
 * パーセントエンコードされるため、文字数から容量を推し量れないから。
 */
export const QR_SAFE_BYTES = 1125

const BASE64_CHUNK_SIZE = 0x8000

/** 1 分のミリ秒。zdt を分単位 epoch に畳むのに使う */
const MS_PER_MINUTE = 60_000

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

/**
 * 場所。v1 / v2 で共通の形なので、キーを足すと両方の形式に同時に載る。
 *
 * 'r' がラテン文字表記(latinName)。n/l/a/t/g が埋まっているので、
 * roman(ラテン文字)の頭文字を取った。他の任意キーと同じく
 * 「値が無ければキーごと省く」ので、この欄を使っていない旅程の
 * 共有URLは 1 バイトも増えない。
 * 逆にこのキーを持たない payload(= この欄を足す前に発行されたURL)は
 * 「ラテン文字表記を入力していない場所」として読める。
 */
interface ShortPlace {
  n: string
  l?: string
  r?: string
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

/**
 * v1 の状態。過去に発行されたURLを読むための形なので、新しいフィールドは足さない。
 *
 * そのため placeAliases(「同じ場所として扱う」の登録)と travelDocs(手続き)、
 * countryInfos(国の基本情報)、および予約の締切 2 種(搭乗手続き・受託手荷物)と
 * オンラインチェックインの開放時刻は v1 では落ちる。
 * v1 でエンコードする経路は CompressionStream が使えない環境だけで
 * 今も生きている(buildPayload 参照)ため、そこで共有すると受け取り側では
 * 黙らせたはずの指摘が復活し、手続きと国の一覧は空になり、
 * 締切と開放時刻は入っていない状態になる。
 * 落ちるのは旅程そのものではない(予約は全部載っている)うえ、
 * 締切が落ちても「マイルストーンが 1 つ出ない」だけで、ずれた締切を
 * 見せることにはならない(安全な側に落ちる)。
 * 現実にその経路を通るブラウザはほぼ無いので、マーカーを増やしてまで直さない。
 */
interface ShortState {
  v: 1
  t: string
  s: string
  e: string
  z?: string
  b: Array<ShortBooking>
  c: Array<ShortContact>
}

// --- 内部形式 → 短縮形式 (v1) ---

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
    ...(place.latinName !== undefined ? { r: place.latinName } : {}),
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

// --- 短縮形式 → 内部形式 (v1) ---
// ここでの変換は「緩く」組み立てるだけで、フィールドの型や enum の値までは検証しない。
// 検証は呼び出し元で必ず parseTripNotesState に通すため、ここで二重にチェックしない。

function fromShortStamp(short: ShortStamp): Stamp {
  return { zdt: short.z, allDay: short.a ?? false }
}

function fromShortPlace(short: ShortPlace): Place {
  return {
    name: short.n,
    ...(short.l !== undefined ? { localName: short.l } : {}),
    ...(short.r !== undefined ? { latinName: short.r } : {}),
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

// --- 短縮キー v2 ---
//
// v1 との違いは 3 点だけで、キーの意味は共通のものをそのまま引き継ぐ。
//
// (1) 予約・連絡先の id を載せない。
//     newId('bk') が作る id は `bk-mfk3j2x1-1` のような 14 文字前後で、
//     30 件あると 420 文字を占める。TripNotesState の中に id の相互参照は無く
//     (NightSlot / TransportGap / ItineraryIssue などは保存されない導出値)、
//     id は「同じ端末の同じセッションで重複しない」ためだけの値なので、
//     共有時に捨てて復元側で振り直しても意味が変わらない。
// (2) タイムゾーン名を辞書の添字に置き換える(shareTimezones.ts)。
// (3) zdt を「分単位 epoch(m) + タイムゾーン(z)」に分解する。

/**
 * v2 の Stamp。
 * 通常は { m, z } の組で持つが、分に揃わない時刻(秒やミリ秒を持つ zdt)は
 * 分単位 epoch に畳むと情報が落ちるので、生の zdt 文字列(r)にフォールバックする。
 */
interface ShortStampV2 {
  /** 分単位の epoch */
  m?: number
  /** タイムゾーン。辞書の添字、または辞書に無い IANA 名 */
  z?: number | string
  /** フォールバック。ZonedDateTime の文字列表現をそのまま持つ */
  r?: string
  /** true のときだけ存在する。省略されていたら false として扱う */
  a?: boolean
}

/**
 * v2 の予約。
 *
 * 締切の 2 つ(h / b)と開放時刻(w)は v1 のキーに対応が無い、v2 で足したキー。
 * 'c' が確認番号で埋まっているので、check-in の 'h'、bag drop の 'b' を割り当てた。
 * 'w' はオンラインチェックインの窓(window)が開く、の w。
 * 意味の近い文字はすべて別の意味で埋まっていて取れない
 * (c = 確認番号、h = 搭乗手続きの締切、o = 到着地、b = 手荷物の締切)。
 * どれも大多数の予約(宿泊・列車・アクティビティ)では入っていない値なので、
 * 他の任意キーと同じく「値が無ければキーごと省く」。この欄を使っていない旅程の
 * 共有URLは 1 バイトも増えない。
 * 逆にこれらのキーを持たない payload(= その欄を足す前に発行されたURL)は
 * 「締切や開放時刻を入力していない予約」として読める。
 */
interface ShortBookingV2 {
  k: BookingKind
  t: string
  s: ShortStampV2
  e?: ShortStampV2
  f?: ShortPlace
  o?: ShortPlace
  p?: ShortPlace
  a: BookingStatus
  y: PaymentStatus
  c?: string
  v?: string
  r?: ShortMoney
  x?: string
  /** オンラインチェックインの開放(出発の何分前か) */
  w?: number
  /** 搭乗手続きの締切(出発の何分前か) */
  h?: number
  /** 受託手荷物の預け締切(出発の何分前か) */
  b?: number
  n?: string
  q?: Array<FieldKey>
}

interface ShortContactV2 {
  l: string
  v: string
  n?: string
}

/**
 * 手続き(TravelDoc)。id は v2 の方針どおり載せない。
 * キーは ShortBookingV2 と意味が重なるものをそろえてある
 * (k = 種別、t = 題名、a = 状況、c = 参照番号、r = 金額、x = 期限、n = メモ)。
 * 同じ意味に別の文字を割り当てると、片方を直したときにもう片方を直し忘れる。
 */
interface ShortTravelDocV2 {
  k: TravelDocKind
  t: string
  g?: string
  a: TravelDocStatus
  x?: string
  f?: string
  u?: string
  c?: string
  r?: ShortMoney
  l?: string
  n?: string
}

/**
 * 国・地域の基本情報(CountryInfo)。id は v2 の方針どおり載せない。
 * キーは既存の短縮型と意味が重なるものをそろえてある
 * (t = 題名にあたる名前、r = ラテン文字表記、n = メモ)。
 * 同じ意味に別の文字を割り当てると、片方を直したときにもう片方を直し忘れる。
 *
 * 残りはその欄の頭文字から取った(p = plug、v = voltage、e = emergency)。
 * 2 つだけ頭文字が使えず別の字を当てている:
 * - チップは tip の 't' が名前で埋まっているので、日本語の呼び名から 'c'。
 * - 救急は ambulance の 'a' が他の短縮型で状況・住所・終日フラグに割り当て済みで、
 *   同じ字が型ごとに違う意味になるのを避けたいので medical の 'm'。
 */
interface ShortCountryInfoV2 {
  /** name */
  t: string
  /** latinName */
  r?: string
  /** plugTypes */
  p?: string
  /** voltage */
  v?: string
  /** tipping */
  c?: string
  /** emergencyPolice */
  e?: string
  /** emergencyAmbulance */
  m?: string
  /** note */
  n?: string
}

interface ShortStateV2 {
  v: 1
  t: string
  s: string
  e: string
  z?: number | string
  b: Array<ShortBookingV2>
  c: Array<ShortContactV2>
  /**
   * placeAliases。名前の組だけを載せ、id は v2 の方針どおり落とす
   * (復元側で newId() を振り直す)。
   * 大多数の旅程では 1 組も無いので、空なら丸ごと省く。
   */
  p?: Array<[string, string]>
  /**
   * travelDocs。placeAliases と同じで、1 件も無ければ丸ごと省く。
   * 'd' はトップレベルでまだ使っていない文字だから選んだだけで、
   * URL のクエリ名 `#d=` とは別の階層の話(あちらは payload 全体の入れ物)。
   */
  d?: Array<ShortTravelDocV2>
  /**
   * countryInfos。travelDocs と同じで、1 件も無ければ丸ごと省く。
   * トップレベルでは country の 'c' が連絡先(emergencyContacts)、'd' が手続きで
   * 埋まっているので、地域 = geography の 'g' を割り当てた。
   */
  g?: Array<ShortCountryInfoV2>
}

/**
 * ZonedDateTime を分単位 epoch に畳む。畳めないときは null。
 *
 * 分未満(秒・ミリ秒・マイクロ秒・ナノ秒)を持つ時刻や、
 * 歴史的な LMT のようにオフセットが分に揃わないタイムゾーンでは
 * 情報が落ちるので、呼び出し側で生文字列に逃がしてもらう。
 */
function toMinuteEpoch(zdt: Temporal.ZonedDateTime): number | null {
  if (zdt.microsecond !== 0 || zdt.nanosecond !== 0) return null
  const ms = zdt.epochMilliseconds
  if (ms % MS_PER_MINUTE !== 0) return null
  return ms / MS_PER_MINUTE
}

/**
 * epoch(瞬間)とタイムゾーンの組は、壁時計時刻とオフセットを一意に決める。
 * そのため秋の DST fall-back で同じ壁時計時刻が 2 回訪れる 1 時間でも、
 * どちらの回だったかが正しく復元される(+02:00 の 02:30 と +01:00 の 02:30 は
 * 別の瞬間なので、分単位 epoch の時点で別の値になっている)。
 */
function toShortStampV2(stamp: Stamp): ShortStampV2 {
  const allDay = stamp.allDay ? { a: true } : {}
  const zdt = tryParseStamp(stamp)
  if (zdt === null) return { r: stamp.zdt, ...allDay }

  const minutes = toMinuteEpoch(zdt)
  if (minutes === null) return { r: stamp.zdt, ...allDay }

  return { m: minutes, z: encodeShareTz(zdt.timeZoneId), ...allDay }
}

/**
 * 復元できない Stamp は zdt を空文字にして返す。
 * ここで例外を投げると payload 全体が読めなくなるが、空文字にしておけば
 * parseTripNotesState がその予約だけを落として残りを活かせる。
 * 適当なタイムゾーンにフォールバックさせないのは storage.ts と同じ理由で、
 * 静かに数時間ずれた時刻を表示するより、予約が消えて気づけるほうがましだから。
 */
function fromShortStampV2(short: ShortStampV2): Stamp {
  const allDay = short.a ?? false
  if (typeof short.r === 'string') return { zdt: short.r, allDay }

  const tz = decodeShareTz(short.z)
  if (tz === null || typeof short.m !== 'number') return { zdt: '', allDay }

  try {
    const zdt = Temporal.Instant.fromEpochMilliseconds(
      short.m * MS_PER_MINUTE,
    ).toZonedDateTimeISO(tz)
    return { zdt: zdt.toString(), allDay }
  } catch {
    return { zdt: '', allDay }
  }
}

function toShortBookingV2(booking: Booking): ShortBookingV2 {
  return {
    k: booking.kind,
    t: booking.title,
    s: toShortStampV2(booking.start),
    ...(booking.end !== null ? { e: toShortStampV2(booking.end) } : {}),
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
    ...(booking.onlineCheckInOpensMinutesBefore !== undefined
      ? { w: booking.onlineCheckInOpensMinutesBefore }
      : {}),
    ...(booking.checkInClosesMinutesBefore !== undefined
      ? { h: booking.checkInClosesMinutesBefore }
      : {}),
    ...(booking.bagDropClosesMinutesBefore !== undefined
      ? { b: booking.bagDropClosesMinutesBefore }
      : {}),
    ...(booking.note !== undefined ? { n: booking.note } : {}),
    ...(booking.unverified !== undefined ? { q: booking.unverified } : {}),
  }
}

function fromShortBookingV2(short: ShortBookingV2): Booking {
  return {
    id: newId('bk'),
    kind: short.k,
    title: short.t,
    start: fromShortStampV2(short.s),
    end: short.e !== undefined ? fromShortStampV2(short.e) : null,
    ...(short.f !== undefined ? { from: fromShortPlace(short.f) } : {}),
    ...(short.o !== undefined ? { to: fromShortPlace(short.o) } : {}),
    ...(short.p !== undefined ? { place: fromShortPlace(short.p) } : {}),
    status: short.a,
    payment: short.y,
    ...(short.c !== undefined ? { confirmationNumber: short.c } : {}),
    ...(short.v !== undefined ? { provider: short.v } : {}),
    ...(short.r !== undefined ? { price: fromShortMoney(short.r) } : {}),
    ...(short.x !== undefined ? { freeCancelUntil: short.x } : {}),
    // このキーを持たない payload は「締切や開放時刻を入力していない予約」を意味する
    // (それぞれの欄を足す前に発行されたURLもここを通る)。値の妥当性は
    // 呼び出し元の parseTripNotesState → parseBooking が見る
    ...(short.w !== undefined
      ? { onlineCheckInOpensMinutesBefore: short.w }
      : {}),
    ...(short.h !== undefined ? { checkInClosesMinutesBefore: short.h } : {}),
    ...(short.b !== undefined ? { bagDropClosesMinutesBefore: short.b } : {}),
    ...(short.n !== undefined ? { note: short.n } : {}),
    ...(short.q !== undefined ? { unverified: short.q } : {}),
  }
}

function toShortContactV2(contact: EmergencyContact): ShortContactV2 {
  return {
    l: contact.label,
    v: contact.value,
    ...(contact.note !== undefined ? { n: contact.note } : {}),
  }
}

function fromShortContactV2(short: ShortContactV2): EmergencyContact {
  return {
    id: newId('ec'),
    label: short.l,
    value: short.v,
    ...(short.n !== undefined ? { note: short.n } : {}),
  }
}

function toShortTravelDocV2(doc: TravelDoc): ShortTravelDocV2 {
  return {
    k: doc.kind,
    t: doc.title,
    ...(doc.region !== undefined ? { g: doc.region } : {}),
    a: doc.status,
    ...(doc.dueDate !== undefined ? { x: doc.dueDate } : {}),
    ...(doc.validFrom !== undefined ? { f: doc.validFrom } : {}),
    ...(doc.validUntil !== undefined ? { u: doc.validUntil } : {}),
    ...(doc.referenceNumber !== undefined ? { c: doc.referenceNumber } : {}),
    ...(doc.price !== undefined ? { r: toShortMoney(doc.price) } : {}),
    ...(doc.url !== undefined ? { l: doc.url } : {}),
    ...(doc.note !== undefined ? { n: doc.note } : {}),
  }
}

function fromShortTravelDocV2(short: ShortTravelDocV2): TravelDoc {
  return {
    id: newId('td'),
    kind: short.k,
    title: short.t,
    ...(short.g !== undefined ? { region: short.g } : {}),
    status: short.a,
    ...(short.x !== undefined ? { dueDate: short.x } : {}),
    ...(short.f !== undefined ? { validFrom: short.f } : {}),
    ...(short.u !== undefined ? { validUntil: short.u } : {}),
    ...(short.c !== undefined ? { referenceNumber: short.c } : {}),
    ...(short.r !== undefined ? { price: fromShortMoney(short.r) } : {}),
    ...(short.l !== undefined ? { url: short.l } : {}),
    ...(short.n !== undefined ? { note: short.n } : {}),
  }
}

function toShortCountryInfoV2(info: CountryInfo): ShortCountryInfoV2 {
  return {
    t: info.name,
    ...(info.latinName !== undefined ? { r: info.latinName } : {}),
    ...(info.plugTypes !== undefined ? { p: info.plugTypes } : {}),
    ...(info.voltage !== undefined ? { v: info.voltage } : {}),
    ...(info.tipping !== undefined ? { c: info.tipping } : {}),
    ...(info.emergencyPolice !== undefined ? { e: info.emergencyPolice } : {}),
    ...(info.emergencyAmbulance !== undefined
      ? { m: info.emergencyAmbulance }
      : {}),
    ...(info.note !== undefined ? { n: info.note } : {}),
  }
}

function fromShortCountryInfoV2(short: ShortCountryInfoV2): CountryInfo {
  return {
    id: newId('ci'),
    name: short.t,
    ...(short.r !== undefined ? { latinName: short.r } : {}),
    ...(short.p !== undefined ? { plugTypes: short.p } : {}),
    ...(short.v !== undefined ? { voltage: short.v } : {}),
    ...(short.c !== undefined ? { tipping: short.c } : {}),
    ...(short.e !== undefined ? { emergencyPolice: short.e } : {}),
    ...(short.m !== undefined ? { emergencyAmbulance: short.m } : {}),
    ...(short.n !== undefined ? { note: short.n } : {}),
  }
}

function toShortStateV2(state: TripNotesState): ShortStateV2 {
  const aliases = state.placeAliases ?? []
  const docs = state.travelDocs ?? []
  const countries = state.countryInfos ?? []
  return {
    v: state.schemaVersion,
    t: state.tripTitle,
    s: state.startDate,
    e: state.endDate,
    ...(state.pinnedTz !== null ? { z: encodeShareTz(state.pinnedTz) } : {}),
    b: state.bookings.map(toShortBookingV2),
    c: state.emergencyContacts.map(toShortContactV2),
    ...(aliases.length > 0 ? { p: aliases.map((alias) => alias.names) } : {}),
    ...(docs.length > 0 ? { d: docs.map(toShortTravelDocV2) } : {}),
    ...(countries.length > 0 ? { g: countries.map(toShortCountryInfoV2) } : {}),
  }
}

function fromShortStateV2(short: ShortStateV2): TripNotesState {
  return {
    schemaVersion: short.v,
    tripTitle: short.t,
    startDate: short.s,
    endDate: short.e,
    // pinnedTz は表示の好みでしかないので、復元できなければ null(デバイスのTZ)に寄せる
    pinnedTz: short.z !== undefined ? decodeShareTz(short.z) : null,
    bookings: short.b.map(fromShortBookingV2),
    emergencyContacts: short.c.map(fromShortContactV2),
    // 省略されていた(= 1 組も無い)ときはフィールドごと付けない
    ...(short.p !== undefined
      ? {
          placeAliases: short.p.map((names) => ({ id: newId('pa'), names })),
        }
      : {}),
    // 手続きも同じ。キーが無い payload は「1 件も登録していない」を意味する
    // (このキーを足す前に発行されたURLもここを通る)
    ...(short.d !== undefined
      ? { travelDocs: short.d.map(fromShortTravelDocV2) }
      : {}),
    // 国の基本情報も同じ。キーが無い payload は「1 件も登録していない」を意味する
    // (このキーを足す前に発行されたURLもここを通る)
    ...(short.g !== undefined
      ? { countryInfos: short.g.map(fromShortCountryInfoV2) }
      : {}),
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

/** 共有URLの見た目の選択。既定(base64url)以外はネタなので opt-in にする */
export interface ShareEncodeOptions {
  /**
   * true にすると payload を CJK-16384(漢字)でエンコードする(marker '3')。
   * アドレスバーに漢字がびっしり並ぶ見た目になる代わりに、
   * QRコードは使えず、SMS や一部のメッセンジャーでリンクが壊れやすくなる。
   */
  cjk?: boolean
}

interface BuiltPayload {
  /** `#d=` に載せる文字列(先頭 1 文字はマーカー) */
  payload: string
  /**
   * エンコード前(圧縮後)のバイト数。
   * QR に載るかどうかはこちらで判定する。payload の文字数は
   * エンコード方式によって同じデータでも 2 倍以上変わるので当てにならない。
   */
  byteLength: number
}

async function buildPayload(
  state: TripNotesState,
  options: ShareEncodeOptions,
): Promise<BuiltPayload> {
  // 圧縮が使えない環境では v1 形式のまま '0' を出す。
  // 「無圧縮の v2」という組み合わせを増やすとマーカーが 1 つ増えるだけで、
  // 実際に通る経路(CompressionStream の無いモダンブラウザは事実上無い)が
  // 増えないため、既存の '0' をそのまま使い回す。
  if (!canUseCompressionStream()) {
    const bytes = new TextEncoder().encode(JSON.stringify(toShortState(state)))
    return { payload: `0${bytesToBase64Url(bytes)}`, byteLength: bytes.length }
  }

  const json = JSON.stringify(toShortStateV2(state))
  const compressed = await compressBytes(new TextEncoder().encode(json))
  const body =
    options.cjk === true ? bytesToCjk(compressed) : bytesToBase64Url(compressed)
  const marker = options.cjk === true ? '3' : '2'
  return { payload: `${marker}${body}`, byteLength: compressed.length }
}

function stripHash(url: string): string {
  const hashIndex = url.indexOf('#')
  return hashIndex === -1 ? url : url.slice(0, hashIndex)
}

/** 共有URLと、その大きさをまとめて返す */
export interface ShareBuildResult {
  url: string
  /** `#d=` に載せた文字列(baseUrl を含まない) */
  payload: string
  /** payload の文字数。UI に出す「◯◯文字」はこれ */
  length: number
  /** 圧縮後のバイト数。QR_SAFE_BYTES と比較するのはこれ */
  byteLength: number
}

/**
 * 共有URLを組み立てる。baseUrl に既にハッシュが付いていても、
 * ここで生成する `#d=...` に置き換わる(二重に付かない)。
 *
 * CJK 形式の URL は非ASCIIを含むので、`new URL()` を通したり
 * ブラウザのアドレスバーからコピーするとパーセントエンコードされた
 * 見た目に戻る。漢字のまま渡したいときは、この関数が返した文字列を
 * そのままクリップボードに載せること(ShareDialog のコピーボタンはそうしている)。
 */
export async function buildShare(
  state: TripNotesState,
  baseUrl: string,
  options: ShareEncodeOptions = {},
): Promise<ShareBuildResult> {
  const { payload, byteLength } = await buildPayload(state, options)
  return {
    url: `${stripHash(baseUrl)}#d=${payload}`,
    payload,
    length: payload.length,
    byteLength,
  }
}

export async function encodeShareUrl(
  state: TripNotesState,
  baseUrl: string,
  options: ShareEncodeOptions = {},
): Promise<string> {
  return (await buildShare(state, baseUrl, options)).url
}

/**
 * 共有URLのフラグメントから状態を復元する。
 * 先頭の '#' はあってもなくてもよい。壊れた入力(不正な base64、解凍失敗、
 * JSON パース失敗、parseTripNotesState によるスキーマ不一致)はすべて
 * 例外を投げずに null を返す。ブラウザの戻る/共有元の手打ち編集など
 * 不正な入力が現実的に起こりうる経路なので、呼び出し側に例外処理を強制しない。
 *
 * URLSearchParams がパーセントデコードを自動で行うため、
 * ブラウザがナビゲーション時にフラグメントの漢字を %E4%B8%80 のような形に
 * 変えていても、ここで元の文字に戻る。decodeURIComponent を足す必要はない。
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

    // '0' / '1' は過去に発行済みのURLが現に存在する形式。消してはいけない
    if (marker === '0' || marker === '1') {
      const bytes = base64UrlToBytes(body)
      const jsonBytes = marker === '1' ? await decompressBytes(bytes) : bytes
      // ShortState として受けるが、URL の中身を信用しているわけではない。
      // 型は組み立て方を決めるためだけのもので、実際の値の妥当性は直後の
      // parseTripNotesState が検証する(壊れていれば null になる)。
      // JSON.parse 自体が失敗した場合も、この関数全体の catch で null に落ちる。
      const short: ShortState = JSON.parse(new TextDecoder().decode(jsonBytes))
      return parseTripNotesState(fromShortState(short))
    }

    if (marker === '2' || marker === '3') {
      const bytes = marker === '3' ? cjkToBytes(body) : base64UrlToBytes(body)
      const jsonBytes = await decompressBytes(bytes)
      const short: ShortStateV2 = JSON.parse(
        new TextDecoder().decode(jsonBytes),
      )
      return parseTripNotesState(fromShortStateV2(short))
    }

    return null
  } catch {
    return null
  }
}

/** 共有payload(baseUrlを含まない `d=` の中身)の文字数を返す */
export async function estimateShareSize(
  state: TripNotesState,
  options: ShareEncodeOptions = {},
): Promise<number> {
  return (await buildPayload(state, options)).payload.length
}
