/**
 * URL の条件から「何を読むか」を決めて、必要な JSON だけを取りに行くフック。
 *
 * 読み込み方針（台北だけ見る人に他都市のデータを落とさせない）:
 * - 条件なし（トップ）            → manifest.json だけ
 * - 都市あり（?city=taipei…）      → その都市の JSON だけ
 * - 都市なし・他の条件あり         → spot-index.json で該当都市を割り出し、
 *                                     該当した都市の JSON だけ
 * - ?spot=id だけ                  → spot-index.json でそのスポットの都市を
 *                                     割り出し、その都市の JSON だけ
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  citiesWithMatches,
  filterSpots,
  hasAnyFilter,
} from '../../../../lib/taiwan-map/filter'
import { filterFromSearch } from '../../../../lib/taiwan-map/query'
import { CITY_IDS } from '../../../../lib/taiwan-map/types'
import type { TaiwanMapRepository } from '../../../../lib/taiwan-map/repository'
import type { SpotFilter } from '../../../../lib/taiwan-map/filter'
import type { TaiwanMapSearch } from '../../../../lib/taiwan-map/query'
import type {
  CityId,
  TaiwanArea,
  TaiwanManifest,
  TaiwanSpot,
} from '../../../../lib/taiwan-map/types'

export type ResultsData = {
  /** 読み込んだ都市（CITIES の順） */
  cities: Array<CityId>
  /** 読み込んだ都市のエリア */
  areas: Array<TaiwanArea>
  /** 条件で絞り込んだあとのスポット */
  spots: Array<TaiwanSpot>
  /**
   * 存在が確認できたスポット id（読んだインデックス・都市 JSON の全件）。
   * ?spot= が「絞り込みで外れているだけ」か「そもそも存在しない」かを
   * 見分けるのに使う。
   */
  knownSpotIds: ReadonlySet<string>
  /**
   * ?spot= だけの URL で、インデックスから割り出したそのスポットの都市。
   * 画面側はこれを使って URL に city を足す（index.tsx 参照）。
   */
  resolvedSpotCity: CityId | undefined
}

export type TaiwanMapData =
  | {
      mode: 'landing'
      manifest: TaiwanManifest | null
      error: string | null
      retry: () => void
    }
  | {
      mode: 'results'
      data: ResultsData | null
      loading: boolean
      error: string | null
      retry: () => void
    }

export async function loadResults(
  repo: TaiwanMapRepository,
  filter: SpotFilter,
  spotId: string | undefined,
): Promise<ResultsData> {
  let cities: Array<CityId>
  const knownSpotIds = new Set<string>()
  let resolvedSpotCity: CityId | undefined

  if (filter.city !== undefined) {
    cities = [filter.city]
  } else {
    const index = await repo.getSpotIndex()
    for (const e of index) knownSpotIds.add(e.id)
    const hit = new Set(
      hasAnyFilter(filter) ? citiesWithMatches(index, filter) : [],
    )
    // 他の条件が無いとき（?spot= だけの共有リンク）だけ、そのスポットの
    // 都市を読む。条件つきなら、条件に合う都市の中にあれば一緒に出る
    if (spotId !== undefined && !hasAnyFilter(filter)) {
      resolvedSpotCity = index.find((e) => e.id === spotId)?.city
      if (resolvedSpotCity) hit.add(resolvedSpotCity)
    }
    cities = CITY_IDS.filter((id) => hit.has(id))
  }

  const loaded = await Promise.all(cities.map((id) => repo.getCity(id)))
  const allSpots = loaded.flatMap((c) => c.spots)
  for (const s of allSpots) knownSpotIds.add(s.id)

  return {
    cities,
    areas: loaded.flatMap((c) => c.areas),
    spots: filterSpots(allSpots, filter),
    knownSpotIds,
    resolvedSpotCity,
  }
}

/**
 * ?spot= の行方。一覧に出ていれば 'shown'。存在はするが今の条件で外れて
 * いる（'filtered'）のか、そもそも無い（'missing'）のかで案内を変える。
 */
export function spotLinkStatus(
  spotId: string | undefined,
  data: ResultsData | null,
): 'shown' | 'filtered' | 'missing' | null {
  if (spotId === undefined || data === null) return null
  if (data.spots.some((s) => s.id === spotId)) return 'shown'
  return data.knownSpotIds.has(spotId) ? 'filtered' : 'missing'
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function useTaiwanMapData(
  repo: TaiwanMapRepository,
  search: TaiwanMapSearch,
): TaiwanMapData {
  const filter = useMemo(
    () => filterFromSearch(search),
    // 各値だけを見る（search オブジェクトはナビゲーションのたびに作り直される）
    // oxlint-disable-next-line react/exhaustive-deps
    [search.city, search.area, search.category, search.status, search.label],
  )
  const isLanding = !hasAnyFilter(filter) && search.spot === undefined
  // ?spot= で読む都市が変わるのは「条件なし」のときだけ。条件つきで
  // 一覧のカードや地図のピンを選ぶたびに読み直さない（= 地図のピンを
  // 作り直さない）よう、読み込みの依存からは外す
  const spotForLoading = hasAnyFilter(filter) ? undefined : search.spot

  const [manifest, setManifest] = useState<TaiwanManifest | null>(null)
  const [results, setResults] = useState<ResultsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 再試行ボタン用。増やすと effect が走り直す（失敗した Promise はリポジトリが捨て済み） */
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setError(null)

    if (isLanding) {
      // トップに戻ったら前回の結果は捨てる。残しておくと、次に別の条件で
      // 開いたとき読み込みが終わるまで前回の一覧が一瞬見えてしまう
      setResults(null)
      setLoading(false)
      repo.getManifest().then(
        (m) => {
          if (!cancelled) setManifest(m)
        },
        (e: unknown) => {
          if (!cancelled) setError(errorMessage(e))
        },
      )
    } else {
      setLoading(true)
      loadResults(repo, filter, spotForLoading).then(
        (r) => {
          if (cancelled) return
          setResults(r)
          setLoading(false)
        },
        (e: unknown) => {
          if (cancelled) return
          setError(errorMessage(e))
          setLoading(false)
        },
      )
    }
    return () => {
      cancelled = true
    }
  }, [repo, filter, isLanding, spotForLoading, attempt])

  if (isLanding) return { mode: 'landing', manifest, error, retry }

  // 都市を切り替えた直後は、読み込みが終わるまで前の都市の一覧を出さない
  // （同じ都市の中で条件を変えたときは、地図を作り直さないよう前の結果を
  // 「更新中」として出し続ける）
  const stale =
    results !== null &&
    filter.city !== undefined &&
    !(results.cities.length === 1 && results.cities[0] === filter.city)
  return {
    mode: 'results',
    data: stale ? null : results,
    loading,
    error,
    retry,
  }
}
