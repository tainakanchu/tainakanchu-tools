/**
 * 入力内容を localStorage に置いておく層。
 *
 * 設計判断:
 * - **サーバーには一切送らない。** ここで扱うのはパスポート番号・生年月日・
 *   自宅の国・電話番号といった、漏れたときに取り返しがつかない種類の情報で、
 *   それを預かる正当な理由がこのツールには 1 つも無い。保存先は端末の
 *   localStorage だけ、というのがこのツールの前提であり、画面にもそう明示する。
 * - それでも保存はする。台湾入国カードは渡航のたびに同じ内容を書かされるうえ、
 *   家族ぶんまで入力するとパスポートを人数分めくり直すことになる。
 *   次の旅行で使い回せることが、このツールを使う理由の半分を占める。
 * - 壊れたデータで画面が真っ白になるくらいなら、落とせるものだけ落として開く。
 *   検証は旅行者 1 件ずつ行い、壊れた 1 件のために残り 15 件を捨てない
 *   (src/lib/trip-scheduler/storage.ts と同じ方針)。
 * - 例外は握る。プライベートブラウジングや容量超過では localStorage が
 *   例外を投げるが、保存できないだけで入力そのものは続けられる。
 */

import {
  DEFAULT_ACCOMMODATION,
  DEFAULT_NATIONALITY,
  DEFAULT_PURPOSE,
  DEFAULT_REGION_CODE,
  DEFAULT_VISA_TYPE,
} from './options'
import { isValidIsoDate } from './dates'
import { MAX_PAST_TRIPS, MAX_TRAVELERS } from './types'
import type {
  Accommodation,
  ArrivalCardState,
  ModeOfTravel,
  PastTrip,
  Traveler,
  TripInfo,
} from './types'

const STORAGE_KEY = 'taiwan-arrival-card:v1'

/**
 * 読めなかった保存データの退避先。最新 1 件だけを保持する。
 * ここに残っていれば、あとから手で取り出して直すことができる。
 */
const BACKUP_KEY = 'taiwan-arrival-card:v1:backup'

/** 保存のデバウンス。1 文字打つたびに書き出す必要はない */
export const SAVE_DEBOUNCE_MS = 500

let idCounter = 0

/**
 * 旅行者の id。crypto.randomUUID が使えればそれを使う。
 * 古い WebView や http のプレビューでは crypto.randomUUID が無いことがあるので、
 * その場合は連番に落とす(id はこのブラウザの中でだけ一意なら足りる)。
 */
export function newTravelerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  idCounter += 1
  return `traveler-${Date.now().toString(36)}-${idCounter}`
}

export function createEmptyTrip(): TripInfo {
  return {
    dateOfEntry: '',
    entryMode: 'AIR',
    entryFlightCode: '',
    entryFlightNumber: '',
    entryVesselNumber: '',
    exitDate: '',
    exitMode: 'AIR',
    exitFlightCode: '',
    exitFlightNumber: '',
    exitVesselNumber: '',
    purpose: DEFAULT_PURPOSE,
    relativesName: '',
    relativesMobile: '',
    reason: '',
    accommodation: DEFAULT_ACCOMMODATION,
    addressOrHotel: '',
  }
}

/**
 * 新しい旅行者。日本のパスポートで観光に行く前提の既定値を入れておく。
 * 国籍が 256 件、電話の国番号が 219 件あるので、いちばん多い組み合わせを
 * 埋めておかないと 1 人目から探し物が始まる。
 */
export function createEmptyTraveler(): Traveler {
  return {
    id: newTravelerId(),
    englishName: '',
    chineseName: '',
    passportNumber: '',
    passportExpiry: '',
    sex: '',
    dateOfBirth: '',
    nationality: DEFAULT_NATIONALITY,
    countryOfBirth: DEFAULT_NATIONALITY,
    cityOfBirth: '',
    placeOfResidence: DEFAULT_NATIONALITY,
    visaType: DEFAULT_VISA_TYPE,
    visaNumber: '',
    regionCode: DEFAULT_REGION_CODE,
    mobileNumber: '',
    occupation: '',
    jobTitle: '',
    email: '',
  }
}

