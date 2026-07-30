import { legKeyOf } from '../../../../lib/trip-scheduler/derive'
import {
  createInitialState,
  newId,
} from '../../../../lib/trip-scheduler/storage'
import type {
  Constraint,
  ConstraintSeverity,
  Stay,
  TravelMode,
  TripState,
} from '../../../../lib/trip-scheduler/types'

/** 候補プールから日程に入れるときの初期泊数(2泊 = 丸1日観光できる最小単位) */
export const DEFAULT_STAY_NIGHTS = 2

/** Undo 履歴の上限 */
const HISTORY_LIMIT = 50

export type TripAction =
  | { type: 'setStartDate'; date: string }
  | { type: 'setEndDate'; date: string }
  | { type: 'setInCity'; cityId: string | null }
  | { type: 'setOutCity'; cityId: string | null }
  | { type: 'addToPool'; cityId: string }
  | { type: 'removeFromPool'; cityId: string }
  | { type: 'placeFromPool'; cityId: string }
  | { type: 'removeStay'; stayId: string }
  | { type: 'changeNights'; stayId: string; delta: number }
  | { type: 'moveStay'; stayId: string; delta: number }
  | {
      type: 'setLegMode'
      fromCityId: string
      toCityId: string
      mode: TravelMode
    }
  | { type: 'addConstraint'; constraint: Constraint }
  | { type: 'setConstraintSeverity'; id: string; severity: ConstraintSeverity }
  | { type: 'toggleConstraint'; id: string }
  | { type: 'removeConstraint'; id: string }
  | { type: 'replaceState'; state: TripState }
  | { type: 'resetAll'; today: string }

export type HistoryAction = TripAction | { type: 'undo' } | { type: 'redo' }

export interface HistoryState {
  past: Array<TripState>
  present: TripState
  future: Array<TripState>
}

/** 子コンポーネントには編集アクションだけを渡す(Undo/Redo はページ側の責務) */
export type TripDispatch = (action: TripAction) => void

export function createHistory(present: TripState): HistoryState {
  return { past: [], present, future: [] }
}

function makeStay(cityId: string, nights: number): Stay {
  return { id: newId('stay'), cityId, nights }
}

function withoutCity(pool: Array<string>, cityId: string): Array<string> {
  return pool.filter((id) => id !== cityId)
}

/** 日程から外した都市は候補プールへ戻す(同じ都市が別の滞在に残っていれば戻さない) */
function removeStayAt(state: TripState, index: number): TripState {
  const target = state.stays[index]
  const stays = state.stays.filter((_, i) => i !== index)
  const stillPlaced = stays.some((stay) => stay.cityId === target.cityId)
  const backToPool =
    !stillPlaced && !state.poolCityIds.includes(target.cityId)
      ? [...state.poolCityIds, target.cityId]
      : state.poolCityIds
  return { ...state, stays, poolCityIds: backToPool }
}

/**
 * IN/OUT 都市は航空券で確定している前提条件なので、選ばれた時点で
 * 最初/最後の滞在として置いておく(未配置のときだけ。既存の並びは壊さない)。
 */
function anchorCity(
  state: TripState,
  cityId: string,
  position: 'first' | 'last',
): TripState {
  const poolCityIds = withoutCity(state.poolCityIds, cityId)
  if (state.stays.some((stay) => stay.cityId === cityId)) {
    return { ...state, poolCityIds }
  }
  const stay = makeStay(cityId, DEFAULT_STAY_NIGHTS)
  return {
    ...state,
    poolCityIds,
    stays:
      position === 'first' ? [stay, ...state.stays] : [...state.stays, stay],
  }
}

