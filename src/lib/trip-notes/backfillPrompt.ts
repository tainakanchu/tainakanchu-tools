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
 *     A. AI の一般知識から導けるもの。搭乗手続き・受託手荷物の締切とオンライン
 *        チェックインの開放時刻(いずれも航空会社と空港が公開している規定で、
 *        便名と空港名さえ分かれば引ける)、地名のラテン文字表記
 *        (その土地について広く知られている表記)。
 *     B. 原本にしか書かれていないもの。座席番号、運賃クラス、受託手荷物の個数、
 *        朝食の有無、その便固有の但し書き。
 *   この穴埋めが渡せるのは登録済みのデータだけで、そこには B の根拠が存在しない。
 *   にもかかわらず B を対象に含めると、AI は空欄を嫌ってそれらしい値をでっち上げる。
 *   しかも出てくるのは「12A」のようないかにも本物らしい座席番号で、利用者が
 *   捏造だと気付ける手掛かりが画面のどこにも無い。だから対象は A に限る。
 *   A は外れても実害が小さい(締切は早い側に外れるので余分に待つだけ、開放時刻は
 *   遅い側に外れても席を取りに行くのが少し遅れるだけ、ラテン文字表記は
 *   外部の検索リンクが空振りするだけ)という点でも B と性質が違う。
 *
 *   A / B の区別は BACKFILL_FIELDS への登録の有無で表す。今後フィールドが増えたときは、
 *   A なら 1 件足すだけでこの機能の対象に加わり、B なら何もしなければ対象外のまま残る。
 *   「対象かどうか」を各所の if 文に散らすと、項目が増えるたびに書き足す場所を
 *   探し回ることになり、いずれ足し忘れる。
 *
 * ■ 予約単位だけでなく旅程単位の穴も対象にする
 *   もともとこの層は予約 1 件ずつの欄だけを見ていた。しかしプラグ形状・電圧・
 *   チップ・緊急通報番号といった国の基本情報(types.ts の CountryInfo)も、
 *   根拠で言えば完全に A である。どれもその国について公開されている事実で、
 *   原本を要しない。予約に紐づかないという理由だけで対象の外に置くと、利用者は
 *   同じ「調べれば分かること」を、項目によって手で埋めたり AI に頼めたりする
 *   ことになる。埋められる根拠が同じなら、入れ物が違っても同じ導線に乗せる。
 *
 * ■ ただし訪問国の推定はしない
 *   地名から国を当てることは機械にはさせない。「サンティアゴ」がチリなのか
 *   スペインなのかは、予約データからは決まらない。しかも外したときに出るのは
 *   間違った国のプラグ形状や緊急通報番号で、それを自信たっぷりに見せるのは
 *   空欄よりはるかに危険である(慌てているときほど、書いてある番号を疑わない)。
 *   だから**国名の入力だけは人間の仕事**だと割り切る(types.ts の CountryInfo に
 *   書いた「国名だけは人間が入れる」と同じ判断)。
 *   穴として数えるのは「countryInfos に登録済みだが欄が空」のものだけで、
 *   1 件も登録されていない状態は穴ではない。それは「まだ何も教えてもらっていない」
 *   であって、埋めるべき欄がある状態ではないからである。だからプロンプトには
 *   何も載せず、代わりに UI(設定タブ)が「国名を登録すれば埋められる」導線を出す。
 *   その出し分けを UI 側でもう一度判定させないために countryCount を返す。
 *
 * ■ なぜ国の latinName は埋めさせないのか
 *   埋め方の規則が違うから。場所のラテン文字表記の規則は「外部の経路検索に渡すので
 *   都市名を優先する」という、地名に固有の話で、国名にはそのまま当てはまらない。
 *   規則が違うものを同じ 1 件にまとめない、というのは BACKFILL_FIELDS の設計原則
 *   (1 件 = 1 つの規則で埋まる項目のまとまり)そのものである。
 *   国名のラテン文字表記は、人間が要るときだけ手で入れる。
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

import { AIRLINE_TIMING_FILL_RULE, LATIN_NAME_FILL_RULE } from './aiPrompt'
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

/**
 * 国の基本情報を一般知識で埋めさせる規則の本文。
 *
 * aiPrompt.ts に置かないのは、抽出プロンプトが国情報をまったく扱わないため。
 * AIRLINE_TIMING_FILL_RULE があちらにあるのは「2 つのプロンプトが同じ文面を使うから」
 * であって、規則だからではない。使い手が 1 つしかない文面を共有の置き場に出すと、
 * 抽出プロンプトを読む人に「これも抽出で使うのか」と探させることになる。
 *
 * 行頭の 3 スペースは、番号付きリストのぶら下げに合わせてある(rule と同じ)。
 */
