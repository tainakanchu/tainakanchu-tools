import { AlertTriangle, PlaneLanding, PlaneTakeoff } from 'lucide-react'
import { dayDiff, isValidISODate } from '../../../../lib/trip-scheduler/dates'
import { cardClass, fieldClass, sectionTitleClass } from '../-lib/styles'
import { CitySelect } from './CitySelect'
import { DateLabel } from './DateLabel'
import type { TripDispatch } from '../-lib/reducer'
import type { TripState } from '../../../../lib/trip-scheduler/types'

interface SetupPanelProps {
  state: TripState
  dispatch: TripDispatch
}

/**
 * 航空券アンカー。ここで決めた期間と IN/OUT 都市は
 * 「もう動かせない前提条件」として以降の編集の外枠になる。
 */
export function SetupPanel({ state, dispatch }: SetupPanelProps) {
  const datesValid =
    isValidISODate(state.startDate) && isValidISODate(state.endDate)
  const nights = datesValid ? dayDiff(state.startDate, state.endDate) : 0
  const rangeOk = datesValid && nights > 0

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <PlaneLanding size={18} className="text-cyan-600" />
        航空券(確定している前提条件)
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        往復の航空券が取れている前提で、期間と発着都市を先に固定します。ここを基準に泊数を配っていきます。
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">
            ヨーロッパ到着日
          </span>
          <input
            type="date"
            value={state.startDate}
            onChange={(event) =>
              dispatch({ type: 'setStartDate', date: event.target.value })
            }
            className={fieldClass}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-gray-700">
            ヨーロッパ出発日(帰国便)
          </span>
          <input
            type="date"
            value={state.endDate}
            onChange={(event) =>
              dispatch({ type: 'setEndDate', date: event.target.value })
            }
            className={fieldClass}
          />
        </label>

        <label className="space-y-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <PlaneLanding size={14} className="text-gray-400" />
            IN(到着都市)
          </span>
          <CitySelect
            label="到着都市"
            placeholder="未定"
            value={state.inCityId}
            onChange={(cityId) => dispatch({ type: 'setInCity', cityId })}
          />
        </label>
        <label className="space-y-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <PlaneTakeoff size={14} className="text-gray-400" />
            OUT(出発都市)
          </span>
          <CitySelect
            label="出発都市"
            placeholder="未定"
            value={state.outCityId}
            onChange={(cityId) => dispatch({ type: 'setOutCity', cityId })}
          />
        </label>
      </div>

      {rangeOk ? (
        <p className="mt-4 rounded-xl bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
          <span className="font-semibold">
            {nights}泊{nights + 1}日
          </span>
          <span className="ml-2 text-cyan-800/80">
            <DateLabel iso={state.startDate} /> 〜{' '}
            <DateLabel iso={state.endDate} />
          </span>
        </p>
      ) : (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            帰国日は到着日より後の日付にしてください。期間が決まらないと泊数を配れません。
          </span>
        </p>
      )}
    </section>
  )
}
