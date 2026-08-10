/**
 * 登録済みデータに空いている「一般知識で埋められる欄」(A 項目)を検出する層。
 *
 * プロンプト本文の組み立ては aiPrompt.ts の buildImportPrompt に一本化した。
 * こちらは「どこに穴があるか」の検出と、プロンプトへ載せる gap 用の payload だけを持つ。
 * UI が「空き欄の内訳」を出すときも、プロンプトと同じ判定(findBackfillGaps)を使う。
 *
 * ■ なぜ「一般知識で埋まる項目」だけを対象にするのか
 *   予約の欄は、埋められる根拠で 2 種類に分かれる。
 *     A. AI の一般知識から導けるもの。搭乗手続き・受託手荷物の締切とオンライン
 *        チェックインの開放時刻、地名のラテン文字表記、国のプラグ形状など。
 *     B. 原本にしか書かれていないもの。座席番号、運賃クラス、受託手荷物の個数、
 *        朝食の有無。
 *   書類なしで B を対象にすると AI がそれらしい値を捏造する。A / B の区別は
 *   BACKFILL_FIELDS / COUNTRY_INFO_FILL_FIELDS への登録の有無で表す。
 *
 * ■ 訪問国の推定はしない
 *   国名の入力だけは人間の仕事(types.ts の CountryInfo と同じ)。
 *   穴として数えるのは「countryInfos に登録済みだが欄が空」のものだけ。
 */

import {
  AIRLINE_TIMING_FILL_RULE,
  LATIN_NAME_FILL_RULE,
} from './promptRules'
import { tryParseStamp } from './datetime'
import { isTransportKind } from './nights'
import type { Booking, CountryInfo, TripNotesState } from './types'

/** Place を持ちうる欄。ラテン文字表記の穴はこの 3 つそれぞれに空きうる */
const PLACE_SLOTS = ['from', 'to', 'place'] as const

/**
 * 穴埋めの対象になりうる項目 1 つぶんの定義。
 *
 * 1 件 = 「1 つの規則で埋まる項目のまとまり」であって、Booking のフィールド 1 つでは
 * ない。搭乗手続きと受託手荷物の締切は別々のフィールドだが埋め方の規則は完全に同じで、
 * 分けて登録すると同じ規則の文面がプロンプトに 2 度出る。利用者に見せるときも
 * 「締切」でひとまとまりのほうが読みやすい。
 */
export interface BackfillField {
  /** 項目の id。React の key とテストからの参照に使う */
  id: string
  /** 利用者に見せる項目名 */
  label: string
  /**
   * その予約でこの項目が「欠けている」キーを返す。空配列なら穴なし。
   *
   * その予約にそもそも無関係な項目(移動でない予約の搭乗手続きの締切など)は
   * 穴ではないので空配列を返すこと。ここで無関係なものまで穴として数えると、
   * 永遠に埋まらない穴の件数が画面に出続けて導線が信用されなくなる。
   *
   * 返したキーはそのままプロンプトの missing に載り、AI が返すパッチのキーにもなる。
   */
  missingKeys: (booking: Booking) => Array<string>
  /** 出力スキーマ(BookingPatch の中身)に差し込む型定義の断片 */
  schema: string
  /** BookingPatch の外側に必要な補助の型定義。要らなければ省く */
  helperTypes?: string
  /** 埋め方の規則。番号は組み立てのときに振るので、ここには書かない */
  rule: string
}

/**
 * 穴埋めの対象にする項目の一覧。ここに登録されている項目だけが対象になる
 * (A / B の区別の実体。ファイル冒頭のコメントを参照)。
 */
