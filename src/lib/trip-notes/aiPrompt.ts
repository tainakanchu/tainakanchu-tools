/**
 * AI へ貼り付ける**唯一の**プロンプトを組み立てる層。
 *
 * 以前は「書類から抽出」(このファイル)と「登録済みの穴埋め」(backfillPrompt.ts)
 * の 2 本だったが、貼り戻し口もマージ経路も同じなのに文面が分かれていると、
 * 荷物枠のような新フィールドが片方にしか載らない・利用者が 2 回往復する、
 * といったずれが起きる。いまは buildImportPrompt 1 本に統合した。
 *
 * 設計判断:
 * - アプリから外部 API を呼ばない。プロンプトを生成して利用者にコピーさせ、
 *   利用者が普段使っている ChatGPT / Claude / Gemini に貼って実行してもらい、
 *   返ってきた JSON を貼り戻す方式にする。
 * - 1 回の実行でできること:
 *   1. 添付された予約確認書から予約を抽出する
 *   2. 書類が無くても、登録済みで空いている「一般知識で埋まる欄」を埋める
 *   3. 返した JSON は parseImportedJson → planImport で既存にマージされ、
 *      アプリ上の旅程の新しい版になる(丸ごと置換ではない)
 * - AI には Stamp を直接書かせない(date / time / tz に分ける)。
 * - スキーマは TypeScript の型定義として渡す。
 */

import { COUNTRY_INFO_PATCH_TYPE, getGapPromptContext } from './backfillPrompt'
import { getDeviceTz, tryParseStamp } from './datetime'
import {
  AIRLINE_TIMING_FILL_RULE,
  COUNTRY_INFO_FILL_RULE,
  LATIN_NAME_FILL_RULE,
} from './promptRules'
import {
  BOOKING_KINDS,
  BOOKING_STATUSES,
  FIELD_KEYS,
  PAYMENT_STATUSES,
} from './storage'
import type { Booking, TripNotesState } from './types'

// テストと呼び出し側がこれまで aiPrompt から import していた名前を維持する
export { AIRLINE_TIMING_FILL_RULE, LATIN_NAME_FILL_RULE } from './promptRules'

export interface AiServiceLink {
  id: string
  label: string
  /** 新しい会話を開く URL。UI がボタンとして並べる */
  url: string
  /** 添付の得意不得意など、利用者が選ぶときの手掛かり */
  hint: string
}

/**
 * プロンプトを貼り付ける先の候補。
 * どれも「新しい会話を開く」URL を指す。既存の会話に貼ると、
 * 前の話題を引きずって余計な前置きが増えるため。
 */
export const AI_SERVICE_LINKS: Array<AiServiceLink> = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    url: 'https://chatgpt.com/',
    hint: 'PDF・画像の添付に対応',
  },
  {
    id: 'claude',
    label: 'Claude',
    url: 'https://claude.ai/new',
    hint: 'PDF・画像の添付に対応',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    url: 'https://gemini.google.com/app',
    hint: 'PDF・画像の添付に対応',
  },
]

export interface BuildPromptOptions {
  /**
   * 登録済みの予約の一覧をプロンプトに含めるか(既定: true)。
   * 同じ確認メールを二度読ませたときの重複登録を防ぐために効くが、
   * 予約が増えるとプロンプトが長くなるので切れるようにしておく。
   */
  includeExistingBookings?: boolean
  /** 列挙する登録済み予約の上限(既定: 20)。これを超えた分は件数だけ伝える */
  maxExistingBookings?: number
  /** 利用者の基準タイムゾーン。既定は state.pinnedTz、無ければデバイスのもの */
  deviceTz?: string
}

/** 'a' | 'b' 形式の TypeScript ユニオン型リテラルを作る */
function unionLiteral(values: ReadonlyArray<string>): string {
  return values.map((value) => `'${value}'`).join(' | ')
}

