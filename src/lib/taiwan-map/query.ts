/**
 * URL の検索パラメータ ⇔ 画面状態の変換。
 *
 * このツールは「絞り込んだ状態の URL を人に送る」のが主な使い道なので、
 * 絞り込み状態は URL だけに持たせ、画面側の state には複製しない。
 * そのぶん URL は外から何が来てもおかしくないので、知らない値
 * （typo・古いカテゴリ名・悪意ある文字列）は黙って捨てる。
 * エラー画面を出すより、分かる条件だけで開いたほうが共有リンクとして親切。
 */

import {
  CITY_IDS,
  SPOT_CATEGORY_IDS,
  SPOT_LABEL_IDS,
  VISIT_STATUS_IDS,
} from './types.ts'
import type { SpotFilter } from './filter.ts'
import type { AreaId, SpotId } from './types.ts'

export type MobileView = 'list' | 'map'

export type TaiwanMapSearch = SpotFilter & {
  /** 開いて強調するスポット。これ単体でも共有 URL になる */
  spot?: SpotId
  /** スマホでの表示切替。既定は一覧（地図を最初の全画面にしない） */
  view?: MobileView
  /** 一覧の文字検索（名前・タグ・エリア名・コメント）。打ったままの文字列 */
  q?: string
}

/** 検索語の長さの上限。URL に長すぎる文字列を載せない */
export const SEARCH_QUERY_MAX = 100

/** 出力順。共有 URL の見た目を毎回同じにするため固定する */
const KEY_ORDER = [
  'city',
  'area',
  'category',
  'status',
  'label',
  'q',
  'spot',
  'view',
] as const satisfies ReadonlyArray<keyof TaiwanMapSearch>

/** データ側の id 規則（schema.ts）と同じ。これ以外は存在し得ないので捨てる */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function pick<T extends string>(
  list: ReadonlyArray<T>,
  value: unknown,
): T | undefined {
  // find で返せば、許可リストの要素そのものが T として返るのでキャスト不要
  return list.find((item) => item === value)
}

function pickId(value: unknown): string | undefined {
  // TanStack Router は検索パラメータを JSON として読むので、
  // ?spot=101 のような数字だけの id は number で届く
  const str = typeof value === 'number' ? String(value) : value
  return typeof str === 'string' && ID_PATTERN.test(str) ? str : undefined
}

/**
 * 検索語。TanStack Router は ?q=101 を number、?q=true を boolean で渡すので
 * 文字列に戻す。空白だけなら無し（URL に ?q= を残さない）、長すぎれば切る
 */
function pickQuery(value: unknown): string | undefined {
  const str =
    typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : value
  if (typeof str !== 'string' || str.trim() === '') return undefined
  return str.slice(0, SEARCH_QUERY_MAX)
}

/**
 * 生の検索パラメータ（TanStack Router の validateSearch に渡る
 * Record<string, unknown>、または URLSearchParams を Object.fromEntries したもの）を
 * 解釈する。値が undefined のキーは結果に含めない。
 */
export function parseTaiwanMapSearch(
  raw: Record<string, unknown>,
): TaiwanMapSearch {
  const result: TaiwanMapSearch = {}
  const city = pick(CITY_IDS, raw.city)
  if (city) result.city = city
  const area: AreaId | undefined = pickId(raw.area)
  if (area) result.area = area
  const category = pick(SPOT_CATEGORY_IDS, raw.category)
  if (category) result.category = category
  const status = pick(VISIT_STATUS_IDS, raw.status)
  if (status) result.status = status
  const label = pick(SPOT_LABEL_IDS, raw.label)
  if (label) result.label = label
  const spot = pickId(raw.spot)
  if (spot) result.spot = spot
  const view = pick(['list', 'map'] as const, raw.view)
  // list は既定値なので URL に残さない（同じ画面の URL を 1 通りにする）
  if (view === 'map') result.view = view
  const q = pickQuery(raw.q)
  if (q) result.q = q
  return result
}

/** 共有用のクエリ文字列（先頭の ? なし）。キー順は KEY_ORDER で固定 */
export function serializeTaiwanMapSearch(search: TaiwanMapSearch): string {
  const params = new URLSearchParams()
  for (const key of KEY_ORDER) {
    const value = search[key]
    if (value !== undefined) params.set(key, value)
  }
  return params.toString()
}

