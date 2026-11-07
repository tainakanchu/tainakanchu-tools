/**
 * スポットの絞り込み。TaiwanSpot（都市 JSON の本文つき）と
 * SpotIndexEntry（軽量インデックス）の両方に同じ条件をかけられるよう、
 * 判定に使う項目だけを持つ構造的な型で受ける。
 *
 * 条件は各軸 1 値の AND。複数値（食べる OR 飲む）を許すと共有 URL の
 * 形が増えて「この URL は何を見せたいのか」が読み取りにくくなるので、
 * まずは 1 軸 1 値に絞っている。
 */

import { CITY_IDS, SPOT_CATEGORY_IDS } from './types.ts'
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

/**
 * カテゴリごとの件数。カテゴリ以外の条件（都市・エリア・状態・ラベル）だけを
 * かけて数えるので、カテゴリを 1 つ選んだあとでも「他のジャンルに切り替えたら
 * 何件出るか」が分かる（地図上のジャンルチップで 0 件のものを隠すのに使う）。
 * 1 スポットが複数カテゴリを持つときは、それぞれに 1 件ずつ数える。
 */
export function countByCategory(
  spots: ReadonlyArray<FilterableSpot>,
  filter: SpotFilter,
): ReadonlyMap<SpotCategory, number> {
  const rest: SpotFilter = { ...filter, category: undefined }
  // 0 件のカテゴリも SPOT_CATEGORIES の順でキーを持たせる
  const counts = new Map<SpotCategory, number>(
    SPOT_CATEGORY_IDS.map((id) => [id, 0]),
  )
  for (const spot of spots) {
    if (!matchesFilter(spot, rest)) continue
    for (const c of new Set(spot.categories)) {
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * 都市ごとの件数（条件はかけない、その都市にあるスポットの総数）。
 * 0 件の都市も CITIES の順でキーを持たせる。
 * 絞り込みバーの都市チップを「トップの都市から探すと同じ顔ぶれ・同じ順」で
 * 出すのに使う（件数 0 の都市は押しても何も出ないので出さない）。
 */
export function countByCity(
  spots: ReadonlyArray<Pick<FilterableSpot, 'city'>>,
): ReadonlyMap<CityId, number> {
  const counts = new Map<CityId, number>(CITY_IDS.map((id) => [id, 0]))
  for (const spot of spots)
    counts.set(spot.city, (counts.get(spot.city) ?? 0) + 1)
  return counts
}

/**
 * エリアごとの件数（条件はかけない総数）。エリア未設定のスポットは数えない。
 * 絞り込みバーで 0 件のエリアを隠すのに使う。ジャンルなど他の条件で
 * 数え直さないのは、条件を切り替えるたびにエリアのチップが出たり消えたり
 * して、押そうとした場所がずれるのを避けるため。
 */
export function countByArea(
  spots: ReadonlyArray<Pick<FilterableSpot, 'area'>>,
): ReadonlyMap<AreaId, number> {
  const counts = new Map<AreaId, number>()
  for (const spot of spots) {
    if (spot.area === undefined) continue
    counts.set(spot.area, (counts.get(spot.area) ?? 0) + 1)
  }
  return counts
}

/**
 * 件数ぶんだけ並べるチップの顔ぶれ。0 件のものは出さないが、選択中のものは
 * （URL 直打ちなどで 0 件でも）解除できるよう残す。並びは items の順のまま。
 * counts が null（件数が分からない）のときは全部出す。
 */
export function visibleByCount<T extends { id: string }>(
  items: ReadonlyArray<T>,
  counts: ReadonlyMap<string, number> | null,
  selected: string | undefined,
): Array<T> {
  if (counts === null) return [...items]
  return items.filter(
    (item) => (counts.get(item.id) ?? 0) > 0 || item.id === selected,
  )
}