/** 登録済み予約の 1 行表記。日付とタイトル、分かれば場所も添える */
function existingBookingLine(booking: Booking): string {
  const zdt = tryParseStamp(booking.start)
  const date = zdt === null ? '日付不明' : zdt.toPlainDate().toString()
  const place = booking.place ?? booking.to ?? booking.from
  const suffix = place === undefined ? '' : `(${place.name})`
  return `- ${date} ${booking.title}${suffix}`
}

/**
 * AI インポート用の唯一のプロンプトを組み立てる。
 *
 * 返ってきた JSON をアプリに貼ると、既存の予約・国情報とマージされて
 * 旅程の新しい版になる(planImport)。丸ごと置換ではない。
 */
export function buildImportPrompt(
  state: TripNotesState,
  opts: BuildPromptOptions = {},
): string {
  const {
    includeExistingBookings = true,
    maxExistingBookings = 20,
    deviceTz,
  } = opts
  const baseTz = deviceTz ?? state.pinnedTz ?? getDeviceTz()

  const kindUnion = unionLiteral(BOOKING_KINDS)
  const statusUnion = unionLiteral(BOOKING_STATUSES)
  const paymentUnion = unionLiteral(PAYMENT_STATUSES)
  const evidenceUnion = unionLiteral(FIELD_KEYS)

  const title = state.tripTitle.trim()
  const contextLines = [
    title.length > 0 ? `- 旅行名: ${title}` : null,
    `- 旅行期間: ${state.startDate} 〜 ${state.endDate}`,
    `- 利用者の基準タイムゾーン: ${baseTz}`,
  ].filter((line): line is string => line !== null)

  // キャンセル済みは「登録済みだが生きていない予約」なので重複判定から外す。
  const activeBookings = state.bookings.filter(
    (booking) => booking.status !== 'cancelled',
  )
  const shown = activeBookings.slice(0, maxExistingBookings)
  const rest = activeBookings.length - shown.length

  const existingSection =
    includeExistingBookings && shown.length > 0
      ? [
          '',
          '## すでに登録済みの予約',
          '以下はすでにアプリに登録済みです。同じ予約を**新しい件として重ねて出力しないでください**。',
          '同じ予約の欄を更新する場合は、同じ kind / title / start(と確認番号があればそれ)で 1 件返し、',
          'アプリが突き合わせてマージします。',
          ...shown.map(existingBookingLine),
          rest > 0 ? `- (ほか ${rest} 件)` : null,
        ]
          .filter((line): line is string => line !== null)
          .join('\n')
      : ''

  const gaps = getGapPromptContext(state)
  const gapSection = gaps === null ? '' : formatGapSection(gaps)

  const countryInOutput = gaps?.hasCountries === true
  const outputType = countryInOutput
    ? 'Array<ExtractedBooking | CountryInfoPatch>'
    : 'Array<ExtractedBooking>'
  const countryTypeBlock = countryInOutput
    ? `\n\n${COUNTRY_INFO_PATCH_TYPE}\n`
    : ''
  const discriminationNote = countryInOutput
    ? `
予約と国のパッチは、**1 つの配列に混ぜて返してかまいません**。
アプリは形で見分けます。**予約には \`kind\` と \`start\` があり、
国のパッチにはそのどちらも無く \`name\` があります。**
2 つの配列に分けないでください。
`
    : ''

  const countryRule = countryInOutput
    ? `
10. **国の基本情報(plugTypes / voltage / tipping / emergencyPolice /
   emergencyAmbulance)は、登録済みで空いている国について一般知識で埋めてかまいません。**
${COUNTRY_INFO_FILL_RULE}
   国の name は 1 文字も変えずそのまま返すこと。ここに無い国を新しく足さないこと。`
    : ''

  return `あなたは旅行の予約データを JSON に整える専門アシスタントです。

## 何をするのか
1. **このメッセージのあとに添付・貼り付けされる予約確認書**(メール、PDF、画面のスクショなど)があれば、
   そこから予約を読み取り、下記スキーマのオブジェクトとして出力してください。
2. **添付が無くても**、「登録済みで空いている欄」に挙がっている項目は、
   一般知識(航空会社・空港の公開規定、地名の一般表記、国の電源・緊急通報など)で埋めてかまいません。
3. 返した JSON はアプリに貼られ、**既存の旅程にマージされて新しい版**になります。
   既存の値を全部書き写して差し替える必要はありません。新規の予約か、更新したい欄だけを返してください。

## 旅行のコンテキスト
${contextLines.join('\n')}
- 年が明記されていない日付は、この旅行期間に収まるように解釈してください。
${existingSection}
${gapSection}
## 出力スキーマ
\`\`\`ts
/** 現地の壁時計時刻。UTC に変換しないでください */
interface DateTimeInput {
  /** 現地の暦日。必ず 'YYYY-MM-DD' 形式 */
  date: string
  /** 現地の時刻。必ず 24 時間制の 'HH:mm' 形式。時刻の記載がなければ null */
  time: string | null
  /** IANA タイムゾーン名(例 'Europe/Paris')。判断できなければ null */
  tz: string | null
}

interface PlaceInput {
  /** 施設名・駅名・空港名など */
  name: string
  /** 現地語表記。書類にあればそのまま。なければ null */
  localName: string | null
  /**
   * ラテン文字表記。外部の検索サイトに渡すためだけに使う欄で、画面には出しません。
   * ルール 9 の例外規定を必ず読むこと
   */
  latinName: string | null
  /** 住所。なければ null */
  address: string | null
}

interface ExtractedBooking {
  kind: ${kindUnion}
  /** 一覧で識別できる短い見出し(例: 'AF276 HND→CDG', 'Hotel Le Marais') */
  title: string
  /** 出発・チェックイン・開始の日時 */
  start: DateTimeInput
  /** 到着・チェックアウト・終了の日時。単発の予定なら null */
  end: DateTimeInput | null
  /** 移動の出発地。移動でなければ null */
  from: PlaceInput | null
  /** 移動の到着地。移動でなければ null */
  to: PlaceInput | null
  /** 宿泊・アクティビティの場所。移動なら null */
  place: PlaceInput | null
  /** 予約の確定度。判断できなければ null */
  status: ${statusUnion} | null
  /** 支払い状況。判断できなければ null */
  payment: ${paymentUnion} | null
  /** 予約番号・確認番号。なければ null */
  confirmationNumber: string | null
  /** 予約サイト・航空会社・ホテル名などの提供元。なければ null */
  provider: string | null
  /** 金額。amount は数値のみ、currency は ISO 4217(例 'EUR')。なければ null */
  price: { amount: number; currency: string } | null
  /** 無料キャンセル期限。'YYYY-MM-DD' 形式。なければ null */
  freeCancelUntil: string | null
  /**
   * オンラインチェックインが開く時刻。出発の「何分前か」を分単位の整数で。
   * 出発の 24 時間前に開くなら 1440。時刻ではなく分数であることに注意。
   * 移動の予約でなければ null。ルール 8 の例外規定を必ず読むこと
   */
  onlineCheckInOpensMinutesBefore: number | null
  /**
   * 搭乗手続き(チェックイン)の締切。出発の「何分前か」を分単位の整数で。
   * 出発の 60 分前に締め切られるなら 60。移動の予約でなければ null。ルール 8
   */
  checkInClosesMinutesBefore: number | null
  /**
   * 受託手荷物の預け締切。出発の「何分前か」を分で。移動でなければ null。ルール 8
   */
  bagDropClosesMinutesBefore: number | null
  /**
   * 荷物枠(許容量)。預け締切とは別。「何を・何個・何 kg 持っていけるか」。
   * **書類に枠の記載があるときだけ**埋める。無ければ null。
   * 航空会社の一般規定での推測は禁止(ルール 1)。推測は禁止。
   * pieces: 0 は「無料枠なし」(未記載とは違う)。
   */
  baggage: {
    personal: {
      pieces: number | null
      weightKg: number | null
      dimensions: string | null
      note: string | null
    } | null
    cabin: {
      pieces: number | null
      weightKg: number | null
      dimensions: string | null
      note: string | null
    } | null
    checked: {
      pieces: number | null
      weightKg: number | null
      dimensions: string | null
      note: string | null
    } | null
  } | null
  /** 上記に収まらない補足(部屋タイプ、座席、待ち合わせ場所など)。なければ null */
  note: string | null
  /** 判断根拠として引用した原文の該当箇所 */
  evidence: { [key in ${evidenceUnion}]?: string }
}
${countryTypeBlock}
type Output = ${outputType}
\`\`\`
${discriminationNote}
## 規則
1. **不明な項目は必ず null にしてください。推測で埋めないこと。**
   書類に書かれていない確認番号・料金・座席・荷物枠をそれらしく補うのは、
   空欄のまま残すよりはるかに有害です。
   (例外はルール 8・9${countryInOutput ? '・10' : ''} だけです)
2. **書類があるときは、書類に書かれている現地の壁時計時刻をそのまま**使ってください。
   UTC に変換しないこと。'+02:00' のようなオフセットは書かないこと。
3. tz は IANA タイムゾーン名で書いてください(例: パリ→'Europe/Paris')。
   都市が特定できない場合は null。推測しないこと。
4. 移動は start.tz が出発地、end.tz が到着地です。国際線では両者が異なるのが普通です。
5. **1 つの書類に複数の予約が含まれる場合は、配列で複数返してください。**
   往復は往路と復路で 2 件、乗り継ぎは区間ごとに 1 件。
6. evidence には、とくに日時とタイムゾーンの根拠になった原文を短く引用してください
   (各 20〜60 文字。訳さず原文のまま)。一般知識で埋めた場合は、
   どの規定・どの土地の表記・どの国の事実から引いたかを書いてください。
7. 書類から予約が 1 件も見つからず、空き欄も埋められないときは、空の配列 [] を返してください。
8. **搭乗手続きの締切・受託手荷物の締切・オンラインチェックインの開放時刻の 3 項目
   (checkInClosesMinutesBefore / bagDropClosesMinutesBefore /
   onlineCheckInOpensMinutesBefore)はルール 1 の例外で、
   書類に書かれていなくても調べて埋めてかまいません。**
${AIRLINE_TIMING_FILL_RULE}
9. **場所のラテン文字表記(PlaceInput.latinName)も、ルール 1 の例外です。
   書類に無くても、その場所の一般的なラテン文字表記で埋めてかまいません。**
${LATIN_NAME_FILL_RULE}
${countryRule}

## 出力形式
\`\`\`json フェンスで囲んだ JSON 配列**のみ**を出力してください。
前置き・解説・要約・確認の問いかけは一切不要です。
`
}

