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
}

/** 出力順。共有 URL の見た目を毎回同じにするため固定する */
const KEY_ORDER = [
  'city',
  'area',
  'category',
  'status',
  'label',
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

export function filterFromSearch(search: TaiwanMapSearch): SpotFilter {
  const { city, area, category, status, label } = search
  return { city, area, category, status, label }
}