/**
 * キーを KEY_ORDER の順に並べ直し、undefined のキーを落とした新しいオブジェクト。
 * TanStack Router はオブジェクトのキー順のまま URL にするので、navigate の
 * 前にこれを通すと、アドレスバーの URL と「リンクをコピー」の URL が
 * 同じ並びになる（同じ条件なのに見た目の違う URL が出回らない）。
 */
export function orderTaiwanMapSearch(search: TaiwanMapSearch): TaiwanMapSearch {
  const ordered: Record<string, string> = {}
  for (const key of KEY_ORDER) {
    const value = search[key]
    if (value !== undefined) ordered[key] = value
  }
  return ordered
}

export function filterFromSearch(search: TaiwanMapSearch): SpotFilter {
  const { city, area, category, status, label } = search
  return { city, area, category, status, label }
}

/**
 * 「この条件のリンクをコピー」で渡す条件。絞り込み（都市・エリア・ジャンル・
 * 状態・気持ち）と検索語だけを残し、今たまたま選んでいるスポットと、スマホの
 * 一覧 / 地図の切り替えは落とす（受け取った人が最初からその 1 件に
 * 寄せられたり、地図だけの画面で開いたりしないように）。
 */
export function shareableSearch(search: TaiwanMapSearch): TaiwanMapSearch {
  const shared: TaiwanMapSearch = filterFromSearch(search)
  if (search.q !== undefined) shared.q = search.q
  return orderTaiwanMapSearch(shared)
}

/** そのスポットを選んでいない状態（選択を閉じたときに戻る先）の URL */
export function unselectedKey(search: TaiwanMapSearch): string {
  return serializeTaiwanMapSearch({ ...search, spot: undefined })
}

/**
 * スポットの選択を外す（× ・Esc・地図の何も無い所）ときの履歴の扱い。
 * - 何も選んでいない → 'none'
 * - 今の履歴に「1 つ前は選択を外しただけの状態」の印（unselectedMark）があり、
 *   それが今の画面から選択を外した URL と一致する → 'back'
 *   （選んだときに積んだ 1 件を history.back() で戻す。「戻る」と同じ）
 * - それ以外（共有リンクで開いた直後・印が古い）→ 'replace'
 *   （spot を落とした URL に置き換える。選んでいない状態の履歴を積み増さない）
 */
export function deselectAction(
  search: TaiwanMapSearch,
  unselectedMark: string | undefined,
): 'none' | 'back' | 'replace' {
  if (search.spot === undefined) return 'none'
  return unselectedMark === unselectedKey(search) ? 'back' : 'replace'
}

/**
 * 画面の URL を書き換えるとき、ブラウザの履歴に積むか置き換えるか。
 * - 絞り込み（都市・エリア・ジャンル・状態・気持ち）か、一覧 / 地図の
 *   切り替えが変わる → 'push'（「戻る」で 1 つ前の条件・一覧に戻れる）
 * - 検索語が変わる → 'replace'（1 文字打つたびに履歴が増えないように。
 *   打っているあいだに一緒にスポットの選択が外れても同じ）
 * - 何も選んでいない状態からスポットを選ぶ → 'push'（「戻る」で選ぶ前に
 *   戻れる。地図の位置はそのまま）
 * - 選んでいるスポットを別のスポットに替える・選択を外す → 'replace'
 *   （何件見比べても「戻る」1 回で選ぶ前に戻る。外すほうは、可能なら
 *   画面側が history.back() で積んだ 1 件を戻す。index.tsx 参照）
 * - 何も変わらない → 'skip'（同じ URL を積んで「戻る」が空振りしないように）
 */
export function historyMode(
  prev: TaiwanMapSearch,
  next: TaiwanMapSearch,
): 'push' | 'replace' | 'skip' {
  const a = orderTaiwanMapSearch(prev)
  const b = orderTaiwanMapSearch(next)
  const changed = KEY_ORDER.filter((key) => a[key] !== b[key])
  if (changed.length === 0) return 'skip'
  if (changed.some((key) => key !== 'spot' && key !== 'q')) return 'push'
  if (changed.includes('q')) return 'replace'
  return a.spot === undefined && b.spot !== undefined ? 'push' : 'replace'
}