export const BACKFILL_FIELDS: Array<BackfillField> = [
  {
    // オンラインチェックインの開放時刻を、締切と別の 1 件に分けずここへ統合してある。
    // BackfillField の 1 件は「1 つの規則で埋まる項目のまとまり」であって Booking の
    // フィールド 1 つではない(上の JSDoc 参照)。開放時刻は締切とまったく同じ規則
    // (同じ公開規定から引き、同じ形で evidence を求める)で埋まるので、分けて
    // 登録すると同じ規則の文面がプロンプトに 2 度出る。利用者に見せるときも、
    // 便の時刻まわりでひとまとまりのほうが読みやすい
    id: 'airlineTimings',
    label: '搭乗手続き・手荷物の締切とオンラインチェックイン開始',
    missingKeys: (booking) => {
      // 移動の予約にしか無い欄。宿やアクティビティに締切の穴を作ってはいけない
      if (!isTransportKind(booking.kind)) return []
      const keys: Array<string> = []
      // 時系列の早い順(開放 → 締切)に並べる。missing はそのまま AI に読ませるので、
      // 便の当日に向けて時刻が進む順に並んでいるほうが取り違えが起きにくい
      if (booking.onlineCheckInOpensMinutesBefore === undefined) {
        keys.push('onlineCheckInOpensMinutesBefore')
      }
      if (booking.checkInClosesMinutesBefore === undefined) {
        keys.push('checkInClosesMinutesBefore')
      }
      if (booking.bagDropClosesMinutesBefore === undefined) {
        keys.push('bagDropClosesMinutesBefore')
      }
      return keys
    },
    schema: `  /**
   * オンラインチェックインが開く時刻。出発の「何分前か」を分単位の整数で。
   * 出発の 24 時間前に開くなら 1440。時刻ではなく分数であることに注意。
   * missing に無ければ、この欄ごと省いてください
   */
  onlineCheckInOpensMinutesBefore?: number | null
  /**
   * 搭乗手続き(チェックイン)の締切。出発の「何分前か」を分単位の整数で。
   * 出発の 60 分前に締め切られるなら 60。時刻ではなく分数であることに注意。
   * missing に無ければ、この欄ごと省いてください
   */
  checkInClosesMinutesBefore?: number | null
  /**
   * 受託手荷物(預け入れ荷物)の預け締切。同じく出発の「何分前か」を分で。
   * 搭乗手続きより早く締め切られることが多く、別の値になります。
   * missing に無ければ、この欄ごと省いてください
   */
  bagDropClosesMinutesBefore?: number | null`,
    rule: `**搭乗手続きの締切・受託手荷物の締切・オンラインチェックインの開放時刻の 3 項目
   (onlineCheckInOpensMinutesBefore / checkInClosesMinutesBefore /
   bagDropClosesMinutesBefore)は、予約データに無くても調べて埋めてかまいません。**
${AIRLINE_TIMING_FILL_RULE}`,
  },
  {
    id: 'placeLatinName',
    label: '場所のラテン文字表記',
    missingKeys: (booking) =>
      PLACE_SLOTS.filter((slot) => {
        const place = booking[slot]
        return place !== undefined && place.latinName === undefined
      }).map((slot) => `${slot}.latinName`),
    helperTypes: `interface PlacePatch {
  /** 渡した name をそのまま返してください。変えないこと */
  name: string
  /** ラテン文字表記 */
  latinName: string | null
}`,
    schema: `  /**
   * 場所のラテン文字表記を返す欄。missing に 'from.latinName' のように
   * 挙がっているものだけを返し、挙がっていない欄は省いてください
   */
  from?: PlacePatch
  to?: PlacePatch
  place?: PlacePatch`,
    rule: `**場所のラテン文字表記(PlacePatch.latinName)も、予約データに無くても
   その場所の一般的なラテン文字表記で埋めてかまいません。**
${LATIN_NAME_FILL_RULE}`,
  },
  // 荷物枠(baggage)は BACKFILL に載せない。
  // 許容量は予約確認書にしか載らず、航空会社の一般規定では埋められない
  // (締切 3 項目のルール 8 のような例外にしない)。穴埋めプロンプトは
  // 登録済みデータだけで埋める想定なので、ここに載せると「全部 null」が並ぶだけになる。
  // 初回取り込み(buildImportPrompt)のスキーマ側で拾う。
]

