import { getCity } from './cities'
import { addDays, dayDiff } from './dates'
import { estimateOptions, recommendedOption } from './travel'
import { evaluateConstraints } from './constraints'
import type {
  DerivedTrip,
  LegKey,
  ResolvedLeg,
  StayWindow,
  TripMetrics,
  TripState,
} from './types'

export function legKeyOf(fromCityId: string, toCityId: string): LegKey {
  return `${fromCityId}>${toCityId}`
}

/** 国際線到着日に観光へ使える割合(午後着 + 時差ボケを想定した目安) */
const ARRIVAL_DAY_FRACTION = 0.5
/** 帰国便出発日に観光へ使える割合 */
const DEPARTURE_DAY_FRACTION = 0.25

/**
 * TripState から日程のすべての導出値を計算する。
 *
 * 泊の帳簿: Σ stay.nights + Σ 夜行移動 = totalNights が成立するとき
 * unassignedNights = 0 になる。
 */
export function deriveTrip(state: TripState): DerivedTrip {
  const totalNights = Math.max(0, dayDiff(state.startDate, state.endDate))
  const totalDays = totalNights + 1

  // 隣接する滞在間の移動 leg を解決する
  const legs: Array<ResolvedLeg> = []
  for (let i = 0; i + 1 < state.stays.length; i++) {
    const from = state.stays[i]
    const to = state.stays[i + 1]
    const fromCity = getCity(from.cityId)
    const toCity = getCity(to.cityId)
    if (!fromCity || !toCity) continue
    const options = estimateOptions(fromCity, toCity)
    const key = legKeyOf(from.cityId, to.cityId)
    const selectedMode = state.legModes[key]
    const chosen =
      options.find((o) => o.mode === selectedMode) ?? recommendedOption(options)
    legs.push({
      key,
      fromStayId: from.id,
      toStayId: to.id,
      fromCityId: from.cityId,
      toCityId: to.cityId,
      chosen,
      options,
      dayIndex: 0, // 後段の走査で確定する
    })
  }

  // 夜インデックスを走査して各滞在の日付窓を確定する
  const windows: Array<StayWindow> = []
  let nightCursor = 0
  for (let i = 0; i < state.stays.length; i++) {
    const stay = state.stays[i]
    const incomingLeg = i > 0 ? legs[i - 1] : undefined
    const outgoingLeg = i < legs.length ? legs[i] : undefined

    // 夜行 leg の泊は前の滞在の後で nightCursor に加算済みなので、
    // 昼行(同日移動)・夜行(翌朝着)どちらも到着日 = nightCursor になる
    const arriveDay = nightCursor
    const departDay = nightCursor + stay.nights

    // 実質観光日数: 到着日・出発日の使える割合 + 中間の丸1日
    const arrivalFraction =
      i === 0
        ? ARRIVAL_DAY_FRACTION
        : incomingLeg && incomingLeg.chosen.nightCost > 0
          ? 1 // 夜行は朝に着くので到着日は丸ごと使える
          : 1 - (incomingLeg?.chosen.dayCost ?? 0)
    const departureFraction =
      i === state.stays.length - 1
        ? DEPARTURE_DAY_FRACTION
        : outgoingLeg && outgoingLeg.chosen.nightCost > 0
          ? 1 // 夜行は夜に乗るので出発日も丸ごと使える
          : 0 // 昼行移動の日は移動先の到着日として数える
    const middleDays = Math.max(0, departDay - arriveDay - 1)
    const effectiveDays = arrivalFraction + middleDays + departureFraction

    windows.push({
      stayId: stay.id,
      cityId: stay.cityId,
      nights: stay.nights,
      arriveDay,
      departDay,
      arriveDate: addDays(state.startDate, arriveDay),
      departDate: addDays(state.startDate, departDay),
      effectiveDays: Math.round(effectiveDays * 100) / 100,
    })

    nightCursor += stay.nights
    if (outgoingLeg) {
      // 昼行: 出発日 = この滞在の最終日。夜行: その夜に泊を1つ消費する
      outgoingLeg.dayIndex = departDay
      nightCursor += outgoingLeg.chosen.nightCost
    }
  }

  const assignedNights = state.stays.reduce((sum, s) => sum + s.nights, 0)
  const overnightLegNights = legs.reduce(
    (sum, leg) => sum + leg.chosen.nightCost,
    0,
  )
  const unassignedNights = totalNights - assignedNights - overnightLegNights

  const metrics: TripMetrics = {
    legCount: legs.length,
    packingCount: legs.length,
    totalTravelMinutes: legs.reduce(
      (sum, leg) => sum + leg.chosen.doorToDoorMinutes,
      0,
    ),
    totalEffectiveDays:
      Math.round(windows.reduce((sum, w) => sum + w.effectiveDays, 0) * 100) /
      100,
    oneNightStayCount: state.stays.filter((s) => s.nights === 1).length,
  }

  const violations = evaluateConstraints(state, windows, unassignedNights)

  return {
    totalNights,
    totalDays,
    overnightLegNights,
    assignedNights,
    unassignedNights,
    legs,
    windows,
    violations,
    metrics,
  }
}
