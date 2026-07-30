import { cityName } from './cities'
import { dayDiff, formatShortJa, isValidISODate } from './dates'
import type { Constraint, StayWindow, TripState, Violation } from './types'

/**
 * 制約チェック。すべて純関数で、UI のハイライトにも(将来の)探索にも使える。
 * 制約は「穴埋め文」として UI に表示される前提で、message は
 * 相手(配偶者)が読んで意味がわかる日本語にする。
 */

export function constraintLabel(constraint: Constraint): string {
  switch (constraint.kind) {
    case 'stayNights': {
      const name = cityName(constraint.cityId)
      if (constraint.min !== null && constraint.max !== null) {
        if (constraint.min === constraint.max)
          return `${name} にちょうど ${constraint.min} 泊する`
        return `${name} に ${constraint.min}〜${constraint.max} 泊する`
      }
      if (constraint.min !== null) return `${name} に ${constraint.min} 泊以上する`
      if (constraint.max !== null) return `${name} は ${constraint.max} 泊までにする`
      return `${name} の泊数(条件未設定)`
    }
    case 'presenceOnDate':
      return `${formatShortJa(constraint.date)} は ${cityName(constraint.cityId)} にいる`
    case 'order':
      return `${cityName(constraint.beforeCityId)} を ${cityName(constraint.afterCityId)} より先に回る`
    case 'mustVisit':
      return `${cityName(constraint.cityId)} には必ず行く`
  }
}

export function evaluateConstraints(
  state: TripState,
  windows: Array<StayWindow>,
  unassignedNights: number,
): Array<Violation> {
  const violations: Array<Violation> = []

  // 組み込み: 泊数の帳簿超過(不足はゲージで見せるので違反にしない)
  if (unassignedNights < 0) {
    violations.push({
      constraintId: 'builtin:nightsBudget',
      severity: 'must',
      message: `泊数が ${-unassignedNights} 泊オーバーしています(全 ${Math.max(0, dayDiff(state.startDate, state.endDate))} 泊)`,
      stayIds: [],
    })
  }

  // 組み込み: 航空券アンカー(IN/OUT 都市)
  const firstStay = state.stays[0]
  const lastStay = state.stays[state.stays.length - 1]
  if (state.inCityId && firstStay && firstStay.cityId !== state.inCityId) {
    violations.push({
      constraintId: 'builtin:inCity',
      severity: 'must',
      message: `到着便は ${cityName(state.inCityId)} 着なので、最初の滞在は ${cityName(state.inCityId)} にする必要があります`,
      stayIds: [firstStay.id],
    })
  }
  if (state.outCityId && lastStay && lastStay.cityId !== state.outCityId) {
    violations.push({
      constraintId: 'builtin:outCity',
      severity: 'must',
      message: `帰国便は ${cityName(state.outCityId)} 発なので、最後の滞在は ${cityName(state.outCityId)} にする必要があります`,
      stayIds: [lastStay.id],
    })
  }

  for (const constraint of state.constraints) {
    if (!constraint.enabled) continue
    violations.push(...checkOne(constraint, state, windows))
  }

  return violations
}

function checkOne(
  constraint: Constraint,
  state: TripState,
  windows: Array<StayWindow>,
): Array<Violation> {
  switch (constraint.kind) {
    case 'stayNights': {
      const cityStays = state.stays.filter((s) => s.cityId === constraint.cityId)
      if (cityStays.length === 0) return [] // 未配置は mustVisit の守備範囲
      const nights = cityStays.reduce((sum, s) => sum + s.nights, 0)
      const stayIds = cityStays.map((s) => s.id)
      const name = cityName(constraint.cityId)
      if (constraint.min !== null && nights < constraint.min) {
        return [
          {
            constraintId: constraint.id,
            severity: constraint.severity,
            message: `${name} が ${nights} 泊です(${constraint.min} 泊以上の指定)`,
            stayIds,
          },
        ]
      }
      if (constraint.max !== null && nights > constraint.max) {
        return [
          {
            constraintId: constraint.id,
            severity: constraint.severity,
            message: `${name} が ${nights} 泊です(${constraint.max} 泊までの指定)`,
            stayIds,
          },
        ]
      }
      return []
    }

    case 'presenceOnDate': {
      if (!isValidISODate(constraint.date)) return []
      const day = dayDiff(state.startDate, constraint.date)
      const totalNights = dayDiff(state.startDate, state.endDate)
      const name = cityName(constraint.cityId)
      const dateLabel = formatShortJa(constraint.date)
      if (day < 0 || day > totalNights) {
        return [
          {
            constraintId: constraint.id,
            severity: constraint.severity,
            message: `${dateLabel} は旅程の期間外です(${name} にいる指定)`,
            stayIds: [],
          },
        ]
      }
      // 移動日はどちらの都市にもいる扱い(緩め)にする
      const there = windows.some(
        (w) =>
          w.cityId === constraint.cityId &&
          w.arriveDay <= day &&
          day <= w.departDay,
      )
      if (there) return []
      const actual = windows.filter((w) => w.arriveDay <= day && day <= w.departDay)
      const actualLabel =
        actual.length > 0
          ? actual.map((w) => cityName(w.cityId)).join('・')
          : 'どの都市にも未配置'
      return [
        {
          constraintId: constraint.id,
          severity: constraint.severity,
          message: `${dateLabel} は ${actualLabel} になっています(${name} にいる指定)`,
          stayIds: actual.map((w) => w.stayId),
        },
      ]
    }

    case 'order': {
      const beforeIndex = state.stays.findIndex(
        (s) => s.cityId === constraint.beforeCityId,
      )
      const afterIndex = state.stays.findIndex(
        (s) => s.cityId === constraint.afterCityId,
      )
      if (beforeIndex === -1 || afterIndex === -1) return []
      if (beforeIndex < afterIndex) return []
      return [
        {
          constraintId: constraint.id,
          severity: constraint.severity,
          message: `${cityName(constraint.beforeCityId)} が ${cityName(constraint.afterCityId)} より後になっています`,
          stayIds: [state.stays[beforeIndex].id, state.stays[afterIndex].id],
        },
      ]
    }

    case 'mustVisit': {
      const placed = state.stays.some((s) => s.cityId === constraint.cityId)
      if (placed) return []
      return [
        {
          constraintId: constraint.id,
          severity: constraint.severity,
          message: `${cityName(constraint.cityId)} がまだ日程に入っていません`,
          stayIds: [],
        },
      ]
    }
  }
}
