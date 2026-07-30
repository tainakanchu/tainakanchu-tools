import { Fragment, useMemo } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  Minus,
  Plus,
  X,
} from 'lucide-react'
import { getCity } from '../../../../lib/trip-scheduler/cities'
import { formatDays } from '../-lib/format'
import { fallbackCityColor } from '../-lib/palette'
import {
  cardClass,
  iconButtonClass,
  sectionTitleClass,
  stepperButtonClass,
} from '../-lib/styles'
import { DateLabel } from './DateLabel'
import { LegRow } from './LegRow'
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

/** 編集の主役。±ボタンと▲▼だけで、2人で相談しながら1泊単位で動かす */
export function StayList({ state, derived, colors, dispatch }: StayListProps) {
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

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <ListOrdered size={18} className="text-cyan-600" />
        滞在の並び
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        泊数は −/+ で1泊ずつ。1泊のときに −
        を押すと日程から外れて候補に戻ります(取り消しは元に戻すボタンで)。
      </p>

      {state.stays.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          まだ滞在がありません。右の「行きたい都市の候補」から日程に入れてください。
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {state.stays.map((stay, index) => {
            const city = getCity(stay.cityId)
            const stayWindow = windowByStayId.get(stay.id)
            const leg = legByFromStayId.get(stay.id)
            const violations = violationsByStayId.get(stay.id) ?? []
            const color = colors.get(stay.cityId) ?? fallbackCityColor
            const hasViolation = violations.length > 0

            return (
              <Fragment key={stay.id}>
                <li className="relative pl-4">
                  <span
                    className={`absolute left-0 top-4 inline-block h-3.5 w-3.5 rounded-full ring-2 ring-white ${color.dot}`}
                  />
                  <div
                    className={`ml-4 rounded-xl border p-3 transition ${
                      hasViolation
                        ? 'border-red-300 bg-red-50/50 ring-2 ring-red-300'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="text-xs font-semibold tabular-nums text-gray-400">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="text-base font-semibold text-gray-900">
                          {city?.name ?? stay.cityId}
                        </span>
                        <span className="ml-2 text-xs text-gray-500">
                          {city?.country}
                        </span>
                      </span>

                      <span className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: 'changeNights',
                              stayId: stay.id,
                              delta: -1,
                            })
                          }
                          className={stepperButtonClass}
                          aria-label={`${city?.name ?? stay.cityId} の泊数を1減らす`}
                        >
                          <Minus size={16} />
                        </button>
                        <span className="w-14 text-center text-lg font-bold tabular-nums text-gray-900">
                          {stay.nights}
                          <span className="ml-0.5 text-xs font-medium text-gray-500">
                            泊
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: 'changeNights',
                              stayId: stay.id,
                              delta: 1,
                            })
                          }
                          className={stepperButtonClass}
                          aria-label={`${city?.name ?? stay.cityId} の泊数を1増やす`}
                        >
                          <Plus size={16} />
                        </button>
                      </span>

                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() =>
                            dispatch({
                              type: 'moveStay',
                              stayId: stay.id,
                              delta: -1,
                            })
                          }
                          className={iconButtonClass}
                          aria-label="前へ移動"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          type="button"
                          disabled={index === state.stays.length - 1}
                          onClick={() =>
                            dispatch({
                              type: 'moveStay',
                              stayId: stay.id,
                              delta: 1,
                            })
                          }
                          className={iconButtonClass}
                          aria-label="後ろへ移動"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({ type: 'removeStay', stayId: stay.id })
                          }
                          className={`${iconButtonClass} hover:border-red-300 hover:bg-red-50 hover:text-red-600`}
                          aria-label="日程から外す"
                        >
                          <X size={16} />
                        </button>
                      </span>
                    </div>

                    {stayWindow ? (
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                        <span>
                          <DateLabel iso={stayWindow.arriveDate} />
                          <span className="mx-1 text-gray-400">→</span>
                          <DateLabel iso={stayWindow.departDate} />
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          実質観光 {formatDays(stayWindow.effectiveDays)}日
                        </span>
                      </p>
                    ) : null}

                    {hasViolation ? (
                      <ul className="mt-2 space-y-1">
                        {violations.map((violation, i) => (
                          <li
                            key={`${violation.constraintId}-${i}`}
                            className={`flex items-start gap-1.5 text-xs ${
                              violation.severity === 'must'
                                ? 'text-red-700'
                                : 'text-amber-700'
                            }`}
                            title={violation.message}
                          >
                            <AlertTriangle
                              size={13}
                              className="mt-0.5 shrink-0"
                            />
                            <span>{violation.message}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
                {leg ? (
                  <LegRow
                    leg={leg}
                    startDate={state.startDate}
                    dispatch={dispatch}
                  />
                ) : null}
              </Fragment>
            )
          })}
        </ul>
      )}
    </section>
  )
}