export function createInitialState(): ArrivalCardState {
  return {
    trip: createEmptyTrip(),
    travelers: [createEmptyTraveler()],
    pastTrips: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 文字列でなければ既定値。undefined と null と数値をまとめて弾く */
function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * 日付欄の復元。実在しない日付('2026-02-30' 等)は空欄に落とす。
 *
 * 残すほうが情報を捨てないように見えるが、逆になる。`<input type="date">` は
 * 読めない値を**空欄として描画する**ので、画面には出ないのに state には
 * 残っているという食い違いが生まれ、そのまま「日付が空の Excel」ができる。
 * 空にしておけば画面と state が一致し、未入力の警告がふつうに効く
 * (この規則の理由は -lib/dates.ts の冒頭に詳しく書いてある)。
 */
function dateStr(value: unknown): string {
  const text = str(value).trim()
  return isValidIsoDate(text) ? text : ''
}

function mode(value: unknown): ModeOfTravel {
  return value === 'SEA' ? 'SEA' : 'AIR'
}

function accommodation(value: unknown): Accommodation {
  if (value === 'Residential Address' || value === 'Transfer') return value
  return 'Hotel Name'
}

/**
 * 旅程の復元。欄が 1 つ壊れていても旅程ごと捨てはしない。
 * 旅程は 16 人ぶんの入力の前提になっているので、ここを null にすると
 * 実質すべて入れ直しになる。読めた欄だけ拾って、残りは既定値で埋める。
 */
export function parseTrip(raw: unknown): TripInfo {
  if (!isRecord(raw)) return createEmptyTrip()
  const empty = createEmptyTrip()
  return {
    dateOfEntry: dateStr(raw.dateOfEntry),
    entryMode: mode(raw.entryMode),
    entryFlightCode: str(raw.entryFlightCode),
    entryFlightNumber: str(raw.entryFlightNumber),
    entryVesselNumber: str(raw.entryVesselNumber),
    exitDate: dateStr(raw.exitDate),
    exitMode: mode(raw.exitMode),
    exitFlightCode: str(raw.exitFlightCode),
    exitFlightNumber: str(raw.exitFlightNumber),
    exitVesselNumber: str(raw.exitVesselNumber),
    purpose: str(raw.purpose, empty.purpose),
    relativesName: str(raw.relativesName),
    relativesMobile: str(raw.relativesMobile),
    reason: str(raw.reason),
    accommodation: accommodation(raw.accommodation),
    addressOrHotel: str(raw.addressOrHotel),
  }
}

/**
 * 旅行者 1 件の復元。オブジェクトでなければ null を返し、その 1 件だけ落とす。
 * id が無ければ採番し直す(id は保存の都合でしかなく、これが無いことを理由に
 * パスポート番号まで捨てるのは損が大きすぎる)。
 */
export function parseTraveler(raw: unknown): Traveler | null {
  if (!isRecord(raw)) return null
  const empty = createEmptyTraveler()
  const sex = raw.sex === 'Male' || raw.sex === 'Female' ? raw.sex : ''
  const id = str(raw.id)
  return {
    id: id.length > 0 ? id : empty.id,
    englishName: str(raw.englishName),
    chineseName: str(raw.chineseName),
    passportNumber: str(raw.passportNumber),
    passportExpiry: dateStr(raw.passportExpiry),
    sex,
    dateOfBirth: dateStr(raw.dateOfBirth),
    nationality: str(raw.nationality, empty.nationality),
    countryOfBirth: str(raw.countryOfBirth, empty.countryOfBirth),
    cityOfBirth: str(raw.cityOfBirth),
    placeOfResidence: str(raw.placeOfResidence, empty.placeOfResidence),
    visaType: str(raw.visaType, empty.visaType),
    visaNumber: str(raw.visaNumber),
    regionCode: str(raw.regionCode, empty.regionCode),
    mobileNumber: str(raw.mobileNumber),
    occupation: str(raw.occupation),
    jobTitle: str(raw.jobTitle),
    email: str(raw.email),
  }
}

/**
 * 履歴 1 件の復元。オブジェクトでなければ null を返してその 1 件だけ落とす。
 * 旅程本体は parseTrip が必ず何かを返すので、ここで見るのは入れ物だけ。
 * savedAt が読めなければ空文字にして、表示側で「日時不明」として扱う
 * (日時が分からないという理由で旅程まで捨てる価値は無い)。
 */
export function parsePastTrip(raw: unknown): PastTrip | null {
  if (!isRecord(raw)) return null
  if (!isRecord(raw.trip)) return null
  const id = str(raw.id)
  return {
    id: id.length > 0 ? id : newTravelerId(),
    savedAt: str(raw.savedAt),
    trip: parseTrip(raw.trip),
  }
}

/**
 * 旅行者の id が全員ぶん一意になるよう振り直す。
 *
 * 保存データを手で編集したり、書き出した JSON を貼り合わせたりすると、
 * 同じ id を持つ旅行者が並びうる。そうなると React の key が重複して
 * 描画がおかしくなるうえ、id で本人を特定している updateTraveler /
 * removeTraveler が**同じ id の人をまとめて書き換える**。1 人ぶん直したはずの
 * パスポート番号が別人にも入る、という気付きにくい壊れ方をするので、
 * 復元の時点で潰しておく。
 */
function withUniqueIds(travelers: Array<Traveler>): Array<Traveler> {
  const seen = new Set<string>()
  return travelers.map((traveler) => {
    if (traveler.id.length > 0 && !seen.has(traveler.id)) {
      seen.add(traveler.id)
      return traveler
    }
    let id = newTravelerId()
    // 採番し直した id が既存とぶつかることは実質起きないが、
    // ぶつかったまま通すと直そうとした問題がそのまま残る
    while (seen.has(id)) id = newTravelerId()
    seen.add(id)
    return { ...traveler, id }
  })
}

/**
 * 外部由来 JSON(localStorage)を検証・正規化する。
 * 全体として読めない形なら null。旅行者と履歴は 1 件ずつ検証し、
 * 不正な要素だけ落とす。
 */
export function parseState(raw: unknown): ArrivalCardState | null {
  if (!isRecord(raw)) return null
  const travelers = Array.isArray(raw.travelers)
    ? withUniqueIds(
        raw.travelers
          .map(parseTraveler)
          .filter((traveler): traveler is Traveler => traveler !== null)
          .slice(0, MAX_TRAVELERS),
      )
    : []
  // pastTrips はあとから足した欄なので、無い保存データがふつうに存在する。
  // 欠けていれば空の履歴として扱い、それを理由に全体を捨てない
  const pastTrips = Array.isArray(raw.pastTrips)
    ? raw.pastTrips
        .map(parsePastTrip)
        .filter((past): past is PastTrip => past !== null)
        .slice(0, MAX_PAST_TRIPS)
    : []
  // 旅行者が 0 件だと「追加」を押すまで何も入力できない画面になるので 1 件用意する
  return {
    trip: parseTrip(raw.trip),
    travelers: travelers.length > 0 ? travelers : [createEmptyTraveler()],
    pastTrips,
  }
}

export interface LoadResult {
  /** 読めなかったとき(保存が無い場合も含む)は null */
  state: ArrivalCardState | null
  /**
   * 保存はあったが読めなかったので、生データを退避キーに逃がしたか。
   * UI はこれを見て「前回の入力は読み取れなかったが、消してはいない」と伝える。
   */
  rescued: boolean
}

/**
 * 保存済みの入力内容を読む。
 *
 * ■ 読めなかったときに、黙って上書きさせない
 *   この関数が null を返すと画面は初期状態で立ち上がり、そのまま自動保存が
 *   走って**読めなかった元データを空の初期状態で上書きする**。原因が
 *   一時的な不具合や将来のスキーマ変更だった場合、パスポート番号を含む
 *   入力内容がそこで永久に失われる。読めなかったのは「壊れている」証拠ではなく
 *   「今のコードでは解釈できない」だけかもしれない。
 *   なので、キーがあるのに読めなかったときは生の文字列を退避キーへ移してから
 *   初期状態を返す。退避は最新 1 件だけ(古い退避を残し続けると、
 *   端末に読めないパスポート情報がいつまでも積もる)。
 */
export function loadState(): LoadResult {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // localStorage 自体が使えない環境。退避のしようもないので初期状態で立ち上げる
    return { state: null, rescued: false }
  }
  if (raw === null || raw.length === 0) return { state: null, rescued: false }

  try {
    const parsed = parseState(JSON.parse(raw))
    if (parsed !== null) return { state: parsed, rescued: false }
  } catch {
    // JSON として壊れている。下の退避処理へ
  }

  try {
    window.localStorage.setItem(BACKUP_KEY, raw)
    return { state: null, rescued: true }
  } catch {
    // 退避すらできない(容量超過など)。それでも上書きだけは避けたいので
    // rescued を立てておき、呼び出し側が保存を保留できるようにする
    return { state: null, rescued: true }
  }
}

export function saveState(state: ArrivalCardState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 容量超過やプライベートモードでは保存を諦める(編集は継続できる)
  }
}

