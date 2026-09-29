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

import { useEffect, useMemo, useState } from 'react'
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
  /** ?spot= だけが指定され、そのスポットが存在しなかった */
  spotNotFound: boolean
}

export type TaiwanMapData =
  | {
      mode: 'landing'
      manifest: TaiwanManifest | null
      error: string | null
    }
  | {
      mode: 'results'
      data: ResultsData | null
      loading: boolean
      error: string | null
    }

async function loadResults(
  repo: TaiwanMapRepository,
  filter: SpotFilter,
  spotId: string | undefined,
): Promise<ResultsData> {
  let cities: Array<CityId>
  let spotNotFound = false

  if (filter.city !== undefined) {
    cities = [filter.city]
  } else {
    const index = await repo.getSpotIndex()
    const hit = new Set(
      hasAnyFilter(filter) ? citiesWithMatches(index, filter) : [],
    )
    if (spotId !== undefined) {
      const entry = index.find((e) => e.id === spotId)
      if (entry) {
        // 他の条件が無いとき（?spot= だけの共有リンク）だけ、そのスポットの
        // 都市を読む。条件つきなら、条件に合う都市の中にあれば一緒に出る
        if (!hasAnyFilter(filter)) hit.add(entry.city)
      } else {
        spotNotFound = true
      }
    }
    cities = CITY_IDS.filter((id) => hit.has(id))
  }

  const loaded = await Promise.all(cities.map((id) => repo.getCity(id)))
  const allSpots = loaded.flatMap((c) => c.spots)

  return {
    cities,
    areas: loaded.flatMap((c) => c.areas),
    spots: filterSpots(allSpots, filter),
    spotNotFound,
  }
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
  // ?spot= の付け外しで読む都市が変わるのは「条件なし」のときだけ。
  // 条件つきで一覧のカードを選ぶたびに読み直さないよう、依存を絞る
  const spotForLoading = hasAnyFilter(filter) ? undefined : search.spot

  const [manifest, setManifest] = useState<TaiwanManifest | null>(null)
  const [results, setResults] = useState<ResultsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)

    if (isLanding) {
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
  }, [repo, filter, isLanding, spotForLoading])

  if (isLanding) return { mode: 'landing', manifest, error }
  return { mode: 'results', data: results, loading, error }
}