/**
 * 国情報の欄 1 つぶんの定義。
 *
 * read を持たせてあるのは、キーの文字列から CountryInfo を引くと型が効かなくなり、
 * 綴りを間違えても「いつまでも埋まらない穴」としてしか現れないため。
 * ここで直接読んでおけば、フィールド名を変えたときにコンパイルが止まる。
 */
interface CountryInfoFillField {
  key: string
  label: string
  read: (country: CountryInfo) => string | undefined
}

const COUNTRY_INFO_FILL_FIELD_DEFS: ReadonlyArray<CountryInfoFillField> = [
  { key: 'plugTypes', label: 'プラグ形状', read: (c) => c.plugTypes },
  { key: 'voltage', label: '電圧・周波数', read: (c) => c.voltage },
  { key: 'tipping', label: 'チップの文化', read: (c) => c.tipping },
  { key: 'emergencyPolice', label: '警察', read: (c) => c.emergencyPolice },
  {
    key: 'emergencyAmbulance',
    label: '救急・消防',
    read: (c) => c.emergencyAmbulance,
  },
]

/**
 * 国情報のうち、一般知識で埋めてよい欄。ここに載っている欄だけが穴として数えられる。
 *
 * BACKFILL_FIELDS と同じ役目(A / B の区別の実体)を国情報について果たす。
 * name はそもそも人間しか入れられないので載せない。latinName と note も載せない
 * (理由はファイル冒頭の「なぜ国の latinName は埋めさせないのか」を参照。note は
 * 利用者の自由記述で、埋めるべき正解が存在しない)。
 */
export const COUNTRY_INFO_FILL_FIELDS: ReadonlyArray<{
  key: string
  label: string
}> = COUNTRY_INFO_FILL_FIELD_DEFS

/** 穴のある予約 1 件と、その予約で欠けている項目 */
export interface BackfillTarget {
  booking: Booking
  /** この予約で欠けている項目(BACKFILL_FIELDS の部分集合) */
  fields: Array<BackfillField>
  /** 欠けているキー。プロンプトの missing にそのまま載る */
  missingKeys: Array<string>
}

/** 項目ごとの、穴が空いている予約の件数 */
export interface BackfillFieldCount {
  field: BackfillField
  bookingCount: number
}

/** 穴のある国 1 件と、その国で空のままの欄 */
export interface CountryInfoGap {
  country: CountryInfo
  /** 空のままの欄。プロンプトの missing にそのまま載る */
  missingKeys: Array<string>
}

export interface BackfillGaps {
  /** 穴のある予約だけ。穴が無ければ空 */
  targets: Array<BackfillTarget>
  /** UI が「どの項目が何件か」を出すための内訳。件数 0 の項目は含まない */
  countsByField: Array<BackfillFieldCount>
  /** 穴のある予約の件数 */
  bookingCount: number
  /** 旅程単位の穴。登録済みの国のうち、空の欄があるものだけ */
  countries: Array<CountryInfoGap>
  /**
   * 登録済みの国の件数。0 なら UI が「国名を登録すると埋められます」の導線を出す。
   *
   * countries.length と別に返しているのは、この 2 つが違うことを意味するため。
   * countries が空でも countryCount が 1 以上なら「登録済みで、もう全部埋まっている」、
   * countryCount が 0 なら「まだ 1 件も教えてもらっていない」で、
   * 画面に出すべき言葉が正反対になる。
   */
  countryCount: number
}

/**
 * 欄が空か。undefined だけでなく、空白だけの文字列も空として扱う。
 *
 * 利用者が一度入れた値を消したとき、フィールドごと消えるとは限らず空文字が残りうる
 * (入力欄は文字列を持ち続けるため)。undefined しか見ないと、画面では空に見えるのに
 * 穴として数えられない欄ができ、その欄には穴埋めの導線が永遠に届かなくなる。
 */
function isBlankField(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0
}

/**
 * 登録済みの国のうち、空の欄があるものを洗い出す。
 *
 * 登録が 1 件も無いときに空を返すのは「穴が無い」ではなく「まだ何も教えて
 * もらっていない」の表現である(ファイル冒頭の「訪問国の推定はしない」を参照)。
 * その区別は countryCount のほうが持つ。
 */