/**
 * 「全データを削除」用。保存領域ごと消す。
 * 退避データも一緒に消す。「すべて削除した」と言った以上、読めなかったぶんの
 * パスポート情報が端末に残っているのは約束が違う。
 */
export function clearState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(BACKUP_KEY)
  } catch {
    // 消せなくても画面側の state はリセットされる
  }
}

/**
 * 旅行者が「作られたまま何も入力されていない」か。
 *
 * AI 取り込みが新しい人を足すべきか、いま画面にある空の行を埋めるべきかの
 * 判定に使う。初期表示の 1 行は空のまま置かれているので、そこに埋めずに
 * append すると空行が 1 行目に残り、**国籍などの既定値だけが入った行**が
 * そのまま Excel の 2 行目として書き出されてしまう。
 * id は行を見分けるためだけの値なので比較から外す。
 */
export function isPristineTraveler(traveler: Traveler): boolean {
  // JSON.stringify どうしの比較にはしない。キーの並び順が変わっただけで
  // 別物と判定され、「空行なのに埋めてもらえない」という分かりにくい
  // 壊れ方をする。欄ごとに突き合わせれば並び順に左右されない
  const current: Record<string, unknown> = { ...traveler }
  const empty: Record<string, unknown> = { ...createEmptyTraveler() }
  for (const [key, value] of Object.entries(empty)) {
    if (key === 'id') continue
    if (current[key] !== value) return false
  }
  return true
}
