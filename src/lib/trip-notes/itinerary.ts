/**
 * 旅程全体の「場所の連続性」チェック。
 *
 * derive.ts の findTransportGaps() は宿と宿の間しか見ていないので、
 * 「パリ着の便を取ったのに次の宿がローマ」「ローマに泊まっているのにパリ発の便」
 * のような食い違いを拾えない。ここでは予約を時系列に並べ、
 * 各予約の「終了時にいる場所」と次の予約の「開始時にいる場所」を突き合わせる。
 *
 * ■ 場所の取り出し方
 *   from / to が入っていれば、種別によらずそれを経路として扱う。
 *   AI 取り込みは手段の決まっていない移動を kind: 'other' に分類するが、
 *   出発地と到着地が入っている以上、利用者にとってはただの移動である。
 *   種別で経路かどうかを決めていると、そうした予約が丸ごと判定から外れ、
 *   移動が存在しないことになって「移動が登録されていません」を誤検出する。
 *   from も to も無い予約(宿泊・アクティビティ、出発地と返却地が同じ
 *   レンタカーなど)だけ place を滞在地として使い、開始も終了も同じ場所とする。
 *   場所がまったく取れない予約は連続性の判定から外す。情報が無いだけで
 *   不整合とは限らないうえ、「未入力だから警告」を出し始めると
 *   下書き段階の旅程が警告で埋まって読めなくなる。
 *
 * ■ 判定はヒューリスティックである
 *   「パリ」「Paris」「パリ市内」を人間は同じ場所として読むが、文字列としては別物で、
 *   逆に「サン・ジョセフ」のような地名は世界中にある。完全な判定は原理的に無理なので、
 *   方針は「見逃しより誤検出を許す」で統一する。旅程の穴を見落として現地で困るより、
 *   余計な警告が出て利用者が握りつぶすほうがましだからである。
 *   ただし同一判定そのものは都市の粒度(半径 30km / 名前の包含)まで意図的に緩めてある。
 *   同じ都市内でホテルを移っただけで毎回「移動がありません」と出ると、
 *   警告そのものが読み飛ばされるようになり、本当の穴まで一緒に見逃されるため。
 *   結果として、同一都市内での取り違えや、同名の別都市は検出できない。
 *   逆に、出発地も到着地も未入力の移動を挟んだ宿と宿は、その移動が無いものとして
 *   「移動がありません」と出る。実際には予約済みでも、それが正しい区間かは
 *   判断しようがないので、警告を出して利用者に確かめてもらう側に倒している。
 *
 *   名前の包含だけでは「マルタ・ルア国際空港」と「マルタの知人宅」が
 *   どちらも他方を含まず、同じ島の中なのに食い違いとして報告されてしまう。
 *   そこで比較候補に「施設名の部分を末尾から落として地名だけにしたもの」を足してある
 *   (FACILITY_SUFFIXES 参照)。空港・駅・ホテル・知人宅といった語は
 *   場所を特定する部分ではなく、そこに付く「どんな施設か」でしかないためである。
 *
 *   それでも語尾の除去で届く範囲には限りがある。「マルタ」と「バレッタ」のように
 *   地名そのものが違う書き方をされていれば、辞書を持たない以上どうやっても一致しない。
 *   判定をこれ以上緩めると本当の穴まで見逃すので、外れたぶんは利用者に
 *   「この 2 つは同じ場所」と教えてもらう(TripNotesState.placeAliases)。
 *   登録された組に該当する指摘だけを、判定の後で落とす。
 *
 * ■ 日付と時刻
 *   並び順は epoch(絶対時刻)で決める。時差のある区間が混ざるので、
 *   現地の壁時計時刻で並べると順序が逆転する。
 *   一方「何日の問題か」は、その予約の現地日付で答える。
 *   「6/15 にローマを発つ」は現地の暦の話なので、日本時間に直す意味がない。
 *
 *   ただし終日の予定と宿泊は、そのままの epoch では並べない(ordering.ts 参照)。
 *   宿泊は「その日の最後に泊まる」ものとして並べる。チェックイン時刻は
 *   「その時刻から入れる」という意味しか持たず、そこにいる時刻ではないためである。
 */

