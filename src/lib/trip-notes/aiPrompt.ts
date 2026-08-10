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

/**
 * 搭乗手続き・受託手荷物の締切と、オンラインチェックインの開放時刻。
 * この 3 項目を「書類に書かれていなくても調べて埋めてよい」とする例外規定の本文。
 *
 * ■ なぜ定数に切り出してあるのか
 *   この規則は、予約確認書から抽出するプロンプト(buildImportPrompt のルール 8)と、
 *   すでに登録済みの予約の穴を埋めるプロンプト(backfillPrompt.ts)の両方が使う。
 *   同じ規則を 2 か所に書き写すと、片方だけ直されて規則が割れる。しかも割れた
 *   結果として緩いほうのプロンプトから「一般に 60 分前」のような汎用の値が
 *   静かに混ざり始めても、入った値を見ただけではどちらのプロンプト経由なのか
 *   区別できない。文面は 1 つしか存在しない状態を保つ。
 *
 * ■ なぜ締切と開放時刻を 1 つの規則にまとめてあるのか
 *   3 項目とも根拠が同じ「航空会社と空港が公開している規定」で、埋め方の手順
 *   (書類の記載を最優先 → 無ければ公開規定 → 特定できなければ null)も、
 *   evidence に求めるものも完全に同じだから。規則を 2 つに割ると、上に書いた
 *   「片方だけ直されて割れる」がこのファイルの中で起きる。
 *   3 項目で違うのは「情報が割れたときにどちらへ倒すか」だけなので、
 *   そこだけを小規則 4 で分けている。
 *
 * ■ ここに入っていないもの
 *   先頭の 1 行(何の例外なのか)は入れていない。プロンプトごとにルールの番号も
 *   前提(書類を読むのか、登録済みのデータだけを見るのか)も違うため、
 *   そこは呼び出し側が書く。ここにあるのは「どう埋めるか」の規則だけ。
 *   行頭の 3 スペースは、番号付きリスト(`8. `)のぶら下げに合わせてある。
 */
export const AIRLINE_TIMING_FILL_RULE = `   例外にする理由は、この 3 つが他の項目と性質が違うからです。到着時刻や確認番号は
   「この予約にしか存在しない事実」なので、推測した値は乗り遅れや窓口での取り違えに
   直結します。一方この 3 つは**航空会社と空港が公開している規定**であり、
   予約確認書に印刷されていなくても調べられる種類の情報です。しかも外れたときの
   実害も小さく済みます。締切は早い側(実際より手前の締切)に外れるので「余分に待つ」で
   済み、開放時刻は遅い側に外れても、席を取りに行くのが少し遅れるだけで
   その便には乗れます。
   ただし、埋めてよいのは次をすべて守る場合だけです。
   1. 予約確認書に締切や開放時刻の記載があれば、**必ずそれを最優先**してください。
      規定より書類の記載が優先です。
   2. 記載が無ければ、**その空港・その航空会社・その路線種別(国内線/国際線)**の
      公開規定を使ってください。**締切も開放時刻も空港ごと・航空会社ごとに違います。**
      同じ航空会社でも空港が変われば違い、同じ空港でも航空会社が変われば違います。
      「一般に 60 分前」「一般に 24 時間前」のような、どこにでも当てはまる汎用の値で
      埋めてはいけません。
   3. その空港・その航空会社について特定できなければ **null** にしてください。
      分からないときに汎用の値を入れるのは、禁じられている推測と同じことです。
   4. 情報が割れたときは、**その時刻に行動しても間に合わなかった、が起きない側**に
      倒してください。締切なら**厳しい側(締切が早いほう)**、開放時刻なら
      **遅い側(まだ開いていないと見ておくほう)**です。向きは逆に見えますが、
      どちらも「その時刻に動いた利用者が空振りしない側」という 1 つの原則です。
   5. evidence には根拠を必ず書いてください。**予約確認書からの引用なのか、
      調べた公開規定なのか**が後から読んで区別できるように書き、
      規定なら「どこの何の規定か(航空会社名・空港名・路線種別)」まで含めてください。`

/**
 * 場所のラテン文字表記を「書類に無くても埋めてよい」とする例外規定の本文。
 * 切り出してある理由と、先頭の 1 行が入っていない理由は
 * AIRLINE_TIMING_FILL_RULE と同じ。
 */