const COUNTRY_INFO_FILL_RULE = `   プラグ形状・電圧/周波数・緊急通報番号は**その国の公的な事実**で、
   旅行ガイドにも大使館の案内にも載っている種類の情報です。
   だから一般知識で埋めてかまいません。
   1. **緊急通報番号は警察と救急・消防を分けて**答えてください。同じ番号で共通の国
      (米国の 911 など)なら、両方に同じ番号を書いてください。片方を空欄にしないこと。
      これを読むのはいちばん慌てている人で、「片方しか書いていない」の意味を
      その場で読み解かせてはいけません。
   2. **チップの文化だけは性質が違います。** 地域・店の種類・時期で幅があり、
      1 つの正解がありません。「不要」「10%」のような断定ではなく、
      **幅があること自体を書いてください**
      (例: 「基本は不要。高級店やホテルでは 5〜10% を置くこともある」)。
   3. その国について特定できなければ **null** にしてください。推測で埋めないこと。
   4. evidence には、その国のどんな事実からその値にしたのかを書いてください。`

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
const COUNTRY_INFO_PATCH_TYPE = `interface CountryInfoPatch {
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

/** null を落として文字列だけを残す。節の組み立てで何度も要るので関数にしてある */
function joinDefined(parts: Array<string | null>, separator: string): string {
  return parts.filter((part): part is string => part !== null).join(separator)
}

/**
 * 穴埋め用プロンプトを組み立てる。埋める穴が 1 つも無ければ null を返す。
 *
 * null を返すのは、呼び出し側(UI)がそれだけで出し分けられるようにするため。
 * 「穴があるか」の判定を UI 側にもう一度書くと、プロンプトの対象と画面の表示が
 * 食い違って「導線は出ているのに空のプロンプトが出てくる」ことになる。
 *
 * 予約の穴と国の穴は独立に効く。片方しか無くてもそちら側だけのプロンプトを出す。
 * 両方揃うまで出さないことにすると、埋められるものが埋められないまま残る。
 * 逆に「載せる中身は実際に穴がある側だけ」は徹底する。使わない型定義や規則まで
 * 並べると、AI が「載っている以上は何か埋めるべきだ」と読んで対象外の欄まで
 * 書き始める(usedFields の絞り込みと同じ理由)。
 */
export function buildBackfillPrompt(state: TripNotesState): string | null {
  const gaps = findBackfillGaps(state)

  const payloads = gaps.targets
    .map(toPayload)
    .filter((payload): payload is PayloadBooking => payload !== null)
  const countryPayloads = gaps.countries.map(toCountryPayload)

  const hasBookings = payloads.length > 0
  const hasCountries = countryPayloads.length > 0
  if (!hasBookings && !hasCountries) return null

  const usedFields = hasBookings
    ? BACKFILL_FIELDS.filter((field) =>
        gaps.targets.some((target) => target.fields.includes(field)),
      )
    : []

  const bookingTypes = hasBookings
    ? [
        ...usedFields
          .map((field) => field.helperTypes)
          .filter((types): types is string => types !== undefined),
        `interface BookingPatch {
  /** 渡した値をそのまま返してください(照合に使います) */
  kind: string
  /** 渡した値をそのまま返してください(照合に使います) */
  title: string
  /** 渡した値をそのまま返してください(照合に使います) */
  start: { date: string; time: string | null; tz: string }
${usedFields.map((field) => field.schema).join('\n')}
  /** その値をどう決めたかの根拠。項目名をキーにする */
  evidence: { [key: string]: string }
}`,
      ]
    : []

  const outputMembers = joinDefined(
    [
      hasBookings ? 'BookingPatch' : null,
      hasCountries ? 'CountryInfoPatch' : null,
    ],
    ' | ',
  )
  const typeSection = [
    ...bookingTypes,
    ...(hasCountries ? [COUNTRY_INFO_PATCH_TYPE] : []),
    `type Output = Array<${outputMembers}>`,
  ].join('\n\n')

  // 両方載るときだけ、どちらのパッチなのかの見分け方を本文にも書く。
  // 型を 2 つ並べただけだと「1 件ずつどちらかを選ぶ」とは読めても、
  // 1 つの配列に混ぜてよいことまでは伝わらず、2 回に分けて答えられてしまう
  const discriminationNote =
    hasBookings && hasCountries
      ? `
