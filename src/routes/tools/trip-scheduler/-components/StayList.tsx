import { Fragment, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ListOrdered } from 'lucide-react'
import { fallbackCityColor } from '../-lib/palette'
import { cardClass, sectionTitleClass } from '../-lib/styles'
import {
  STAY_LIST_END_DROPPABLE_ID,
  isDragging,
  useTripDrag,
} from '../-lib/dnd'
import { LegRow } from './LegRow'
import { StayRow } from './StayRow'
import type { CityColor } from '../-lib/palette'
import type { TripDispatch } from '../-lib/reducer'
import type {
  DerivedTrip,
  TripState,
  Violation,
} from '../../../../lib/trip-scheduler/types'

interface StayListProps {
  state: TripState
  derived: DerivedTrip
  colors: Map<string, CityColor>
  dispatch: TripDispatch
}

/** 末尾に落としたときの投入先。プールからドラッグしている間だけ現れる */
function StayListEndDropZone() {
  const { setNodeRef, isOver } = useDroppable({
    id: STAY_LIST_END_DROPPABLE_ID,
  })
  return (
    <li
      ref={setNodeRef}
      className={`ml-8 rounded-xl border-2 border-dashed px-3 py-3 text-center text-xs transition ${
        isOver
          ? 'border-cyan-500 bg-cyan-50 font-medium text-cyan-700'
          : 'border-gray-300 bg-gray-50 text-gray-500'
      }`}
    >
      ここに落とすと最後に入ります
    </li>
  )
}

/** 編集の主役。ハンドルのドラッグ、±ボタンと▲▼で、2人で相談しながら1泊単位で動かす */
export function StayList({ state, derived, colors, dispatch }: StayListProps) {
  const drag = useTripDrag()
  const dragging = isDragging(drag)

  const windowByStayId = useMemo(
    () => new Map(derived.windows.map((w) => [w.stayId, w])),
    [derived.windows],
  )
  const legByFromStayId = useMemo(
    () => new Map(derived.legs.map((leg) => [leg.fromStayId, leg])),
    [derived.legs],
  )
  const violationsByStayId = useMemo(() => {
    const map = new Map<string, Array<Violation>>()
    for (const violation of derived.violations) {
      for (const stayId of violation.stayIds) {
        const list = map.get(stayId)
        if (list) {
          list.push(violation)
        } else {
          map.set(stayId, [violation])
        }
      }
    }
    return map
  }, [derived.violations])

  const stayIds = useMemo(
    () => state.stays.map((stay) => stay.id),
    [state.stays],
  )

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <ListOrdered size={18} className="text-cyan-600" />
        滞在の並び
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        順番は左のハンドル(⠿)を掴んでドラッグ、または▲▼で1つずつ。泊数は −/+
        で1泊ずつ。1泊のときに −
        を押すと日程から外れて候補に戻ります(取り消しは元に戻すボタンで)。
      </p>

      {state.stays.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          まだ滞在がありません。右の「行きたい都市の候補」から日程に入れてください。
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          <SortableContext
            items={stayIds}
            strategy={verticalListSortingStrategy}
          >
            {state.stays.map((stay, index) => {
              const leg = legByFromStayId.get(stay.id)
              return (
                <Fragment key={stay.id}>
                  <StayRow
                    stay={stay}
                    index={index}
                    total={state.stays.length}
                    color={colors.get(stay.cityId) ?? fallbackCityColor}
                    stayWindow={windowByStayId.get(stay.id)}
                    violations={violationsByStayId.get(stay.id) ?? []}
                    dispatch={dispatch}
                    showInsertBefore={drag.poolInsertIndex === index}
                  />
                  {leg ? (
                    <LegRow
                      leg={leg}
                      startDate={state.startDate}
                      dispatch={dispatch}
                      collapsed={dragging}
                    />
                  ) : null}
                </Fragment>
              )
            })}
          </SortableContext>
          {drag.activePoolCityId !== null ? <StayListEndDropZone /> : null}
        </ul>
      )}
    </section>
  )
}