function findCountryInfoGaps(state: TripNotesState): Array<CountryInfoGap> {
  const gaps: Array<CountryInfoGap> = []

  for (const country of state.countryInfos ?? []) {
    const missingKeys = COUNTRY_INFO_FILL_FIELD_DEFS.filter((field) =>
      isBlankField(field.read(country)),
    ).map((field) => field.key)
    if (missingKeys.length === 0) continue
    gaps.push({ country, missingKeys })
  }

  return gaps
}

/**
 * 穴埋めの対象になる予約・項目と、旅程単位(国)の穴を洗い出す。
 *
 * キャンセル済みは除く。キャンセルした宿の締切を埋めても誰の役にも立たないうえ、
 * 「もう行かない予約」のために外部のチャットへデータを渡すことになる
 * (aiPrompt.ts が登録済み一覧からキャンセル済みを外しているのと同じ考え)。
 * 開始日時が壊れていて読めない予約も除く。プロンプトに載せる date / time / tz が
 * 作れないので、そもそも識別情報を渡せない。
 * 国のほうにはこの手の除外が無い。国情報は日時も状態も持たない、名前と欄だけの
 * 入れ物なので、除くべき理由が生まれない。
 */
export function findBackfillGaps(state: TripNotesState): BackfillGaps {
  const targets: Array<BackfillTarget> = []

  for (const booking of state.bookings) {
    if (booking.status === 'cancelled') continue
    if (tryParseStamp(booking.start) === null) continue

    const fields: Array<BackfillField> = []
    const missingKeys: Array<string> = []
    for (const field of BACKFILL_FIELDS) {
      const keys = field.missingKeys(booking)
      if (keys.length === 0) continue
      fields.push(field)
      missingKeys.push(...keys)
    }
    if (fields.length === 0) continue

    targets.push({ booking, fields, missingKeys })
  }

  const countsByField = BACKFILL_FIELDS.map((field) => ({
    field,
    bookingCount: targets.filter((target) => target.fields.includes(field))
      .length,
  })).filter((count) => count.bookingCount > 0)

  return {
    targets,
    countsByField,
    bookingCount: targets.length,
    countries: findCountryInfoGaps(state),
    countryCount: (state.countryInfos ?? []).length,
  }
}

/** プロンプトに載せる場所。名前だけ渡す(住所や現地語表記は穴埋めに要らない) */
interface PayloadPlace {
  name: string
}

/**
 * プロンプトに載せる予約 1 件ぶん。
 *
 * kind / title / start は識別のための欄で、planImport が既存の予約を見つける鍵
 * (確認番号が無いときの「kind + 開始日 + タイトル」)と一致させてある。
 * from / to / place は識別ではなく手掛かりとして渡す。どの空港のどの航空会社かが
 * 分からなければ締切の規定は引けないし、ラテン文字表記も元の名前が要る。
 */
interface PayloadBooking {
  kind: string
  title: string
  start: { date: string; time: string | null; tz: string }
  from?: PayloadPlace
  to?: PayloadPlace
  place?: PayloadPlace
  missing: Array<string>
}

function toPayload(target: BackfillTarget): PayloadBooking | null {
  const zdt = tryParseStamp(target.booking.start)
  if (zdt === null) return null

  const places: Partial<Record<(typeof PLACE_SLOTS)[number], PayloadPlace>> = {}
  for (const slot of PLACE_SLOTS) {
    const place = target.booking[slot]
    if (place !== undefined) places[slot] = { name: place.name }
  }

  // JSON.stringify はキーを入れた順に書き出す。missing を最後に置くことで、
  // AI が読む順が「何の予約か」→「何が足りないか」になる
  return {
    kind: target.booking.kind,
    title: target.booking.title,
    start: {
      date: zdt.toPlainDate().toString(),
      // 終日の予約は現地 00:00 を持っているが、それは時刻の指定ではないので
      // null として渡す。00:00 のまま渡すと AI が「深夜 0 時発」と読んでしまう
      time: target.booking.start.allDay
        ? null
        : `${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`,
      tz: zdt.timeZoneId,
    },
    ...places,
    missing: target.missingKeys,
  }
}

