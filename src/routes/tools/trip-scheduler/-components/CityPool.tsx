import { useMemo, useState } from 'react'
import { CalendarPlus, MapPin, Plus, Search, X } from 'lucide-react'
import { cityCatalog, getCity } from '../../../../lib/trip-scheduler/cities'
import { cardClass, fieldClass, sectionTitleClass } from '../-lib/styles'
import { DEFAULT_STAY_NIGHTS } from '../-lib/reducer'
import type { TripDispatch } from '../-lib/reducer'
import type { TripState } from '../../../../lib/trip-scheduler/types'

interface CityPoolProps {
  state: TripState
  dispatch: TripDispatch
}

const MAX_SUGGESTIONS = 8

/** 行きたい都市の置き場。ここから日程に入れて、外したらここに戻ってくる */
export function CityPool({ state, dispatch }: CityPoolProps) {
  const [query, setQuery] = useState('')

  const placedCityIds = useMemo(
    () => new Set(state.stays.map((stay) => stay.cityId)),
    [state.stays],
  )

  const suggestions = useMemo(() => {
    const keyword = query.trim()
    if (keyword === '') return []
    return cityCatalog
      .filter(
        (city) =>
          !state.poolCityIds.includes(city.id) &&
          !placedCityIds.has(city.id) &&
          (city.name.includes(keyword) || city.country.includes(keyword)),
      )
      .slice(0, MAX_SUGGESTIONS)
  }, [query, state.poolCityIds, placedCityIds])

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <MapPin size={18} className="text-cyan-600" />
        行きたい都市の候補
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        気になる都市をためておく場所です。日程に入れると{DEFAULT_STAY_NIGHTS}
        泊から始まり、OUT都市の手前に並びます。順番は滞在リストの▲▼で入れ替えてください。
      </p>

      <div className="relative mt-4">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="都市名・国名で検索(例: イタリア、パリ)"
          className={`${fieldClass} pl-9`}
          aria-label="都市を検索"
        />
      </div>

      {query.trim() !== '' ? (
        suggestions.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {suggestions.map((city) => (
              <li key={city.id}>
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'addToPool', cityId: city.id })
                    setQuery('')
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2 text-left text-sm transition hover:border-cyan-400 hover:bg-cyan-50"
                >
                  <span>
                    <span className="font-medium text-gray-900">
                      {city.name}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      {city.country}
                    </span>
                  </span>
                  <Plus size={16} className="shrink-0 text-cyan-600" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-500">
            該当する都市が見つかりません(すでに候補や日程に入っているかもしれません)。
          </p>
        )
      ) : null}

      <div className="mt-4">
        {state.poolCityIds.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-500">
            候補はまだ空です。上の検索から追加してください。
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {state.poolCityIds.map((cityId) => {
              const city = getCity(cityId)
              return (
                <li
                  key={cityId}
                  className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 py-1 pl-3 pr-1 text-sm"
                >
                  <span className="font-medium text-gray-800">
                    {city?.name ?? cityId}
                  </span>
                  <span className="text-xs text-gray-500">{city?.country}</span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'placeFromPool', cityId })}
                    className="ml-1 inline-flex items-center gap-1 rounded-full bg-cyan-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-cyan-700"
                  >
                    <CalendarPlus size={12} />
                    日程に入れる
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'removeFromPool', cityId })}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                    aria-label={`${city?.name ?? cityId} を候補から削除`}
                  >
                    <X size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
