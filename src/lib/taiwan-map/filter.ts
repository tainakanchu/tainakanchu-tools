/**
 * スポットの絞り込み。TaiwanSpot（都市 JSON の本文つき）と
 * SpotIndexEntry（軽量インデックス）の両方に同じ条件をかけられるよう、
 * 判定に使う項目だけを持つ構造的な型で受ける。
 *
 * 条件は各軸 1 値の AND。複数値（食べる OR 飲む）を許すと共有 URL の
 * 形が増えて「この URL は何を見せたいのか」が読み取りにくくなるので、
 * まずは 1 軸 1 値に絞っている。
 */

import { CITY_IDS } from './types.ts'
import type {
  AreaId,
  CityId,
  SpotCategory,
  SpotLabel,
  VisitStatus,
} from './types.ts'

export type SpotFilter = {
  city?: CityId
  area?: AreaId
  category?: SpotCategory
  status?: VisitStatus
  label?: SpotLabel
}

export type FilterableSpot = {
  city: CityId
  area?: AreaId
  categories: ReadonlyArray<SpotCategory>
  status: VisitStatus
  labels?: ReadonlyArray<SpotLabel>
}

export function matchesFilter(
  spot: FilterableSpot,
  filter: SpotFilter,
): boolean {
  if (filter.city !== undefined && spot.city !== filter.city) return false
  if (filter.area !== undefined && spot.area !== filter.area) return false
  if (
    filter.category !== undefined &&
    !spot.categories.includes(filter.category)
  ) {
    return false
  }
  if (filter.status !== undefined && spot.status !== filter.status) return false
  if (
    filter.label !== undefined &&
    !(spot.labels ?? []).includes(filter.label)
  ) {
    return false
  }
  return true
}

export function filterSpots<T extends FilterableSpot>(
  spots: ReadonlyArray<T>,
  filter: SpotFilter,
): Array<T> {
  return spots.filter((spot) => matchesFilter(spot, filter))
}

/**
 * 条件に合うスポットを持つ都市だけを CITIES の順で返す。
 * 都市未指定の絞り込み（?category=food など）で「どの都市 JSON を読むか」を
 * インデックスから決めるのに使う。合わない都市のファイルは読まない。
 */
export function citiesWithMatches(
  index: ReadonlyArray<FilterableSpot>,
  filter: SpotFilter,
): Array<CityId> {
  const hit = new Set(filterSpots(index, filter).map((s) => s.city))
  return CITY_IDS.filter((id) => hit.has(id))
}

/** 何か 1 つでも条件が付いているか（付いていなければトップページを出す） */
export function hasAnyFilter(filter: SpotFilter): boolean {
  return (
    filter.city !== undefined ||
    filter.area !== undefined ||
    filter.category !== undefined ||
    filter.status !== undefined ||
    filter.label !== undefined
  )
}
