/**
 * 旅程パズルのドラッグ&ドロップ共通部品。
 * 滞在リストの並べ替えと、候補プールから滞在リストへの差し込みで同じ DndContext を使う。
 */

import { createContext, useContext } from 'react'

/** 候補プールのチップにつける drag id の接頭辞(滞在の id と混ざらないように) */
const POOL_DRAG_PREFIX = 'pool:'

/** 滞在リストの末尾に置く投入エリア(プールからのドラッグ中だけ表示する) */
export const STAY_LIST_END_DROPPABLE_ID = 'stay-list-end'

export function poolDragId(cityId: string): string {
  return `${POOL_DRAG_PREFIX}${cityId}`
}

/** drag id が候補プール由来なら都市 ID を、滞在の並べ替えなら null を返す */
export function poolCityIdOf(dragId: string): string | null {
  return dragId.startsWith(POOL_DRAG_PREFIX)
    ? dragId.slice(POOL_DRAG_PREFIX.length)
    : null
}

/**
 * ドロップ先 (over の id) を「滞在リストの何番目に入るか」に読み替える。
 * 滞在の上なら「その滞在の直前」、末尾ゾーンなら一番後ろ。リスト外なら null。
 */
export function insertIndexOf(
  overId: string | null,
  stayIds: Array<string>,
): number | null {
  if (overId === null) return null
  if (overId === STAY_LIST_END_DROPPABLE_ID) return stayIds.length
  const index = stayIds.indexOf(overId)
  return index === -1 ? null : index
}

export interface TripDragState {
  /** 並べ替え中の滞在 ID */
  activeStayId: string | null
  /** 候補プールからドラッグ中の都市 ID */
  activePoolCityId: string | null
  /** プールからのドラッグで差し込まれる位置(0 〜 stays.length)。未確定なら null */
  poolInsertIndex: number | null
}

export const idleTripDragState: TripDragState = {
  activeStayId: null,
  activePoolCityId: null,
  poolInsertIndex: null,
}

const TripDragContext = createContext<TripDragState>(idleTripDragState)

export const TripDragProvider = TripDragContext.Provider

export function useTripDrag(): TripDragState {
  return useContext(TripDragContext)
}

/** 何かしらドラッグ中か(移動手段の行を畳むかどうかの判定に使う) */
export function isDragging(drag: TripDragState): boolean {
  return drag.activeStayId !== null || drag.activePoolCityId !== null
}
