/**
 * AI に渡すプロンプトを組み立てる。
 *
 * 旅のしおり(trip-notes/aiPrompt.ts)と同じく、アプリから外部 API は呼ばない。
 * 利用者がプロンプトをコピーして自分の ChatGPT / Claude / Gemini に貼り、
 * 公式タイムテーブルの画像・PDF・URL を添えて送り、返ってきた JSON を貼り戻す。
 *
 * - スキーマは TypeScript の型として渡す。AI は型定義を読むのが得意で、
 *   文章で説明するより抜けが少ない。
 * - acts の id は書かせない。id はアプリが中身から作る(id.ts)。AI に連番を
 *   振らせると、再取り込みのたびにずれてお気に入りが外れる。
 * - 資料が添付されていないうちに `{}` を返されると、利用者は何が起きたのか
 *   分からない。資料が無ければ JSON を出さずに「何を送ればよいか」を案内して
 *   待つように明記する。
 * - JSON は必ず ```json コードブロックで出させる。本文(リッチテキスト)として
 *   出された JSON をコピーすると、行末の \ や &#x20; が混ざって崩れる。
 *   コードブロックならコピーボタンでそのまま取れる。
 * - 追記・修正モードでは現在の JSON を丸ごと同梱し、「全体を返す」ように頼む。
 *   差分で返させると、マージの規則をアプリと AI の両方が持つことになる。
 */

import { ACT_KINDS, DEFAULT_TIMEZONE } from './types'
import type { TimetableDoc } from './types'

export interface AiServiceLink {
  id: string
  label: string
  url: string
}

/** どれも新しい会話を開く URL(前の話題を引きずらないように) */
export const AI_SERVICE_LINKS: Array<AiServiceLink> = [
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
]

/** 資料が無いときの案内文。テストでも参照する */
export const WAIT_FOR_MATERIAL_RULE =
  '資料(タイムテーブルの画像・PDF・URL・文字起こし)がまだ添付・記載されていない場合は、JSON を出力しないでください。代わりに「タイムテーブルの画像・PDF・URL、または文字起こしを貼ってください」のように、何を送ればよいかを短く案内して待ってください。資料を受け取ったら、JSON を 1 つの ```json コードブロックに入れて出力してください。'

export const WAIT_FOR_EDIT_RULE =
  '修正・追記の内容(新しい資料や、どこをどう直したいか)がまだ書かれていない場合は、JSON を出力しないでください。代わりに「何を追加・修正したいか、または新しい資料を送ってください」と短く聞いて待ってください。内容を受け取ったら、修正後の JSON 全体を 1 つの ```json コードブロックに入れて出力してください。'

/** JSON の出し方。テストでも参照する */
export const OUTPUT_FORMAT_RULE = [
  '- 完成した JSON は、必ず 1 つの ```json コードブロックに入れて出力する。利用者はコードブロックのコピーボタンでコピーしてアプリに貼り付ける。',
  '- JSON をコードブロックの外に本文(リッチテキスト)として書いたり、表にしたりしない。コピーしたときに記号が崩れて読み込めなくなる。',
  '- コードブロックは 1 つだけにし、JSON を途中で分けない。',
].join('\n')

const SCHEMA = `type TimetableDoc = {
  version: 1
  title: string                 // イベント名と年(例: "BiKN shibuya 2026")
  timezone: string              // IANA 名。日本のイベントなら "${DEFAULT_TIMEZONE}"
  sourceUrl?: string            // 公式タイムテーブルの URL が分かれば
  days: Array<{ id: string; date: string; label?: string }>  // date は "YYYY-MM-DD"。id は "d1", "d2" など
  venues: Array<{
    id: string                  // "v1", "v2" など
    name: string                // ステージ名またはライブハウス名(公式の表記どおり)
    group?: string              // 同じ建物の別フロアなどをまとめる名前
    note?: string               // 会場の補足(住所・入場規制など、公式に書いてあれば)
    mapUrl?: string
  }>
  acts: Array<{
    dayId: string               // days の id
    venueId: string             // venues の id
    start: string               // "HH:MM"(24 時間表記)
    end?: string                // "HH:MM"。0 時を跨ぐ場合は "25:30" のように 24 以上で書く
    title: string               // 出演者名(公式の表記どおり)
    subtitle?: string           // 編成・ゲスト・企画名など
    kind?: ${ACT_KINDS.map((k) => `'${k}'`).join(' | ')}   // 省略時は 'live'
    note?: string
    url?: string
  }>
  travel?: Array<{ from: string; to: string; minutes: number }>  // 会場間の移動時間(venues の id)。向きは区別しない
}`