export const LATIN_NAME_FILL_RULE = `   例外にする理由は、これが「この予約にしか存在しない事実」ではなく、
   その土地について広く知られている表記だからです。しかも外れたときに変わるのは
   外部の検索サイトでの検索結果だけで、時刻や予約番号のように乗り遅れや
   当日のトラブルには直結しません。この欄は画面表示には使わず、
   経路検索サイトのような**外部サービスに地名を渡すためだけ**に使います。
   利用者は地名を日本語で書くため、この欄が無いと英語圏のサイトで
   地名が解決できず、リンクが空振りします。
   1. 予約確認書にラテン文字の表記があれば、**必ずそれを最優先**してください。
      空港コードや英語表記が併記されていることが多く、書類にある表記が
      その予約ではいちばん確実です。
   2. 無ければ、その場所の一般的なラテン文字表記を使ってください。
      英語名である必要はありません(現地の綴りのままでかまいません)。
   3. **都市名を優先してください。** 外部の検索サイト、とくに区間の比較サイトは
      都市の単位で場所を解決するため、施設名より都市名のほうが当たります
      (例: '香港国際空港 T2' なら 'Hong Kong')。ただし空港のように
      施設そのものが移動の起点・終点になる場合は、施設名や空港コードで結構です。
   4. どう書くか特定できなければ **null** にしてください。`

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
 *
 * その例外は 2 つの規則だけで、航空会社と空港の公開規定から引ける 3 項目
 * (搭乗手続き・受託手荷物の締切とオンラインチェックインの開放時刻、ルール 8)と、
 * 場所のラテン文字表記(ルール 9)には「調べて埋めてよい」と書いてある。
 * これは規則を緩めたのではなく、これらが「その予約にしか存在しない事実」では
 * ないためで、例外だと分かる形(ルール 1 からの参照 + 独立したルール)で
 * 書いてある。両方とも理由はプロンプトの中に書いてあり、
 * ここで二重に説明はしない。プロンプトは AI に読ませる文章であると同時に、
 * 「なぜこの規則があるのか」を人間が読んで確かめられる唯一の場所でもあるので、
 * 判断の理由は必ずプロンプト本文の側に置く。
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
  /**
   * ラテン文字表記。外部の検索サイトに渡すためだけに使う欄で、画面には出しません。
   * 抽出ルール 9 の例外規定を必ず読むこと
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
   * 移動の予約でなければ null。抽出ルール 8 の例外規定を必ず読むこと
   */
  onlineCheckInOpensMinutesBefore: number | null
  /**
   * 搭乗手続き(チェックイン)の締切。出発の「何分前か」を分単位の整数で。
   * 出発の 60 分前に締め切られるなら 60。時刻ではなく分数であることに注意。
   * 移動の予約でなければ null。抽出ルール 8 の例外規定を必ず読むこと
   */
  checkInClosesMinutesBefore: number | null
  /**
   * 受託手荷物(預け入れ荷物)の預け締切。同じく出発の「何分前か」を分で。
   * 搭乗手続きより早く締め切られることが多く、別の値になる。
   * 移動の予約でなければ null。抽出ルール 8 の例外規定を必ず読むこと
   */
  bagDropClosesMinutesBefore: number | null
  /**
   * 荷物枠(許容量)。預け締切とは別物で、「何を・何個・何 kg 持っていけるか」。
   * 移動の予約で、書類に枠の記載があるときだけ埋める。無ければ null。
   * 推測禁止(ルール 1)。航空会社の一般規定で埋めてはいけない。
   */
  baggage: {
    /**
     * 身の回り品(座席下など)。記載が無ければ null または欄ごと省略。
     * pieces: 0 は「無料枠なし」を意味する(未記載とは違う)。
     */
    personal: {
      pieces: number | null
      weightKg: number | null
      /** 寸法の表記そのまま(例 '40x30x20cm')。無ければ null */
      dimensions: string | null
      note: string | null
    } | null
    /** 機内持込 / 車内持込 */
    cabin: {
      pieces: number | null
      weightKg: number | null
      dimensions: string | null
      note: string | null
    } | null
    /** 受託手荷物(預け入れ) */
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

type Output = Array<ExtractedBooking>
\`\`\`

## 抽出ルール
1. **不明な項目は必ず null にしてください。推測で埋めないこと。**
   書類に書かれていない確認番号・料金・時刻をそれらしく補うのは、
   空欄のまま残すよりはるかに有害です。読み取れなかったものは null です。
   (例外はルール 8 と 9 だけです。搭乗手続き・受託手荷物の締切とオンライン
   チェックインの開放時刻はルール 8、場所のラテン文字表記はルール 9 を
   参照してください)
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
8. **搭乗手続きの締切・受託手荷物の締切・オンラインチェックインの開放時刻の 3 項目
   (checkInClosesMinutesBefore / bagDropClosesMinutesBefore /
   onlineCheckInOpensMinutesBefore)だけはルール 1 の例外で、
   書類に書かれていなくても調べて埋めてかまいません。**
${AIRLINE_TIMING_FILL_RULE}
9. **場所のラテン文字表記(PlaceInput.latinName)も、ルール 1 の例外です。
   書類に無くても、その場所の一般的なラテン文字表記で埋めてかまいません。**
${LATIN_NAME_FILL_RULE}

## 出力形式
\`\`\`json フェンスで囲んだ JSON 配列**のみ**を出力してください。
前置き・解説・要約・確認の問いかけは一切不要です。
`
}
