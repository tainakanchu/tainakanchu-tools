import { getCity } from './cities'
import { addDays, isValidISODate } from './dates'
import type { Constraint, Stay, TravelMode, TripState } from './types'

const STORAGE_KEY = 'trip-scheduler:v1'

let idCounter = 0

export function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

export function createInitialState(today: string): TripState {
  return {
    schemaVersion: 1,
    startDate: today,
    endDate: addDays(today, 10),
    inCityId: null,
    outCityId: null,
    poolCityIds: [],
    stays: [],
    legModes: {},
    constraints: [],
  }
}

const TRAVEL_MODES: Array<TravelMode> = ['train', 'flight', 'bus', 'nightTrain']

function isStay(value: unknown): value is Stay {
  if (typeof value !== 'object' || value === null) return false
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 外部由来 JSON の検証用キャスト。直後で全プロパティを typeof チェックしてから真偽を返す type guard 関数
  const stay = value as Record<string, unknown>
  return (
    typeof stay.id === 'string' &&
    typeof stay.cityId === 'string' &&
    typeof stay.nights === 'number' &&
    Number.isInteger(stay.nights) &&
    stay.nights >= 1
  )
}

function isConstraint(value: unknown): value is Constraint {
  if (typeof value !== 'object' || value === null) return false
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 外部由来 JSON の検証用キャスト。直後で全プロパティを typeof チェックしてから真偽を返す type guard 関数
  const c = value as Record<string, unknown>
  if (typeof c.id !== 'string') return false
  if (typeof c.enabled !== 'boolean') return false
  if (c.severity !== 'must' && c.severity !== 'want') return false
  switch (c.kind) {
    case 'stayNights':
      return (
        typeof c.cityId === 'string' &&
        (c.min === null || typeof c.min === 'number') &&
        (c.max === null || typeof c.max === 'number')
      )
    case 'presenceOnDate':
      return typeof c.cityId === 'string' && typeof c.date === 'string'
    case 'order':
      return (
        typeof c.beforeCityId === 'string' && typeof c.afterCityId === 'string'
      )
    case 'mustVisit':
      return typeof c.cityId === 'string'
    default:
      return false
  }
}

const knownCity = (id: unknown): id is string =>
  typeof id === 'string' && getCity(id) !== undefined

/**
 * 外部由来 JSON(localStorage / ファイル読込)を TripState に検証・正規化する。
 * カタログにない都市 ID は黙って落とす(カタログ更新で消えた都市への保険)。
 */
export function parseTripState(raw: unknown): TripState | null {
  if (typeof raw !== 'object' || raw === null) return null
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 外部由来 JSON (localStorage) の検証用キャスト。以降のフィールドごとの typeof / isValidISODate チェックで正規化する
  const data = raw as Record<string, unknown>
  if (data.schemaVersion !== 1) return null
  if (
    typeof data.startDate !== 'string' ||
    !isValidISODate(data.startDate) ||
    typeof data.endDate !== 'string' ||
    !isValidISODate(data.endDate)
  ) {
    return null
  }

  const stays = Array.isArray(data.stays)
    ? data.stays.filter(isStay).filter((s) => knownCity(s.cityId))
    : []
  const poolCityIds = Array.isArray(data.poolCityIds)
    ? data.poolCityIds.filter(knownCity)
    : []
  const constraints = Array.isArray(data.constraints)
    ? data.constraints.filter(isConstraint)
    : []

  const legModes: Record<string, TravelMode> = {}
  if (typeof data.legModes === 'object' && data.legModes !== null) {
    for (const [key, mode] of Object.entries(data.legModes)) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- data.legModes は object までしか絞り込めず mode は any。TRAVEL_MODES.includes() の許可リストチェック自体が実質的な型ガード
      if (TRAVEL_MODES.includes(mode as TravelMode)) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 直前の includes() チェックで許可リストに含まれることを確認済み
        legModes[key] = mode as TravelMode
      }
    }
  }

  return {
    schemaVersion: 1,
    startDate: data.startDate,
    endDate: data.endDate,
    inCityId: knownCity(data.inCityId) ? data.inCityId : null,
    outCityId: knownCity(data.outCityId) ? data.outCityId : null,
    poolCityIds,
    stays,
    legModes,
    constraints,
  }
}

export function loadFromStorage(): TripState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return parseTripState(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveToStorage(state: TripState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 容量超過やプライベートモードでは保存を諦める(編集は継続できる)
  }
}