import { addDays, diffDays, formatDateJa, tryParseStamp } from './datetime'
import { isTransportKind, lodgingCoversNight } from './nights'
import { sortEpochOf } from './ordering'
import type {
  Booking,
  ItineraryIssue,
  ItineraryIssueKind,
  Place,
  PlaceAlias,
  TripNotesState,
} from './types'

/**
 * 同じ場所とみなす距離の上限 (km)。
 * 都市の中心と近郊の空港が収まる程度の広さにしてある
 * (パリ中心 - シャルル・ド・ゴール空港でおよそ 25km)。
 * これより狭くすると、同じ都市内でホテルを移っただけで移動漏れの警告が出る。
 */
export const SAME_PLACE_RADIUS_KM = 30

/** 地球の平均半径 (km)。Haversine 用 */
const EARTH_RADIUS_KM = 6371

/**
 * 部分一致を認める最短の長さ。
 * 1 文字の地名まで包含判定に載せると、ほぼ何にでも一致してしまう。
 */
const MIN_PARTIAL_MATCH_LENGTH = 2

/**
 * 1 区間で宿の有無を調べる夜の上限。
 * 年を打ち間違えた予約(2026 → 9999)があると数百万日を走査することになり、
 * この計算は画面の描画のたびに走るので、そのまま操作不能になる。
 * ここを超える滞在は、宿より先に日付を直すべき状態である。
 */
const MAX_STAY_NIGHTS = 366

/**
 * 乗り継ぎとみなす、到着から次の出発までの上限。
 * これを超えるなら、同じ空港に戻ってくるだけの往復であっても
 * 街に出て泊まるのが普通なので、宿が無いことを警告として扱う。
 */
const LAYOVER_MAX_MS = 24 * 60 * 60 * 1000

// --- 場所の取り出し ---

/** 中身が空の Place は「場所が入っていない」として扱う */
function usablePlace(place: Place | undefined): Place | null {
  if (place === undefined) return null
  if (place.name.trim() !== '') return place
  if (place.localName !== undefined && place.localName.trim() !== '')
    return place
  return coordsOf(place) === null ? null : place
}

function placeAt(booking: Booking, edge: 'start' | 'end'): Place | null {
  const from = usablePlace(booking.from)
  const to = usablePlace(booking.to)
  // 種別は見ない。kind: 'other' でも from / to が入っていれば経路である。
  // 片方でも入っていれば経路として扱う。
  // 到着地が未入力の便に place を当てて「そこに着いた」ことにすると、
  // 実際とは違う場所を起点にした警告が出てしまう
  if (from !== null || to !== null) return edge === 'start' ? from : to
  return usablePlace(booking.place)
}

/**
 * 連続性の判定で「移動」として扱うか。
 *
 * 並び順(ordering.ts)もこの判定を使う。終日の移動と終日の滞在ではみなしの時刻が
 * 違うので、画面と判定で「これは移動か」の答えが割れると並びも割れる。
 *
 * 種別が移動系であるか、from と to の両方が入っていれば移動とみなす。
 * isTransportKind() だけで判定すると、AI が手段未定として kind: 'other' に
 * 分類した移動が「移動ではない」ことになり、その前後が直接つながって
 * 「移動が登録されていません」を誤検出する。
 *
 * nights.ts の isTransportKind() は据え置く。あちらは「車中泊・機内泊で
 * その夜を寝られるか」の判定で、手段の決まっていない移動を夜行扱いすると
 * 寝る場所がない夜を見逃す。見逃しより誤警告に倒すという方針に反する。
 */
export function isMoveBooking(booking: Booking): boolean {
  if (isTransportKind(booking.kind)) return true
  return usablePlace(booking.from) !== null && usablePlace(booking.to) !== null
}

/** その予約が始まる時点でいる場所。分からなければ null */
export function placeAtStart(booking: Booking): Place | null {
  return placeAt(booking, 'start')
}

/** その予約が終わる時点でいる場所。分からなければ null */
export function placeAtEnd(booking: Booking): Place | null {
  return placeAt(booking, 'end')
}

// --- 場所の同一判定 ---

interface Coords {
  lat: number
  lng: number
}