/**
 * プロンプトに載せる国 1 件ぶん。
 *
 * name は識別のための欄で、planCountryInfoImport が既存の国を見つける鍵。
 * latinName は識別には使わないが、入っていれば送る。利用者が略称や通称で
 * 書いていても(「イギリス」「英国」)、ラテン文字表記が併記されていれば
 * AI がどの国かを取り違えにくくなる。入っていなければ省く
 * (無い情報の代わりに空文字を送ると、AI がそれを「空にせよ」と読みかねない)。
 */
interface PayloadCountry {
  name: string
  latinName?: string
  missing: Array<string>
}

function toCountryPayload(gap: CountryInfoGap): PayloadCountry {
  // 予約側と同じく、missing を最後に置いて「何の国か」→「何が足りないか」の順にする
  return {
    name: gap.country.name,
    ...(gap.country.latinName === undefined
      ? {}
      : { latinName: gap.country.latinName }),
    missing: gap.missingKeys,
  }
}

/**
 * 国のパッチの出力スキーマ。
 *
 * BookingPatch のように穴のある欄だけを組み立てるのではなく、5 欄すべてを
 * 型として載せている。国情報の欄は 5 つしかなく、しかも 1 つの国で複数が同時に
 * 空いているのが普通なので、載せる欄を絞っても短くならないうえ、国ごとに
 * 違う型定義を作ると「どの国にどの欄が許されているのか」が読めなくなる。
 * どの欄を埋めるかは、各国の missing が決める。
 */
/**
 * 国のパッチの出力スキーマ。buildImportPrompt が国の穴があるときだけ載せる。
 */
export const COUNTRY_INFO_PATCH_TYPE = `interface CountryInfoPatch {
  /** 渡した name をそのまま返してください。1 文字も変えないこと(照合に使います) */
  name: string
  /** プラグ形状 (例: 'A / C')。missing に無ければ、この欄ごと省いてください */
  plugTypes?: string | null
  /** 電圧・周波数 (例: '230V 50Hz') */
  voltage?: string | null
  /** チップの文化 */
  tipping?: string | null
  /** 警察の緊急通報番号 (例: '112') */
  emergencyPolice?: string | null
  /** 救急・消防の緊急通報番号 */
  emergencyAmbulance?: string | null
  /** その値をどう決めたかの根拠。項目名をキーにする */
  evidence: { [key: string]: string }
}`

/**
 * 統合プロンプト(buildImportPrompt)に差し込む、空き欄まわりの材料。
 * 穴が 1 つも無ければ null(プロンプトから gap 節ごと省く)。
 */
export interface GapPromptContext {
  bookingPayloads: Array<PayloadBooking>
  countryPayloads: Array<PayloadCountry>
  usedFields: Array<BackfillField>
  hasBookings: boolean
  hasCountries: boolean
}

/**
 * プロンプトに載せる gap 用の payload を組み立てる。
 * 検出は findBackfillGaps と同じなので、UI の内訳とプロンプトの対象がずれない。
 */
export function getGapPromptContext(
  state: TripNotesState,
): GapPromptContext | null {
  const gaps = findBackfillGaps(state)

  const bookingPayloads = gaps.targets
    .map(toPayload)
    .filter((payload): payload is PayloadBooking => payload !== null)
  const countryPayloads = gaps.countries.map(toCountryPayload)

  const hasBookings = bookingPayloads.length > 0
  const hasCountries = countryPayloads.length > 0
  if (!hasBookings && !hasCountries) return null

  const usedFields = hasBookings
    ? BACKFILL_FIELDS.filter((field) =>
        gaps.targets.some((target) => target.fields.includes(field)),
      )
    : []

  return {
    bookingPayloads,
    countryPayloads,
    usedFields,
    hasBookings,
    hasCountries,
  }
}
