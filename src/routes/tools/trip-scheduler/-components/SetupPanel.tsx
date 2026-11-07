import { Field, Note, TextInput } from '../../../../components/ui'
import { cityName } from '../../../../lib/trip-scheduler/cities'
import { dayDiff, isValidISODate } from '../../../../lib/trip-scheduler/dates'
import { panelClass, sectionLeadClass, sectionTitleClass } from '../-lib/styles'
import { CitySelect } from './CitySelect'
import { DateLabel } from './DateLabel'
import type { TripDispatch } from '../-lib/reducer'
import type { TripState } from '../../../../lib/trip-scheduler/types'

interface SetupPanelProps {
  state: TripState
  dispatch: TripDispatch
}

/**
 * 航空券アンカー。ここで決めた期間と到着・出発の都市は
 * 「もう動かせない前提条件」として以降の編集の外枠になる。
 */
export function SetupPanel({ state, dispatch }: SetupPanelProps) {
  const datesValid =
    isValidISODate(state.startDate) && isValidISODate(state.endDate)
  const nights = datesValid ? dayDiff(state.startDate, state.endDate) : 0
  const rangeOk = datesValid && nights > 0
  /** 同じ都市に着いて同じ都市から帰る往復便(パリ往復のような定番パターン) */
  const roundTripCityId =
    state.inCityId !== null && state.inCityId === state.outCityId
      ? state.inCityId
      : null

  return (
    <section className={panelClass}>
      <h2 className={sectionTitleClass}>航空券</h2>
      <p className={sectionLeadClass}>
        往復の航空券が取れている前提で、期間と発着都市を先に固定します。ここを基準に泊数を配っていきます。
      </p>

      {/* 全幅レイアウトでは 4 項目を1行に並べて、前提条件を横一列の帯として見せる */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="ヨーロッパ到着日">
          <TextInput
            type="date"
            value={state.startDate}
            onChange={(event) =>
              dispatch({ type: 'setStartDate', date: event.target.value })
            }
          />
        </Field>
        <Field label="ヨーロッパ出発日(帰国便)">
          <TextInput
            type="date"
            value={state.endDate}
            onChange={(event) =>
              dispatch({ type: 'setEndDate', date: event.target.value })
            }
          />
        </Field>
        <Field label="到着都市">
          <CitySelect
            placeholder="未定"
            value={state.inCityId}
            onChange={(cityId) => dispatch({ type: 'setInCity', cityId })}
          />
        </Field>
        <Field label="帰国便の出発都市">
          <CitySelect
            placeholder="未定"
            value={state.outCityId}
            onChange={(cityId) => dispatch({ type: 'setOutCity', cityId })}
          />
        </Field>
      </div>

      {rangeOk ? (
        <p className="mt-4 text-sm">
          <span className="font-bold">
            {nights}泊{nights + 1}日
          </span>
          <span className="ml-3 text-ink-muted">
            <DateLabel iso={state.startDate} />〜
            <DateLabel iso={state.endDate} />
          </span>
        </p>
      ) : (
        <Note tone="error" className="mt-4" role="alert">
          帰国日は到着日より後の日付にしてください。期間が決まらないと泊数を配れません。
        </Note>
      )}

      {roundTripCityId !== null ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {cityName(roundTripCityId)}
          の往復なので、最初と最後の両方に{cityName(roundTripCityId)}
          の滞在を置けます。最初に2泊して周遊し、最後にもう一度泊まる、のような組み方です。
        </p>
      ) : null}
    </section>
  )
}