export function tripReducer(state: TripState, action: TripAction): TripState {
  switch (action.type) {
    case 'setStartDate':
      if (state.startDate === action.date) return state
      return { ...state, startDate: action.date }

    case 'setEndDate':
      if (state.endDate === action.date) return state
      return { ...state, endDate: action.date }

    case 'setInCity': {
      const next: TripState = { ...state, inCityId: action.cityId }
      if (action.cityId === null) return next
      return anchorCity(next, action.cityId, 'first')
    }

    case 'setOutCity': {
      const next: TripState = { ...state, outCityId: action.cityId }
      if (action.cityId === null) return next
      return anchorCity(next, action.cityId, 'last')
    }

    case 'addToPool': {
      if (state.poolCityIds.includes(action.cityId)) return state
      if (state.stays.some((stay) => stay.cityId === action.cityId))
        return state
      return { ...state, poolCityIds: [...state.poolCityIds, action.cityId] }
    }

    case 'removeFromPool': {
      if (!state.poolCityIds.includes(action.cityId)) return state
      return {
        ...state,
        poolCityIds: withoutCity(state.poolCityIds, action.cityId),
      }
    }

    case 'placeFromPool': {
      const stays = [...state.stays]
      // 末尾が OUT 都市なら、その手前に入れる(帰国便の発地は動かせないので)
      const last = stays.at(-1)
      const insertAt =
        state.outCityId !== null && last?.cityId === state.outCityId
          ? stays.length - 1
          : stays.length
      stays.splice(insertAt, 0, makeStay(action.cityId, DEFAULT_STAY_NIGHTS))
      return {
        ...state,
        poolCityIds: withoutCity(state.poolCityIds, action.cityId),
        stays,
      }
    }

    case 'removeStay': {
      const index = state.stays.findIndex((stay) => stay.id === action.stayId)
      if (index === -1) return state
      return removeStayAt(state, index)
    }

    case 'changeNights': {
      const index = state.stays.findIndex((stay) => stay.id === action.stayId)
      if (index === -1) return state
      const stay = state.stays[index]
      const nights = stay.nights + action.delta
      // 1泊の状態で「−」を押したら日程から外す(確認なし・Undo で戻せる)
      if (nights < 1) return removeStayAt(state, index)
      const stays = [...state.stays]
      stays[index] = { ...stay, nights }
      return { ...state, stays }
    }

    case 'moveStay': {
      const index = state.stays.findIndex((stay) => stay.id === action.stayId)
      if (index === -1) return state
      const to = index + action.delta
      if (to < 0 || to >= state.stays.length) return state
      const stays = [...state.stays]
      const [moved] = stays.splice(index, 1)
      stays.splice(to, 0, moved)
      return { ...state, stays }
    }

    case 'setLegMode': {
      const key = legKeyOf(action.fromCityId, action.toCityId)
      if (state.legModes[key] === action.mode) return state
      return { ...state, legModes: { ...state.legModes, [key]: action.mode } }
    }

    case 'addConstraint':
      return {
        ...state,
        constraints: [...state.constraints, action.constraint],
      }

    case 'setConstraintSeverity':
      return {
        ...state,
        constraints: state.constraints.map((c) =>
          c.id === action.id ? { ...c, severity: action.severity } : c,
        ),
      }

    case 'toggleConstraint':
      return {
        ...state,
        constraints: state.constraints.map((c) =>
          c.id === action.id ? { ...c, enabled: !c.enabled } : c,
        ),
      }

    case 'removeConstraint':
      return {
        ...state,
        constraints: state.constraints.filter((c) => c.id !== action.id),
      }

    case 'replaceState':
      return action.state

    case 'resetAll':
      return createInitialState(action.today)
  }
}

/**
 * Undo/Redo 付きのリデューサ。編集で状態が実際に変わったときだけ past に積む
 * (端で ▲ を押した等の空振りは履歴を汚さない)。
 */
export function historyReducer(
  history: HistoryState,
  action: HistoryAction,
): HistoryState {
  if (action.type === 'undo') {
    if (history.past.length === 0) return history
    const previous = history.past[history.past.length - 1]
    return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future].slice(0, HISTORY_LIMIT),
    }
  }

  if (action.type === 'redo') {
    if (history.future.length === 0) return history
    const [next, ...rest] = history.future
    return {
      past: [...history.past, history.present].slice(-HISTORY_LIMIT),
      present: next,
      future: rest,
    }
  }

  const present = tripReducer(history.present, action)
  if (present === history.present) return history
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
  }
}