const READING_RULES = `## 読み取りのルール
- ステージ・会場は表の列(または見出し)ごとに venues に 1 件ずつ入れ、表の左から順に並べる。
- 複数日あるときは日付ごとに days を分ける。年が書かれていなければ、資料の他の箇所(告知・URL)から判断する。
- 深夜帯(0 時以降)の出演は、その日の続きとして "24:30" "25:00" のように 24 以上の時刻で書く。日付を翌日にしない。
- 時刻は半角の "HH:MM"。"14:00〜14:40" のような範囲は start と end に分ける。終了時刻が書かれていなければ end を省く。
- DJ は kind: 'dj'、トークは 'talk'、サイン会・特典会は 'signing'、物販や転換など出演以外は 'other' にする。
- 読み取れない・判別できない箇所は推測で埋めず、分かる範囲で書いたうえで note に「要確認」と書く。
- 会場間の移動時間(徒歩◯分など)が案内にあれば travel に入れる。書かれていなければ travel は省く。
- acts に id は書かない(アプリが自動で付ける)。
- 出演が多くても省略せず、全件を書く。「...」「以下同様」「// 他◯組」のような省略やコメントは書かない(JSON として読めなくなる)。
- 出力は JSON のみ(下の「出力の形式」のとおりコードブロックに入れる)。前置き・説明は不要。

## サーキットフェス(複数のライブハウスを回る形式)の読み方
- 会場ごとに縦に出演が並ぶ表(列が会場、縦が時刻)が多い。列の見出しを venues に、その列の出演をその会場の acts にする。会場ごとに別の画像・ページになっている場合も同じ。
- 出演が時間軸上の帯(枠)で描かれている場合、帯の上端を start、下端を end にする。
- 「各組 30 分」「持ち時間 40 分」のように持ち時間が明記されていれば、start に足して end を計算してよい。明記されていなければ end を推測せず省く。
- 出力する前に、会場ごと・日ごとの出演数を資料と数え合わせ、抜けや重複が無いか確かめる。
- URL を渡されても中身を直接読めない場合は、推測で作らず「ページを開けないので、タイムテーブルの画像(スクリーンショット)か文字起こしを貼ってください」と案内して待つ。`

export type PromptMode = 'new' | 'update'

export function buildTimetablePrompt(
  mode: PromptMode,
  current?: TimetableDoc,
): string {
  if (mode === 'update' && current !== undefined) {
    return [
      'あなたはイベントのタイムテーブルを整理するアシスタントです。',
      '下の「現在のタイムテーブル」(JSON)に、これから送る資料や指示の内容を反映して、修正後のタイムテーブル全体を同じ形式の JSON で返してください。',
      '',
      `## 最初に`,
      WAIT_FOR_EDIT_RULE,
      '',
      '## 形式(TypeScript の型)',
      SCHEMA,
      '',
      READING_RULES,
      '- 既存の出演に id が付いていれば、内容を直す場合も id はそのまま残す。新しく足す出演には id を書かない。',
      '- 変更しない部分も省略せず、全体を返す。',
      '',
      '## 出力の形式',
      OUTPUT_FORMAT_RULE,
      '',
      '## 現在のタイムテーブル',
      JSON.stringify(current),
    ].join('\n')
  }
  return [
    'あなたはイベントのタイムテーブルを読み取るアシスタントです。',
    'これから送るフェス・ライブイベントの公式タイムテーブル(画像・PDF・Web ページの URL・文字起こしのいずれか)を読み取り、下の形式の JSON にしてください。',
    '',
    '## 最初に',
    WAIT_FOR_MATERIAL_RULE,
    '',
    '## 形式(TypeScript の型)',
    SCHEMA,
    '',
    READING_RULES,
    '',
    '## 出力の形式',
    OUTPUT_FORMAT_RULE,
  ].join('\n')
}
