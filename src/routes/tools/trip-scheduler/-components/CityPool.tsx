import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical, X } from 'lucide-react'
import { Badge, Button, TextInput } from '../../../../components/ui'
import { cityCatalog, getCity } from '../../../../lib/trip-scheduler/cities'
import {
  panelClass,
  quietIconButtonClass,
  ruledListClass,
  ruledRowClass,
  sectionLeadClass,
  sectionTitleClass,
} from '../-lib/styles'
import { DEFAULT_STAY_NIGHTS } from '../-lib/reducer'
import { poolDragId } from '../-lib/dnd'
import type { TripDispatch } from '../-lib/reducer'
import type { TripState } from '../../../../lib/trip-scheduler/types'

interface CityPoolProps {
  state: TripState
  dispatch: TripDispatch
}

const MAX_SUGGESTIONS = 8

/** 候補 1 件の行。罫で区切って縦に並べる(箱は積まない) */
const rowClass = `${ruledRowClass} flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-2 text-sm`

const chipGripClass =
  'inline-flex h-8 w-6 shrink-0 cursor-grab touch-manipulation items-center justify-center rounded-ui text-ink-muted transition-colors hover:bg-wash hover:text-ink active:cursor-grabbing'

/** ドラッグ中にカーソルへ追従するチップ(操作はできない見た目だけの複製) */
export function CityChipPreview({ cityId }: { cityId: string }) {
  const city = getCity(cityId)
  return (
    <span className="misreg inline-flex cursor-grabbing items-center gap-1.5 rounded-ui py-1.5 pl-2 pr-3 text-sm">
      <GripVertical size={14} className="text-ink-muted" aria-hidden />
      <span className="font-bold">{city?.name ?? cityId}</span>
      <span className="text-xs text-ink-muted">{city?.country}</span>
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
    <li className={`${rowClass} ${isDragging ? 'opacity-40' : ''}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
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
          <GripVertical size={14} aria-hidden />
        </button>
        <span className={placed ? 'text-ink-muted' : 'font-bold'}>
          {cityLabel}
        </span>
        <span className="text-xs text-ink-muted">{city?.country}</span>
        {placed ? (
          <Badge tone="muted" title={`日程に ${placedCount} 回入っています`}>
            {placedCount > 1 ? `日程に${placedCount}回` : '日程に入れた'}
          </Badge>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          onClick={() => dispatch({ type: 'placeFromPool', cityId })}
        >
          {placed ? 'もう一度入れる' : '日程に入れる'}
        </Button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'removeFromPool', cityId })}
          className={quietIconButtonClass}
          aria-label={`${cityLabel} を候補から削除`}
          title="候補から外します(日程に入れた滞在はそのまま残ります)"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
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

  // 配置済みの都市も候補に出す(到着・出発の都市として自動で置かれた都市を再訪させたいときのため)
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
    <section className={panelClass}>
      <h2 className={sectionTitleClass}>行きたい都市の候補</h2>
      <p className={sectionLeadClass}>
        気になる都市をためておく場所です。「日程に入れる」で
        {DEFAULT_STAY_NIGHTS}
        泊で、帰国便の出発都市の手前に並びます。左のつまみをドラッグして、滞在の並びの好きな位置へ入れることもできます。入れたあとも候補は残るので、「最初にパリ、周遊して、最後にまたパリ」のように同じ都市を何度でも置けます。
      </p>

      <div className="mt-4">
        <TextInput
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="都市名・国名で検索(例: イタリア、パリ)"
          aria-label="都市を検索"
        />
      </div>

      {query.trim() !== '' ? (
        suggestions.length > 0 ? (
          <ul className={`mt-3 ${ruledListClass}`}>
            {suggestions.map((city) => (
              <li key={city.id} className={ruledRowClass}>
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'addToPool', cityId: city.id })
                    setQuery('')
                  }}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-ui px-2 py-2 text-left text-sm transition-colors hover:bg-wash focus-visible:shadow-[3px_3px_0_0_var(--color-pink)]"
                >
                  <span>
                    <span className="font-bold">{city.name}</span>
                    <span className="ml-2 text-xs text-ink-muted">
                      {city.country}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-ink-muted">
                    候補に足す
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            該当する都市が見つかりません(すでに候補に入っているかもしれません)。
          </p>
        )
      ) : null}

      <div className="mt-4">
        {state.poolCityIds.length === 0 ? (
          <p className="border-[1.5px] border-dashed border-ink-muted px-3 py-3 text-sm text-ink-muted">
            候補はまだ空です。上の検索から追加してください。
          </p>
        ) : (
          <ul className={ruledListClass}>
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