function coordsOf(place: Place): Coords | null {
  const { lat, lng } = place
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null
  if (typeof lng !== 'number' || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/** 度をラジアンに直す。距離計算のたびに作り直す必要はないのでモジュール側に置く */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Haversine 距離 (km) */
function distanceKm(a: Coords, b: Coords): number {
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  // asin の引数が丸め誤差で 1 を超えると NaN になるので上で止める
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * 表記ゆれを潰す。NFKC で全角/半角を揃えたうえで小文字化し、
 * 文字と数字以外(空白・中黒・ハイフン・括弧などの記号)をすべて落とす。
 * 長音符「ー」は Unicode 上は文字なので残る。
 */
function normalizeName(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * 名前の末尾から落とす「どんな施設か」の語。normalizeName() を通した後の形で持つ
 * (空白・中黒はこの時点で消えているので、英語は続けて書いた形になる)。
 *
 * ■ なぜ語尾を落とすのか
 *   「マルタ・ルア国際空港」と「マルタの知人宅」は人間には同じ島の話だと分かるが、
 *   文字列としてはどちらも他方を含まないので包含判定では一致しない。
 *   この 2 つで共通しているのは地名の部分だけで、残りは施設の種類でしかない。
 *   語尾を落として地名部分を露出させれば、既存の包含判定にそのまま乗る。
 *
 * ■ なぜ辞書を持たないのか
 *   都市名・国名の一覧を持てば同じことをもっと正確にできるが、
 *   世界中の地名を網羅した表を個人ツールで維持し続けるのは無理がある。
 *   古い表は「載っていない街だけ判定が変わる」という説明しづらい壊れ方をするので、
 *   最初から持たず、語尾の除去だけで届く範囲に留める。
 *
 * ■ 落としすぎないための制約
 *   落とすのは末尾の 1 語だけで、長い語から順に試して 1 つ落としたら打ち切る
 *   (「国際空港」を「空港」で削って「◯◯国際」を作らないため)。
 *   落とした残りが MIN_PARTIAL_MATCH_LENGTH 未満になる候補は捨てる。
 *   「駅」だけを入力した予約から空文字の候補が生まれると、
 *   何にでも一致して食い違いを丸ごと見逃すことになる。
 *
 * ■ 英語の `port` を単独では入れない(再追加しないこと)
 *   Newport / Southport / Stockport / Bridgeport のように、地名そのものが
 *   -port で終わる街が英語圏には実在する。`port` を落とすと「Newport」から
 *   「new」という候補が生まれ、3 文字あるので長さのガードも素通りしたうえで
 *   「New York」(newyork)に包含判定で一致してしまう。つまり本当に出るべき
 *   到着地の食い違いが消える。このファイルの方針は「見逃しより誤検出を許す」なので、
 *   港をひとつ拾うために見逃しを作るのは割に合わない。
 *   港を拾いたい場合は、地名の一部になりにくい複合語(seaport / ferryport /
 *   cruiseport)だけを足す。日本語の「港」は「神戸港」→「神戸」と落とせて、
 *   「香港」→「香」は 1 文字なので長さのガードで捨てられるため残してある。
 */
const FACILITY_SUFFIXES: Array<string> = [
  '国際空港',
  '空港',
  '飛行場',
  '中央駅',
  '駅',
  'フェリーターミナル',
  'バスターミナル',
  'ターミナル',
  '港',
  'ホテル',
  'ゲストハウス',
  'ホステル',
  '旅館',
  '民宿',
  '民泊',
  '知人宅',
  '友人宅',
  '実家',
  '自宅',
  '別荘',
  '宅',
  'internationalairport',
  'intlairport',
  'airport',
  'centralstation',
  'station',
  'ferryterminal',
  'busterminal',
  'terminal',
  'cruiseport',
  'ferryport',
  'seaport',
  'hotel',
  'hostel',
  'guesthouse',
  'apartment',
].toSorted((a, b) => b.length - a.length)

/**
 * 施設の語を末尾から 1 つだけ落として、地名部分だけにした名前を返す。
 * 落とせない(施設の語で終わっていない、落とすと短くなりすぎる)なら null。
 */
function withoutFacilitySuffix(name: string): string | null {
  for (const suffix of FACILITY_SUFFIXES) {
    if (!name.endsWith(suffix)) continue
    const stripped = name.slice(0, name.length - suffix.length)
    // 「マルタの知人宅」は「マルタの」で終わるので、助詞もここで落として地名にする
    const base = stripped.endsWith('の') ? stripped.slice(0, -1) : stripped
    return base.length < MIN_PARTIAL_MATCH_LENGTH ? null : base
  }
  return null
}

/**
 * 比較に使う名前の候補。localName も同じ土俵に載せる。
 * 施設の語を落とした形は元の名前を消さずに「足す」。
 * 「羽田空港」を「羽田」に置き換えてしまうと、空港名どうしの比較
 * (「羽田空港」と「東京国際空港(羽田空港)」)のような素直な一致を失う。
 */
function nameCandidates(place: Place): Array<string> {
  const names = [place.name, place.localName ?? '']
    .map(normalizeName)
    .filter((name) => name !== '')
  const bases = names
    .map(withoutFacilitySuffix)
    .filter((name): name is string => name !== null)
  return [...new Set([...names, ...bases])]
}

/**
 * 一方が他方を含んでいれば同じ場所とみなす。
 * 「パリ」と「パリ シャルル・ド・ゴール空港」を別の街として扱わないための緩さで、
 * 代わりに「ローマ」と「ローマ字博物館」のような無関係な包含も通してしまう。
 */
function nameMatches(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length < MIN_PARTIAL_MATCH_LENGTH) return false
  return long.includes(short)
}

/**
 * 2 つの場所が同じかどうか。
 *
 * 座標が両方にあれば距離だけで決める。名前は言語も表記もまちまちだが、
 * 座標は入力元(地図アプリからの貼り付け等)がはっきりしていて信用できる。
 * 片方にしか座標が無い場合は比較にならないので名前に落とす。
 */
export function isSamePlace(a: Place, b: Place): boolean {
  const ca = coordsOf(a)
  const cb = coordsOf(b)
  if (ca !== null && cb !== null) {
    return distanceKm(ca, cb) <= SAME_PLACE_RADIUS_KM
  }

  for (const na of nameCandidates(a)) {
    for (const nb of nameCandidates(b)) {
      if (nameMatches(na, nb)) return true
    }
  }
  return false
}

// --- 利用者が「同じ場所」と教えた組 ---

/**
 * 2 つの名前の組が、順不同で同じ組か。
 *
 * 突き合わせるのは normalizeName() を通した完全一致だけで、
 * isSamePlace() のような包含は使わない。ここは推測を足す場所ではなく、
 * 利用者が名指しで「この 2 つ」と教えた組をそのまま照合する場所だからである。
 * 包含まで認めると、教えていない組まで巻き添えで消える。
 *
 * 名前が空になる組は常に一致しないものとして扱う。空文字どうしが一致すると、
 * 場所が入っていない予約の指摘がまとめて消えて、穴が見えなくなる。
 */
export function isSameAliasPair(
  a: [string, string],
  b: [string, string],
): boolean {
  const [a0, a1] = a.map(normalizeName)
  const [b0, b1] = b.map(normalizeName)
  if (a0 === '' || a1 === '' || b0 === '' || b1 === '') return false
  return (a0 === b0 && a1 === b1) || (a0 === b1 && a1 === b0)
}

/**
 * 「同じ場所として扱う」で落とせる指摘の種別。
 *
 * 場所の食い違い系だけに限る。missing-lodging と layover は
 * 「その夜に寝る場所があるか」の話で、2 つの地名が同じ場所かどうかとは別の問題である。
 * 同じ場所だと教えられたからといって宿が要らなくなるわけではないので、
 * ここで一緒に消すと、教えた副作用で泊まる場所の無い夜が見えなくなる。
 */
const ALIASABLE_ISSUE_KINDS: ReadonlySet<ItineraryIssueKind> = new Set([
  'location-mismatch',
  'departure-mismatch',
  'missing-transport',
])

/**
 * その種別の指摘に「同じ場所として扱う」を出してよいか。
 * 画面側もこれを見る。ボタンを出す条件と実際に落ちる条件が別々に書かれていると、
 * 押しても何も消えないボタンが生まれて、利用者は何が起きたのか分からなくなる。
 */
export function isAliasableIssueKind(kind: ItineraryIssueKind): boolean {
  return ALIASABLE_ISSUE_KINDS.has(kind)
}

/**
 * 利用者が登録した組に該当する指摘か。
 *
 * Place どうしの同一判定(isSamePlace)に混ぜず、指摘のラベルで突き合わせている。
 * 理由は 2 つある。
 * - 利用者が押すのは「画面に出ていたこの警告の 2 つの地名は同じ場所だ」であって、
 *   予約のどのフィールドから来た Place かではない。出ていた文言そのままで
 *   突き合わせるほうが、押した結果と消える警告が一致して裏切りが無い。
 * - placeLabel() は place が空なら予約の題名で代用するので、
 *   ラベルが Place 由来とは限らない。Place だけを見ていると、
 *   利用者が押した組に対応する Place が存在せず、永久に消えない警告が生まれる。
 */
function isDismissedByAlias(
  issue: ItineraryIssue,
  aliases: Array<PlaceAlias>,
): boolean {
  if (!isAliasableIssueKind(issue.kind)) return false
  return aliases.some((alias) =>
    isSameAliasPair([issue.fromLabel, issue.toLabel], alias.names),
  )
}

// --- 時系列に並べた予約 ---

interface Entry {
  booking: Booking
  /** 開始の絶対時刻。乗り継ぎ時間の計算に使う実際の値 */
  startEpochMs: number
  /** 終了の絶対時刻。end が無ければ開始と同じ */
  endEpochMs: number
  /** 並び替えの鍵。終日と宿泊はみなしの時刻に寄せてあるので実際の epoch とは違う(ordering.ts) */
  sortEpochMs: number
  /** 現地時間での開始日 (YYYY-MM-DD) */
  startDate: string
  /** 現地時間での終了日。end が無ければ開始日と同じ */
  endDate: string
  placeStart: Place | null
  placeEnd: Place | null
  isMove: boolean
}

function toEntry(booking: Booking): Entry | null {
  const start = tryParseStamp(booking.start)
  if (start === null) return null
  const end = booking.end === null ? null : tryParseStamp(booking.end)
  const isMove = isMoveBooking(booking)
  return {
    booking,
    startEpochMs: start.epochMilliseconds,
    endEpochMs: (end ?? start).epochMilliseconds,
    sortEpochMs: sortEpochOf(booking, start, isMove),
    startDate: start.toPlainDate().toString(),
    endDate: (end ?? start).toPlainDate().toString(),
    placeStart: placeAt(booking, 'start'),
    placeEnd: placeAt(booking, 'end'),
    isMove,
  }
}

function compareEntries(a: Entry, b: Entry): number {
  if (a.sortEpochMs !== b.sortEpochMs) return a.sortEpochMs - b.sortEpochMs
  // 同時刻なら「着いてから泊まる」の順に見えるよう移動を先に置く
  if (a.isMove !== b.isMove) return a.isMove ? -1 : 1
  return a.booking.id.localeCompare(b.booking.id)
}

/** 場所の代わりに出す名前。place が空なら予約の題名で代用する */
function placeLabel(place: Place | null, booking: Booking): string {
  const name = place?.name.trim()
  if (name !== undefined && name !== '') return name
  const localName = place?.localName?.trim()
  if (localName !== undefined && localName !== '') return localName
  return booking.title.trim()
}

// --- 連続性の判定 ---

/**
 * 前後どちらが移動かで種別を決める。
 * 移動の直後にずれていれば到着地の食い違い、移動の直前にずれていれば出発地の食い違い、
 * どちらも移動でないなら単純に移動の予約が抜けている。
 * 移動と移動が並んでいる場合は到着地側の問題として扱う
 * (先に着いた場所が違うほうが、利用者にとって手前の判断材料になる)。
 */
function classify(prev: Entry, next: Entry): ItineraryIssueKind {
  if (prev.isMove) return 'location-mismatch'
  if (next.isMove) return 'departure-mismatch'
  return 'missing-transport'
}

function continuityMessage(
  kind: ItineraryIssueKind,
  date: string,
  fromLabel: string,
  toLabel: string,
): string {
  const day = formatDateJa(date)
  switch (kind) {
    case 'location-mismatch':
      return `${fromLabel} に到着する予定ですが、次の予約は ${toLabel} です。${day} までの移動を追加するか、到着地を見直してください`
    case 'departure-mismatch':
      return `${day} の移動は ${toLabel} 発ですが、その手前は ${fromLabel} にいる予定です。出発地か、${fromLabel} からの移動を見直してください`
    default:
      // missing-transport。missing-lodging は専用の文言を組み立てるのでここは通らない
      return `${fromLabel} → ${toLabel} の移動が登録されていません。${day} の移動を追加してください`
  }
}

/**
 * 隣り合う予約の場所がつながっているか。
 *
 * 場所がまったく取れない予約は列から抜くので、その前後が直接隣り合う。
 * 「場所未入力のアクティビティを挟んだ宿と宿」も、間に何も無いのと同じに扱う。
 * 移動の到着地だけが未入力といった片側だけ欠けている場合は、
 * その境目の判定だけを諦める(欠けている側を推測で埋めると、
 * 実在しない食い違いを作り出してしまう)。
 */
function findContinuityIssues(entries: Array<Entry>): Array<ItineraryIssue> {
  const chain = entries.filter(
    (entry) => entry.placeStart !== null || entry.placeEnd !== null,
  )

  const issues: Array<ItineraryIssue> = []
  for (let i = 0; i + 1 < chain.length; i++) {
    const prev = chain[i]
    const next = chain[i + 1]
    const from = prev.placeEnd
    const to = next.placeStart
    if (from === null || to === null) continue
    if (isSamePlace(from, to)) continue

    const kind = classify(prev, next)
    const date = next.startDate
    const fromLabel = placeLabel(from, prev.booking)
    const toLabel = placeLabel(to, next.booking)
    issues.push({
      kind,
      severity: 'warning',
      date,
      fromBookingId: prev.booking.id,
      toBookingId: next.booking.id,
      fromLabel,
      toLabel,
      message: continuityMessage(kind, date, fromLabel, toLabel),
    })
  }
  return issues
}

// --- 移動と移動の間の宿 ---

/**
 * 到着と次の出発が「乗り継ぎ」か。
 *
 * 空港で夜を明かす乗り継ぎに「宿泊が未予約」と出しても直しようがないので、
 * 次の 3 つがそろったときだけ乗り継ぎとみなす。
 * - 到着地と次の出発地が同じ場所
 * - その間に他の予約が 1 つも無い(街に出る予定があるなら乗り継ぎではない)
 * - 到着から出発まで LAYOVER_MAX_MS 未満
 *
 * 時間の条件が要るのは、場所が同じだけでは往復の起点と区別できないため。
 * 「パリに着いて 2 日後にパリから発つ」は同じ場所だが、
 * これは乗り継ぎではなくパリ滞在であって、宿が要る。
 */
function isLayover(arrive: Entry, depart: Entry, adjacent: boolean): boolean {
  if (!adjacent) return false
  if (arrive.placeEnd === null || depart.placeStart === null) return false
  if (!isSamePlace(arrive.placeEnd, depart.placeStart)) return false
  const waitMs = depart.startEpochMs - arrive.endEpochMs
  return waitMs >= 0 && waitMs < LAYOVER_MAX_MS
}

/**
 * 移動と移動に挟まれた滞在に、宿泊の予約があるか。
 *
 * nights.ts も「寝る場所がない夜」を出すが、あちらは旅行期間の全夜を走査する。
 * こちらは「着いてから次に発つまで」という文脈を持つので、
 * 何日から何日までの滞在で宿が要るのかを名指しできる。両方から報告されうるが、
 * 利用者が読むのは文脈のあるほうなので重複はそのままにしてある。
 *
 * 到着日と出発日はそれぞれの現地日付で数える。時差のある区間では
 * 絶対時刻の差から泊数を割り出すと 1 泊ずれるが、人が寝るのは現地の夜だからである。
 *
 * 同一地点での乗り継ぎだけは警告ではなく情報として出す(isLayover 参照)。
 * 黙って消さないのは、待ち時間が長ければ空港近くの宿を取りたい人がいるためで、
 * 「ここは乗り継ぎです」と見えていれば利用者自身が判断できる。
 */
function findMissingLodgingIssues(
  entries: Array<Entry>,
  alive: Array<Booking>,
): Array<ItineraryIssue> {
  // 「間に他の予約が無いか」を見たいので、元の並びでの位置も持ち歩く
  const moves: Array<{ entry: Entry; index: number }> = []
  for (const [index, entry] of entries.entries()) {
    if (entry.isMove) moves.push({ entry, index })
  }
  const lodgings = alive.filter((booking) => booking.kind === 'lodging')

  const issues: Array<ItineraryIssue> = []
  for (let i = 0; i + 1 < moves.length; i++) {
    const arrive = moves[i].entry
    const depart = moves[i + 1].entry
    // 同日中に乗り継ぐだけなら夜をまたがないので宿は要らない
    const nightCount = diffDays(arrive.endDate, depart.startDate)
    if (nightCount <= 0) continue

    // 報告に使うのは最初の 1 泊だけなので、見つかった時点で打ち切る
    const scanCount = Math.min(nightCount, MAX_STAY_NIGHTS)
    let firstUncovered: string | null = null
    for (let n = 0; n < scanCount; n++) {
      const night = addDays(arrive.endDate, n)
      if (!lodgings.some((booking) => lodgingCoversNight(booking, night))) {
        firstUncovered = night
        break
      }
    }
    if (firstUncovered === null) continue

    const fromLabel = placeLabel(arrive.placeEnd, arrive.booking)
    const toLabel = placeLabel(depart.placeStart, depart.booking)
    const adjacent = moves[i + 1].index === moves[i].index + 1
    const layover = isLayover(arrive, depart, adjacent)
    const span = `${formatDateJa(arrive.endDate)} に到着してから ${formatDateJa(depart.startDate)} の出発まで`
    const area = arrive.placeEnd === null ? '' : `${fromLabel} 周辺の`
    issues.push({
      kind: layover ? 'layover' : 'missing-lodging',
      severity: layover ? 'info' : 'warning',
      date: firstUncovered,
      fromBookingId: arrive.booking.id,
      toBookingId: depart.booking.id,
      fromLabel,
      toLabel,
      message: layover
        ? `${span}、${fromLabel} での乗り継ぎです。空港で待つなら宿は要りませんが、休みたい場合は${area}宿を追加してください`
        : `${span}、宿泊の予約がありません。${area}宿を追加してください`,
    })
  }
  return issues
}

// --- 公開 API ---

/**
 * 警告として扱う指摘だけを残す。
 * 乗り継ぎの案内(severity: 'info')まで「旅程の不整合」として数えると、
 * 直しようのない件数がアラートに乗って、本当の穴が埋もれる。
 */
export function warningIssuesOf(
  issues: Array<ItineraryIssue>,
): Array<ItineraryIssue> {
  return issues.filter((issue) => issue.severity === 'warning')
}

/**
 * 旅程の不整合を日付順に返す。
 *
 * キャンセル済みの予約は無いものとして扱う。キャンセルした宿がつながりを埋めていると、
 * 実際には泊まる場所が無いのに警告が出ないという、一番まずい壊れ方をする。
 * 開始時刻が壊れている予約も並べようがないので判定から外す。
 *
 * 利用者が「同じ場所」と教えた組(state.placeAliases)に該当する指摘は、
 * 判定を通したうえで最後に落とす。判定そのものを書き換えてしまうと、
 * 教えた組が別の場面(乗り継ぎかどうかなど)にも波及して、
 * 何が消えたのか説明できなくなる。
 */
export function findItineraryIssues(
  state: TripNotesState,
): Array<ItineraryIssue> {
  const alive = state.bookings.filter(
    (booking) => booking.status !== 'cancelled',
  )
  const entries = alive
    .map(toEntry)
    .filter((entry): entry is Entry => entry !== null)
    .toSorted(compareEntries)

  const aliases = state.placeAliases ?? []
  const issues = [
    ...findContinuityIssues(entries),
    ...findMissingLodgingIssues(entries, alive),
  ].filter((issue) => !isDismissedByAlias(issue, aliases))
  // 同じ日に複数出る場合の並びは検出順のまま(toSorted も安定ソート)
  return issues.toSorted((a, b) => a.date.localeCompare(b.date))
}
