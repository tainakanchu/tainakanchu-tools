import { Fragment, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { fallbackCityColor } from '../-lib/palette'
import {
  emptyClass,
  panelClass,
  ruledListClass,
  sectionLeadClass,
  sectionTitleClass,
} from '../-lib/styles'
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
      className={`my-2 border-[1.5px] border-dashed px-3 py-3 text-center text-xs transition-colors ${
        isOver
          ? 'border-ink bg-pink-tint font-bold'
          : 'border-ink-muted bg-paper text-ink-muted'
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

  /**
   * 同じ都市の何回目の滞在か(パリ往復で最初と最後にパリを置くような再訪を行だけで見分けられるように)。
   * 直前の滞在と同じ都市なら移動 leg が立たないので「続き」として区別する。
   */
  const revisits = useMemo(
    () =>
      state.stays.map((stay, index) => {
        const order = state.stays
          .slice(0, index + 1)
          .filter((s) => s.cityId === stay.cityId).length
        return {
          order,
          continued: index > 0 && state.stays[index - 1].cityId === stay.cityId,
        }
      }),
    [state.stays],
  )

  return (
    <section className={panelClass}>
      <h2 className={sectionTitleClass}>滞在の並び</h2>
      <p className={sectionLeadClass}>
        順番は左のつまみをドラッグするか、上下のボタンで1つずつ動かします。泊数は
        −/+ で1泊ずつ変わり、1泊のときに −
        を押すと日程から外れて候補に戻ります。
      </p>

      {state.stays.length === 0 ? (
        <p className={`mt-4 ${emptyClass}`}>
          まだ滞在がありません。「行きたい都市の候補」から日程に入れてください。
        </p>
      ) : (
        <ul className={`mt-4 ${ruledListClass}`}>
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
                    revisitOrder={revisits[index].order}
                    continuedFromPrevious={revisits[index].continued}
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
