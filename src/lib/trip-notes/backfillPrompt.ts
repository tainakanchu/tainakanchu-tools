/**
 * すでに登録済みの予約に、あとから増えた項目を埋めさせるためのプロンプトを組み立てる層。
 *
 * 抽出プロンプト(aiPrompt.ts)は「原本を読んで予約を作る」ためのものだが、こちらは
 * 「原本はもう手元にない前提で、登録済みのデータだけを手掛かりに欠けた欄を足す」ためのもの。
 * アプリに項目が増えるたびに、利用者が過去の予約確認 PDF を探し直して全部読ませ直すのは
 * 現実的でない(古い予約ほど原本が見つからない)。
 *
 * 設計判断:
 *
 * ■ なぜ「一般知識で埋まる項目」だけを対象にするのか
 *   予約の欄は、埋められる根拠で 2 種類に分かれる。
 *     A. AI の一般知識から導けるもの。搭乗手続き・受託手荷物の締切(航空会社と空港が
 *        公開している規定で、便名と空港名さえ分かれば引ける)、地名のラテン文字表記
 *        (その土地について広く知られている表記)。
 *     B. 原本にしか書かれていないもの。座席番号、運賃クラス、受託手荷物の個数、
 *        朝食の有無、その便固有の但し書き。
 *   この穴埋めが渡せるのは登録済みのデータだけで、そこには B の根拠が存在しない。
 *   にもかかわらず B を対象に含めると、AI は空欄を嫌ってそれらしい値をでっち上げる。
 *   しかも出てくるのは「12A」のようないかにも本物らしい座席番号で、利用者が
 *   捏造だと気付ける手掛かりが画面のどこにも無い。だから対象は A に限る。
 *   A は外れても実害が小さい(締切は早い側に外れるので余分に待つだけ、ラテン文字表記は
 *   外部の検索リンクが空振りするだけ)という点でも B と性質が違う。
 *
 *   A / B の区別は BACKFILL_FIELDS への登録の有無で表す。今後フィールドが増えたときは、
 *   A なら 1 件足すだけでこの機能の対象に加わり、B なら何もしなければ対象外のまま残る。
 *   「対象かどうか」を各所の if 文に散らすと、項目が増えるたびに書き足す場所を
 *   探し回ることになり、いずれ足し忘れる。
 *
 * ■ なぜ既存の値を再出力させないのか
 *   最初は「全項目を出し直させて丸ごと差し替える」ほうが素直に見えたが、これは危ない。
 *   AI に 1 件ぶんの予約を全部書き写させると、出発時刻の 1 文字が変わったり、
 *   確認番号の O と 0 が入れ替わったりする。書き写しの誤りは元の値と見分けが付かない
 *   形で入るので、取り込んだあとに気付く手立てが無い。しかも「埋めるだけのつもり」の
 *   操作なので、利用者は差分を疑いもしない。
 *   だから出力は「予約を識別するための最小限の項目 + 新しく埋める項目だけ」の
 *   パッチ形式にする。パッチに含まれない欄は importMerge の
 *   「取り込み側が空の項目は既存を維持する」規則によって、そもそも触られない。
 *
 * ■ なぜ確認番号を送らないのか
 *   予約の突き合わせ(importMerge.ts の planImport)は、確認番号が一致するか、
 *   kind + 開始日 + タイトルが一致するかで既存の予約を見つける。後者だけで十分
 *   マッチするので、確認番号を送る必要が無い。
 *   一方これは利用者が自分の予約データを外部のチャットに貼る操作なので、送らずに
 *   済むものは送らない。確認番号は「それ単体で予約を操作できてしまう」種類の値で、
 *   タイトルや日時とは危険度が違う。同じ理由で料金・メモ・搭乗者名も送らない。
 *
 * ■ 出力を戻す先は既存の AI インポート
 *   パッチ形式の JSON は、そのまま AI インポートのステップ 2 に貼れば
 *   parseImportedJson → planImport が既存の予約にマージしてくれる。専用の取り込み口は
 *   作らない。取り込みの経路が 2 本になると、マッチ条件や検証の規則がいずれ食い違い、
 *   「片方の口からは入るのに、もう片方からは入らない」という追いにくい壊れ方をする。
 *
 * ■ 埋まらなかった予約は次回も対象に残る
 *   AI が「特定できない」として null を返した予約は、値が入らないので次に開いたときも
 *   穴として数え続ける。うっとうしくはあるが、「一度尋ねたから埋まったことにする」ための
 *   状態を別に持つと、その状態と実際の値が食い違ったときに直しようがなくなる。
 *   捏造した値で穴を塞ぐより、空のまま残って導線を無視できるほうが安全である。
 */

import { DEADLINE_FILL_RULE, LATIN_NAME_FILL_RULE } from './aiPrompt'
import { tryParseStamp } from './datetime'
import { isTransportKind } from './nights'
import type { Booking, TripNotesState } from './types'

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
    id: 'deadlines',
    label: '搭乗手続き・受託手荷物の締切',
    missingKeys: (booking) => {
      // 移動の予約にしか無い欄。宿やアクティビティに締切の穴を作ってはいけない
      if (!isTransportKind(booking.kind)) return []
      const keys: Array<string> = []
      if (booking.checkInClosesMinutesBefore === undefined) {
        keys.push('checkInClosesMinutesBefore')
      }
      if (booking.bagDropClosesMinutesBefore === undefined) {
        keys.push('bagDropClosesMinutesBefore')
      }
      return keys
    },
    schema: `  /**
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
    rule: `**締切の 2 項目(checkInClosesMinutesBefore / bagDropClosesMinutesBefore)は、
   予約データに無くても調べて埋めてかまいません。**
