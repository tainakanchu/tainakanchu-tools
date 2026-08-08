/**
 * 航空券やホテルの予約確認書から入国カードの入力に必要な情報を抽出させる、
 * AI へ貼り付けるプロンプトを組み立てる層。
 *
 * 設計判断:
 * - アプリから外部 API を呼ばない。プロンプトを生成して利用者にコピーさせ、
 *   利用者が普段使っている ChatGPT / Claude / Gemini に貼って実行してもらい、
 *   返ってきた JSON を貼り戻す方式にする(旅のしおりと同じ方式)。
 *   API キーが要らず、利用者がすでに払っているサブスクをそのまま使え、
 *   プロバイダにも依存しない。PDF の添付は各社の公式アプリのほうが確実に扱える。
 *   なにより、このアプリ自体は一切ネットワークに出ない。
 *   パスポート番号や生年月日を扱うツールとして、この性質は譲れない。
 * - AI に航空会社を 'BR : EVA Air' というリスト値のまま返させない。
 *   このリストは台湾側の表記で 108 件あり、'EVA Airways' のような表記揺れで
 *   必ず外れる。IATA の 2 レターコードだけを返させ、リスト値への解決は
 *   options.ts の resolveFlightCode に任せる。同じ理由で国籍・職業も
 *   AI には出させない(それらは人が一度入れれば次回以降は保存から復元される)。
 * - スキーマは散文ではなく TypeScript の型定義として渡す。LLM には型定義を
 *   貼るのがもっとも効く。この文字列は aiImport.ts が読む形と 1 対 1 で対応する。
 */

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
 * src/lib/trip-notes/aiPrompt.ts の AI_SERVICE_LINKS を写したもの。
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
 * 抽出用プロンプトを組み立てる。
 *
 * 「不明なら null」を繰り返し強調しているのは、LLM が空欄を嫌って
 * それらしい値をでっち上げる傾向があるため。捏造されたパスポート番号や
 * 推測で埋められた便名は、空欄よりはるかに危険である。入国カードの記載が
 * 実際の渡航と食い違えば、直る場所は空港のカウンターしかない。
 * このツールには「調べて埋めてよい」の例外を 1 つも置いていない。
 */
export function buildImportPrompt(): string {
  return `あなたは台湾のオンライン入国カード(TWAC)の入力に必要な情報を、
旅行の予約書類から抽出する専門アシスタントです。
このメッセージのあとに貼り付ける、または添付するもの(航空券の e チケット控え、
ホテルの予約確認メール、旅程表、予約画面のスクリーンショットなど)を読み取り、
下記のスキーマに従った JSON だけを出力してください。

## 出力スキーマ
\`\`\`ts
interface ExtractedArrivalInfo {
  /** 台湾に到着する日 'YYYY-MM-DD'。深夜便は台湾現地の到着日。不明なら null */
  dateOfEntry: string | null
  /** 入国便の航空会社 IATA 2レターコード(例 'BR', 'JX', 'CI')。不明なら null */
  entryAirlineCode: string | null
  /** 入国便の便番号の数字部分のみ(例 'BR190' なら '190')。不明なら null */
  entryFlightNumber: string | null
  /** 台湾を出国する日 'YYYY-MM-DD'。不明なら null */
  exitDate: string | null
  exitAirlineCode: string | null
  exitFlightNumber: string | null
  /** 台湾での宿泊先ホテル名(英語表記があれば英語)。不明なら null */
  hotelName: string | null
  /** 宿泊先住所(英語表記があれば英語)。不明なら null */
  hotelAddress: string | null
  /** 予約に載っている搭乗者。個人ごとの情報が読み取れた場合のみ */
  travelers: Array<{
    /** パスポート表記のローマ字氏名(例 'YAMADA TARO')。不明なら null */
    englishName: string | null
    /** 'YYYY-MM-DD'。不明なら null */
    dateOfBirth: string | null
    passportNumber: string | null
    passportExpiry: string | null
    sex: 'Male' | 'Female' | null
  }> | null
}
type Output = ExtractedArrivalInfo
\`\`\`

## 抽出ルール
1. **不明な項目は必ず null にしてください。推測で埋めないこと。**
   これがこのプロンプトで最も重要な規則です。書類に書かれていない便名・
   パスポート番号・生年月日をそれらしく補うのは、空欄のまま残すよりはるかに
   有害です。入国カードの記載が実際の渡航と食い違うと、直せる場所は
   現地の窓口しかありません。読み取れなかったものは null です。
   **この規則に例外はありません。** 一般的にそうだから、よくある便だから、
   といった理由で埋めてはいけません。
2. **往復航空券なら、往路が台湾への入国、復路が台湾からの出国です。**
   entryAirlineCode / entryFlightNumber は台湾に**到着する**便、
   exitAirlineCode / exitFlightNumber は台湾を**出発する**便のものです。
   乗り継ぎがある場合、入国便は台湾の空港に着く最後の区間、
   出国便は台湾の空港を出る最初の区間です。
3. **日付は台湾の現地日付**で書いてください。日本を夜に発つ便が台湾に
   0 時過ぎに着くなら、dateOfEntry は**到着した側の日付**です。
   出発日ではありません。
4. 便番号は**数字の部分だけ**を返してください。'BR190' なら
   entryAirlineCode が 'BR'、entryFlightNumber が '190' です。
   'NH 851' のように空白が入っていても分けてください。
5. 航空会社は**IATA の 2 レターコード**で返してください。会社名は不要です。
   コードが書類から読み取れず会社名しか分からない場合も、確実に分かる
   コードだけを返し、自信が持てなければ null にしてください。
6. ホテルは**台湾で宿泊する先**のものだけを返してください。乗り継ぎ地や
   帰国後の宿は含めません。英語表記と現地表記が併記されていれば英語を
   優先してください(入国カードはラテン文字で入力する欄です)。
7. travelers には、書類から**個人ごとに読み取れた人だけ**を入れてください。
   人数しか分からない場合や、氏名がまとめて 1 行に書かれていて分けられない
   場合は、travelers 自体を null にしてください。空の要素を人数分並べては
   いけません。
8. 氏名はパスポートの表記(すべて大文字のローマ字、姓が先)に揃えてください。
   書類にその形で書かれていればそのまま使い、日本語表記しか無い場合は
   null にしてください(ローマ字への変換は推測になります)。
9. 該当する情報が 1 つも見つからなければ、すべての項目が null の
   オブジェクトを返してください。

## 出力形式
\`\`\`json フェンスで囲んだ JSON オブジェクト**のみ**を出力してください。
前置き・解説・要約・確認の問いかけは一切不要です。
`
}
