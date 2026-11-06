/**
 * マイタイムテーブルのデータ形式。
 *
 * 1 つのイベント(フェス・サーキット・対バン)を TimetableDoc 1 つで表す。
 * AI に書かせる JSON の形もこれと同じにしてあり、プロンプト(prompt.ts)・
 * 取り込み(normalize.ts)・保存(storage.ts)・共有URL(share.ts)が
 * すべてこの型を軸に変換する。
 *
 * 時刻は「その日の 0:00 からの壁時計表記」で持ち、24 時以降は "25:30" のように
 * 書く。オールナイトのイベントは公式タイムテーブル自体がこの表記を使うことが多く、
 * 日付を跨いだ瞬間に day を切り替えるより「その日の続き」として扱うほうが
 * 画面(縦軸が 1 本のグリッド)とも利用者の感覚とも合う。
 */

export const ACT_KINDS = ['live', 'dj', 'talk', 'signing', 'other'] as const
export type ActKind = (typeof ACT_KINDS)[number]

export const DEFAULT_TIMEZONE = 'Asia/Tokyo'

export interface TimetableDay {
  id: string
  /** YYYY-MM-DD */
  date: string
  label?: string
}

export interface TimetableVenue {
  id: string
  name: string
  /** 同じ建物の別フロアなど、まとめて見せたい単位 */
  group?: string
  note?: string
  mapUrl?: string
}

export interface TimetableAct {
  id: string
  dayId: string
  venueId: string
  /** HH:MM。24 以上はその日の続き(深夜) */
  start: string
  end?: string
  title: string
  subtitle?: string
  kind?: ActKind
  note?: string
  url?: string
}

/** 会場間の移動時間(分)。向きは区別しない */
export interface TimetableTravel {
  from: string
  to: string
  minutes: number
}

export interface TimetableDoc {
  version: 1
  title: string
  /** IANA タイムゾーン名 */
  timezone: string
  sourceUrl?: string
  days: Array<TimetableDay>
  venues: Array<TimetableVenue>
  acts: Array<TimetableAct>
  travel?: Array<TimetableTravel>
}

/** 友達の選択。共有URLで受け取ったお気に入りを、自分のお気に入りとは別に重ねる */
export interface FriendPick {
  id: string
  name: string
  actIds: Array<string>
  /** true なら画面に重ねない(消さずに一時的に隠す) */
  hidden?: boolean
}
