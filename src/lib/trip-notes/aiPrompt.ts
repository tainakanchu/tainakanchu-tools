/**
 * 予約確認書から予約情報を抽出させるための、AI へ貼り付けるプロンプトを組み立てる層。
 *
 * 設計判断:
 * - アプリから外部 API を呼ばない。プロンプトを生成して利用者にコピーさせ、
 *   利用者が普段使っている ChatGPT / Claude / Gemini に貼って実行してもらい、
 *   返ってきた JSON を貼り戻す方式にする。
 *   API キーが要らず、利用者がすでに払っているサブスクをそのまま使え、
 *   プロバイダにも依存しない。PDF の添付は各社の公式アプリのほうが確実に扱える。
 *   なにより、このアプリ自体は一切ネットワークに出ない。
 * - AI には Stamp("2026-09-12T14:20:00+02:00[Europe/Paris]")を直接書かせない。
 *   夏時間の有無でオフセットが変わるため、+02:00 と +01:00 の取り違えが高確率で起きる。
 *   date / time / tz を分けた素朴な形で出させ、オフセットの計算は
 *   こちら側の Temporal(makeStamp)に任せる。
 * - スキーマは散文ではなく TypeScript の型定義として渡す。LLM には型定義を貼るのが
 *   もっとも効く。かつ kind / status / payment の候補値は storage.ts の定数配列から
 *   動的に生成し、型定義とプロンプトの記述がズレないようにする。
 */

import { getDeviceTz, tryParseStamp } from './datetime'
import {
  BOOKING_KINDS,
  BOOKING_STATUSES,
  FIELD_KEYS,
  PAYMENT_STATUSES,
} from './storage'
import type { Booking, TripNotesState } from './types'

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
 * 抽出用プロンプトを組み立てる。
 *
 * 「不明なら null」を繰り返し強調しているのは、LLM が空欄を嫌って
 * それらしい値をでっち上げる傾向があるため。捏造された確認番号や
 * 推測で埋められた到着時刻は、空欄よりはるかに危険である。
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
  // 同じ確認メールを読み直して復活させたい場面のほうが多い。
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
          '以下はすでにアプリに登録済みです。同じ予約を重ねて出力しないでください。',
          ...shown.map(existingBookingLine),
          rest > 0 ? `- (ほか ${rest} 件)` : null,
        ]
          .filter((line): line is string => line !== null)
          .join('\n')
      : ''

  return `あなたは旅行の予約確認書から予約情報を抽出する専門アシスタントです。
このメッセージのあとに貼り付ける、または添付するもの(予約確認メール、予約票の PDF、
予約画面のスクリーンショットなど)を読み取り、下記のスキーマに従った JSON だけを出力してください。

## 旅行のコンテキスト
${contextLines.join('\n')}
- 年が明記されていない日付は、この旅行期間に収まるように解釈してください。
${existingSection}

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
  /** 上記に収まらない補足(部屋タイプ、座席、待ち合わせ場所など)。なければ null */
  note: string | null
  /** 判断根拠として引用した原文の該当箇所 */
  evidence: { [key in ${evidenceUnion}]?: string }
}

type Output = Array<ExtractedBooking>
\`\`\`

## 抽出ルール
1. **不明な項目は必ず null にしてください。推測で埋めないこと。**
   書類に書かれていない確認番号・料金・時刻をそれらしく補うのは、
   空欄のまま残すよりはるかに有害です。読み取れなかったものは null です。
2. **時刻は書類に書かれている現地の壁時計時刻をそのまま**使ってください。
   UTC に変換しないこと。'+02:00' のようなオフセットは書かないこと。
   オフセットはアプリ側が tz から正しく計算します。
3. tz は IANA タイムゾーン名で書いてください。出発地・到着地・宿泊地の
   都市名から判断します(例: パリ→'Europe/Paris'、羽田→'Asia/Tokyo')。
   都市が特定できない場合は null にしてください。推測しないこと。
4. 移動は出発地と到着地でタイムゾーンが変わります。start.tz は出発地、
   end.tz は到着地のタイムゾーンです。国際線では両者が異なるのが普通です。
5. **1 つの書類に複数の予約が含まれる場合は、配列で複数返してください。**
   往復航空券は往路と復路で 2 件、乗り継ぎ便は区間ごとに 1 件、
   送迎付きホテルは宿泊と送迎で 2 件、というように分けます。
6. evidence には、とくに**日時とタイムゾーンをそう判断した根拠**になった
   原文の該当箇所を短く引用してください(各 20〜60 文字程度)。
   人間があとで原文と照合するために使います。訳さず原文のまま引用してください。
7. 該当する予約が 1 件も見つからなければ、空の配列 [] を返してください。

## 出力形式
\`\`\`json フェンスで囲んだ JSON 配列**のみ**を出力してください。
前置き・解説・要約・確認の問いかけは一切不要です。
`
}
