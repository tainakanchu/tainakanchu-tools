/**
 * テンプレートの描画関数が共有する型。
 */
import type { CenterParams } from './center'
import type { Ctx, ScrimZone } from './draw'
import type { Rect } from './fit'
import type { ColumnsSetting, PhotoPlan } from './layouts'
import type { RowItem, RowParams } from './rows'

/** 見出しに使う情報 */
export type Meta = {
  event: string
  dj: string
  date: string
  venue: string
  total: number
  /** セットの長さ（秒）。開始時刻が無ければ undefined */
  setLength?: number
  /** レコードの品番風の ID（例: KAN-20261103） */
  catalog: string
}

/** 何枚目か（start / end は全曲の中の範囲） */
export type PageSpec = {
  index: number
  count: number
  start: number
  end: number
}

/** 1 枚目の組み方。2 枚目以降をこれにそろえる */
export type PageLock = {
  /** ポスターで見出しを小さくした組みを使ったか */
  posterTight?: boolean
  rows?: RowParams
  flow?: { size: number; each: boolean; large: boolean; metaShown: number }
  /** 曲の領域の高さの割合（フォト）・見出しの縮め具合（エディトリアル）など */
  variant?: number
  center?: CenterParams
}

export type LayoutResult = {
  overflow: boolean
  hidden: number
  lock: PageLock
  textSize: number
  metaShown: number
  /** 写真を背景にしたときの幕の区域（無ければ全面に一様） */
  scrim?: Array<ScrimZone>
  /** 文字はすべて不透明な面の上にある（写真の上の判定をしない） */
  solidText?: boolean
  /** 段が狭くて名前が切れがち（自動の枚数決めでは、枚数を増やす方を選ぶ） */
  cramped?: boolean
}

export type TemplateArgs = {
  ctx: Ctx
  meta: Meta
  items: ReadonlyArray<RowItem>
  /** 文字を組む枠（写真枠のときは写真を除いた側） */
  frame: Rect
  plan: PhotoPlan | null
  page: PageSpec
  lock: PageLock | undefined
  columns: ColumnsSetting
  /** 全面背景の写真があるか */
  photoBg: boolean
  /** 表示する補足列（左から） */
  metaKeys: ReadonlyArray<'time' | 'bpm' | 'key' | 'label'>
}

export function pageLabel(page: PageSpec): string {
  return page.count > 1 ? `${page.index + 1} / ${page.count}` : ''
}
