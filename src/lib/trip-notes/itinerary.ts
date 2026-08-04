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
 * ■ 日付と時刻
 *   並び順は epoch(絶対時刻)で決める。時差のある区間が混ざるので、
 *   現地の壁時計時刻で並べると順序が逆転する。
 *   一方「何日の問題か」は、その予約の現地日付で答える。
 *   「6/15 にローマを発つ」は現地の暦の話なので、日本時間に直す意味がない。
 *
 *   ただし終日の予定だけは、そのままの epoch では並べない(ALL_DAY_* 参照)。
 */

import { addDays, diffDays, formatDateJa, tryParseStamp } from './datetime'
import { isTransportKind } from './nights'
import type {
  Booking,
  ItineraryIssue,
  ItineraryIssueKind,
  Place,
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
 * 終日の予定を並べるときの、みなしの開始時刻(現地の時)。
 *
 * ■ なぜ必要か
 *   終日は現地 00:00 の ZonedDateTime として保存される(types.ts の Stamp 参照)。
 *   epoch そのままで並べると「9/6 からコペンハーゲンに泊まる」は 9/5 22:00 UTC、
 *   「9/6 12:20 デリー発コペンハーゲン行き」は 9/6 06:50 UTC になり、
 *   泊まる予定のほうが、そこへ向かう便より前に来てしまう。
 *   結果、到着地の食い違いと出発地の食い違いが必ずペアで誤検出される。
 *
 * ■ なぜこの方針か
 *   候補は 3 つあった。
 *   (a) 同一日なら「移動 → 滞在」の順に並べ替える
 *   (b) 終日は「その日の遅い時刻に始まる」とみなす ← これを採った
 *   (c) 終日を区間として扱い、区間と点の重なりで判定する
 *   (a) は日付が主キーになるので、時差をまたいで現地日付が前後する区間
 *   (東京 6/12 23:00 発 → パリ 6/13 05:30 着)で並びが崩れる。
 *   (c) は「点の列」という前提で書かれた連続性の判定と宿の判定を両方作り直すことになり、
 *   壊す範囲が広すぎる。
 *   (b) は並び替えの鍵を作る 1 か所で閉じるうえ、実態にも合っている
 *   (チェックインは午後、その日のうちの移動は日中に済ませる)。
 *
 * ■ 移動と滞在で時刻を分けるのは、終日の移動があるため
 *   「ミラノ→スイス」のように手段未定で終日の移動があると、
 *   同じ日の「時刻付きの到着便 → 終日の移動 → 夕方チェックインの宿」を
 *   正しい順に並べる必要がある。移動を昼、滞在を夕方に置けばこれが素直に決まる。
 */
const ALL_DAY_MOVE_HOUR = 12
const ALL_DAY_STAY_HOUR = 18

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
 * 種別が移動系であるか、from と to の両方が入っていれば移動とみなす。
 * isTransportKind() だけで判定すると、AI が手段未定として kind: 'other' に
 * 分類した移動が「移動ではない」ことになり、その前後が直接つながって
 * 「移動が登録されていません」を誤検出する。
 *
 * nights.ts の isTransportKind() は据え置く。あちらは「車中泊・機内泊で
 * その夜を寝られるか」の判定で、手段の決まっていない移動を夜行扱いすると
 * 寝る場所がない夜を見逃す。見逃しより誤警告に倒すという方針に反する。
 */
function isMoveBooking(booking: Booking): boolean {
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

/** 比較に使う名前の候補。localName も同じ土俵に載せる */
function nameCandidates(place: Place): Array<string> {
  const names = [place.name, place.localName ?? '']
    .map(normalizeName)
    .filter((name) => name !== '')
  return [...new Set(names)]
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

// --- 時系列に並べた予約 ---

interface Entry {
  booking: Booking
  /** 開始の絶対時刻。乗り継ぎ時間の計算に使う実際の値 */
  startEpochMs: number
  /** 終了の絶対時刻。end が無ければ開始と同じ */
  endEpochMs: number
  /** 並び替えの鍵。終日はみなしの時刻に寄せてあるので実際の epoch とは違う */
  sortEpochMs: number
  /** 現地時間での開始日 (YYYY-MM-DD) */
  startDate: string
  /** 現地時間での終了日。end が無ければ開始日と同じ */
  endDate: string
  placeStart: Place | null
  placeEnd: Place | null
  isMove: boolean
}

/**
 * 並び替えに使う時刻。終日なら現地のみなしの時刻に寄せる。
 * startOfDay() から時を足すので、その日が 23 時間や 25 時間になる
 * 夏時間の切替日でも例外を投げず、必ずその日の中に収まる。
 */
function sortEpochOf(
  start: Temporal.ZonedDateTime,
  allDay: boolean,
  isMove: boolean,
): number {
  if (!allDay) return start.epochMilliseconds
  const hours = isMove ? ALL_DAY_MOVE_HOUR : ALL_DAY_STAY_HOUR
  return start.startOfDay().add({ hours }).epochMilliseconds
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
    sortEpochMs: sortEpochOf(start, booking.start.allDay, isMove),
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

/** その宿がその夜をカバーするか。nights.ts と同じ「チェックイン <= 夜 < チェックアウト」 */
function lodgingCoversNight(booking: Booking, nightDate: string): boolean {
  const start = tryParseStamp(booking.start)
  if (start === null) return false
  const from = start.toPlainDate().toString()

  const end = booking.end === null ? null : tryParseStamp(booking.end)
  const rawTo = end === null ? null : end.toPlainDate().toString()
  const to = rawTo !== null && rawTo > from ? rawTo : addDays(from, 1)
  return from <= nightDate && nightDate < to
}

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

  const issues = [
    ...findContinuityIssues(entries),
    ...findMissingLodgingIssues(entries, alive),
  ]
  // 同じ日に複数出る場合の並びは検出順のまま(toSorted も安定ソート)
  return issues.toSorted((a, b) => a.date.localeCompare(b.date))
}