${DEADLINE_FILL_RULE}`,
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
]

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

export interface BackfillGaps {
  /** 穴のある予約だけ。穴が無ければ空 */
  targets: Array<BackfillTarget>
  /** UI が「どの項目が何件か」を出すための内訳。件数 0 の項目は含まない */
  countsByField: Array<BackfillFieldCount>
  /** 穴のある予約の件数 */
  bookingCount: number
}

/**
 * 穴埋めの対象になる予約と項目を洗い出す。
 *
 * キャンセル済みは除く。キャンセルした宿の締切を埋めても誰の役にも立たないうえ、
 * 「もう行かない予約」のために外部のチャットへデータを渡すことになる
 * (aiPrompt.ts が登録済み一覧からキャンセル済みを外しているのと同じ考え)。
 * 開始日時が壊れていて読めない予約も除く。プロンプトに載せる date / time / tz が
 * 作れないので、そもそも識別情報を渡せない。
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

  return { targets, countsByField, bookingCount: targets.length }
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
 * 穴埋め用プロンプトを組み立てる。埋める穴が 1 つも無ければ null を返す。
 *
 * null を返すのは、呼び出し側(UI)がそれだけで出し分けられるようにするため。
 * 「穴があるか」の判定を UI 側にもう一度書くと、プロンプトの対象と画面の表示が
 * 食い違って「導線は出ているのに空のプロンプトが出てくる」ことになる。
 */
export function buildBackfillPrompt(state: TripNotesState): string | null {
  const gaps = findBackfillGaps(state)
  if (gaps.targets.length === 0) return null

  const payloads = gaps.targets
    .map(toPayload)
    .filter((payload): payload is PayloadBooking => payload !== null)
  if (payloads.length === 0) return null

  // 実際に穴のある項目の規則とスキーマだけを載せる。使わない規則まで並べると
  // プロンプトが長くなるうえ、AI が「載っている以上は何か埋めるべきだ」と読んで
  // 対象外の欄まで書き始める
  const usedFields = BACKFILL_FIELDS.filter((field) =>
    gaps.targets.some((target) => target.fields.includes(field)),
  )

  const helperTypes = usedFields
    .map((field) => field.helperTypes)
    .filter((types): types is string => types !== undefined)
  const schemas = usedFields.map((field) => field.schema)
  const rules = usedFields.map((field, index) => `${index + 4}. ${field.rule}`)

  const typeSection = [
    ...helperTypes,
    `interface BookingPatch {
  /** 渡した値をそのまま返してください(照合に使います) */
  kind: string
  /** 渡した値をそのまま返してください(照合に使います) */
  title: string
  /** 渡した値をそのまま返してください(照合に使います) */
  start: { date: string; time: string | null; tz: string }
${schemas.join('\n')}
  /** その値をどう決めたかの根拠。項目名をキーにする */
  evidence: { [key: string]: string }
}`,
    'type Output = Array<BookingPatch>',
  ].join('\n\n')

  return `あなたは、すでに登録済みの旅行の予約に、不足している項目だけを補うアシスタントです。

予約確認書やメールは添付しません。**下記の予約データと、あなたが一般に知っていること
(航空会社・空港が公開している規定、地名の一般的な表記)だけ**を使ってください。

## 何をするのか
アプリが新しい項目に対応したため、以前に登録した予約にはその欄が入っていません。
原本を探し直さずに済むよう、**一般知識だけで埋められる欄**をここで補います。
座席番号・運賃クラス・受託手荷物の個数・朝食の有無のような、
**その予約の書類にしか書かれていない情報はこの作業の対象外**です。
渡していませんし、出力にも含めないでください。

## いちばん大事な約束
渡した予約の **kind / title / start と、場所の name は、1 文字も変えずにそのまま**
返してください。アプリはこれらを鍵にして「どの予約への追記か」を突き合わせます。
1 文字でも変わると追記にならず、**新しい予約として二重に増えます**。
表記を整えたり、綴りを直したり、時刻の形式を変えたりしないでください。

## 補う予約
各予約の \`missing\` に、その予約で不足している欄のキーが並んでいます。

\`\`\`json
${JSON.stringify(payloads, null, 2)}
\`\`\`

## 出力スキーマ
\`\`\`ts
${typeSection}
\`\`\`

## 規則
1. **kind / title / start / 場所の name は渡された値をそのまま返してください。**
   これらは照合のためだけに往復させている値で、直す対象ではありません。
2. **\`missing\` に挙がっている欄だけを埋めてください。**
   挙がっていない欄は、その予約ではすでに値が入っています。書き直すと、
   利用者が確認済みの値を上書きしてしまいます。省いてかまいません。
3. **埋められない欄は null にしてください。推測で埋めないこと。**
   分からないときに「だいたいこのくらい」で埋めるのは、間違った値を
   正しい値の顔で入れることになり、空欄のまま残すよりはるかに有害です。
${rules.join('\n')}
${usedFields.length + 4}. evidence には、その値を**どう決めたか**を短く書いてください。
   今回は予約確認書を読んでいないので、「どこの何の規定から引いたか」
   「どの土地の一般的な表記か」を書くことになります。
   あとから人間が同じ根拠にたどり着けることが目的です。

なお上の規則には「予約確認書に記載があればそれを優先」という項が含まれますが、
今回は書類を読みません。書類に記載があった欄はすでにアプリに入っていて
\`missing\` に出てこないので、実際には公開規定や一般的な表記から埋めることになります。

## 出力形式
\`\`\`json フェンスで囲んだ JSON 配列**のみ**を出力してください。
前置き・解説・要約・確認の問いかけは一切不要です。
`
}
