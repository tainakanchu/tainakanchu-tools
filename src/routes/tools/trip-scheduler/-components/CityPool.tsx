import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  CalendarPlus,
  Check,
  GripVertical,
  MapPin,
  Plus,
  Repeat,
  Search,
  X,
} from 'lucide-react'
import { cityCatalog, getCity } from '../../../../lib/trip-scheduler/cities'
import { cardClass, fieldClass, sectionTitleClass } from '../-lib/styles'
import { DEFAULT_STAY_NIGHTS } from '../-lib/reducer'
import { poolDragId } from '../-lib/dnd'
import type { TripDispatch } from '../-lib/reducer'
import type { TripState } from '../../../../lib/trip-scheduler/types'

interface CityPoolProps {
  state: TripState
  dispatch: TripDispatch
}

const MAX_SUGGESTIONS = 8

const chipClass =
  'flex items-center gap-1 rounded-full border py-1 pl-1 pr-1 text-sm transition'

/** 未配置のチップ。ここからどう置くかを考える主役なのではっきり見せる */
const chipIdleClass = 'border-gray-200 bg-gray-50'

/** 配置済みのチップ。用は済んでいるので薄く。再訪のためにプールには残しておく */
const chipPlacedClass = 'border-gray-200/70 bg-white'

const chipGripClass =
  'inline-flex h-6 w-5 shrink-0 cursor-grab touch-manipulation items-center justify-center rounded-full text-gray-300 transition hover:bg-gray-200 hover:text-gray-600 active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500'

/** ドラッグ中にカーソルへ追従するチップ(操作はできない見た目だけの複製) */
export function CityChipPreview({ cityId }: { cityId: string }) {
  const city = getCity(cityId)
  return (
    <span className="inline-flex cursor-grabbing items-center gap-1.5 rounded-full border border-cyan-300 bg-white py-1.5 pl-2 pr-3 text-sm shadow-lg ring-2 ring-cyan-200">
      <GripVertical size={14} className="text-gray-400" />
      <span className="font-medium text-gray-800">{city?.name ?? cityId}</span>
      <span className="text-xs text-gray-500">{city?.country}</span>
    </span>
  )
}

interface PoolCityChipProps {
  cityId: string
  /** その都市が滞在リストに入っている数(0 = 未配置) */
  placedCount: number
  dispatch: TripDispatch
}

function PoolCityChip({ cityId, placedCount, dispatch }: PoolCityChipProps) {
  const city = getCity(cityId)
  const cityLabel = city?.name ?? cityId
  const placed = placedCount > 0
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: poolDragId(cityId),
  })

  return (
    <li
      className={`${chipClass} ${placed ? chipPlacedClass : chipIdleClass} ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <button
        type="button"
        ref={setNodeRef}
        className={chipGripClass}
        aria-label={
          placed
            ? `${cityLabel} をドラッグして日程にもう一度差し込む`
            : `${cityLabel} をドラッグして日程に差し込む`
        }
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <span className={placed ? 'text-gray-500' : 'font-medium text-gray-800'}>
        {cityLabel}
      </span>
      <span className="text-xs text-gray-400">{city?.country}</span>
      {placed ? (
        <span
          className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
          title={`日程に ${placedCount} 回入っています`}
        >
          <Check size={10} />
          配置済み
          {placedCount > 1 ? `×${placedCount}` : ''}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => dispatch({ type: 'placeFromPool', cityId })}
        className={
          placed
            ? 'ml-1 inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-white px-2 py-1 text-xs font-medium text-cyan-700 transition hover:bg-cyan-50'
            : 'ml-1 inline-flex items-center gap-1 rounded-full bg-cyan-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-cyan-700'
        }
      >
        {placed ? (
          <>
            <Repeat size={12} />
            もう一度入れる
          </>
        ) : (
          <>
            <CalendarPlus size={12} />
            日程に入れる
          </>
        )}
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'removeFromPool', cityId })}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
        aria-label={`${cityLabel} を候補から削除`}
        title="候補から外します(日程に入れた滞在はそのまま残ります)"
      >
        <X size={14} />
      </button>
    </li>
  )
}

/** 行きたい都市の置き場。ここから日程に入れて、外したらここに戻ってくる */
export function CityPool({ state, dispatch }: CityPoolProps) {
  const [query, setQuery] = useState('')

  /** 都市 ID → 滞在リストに入っている数(同じ都市を2回置けるので数で持つ) */
  const placedCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const stay of state.stays) {
      counts.set(stay.cityId, (counts.get(stay.cityId) ?? 0) + 1)
    }
    return counts
  }, [state.stays])

  // 配置済みの都市も候補に出す(IN/OUT で自動配置された都市を再訪させたいときのため)
  const suggestions = useMemo(() => {
    const keyword = query.trim()
    if (keyword === '') return []
    return cityCatalog
      .filter(
        (city) =>
          !state.poolCityIds.includes(city.id) &&
          (city.name.includes(keyword) || city.country.includes(keyword)),
      )
      .slice(0, MAX_SUGGESTIONS)
  }, [query, state.poolCityIds])

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <MapPin size={18} className="text-cyan-600" />
        行きたい都市の候補
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        気になる都市をためておく場所です。「日程に入れる」で
        {DEFAULT_STAY_NIGHTS}
        泊からOUT都市の手前に並びます。ハンドル(⠿)を掴んで滞在リストの好きな位置へドラッグしても入れられます。
      </p>
      <p className="mt-1 text-sm text-gray-500">
        入れたあともチップは残ります。同じ都市は何度でも置けるので、パリIN・パリOUTのように「最初にパリ→周遊→最後にまたパリ」も組めます。
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
            該当する都市が見つかりません(すでに候補に入っているかもしれません)。
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
            {state.poolCityIds.map((cityId) => (
              <PoolCityChip
                key={cityId}
                cityId={cityId}
                placedCount={placedCounts.get(cityId) ?? 0}
                dispatch={dispatch}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