function formatGapSection(
  gaps: NonNullable<ReturnType<typeof getGapPromptContext>>,
): string {
  const parts: Array<string> = [
    '',
    '## 登録済みで空いている欄',
    'アプリに登録済みだが、まだ値が入っていない欄です。',
    '**書類が無くても**、次に挙がっている欄だけは一般知識で埋めて返してかまいません。',
    '座席番号・運賃クラス・受託手荷物の個数(荷物枠)・朝食の有無など、',
    '**その予約の書類にしか書かれていない情報は、書類が無いときに捏造しないでください。**',
  ]

  if (gaps.hasBookings) {
    parts.push(
      '',
      '### 予約の空き欄',
      '各予約の `missing` が空いているキーです。照合のため **kind / title / start と場所の name は 1 文字も変えず**そのまま返してください。',
      '1 文字でも変わると新しい予約として二重に増えます。',
      '',
      '```json',
      JSON.stringify(gaps.bookingPayloads, null, 2),
      '```',
    )
  }

  if (gaps.hasCountries) {
    parts.push(
      '',
      '### 国・地域の空き欄',
      '各国の `missing` が空いているキーです。**name は 1 文字も変えず**そのまま返してください。',
      'ここに無い国を足さないでください。',
      '',
      '```json',
      JSON.stringify(gaps.countryPayloads, null, 2),
      '```',
    )
  }

  return parts.join('\n')
}
