import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { cityName } from '../../../../lib/trip-scheduler/cities'
import { fallbackCityColor } from '../-lib/palette'
import {
  TripDragProvider,
  idleTripDragState,
  insertIndexOf,
  poolCityIdOf,
} from '../-lib/dnd'
import { CityChipPreview } from './CityPool'
import { StayRowPreview } from './StayRow'
import type { ReactNode } from 'react'
import type {
  Announcements,
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core'
import type { CityColor } from '../-lib/palette'
import type { TripDragState } from '../-lib/dnd'
import type { TripDispatch } from '../-lib/reducer'
import type { TripState } from '../../../../lib/trip-scheduler/types'

interface TripDragAreaProps {
  state: TripState
  colors: Map<string, CityColor>
  dispatch: TripDispatch
  children: ReactNode
}

/**
 * マウスは 6px 動かすまでドラッグにしない(±ステッパーや▲▼のクリックを奪わないため)。
 * タッチは 200ms 長押ししてから(押してすぐ動かした指はページのスクロールに渡す)。
 * PointerSensor は pointerdown が touchstart より先に走って TouchSensor を無効化してしまうので使わない。
 */
const MOUSE_ACTIVATION_DISTANCE = 6
const TOUCH_ACTIVATION_DELAY_MS = 200
const TOUCH_ACTIVATION_TOLERANCE = 8

const screenReaderInstructions = {
  draggable:
    'スペースキーまたはEnterキーで滞在をつかみます。矢印キーで移動先を選び、もう一度スペースキーで確定、Escapeキーで取り消します。',
}

function dragLabel(state: TripState, dragId: string): string {
  const poolCityId = poolCityIdOf(dragId)
  if (poolCityId !== null) return cityName(poolCityId)
  const stay = state.stays.find((s) => s.id === dragId)
  return stay ? cityName(stay.cityId) : '滞在'
}

/**
 * 滞在リストの並べ替えと、候補プールから滞在リストへの差し込みを受け持つ DndContext。
 * ドロップ確定時に1アクションだけ dispatch するので、Undo 1回で元に戻せる。
 */
export function TripDragArea({
  state,
  colors,
  dispatch,
  children,
}: TripDragAreaProps) {
  const [drag, setDrag] = useState<TripDragState>(idleTripDragState)

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: MOUSE_ACTIVATION_DISTANCE },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_ACTIVATION_DELAY_MS,
        tolerance: TOUCH_ACTIVATION_TOLERANCE,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const stayIds = useMemo(
    () => state.stays.map((stay) => stay.id),
    [state.stays],
  )

  /**
   * 滞在の並べ替えは常にどこかへ吸い付いてほしいので closestCenter。
   * プールのチップは、リストの上に本当に重なったときだけ差し込みたいので pointerWithin。
   */
  const collisionDetection: CollisionDetection = useCallback((args) => {
    if (poolCityIdOf(String(args.active.id)) === null)
      return closestCenter(args)
    if (args.pointerCoordinates === null) return closestCenter(args)
    return pointerWithin(args)
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = String(event.active.id)
    const poolCityId = poolCityIdOf(activeId)
    setDrag({
      activeStayId: poolCityId === null ? activeId : null,
      activePoolCityId: poolCityId,
      poolInsertIndex: null,
    })
  }, [])

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (poolCityIdOf(String(event.active.id)) === null) return
      const next = insertIndexOf(
        event.over ? String(event.over.id) : null,
        stayIds,
      )
      setDrag((prev) =>
        prev.poolInsertIndex === next
          ? prev
          : { ...prev, poolInsertIndex: next },
      )
    },
    [stayIds],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDrag(idleTripDragState)
      const activeId = String(event.active.id)
      const overId = event.over ? String(event.over.id) : null
      if (overId === null) return

      const poolCityId = poolCityIdOf(activeId)
      if (poolCityId !== null) {
        const toIndex = insertIndexOf(overId, stayIds)
        if (toIndex === null) return
        dispatch({ type: 'placeFromPoolAt', cityId: poolCityId, toIndex })
        return
      }

      // 並べ替えは「重なった滞在の位置に入る」。1 アクションなので Undo 1回で戻せる
      if (overId === activeId) return
      const toIndex = stayIds.indexOf(overId)
      if (toIndex === -1) return
      dispatch({ type: 'reorderStay', stayId: activeId, toIndex })
    },
    [dispatch, stayIds],
  )

  const handleDragCancel = useCallback(() => setDrag(idleTripDragState), [])

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) =>
        `${dragLabel(state, String(active.id))} をつかみました`,
      onDragOver: () => undefined,
      onDragEnd: ({ active }) =>
        `${dragLabel(state, String(active.id))} を置きました`,
      onDragCancel: ({ active }) =>
        `${dragLabel(state, String(active.id))} の移動を取り消しました`,
    }),
    [state],
  )

  const activeStay =
    drag.activeStayId === null
      ? undefined
      : state.stays.find((stay) => stay.id === drag.activeStayId)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <TripDragProvider value={drag}>{children}</TripDragProvider>
      <DragOverlay>
        {activeStay ? (
          <StayRowPreview
            stay={activeStay}
            color={colors.get(activeStay.cityId) ?? fallbackCityColor}
          />
        ) : drag.activePoolCityId !== null ? (
          <CityChipPreview cityId={drag.activePoolCityId} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
