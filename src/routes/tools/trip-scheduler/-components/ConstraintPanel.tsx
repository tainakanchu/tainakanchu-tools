import { useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  ListChecks,
  Plus,
  Trash2,
} from 'lucide-react'
import { constraintLabel } from '../../../../lib/trip-scheduler/constraints'
import { isValidISODate } from '../../../../lib/trip-scheduler/dates'
import { newId } from '../../../../lib/trip-scheduler/storage'
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  sectionTitleClass,
} from '../-lib/styles'
import { CitySelect } from './CitySelect'
import { DateLabel } from './DateLabel'
import type { TripDispatch } from '../-lib/reducer'
import type {
  Constraint,
  ConstraintKind,
  ConstraintSeverity,
  DerivedTrip,
  TripState,
} from '../../../../lib/trip-scheduler/types'

const kindLabels: Array<{ kind: ConstraintKind; label: string }> = [
  { kind: 'mustVisit', label: '必ず行く' },
  { kind: 'stayNights', label: '泊数の下限・上限' },
  { kind: 'presenceOnDate', label: 'この日はこの都市' },
  { kind: 'order', label: '回る順番' },
]

interface ConstraintPanelProps {
  state: TripState
  derived: DerivedTrip
  dispatch: TripDispatch
}

/** 「穴埋め文」で条件を足していくパネル。2人の希望をここに置いて可視化する */
export function ConstraintPanel({
  state,
  derived,
  dispatch,
}: ConstraintPanelProps) {
  const [kind, setKind] = useState<ConstraintKind>('mustVisit')
  const [cityId, setCityId] = useState<string | null>(null)
  const [otherCityId, setOtherCityId] = useState<string | null>(null)
  const [minNights, setMinNights] = useState('')
  const [maxNights, setMaxNights] = useState('')
  const [date, setDate] = useState('')
  const [severity, setSeverity] = useState<ConstraintSeverity>('must')

  const violatedIds = useMemo(
    () =>
      new Set(derived.violations.map((violation) => violation.constraintId)),
    [derived.violations],
  )

  const resetForm = () => {
    setCityId(null)
    setOtherCityId(null)
    setMinNights('')
    setMaxNights('')
    setDate('')
  }

  const buildConstraint = (): Constraint | null => {
    const base = { id: newId('constraint'), enabled: true, severity }
    switch (kind) {
      case 'mustVisit':
        if (!cityId) return null
        return { ...base, kind: 'mustVisit', cityId }
      case 'stayNights': {
        if (!cityId) return null
        const min = minNights === '' ? null : Number(minNights)
        const max = maxNights === '' ? null : Number(maxNights)
        if (min === null && max === null) return null
        if (min !== null && !Number.isFinite(min)) return null
        if (max !== null && !Number.isFinite(max)) return null
        return { ...base, kind: 'stayNights', cityId, min, max }
      }
      case 'presenceOnDate':
        if (!cityId || !isValidISODate(date)) return null
        return { ...base, kind: 'presenceOnDate', cityId, date }
      case 'order':
        if (!cityId || !otherCityId || cityId === otherCityId) return null
        return {
          ...base,
          kind: 'order',
          beforeCityId: cityId,
          afterCityId: otherCityId,
        }
    }
  }

  const handleSubmit = () => {
    const constraint = buildConstraint()
    if (!constraint) return
    dispatch({ type: 'addConstraint', constraint })
    resetForm()
  }

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <ListChecks size={18} className="text-cyan-600" />
        条件(2人の希望)
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        「ここは3泊したい」「この日は誕生日だからパリ」のような希望を文で足していきます。
      </p>

      <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <select
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as ConstraintKind)
            resetForm()
          }}
          className={fieldClass}
          aria-label="条件の種類"
        >
          {kindLabels.map((item) => (
            <option key={item.kind} value={item.kind}>
              {item.label}
            </option>
          ))}
        </select>

        {kind === 'mustVisit' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <CitySelect
              value={cityId}
              onChange={setCityId}
              className={`${fieldClass} sm:w-48`}
            />
            <span>には必ず行く</span>
          </div>
        ) : null}

        {kind === 'stayNights' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <CitySelect
              value={cityId}
              onChange={setCityId}
              className={`${fieldClass} sm:w-40`}
            />
            <span>に</span>
            <input
              type="number"
              min={0}
              step={1}
              value={minNights}
              onChange={(event) => setMinNights(event.target.value)}
              placeholder="—"
              aria-label="最低泊数"
              className={`${fieldClass} w-20`}
            />
            <span>泊以上</span>
            <input
              type="number"
              min={0}
              step={1}
              value={maxNights}
              onChange={(event) => setMaxNights(event.target.value)}
              placeholder="—"
              aria-label="最大泊数"
              className={`${fieldClass} w-20`}
            />
            <span>泊まで(片方だけでも可)</span>
          </div>
        ) : null}

        {kind === 'presenceOnDate' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-label="日付"
              className={`${fieldClass} w-44`}
            />
            {isValidISODate(date) ? (
              // 入力欄だけだと曜日が見えないので、選んだ日の曜日をその場で出す
              <DateLabel iso={date} className="text-xs text-gray-500" />
            ) : null}
            <span>は</span>
            <CitySelect
              value={cityId}
              onChange={setCityId}
              className={`${fieldClass} sm:w-40`}
            />
            <span>にいる</span>
          </div>
        ) : null}

        {kind === 'order' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <CitySelect
              value={cityId}
              onChange={setCityId}
              className={`${fieldClass} sm:w-40`}
            />
            <span>を</span>
            <CitySelect
              value={otherCityId}
              onChange={setOtherCityId}
              className={`${fieldClass} sm:w-40`}
            />
            <span>より先に回る</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <SeverityChips value={severity} onChange={setSeverity} />
          <button
            type="button"
            onClick={handleSubmit}
            className={primaryButtonClass}
          >
            <Plus size={16} />
            条件を追加
          </button>
        </div>
      </div>

      {state.constraints.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {state.constraints.map((constraint) => {
            const violated = violatedIds.has(constraint.id)
            return (
              <li
                key={constraint.id}
                className={`rounded-xl border p-3 ${
                  !constraint.enabled
                    ? 'border-gray-200 bg-gray-50 opacity-70'
                    : violated
                      ? constraint.severity === 'must'
                        ? 'border-red-300 bg-red-50/60'
                        : 'border-amber-300 bg-amber-50/60'
                      : 'border-emerald-200 bg-emerald-50/40'
                }`}
              >
                <div className="flex items-start gap-2">
                  <ConstraintStatusIcon
                    enabled={constraint.enabled}
                    violated={violated}
                    severity={constraint.severity}
                  />
                  <span className="min-w-0 flex-1 text-sm text-gray-800">
                    {constraintLabel(constraint)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'toggleConstraint', id: constraint.id })
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                    aria-label={
                      constraint.enabled ? '無効にする' : '有効にする'
                    }
                    title={constraint.enabled ? '無効にする' : '有効にする'}
                  >
                    {constraint.enabled ? (
                      <Eye size={15} />
                    ) : (
                      <EyeOff size={15} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'removeConstraint', id: constraint.id })
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-100 hover:text-red-600"
                    aria-label="条件を削除"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="mt-2 pl-6">
                  <SeverityChips
                    value={constraint.severity}
                    onChange={(next) =>
                      dispatch({
                        type: 'setConstraintSeverity',
                        id: constraint.id,
                        severity: next,
                      })
                    }
                  />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-500">
          条件はまだありません。
        </p>
      )}

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-gray-800">気になるところ</h3>
        {derived.violations.length === 0 ? (
          <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 size={15} />
            いまのところ条件はすべて満たしています。
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {derived.violations.map((violation, index) => (
              <li
                key={`${violation.constraintId}-${index}`}
                className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-sm ${
                  violation.severity === 'must'
                    ? 'bg-red-50 text-red-800'
                    : 'bg-amber-50 text-amber-800'
                }`}
              >
                {violation.severity === 'must' ? (
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                )}
                <span>{violation.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function ConstraintStatusIcon({
  enabled,
  violated,
  severity,
}: {
  enabled: boolean
  violated: boolean
  severity: ConstraintSeverity
}) {
  if (!enabled) {
    return <EyeOff size={16} className="mt-0.5 shrink-0 text-gray-400" />
  }
  if (!violated) {
    return (
      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
    )
  }
  return severity === 'must' ? (
    <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
  ) : (
    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
  )
}

function SeverityChips({
  value,
  onChange,
}: {
  value: ConstraintSeverity
  onChange: (severity: ConstraintSeverity) => void
}) {
  const options: Array<{ value: ConstraintSeverity; label: string }> = [
    { value: 'must', label: '必須' },
    { value: 'want', label: 'できれば' },
  ]
  return (
    <span className="inline-flex overflow-hidden rounded-full border border-gray-300 bg-white text-xs">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`px-3 py-1 font-medium transition ${
            value === option.value
              ? option.value === 'must'
                ? 'bg-red-500 text-white'
                : 'bg-amber-500 text-white'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          {option.label}
        </button>
      ))}
    </span>
  )
}