予約のパッチと国のパッチは、**1 つの配列に混ぜて返してかまいません**。
アプリは形で見分けます。**予約のパッチには \`kind\` と \`start\` があり、
国のパッチにはそのどちらも無く \`name\` があります。**
どちらか一方の形に寄せたり、2 つの配列に分けたりしないでください。
`
      : ''

  const bookingSection = hasBookings
    ? `
## 補う予約
各予約の \`missing\` に、その予約で不足している欄のキーが並んでいます。

\`\`\`json
${JSON.stringify(payloads, null, 2)}
\`\`\`
`
    : ''

  const countrySection = hasCountries
    ? `
## 補う国・地域
各国の \`missing\` に、その国で不足している欄のキーが並んでいます。
**国名は利用者が入力したものです。ここに無い国を足さないでください。**

\`\`\`json
${JSON.stringify(countryPayloads, null, 2)}
\`\`\`
`
    : ''

  // 規則 4 以降は、実際に載せた対象のぶんだけ。番号を固定で書くと、
  // 出し分けで欄が減ったときに番号が飛ぶ
  const ruleBodies = [
    ...usedFields.map((field) => field.rule),
    ...(hasCountries
      ? [
          `**国の基本情報(plugTypes / voltage / tipping / emergencyPolice /
   emergencyAmbulance)は、その国について一般に知られていることから
   埋めてかまいません。**
${COUNTRY_INFO_FILL_RULE}`,
        ]
      : []),
  ]

  return `あなたは、すでに登録済みの旅行の${joinDefined(
    [hasBookings ? '予約' : null, hasCountries ? '訪問先の国・地域' : null],
    'と',
  )}に、不足している項目だけを補うアシスタントです。

予約確認書やメールは添付しません。**下記のデータと、あなたが一般に知っていること
(${joinDefined(
    [
      hasBookings
        ? '航空会社・空港が公開している規定、地名の一般的な表記'
        : null,
      hasCountries
        ? '国ごとに公開されている電源・チップ・緊急通報の情報'
        : null,
    ],
    '、\n',
  )})だけ**を使ってください。

## 何をするのか
アプリが新しい項目に対応したため、以前に登録したデータにはその欄が入っていません。
原本を探し直さずに済むよう、**一般知識だけで埋められる欄**をここで補います。${
    hasBookings
      ? `
座席番号・運賃クラス・受託手荷物の個数・朝食の有無のような、
**その予約の書類にしか書かれていない情報はこの作業の対象外**です。
渡していませんし、出力にも含めないでください。`
      : ''
  }

## いちばん大事な約束
${joinDefined(
  [
    hasBookings
      ? `渡した予約の **kind / title / start と、場所の name は、1 文字も変えずにそのまま**
返してください。アプリはこれらを鍵にして「どの予約への追記か」を突き合わせます。
1 文字でも変わると追記にならず、**新しい予約として二重に増えます**。`
      : null,
    hasCountries
      ? `渡した国の **name も、1 文字も変えずにそのまま**返してください。
これが「どの国への追記か」を突き合わせる唯一の鍵で、1 文字でも変わると
追記にならず、**新しい国として二重に増えます**。`
      : null,
  ],
  '\n\n',
)}
表記を整えたり、綴りを直したり、時刻の形式を変えたりしないでください。
${bookingSection}${countrySection}
## 出力スキーマ
\`\`\`ts
${typeSection}
\`\`\`
${discriminationNote}
## 規則
1. **${joinDefined(
    [
      hasBookings ? '予約の kind / title / start / 場所の name' : null,
      hasCountries ? '国の name' : null,
    ],
    '、',
  )} は渡された値をそのまま返してください。**
   これらは照合のためだけに往復させている値で、直す対象ではありません。
2. **\`missing\` に挙がっている欄だけを埋めてください。**
   挙がっていない欄は、すでに値が入っています。書き直すと、
   利用者が確認済みの値を上書きしてしまいます。省いてかまいません。
3. **埋められない欄は null にしてください。推測で埋めないこと。**
   分からないときに「だいたいこのくらい」で埋めるのは、間違った値を
   正しい値の顔で入れることになり、空欄のまま残すよりはるかに有害です。
${ruleBodies.map((body, index) => `${index + 4}. ${body}`).join('\n')}
${ruleBodies.length + 4}. evidence には、その値を**どう決めたか**を短く書いてください。
   今回は予約確認書を読んでいないので、${joinDefined(
     [
       hasBookings
         ? '「どこの何の規定から引いたか」\n   「どの土地の一般的な表記か」'
         : null,
       hasCountries ? '「その国について一般に知られていること」' : null,
     ],
     '\n   ',
   )}を書くことになります。
   あとから人間が同じ根拠にたどり着けることが目的です。
${
  hasBookings
    ? `
なお上の規則には「予約確認書に記載があればそれを優先」という項が含まれますが、
今回は書類を読みません。書類に記載があった欄はすでにアプリに入っていて
\`missing\` に出てこないので、実際には公開規定や一般的な表記から埋めることになります。
`
    : ''
}
## 出力形式
\`\`\`json フェンスで囲んだ JSON 配列**のみ**を出力してください。
前置き・解説・要約・確認の問いかけは一切不要です。
`
}
