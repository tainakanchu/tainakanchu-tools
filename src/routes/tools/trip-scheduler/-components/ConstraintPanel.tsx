import { useMemo, useState } from 'react'
import { Eye, EyeOff, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  SegmentedControl,
  Select,
  TextInput,
} from '../../../../components/ui'
import { constraintLabel } from '../../../../lib/trip-scheduler/constraints'
import { isValidISODate } from '../../../../lib/trip-scheduler/dates'
import { newId } from '../../../../lib/trip-scheduler/storage'
import {
  panelClass,
  quietIconButtonClass,
  ruledListClass,
  ruledRowClass,
  sectionLeadClass,
  sectionTitleClass,
} from '../-lib/styles'
import { CitySelect } from './CitySelect'
import { DateLabel } from './DateLabel'
import { ViolationLine } from './ViolationLine'
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
    <section className={panelClass}>
      <h2 className={sectionTitleClass}>条件(2人の希望)</h2>
      <p className={sectionLeadClass}>
        「ここは3泊したい」「この日は誕生日だからパリ」のような希望を文で足していきます。
      </p>

      <div className="panel panel-wash mt-4 space-y-3 p-3">
        <Select
          value={kind}
          onChange={(event) => {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- option の value は kindLabels (ConstraintKind 型) からのみ生成されるため実行時も安全
            setKind(event.target.value as ConstraintKind)
            resetForm()
          }}
          aria-label="条件の種類"
        >
          {kindLabels.map((item) => (
            <option key={item.kind} value={item.kind}>
              {item.label}
            </option>
          ))}
        </Select>

        {kind === 'mustVisit' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CitySelect
              label="都市"
              value={cityId}
              onChange={setCityId}
              className="sm:w-48"
            />
            <span>には必ず行く</span>
          </div>
        ) : null}

        {kind === 'stayNights' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CitySelect
              label="都市"
              value={cityId}
              onChange={setCityId}
              className="sm:w-40"
            />
            <span>に</span>
            <TextInput
              type="number"
              min={0}
              step={1}
              value={minNights}
              onChange={(event) => setMinNights(event.target.value)}
              placeholder="-"
              aria-label="最低泊数"
              className="w-20"
            />
            <span>泊以上</span>
            <TextInput
              type="number"
              min={0}
              step={1}
              value={maxNights}
              onChange={(event) => setMaxNights(event.target.value)}
              placeholder="-"
              aria-label="最大泊数"
              className="w-20"
            />
            <span>泊まで(片方だけでも可)</span>
          </div>
        ) : null}

        {kind === 'presenceOnDate' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <TextInput
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-label="日付"
              className="w-44"
            />
            {isValidISODate(date) ? (
              // 入力欄だけだと曜日が見えないので、選んだ日の曜日をその場で出す
              <DateLabel iso={date} className="text-xs text-ink-muted" />
            ) : null}
            <span>は</span>
            <CitySelect
              label="都市"
              value={cityId}
              onChange={setCityId}
              className="sm:w-40"
            />
            <span>にいる</span>
          </div>
        ) : null}

        {kind === 'order' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CitySelect
              label="先に回る都市"
              value={cityId}
              onChange={setCityId}
              className="sm:w-40"
            />
            <span>を</span>
            <CitySelect
              label="後に回る都市"
              value={otherCityId}
              onChange={setOtherCityId}
              className="sm:w-40"
            />
            <span>より先に回る</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <SeverityControl
            label="新しい条件の重さ"
            value={severity}
            onChange={setSeverity}
          />
          <Button onClick={handleSubmit}>条件を追加</Button>
        </div>
      </div>

      {state.constraints.length > 0 ? (
        <ul className={`mt-4 ${ruledListClass}`}>
          {state.constraints.map((constraint) => {
            const label = constraintLabel(constraint)
            const violated = violatedIds.has(constraint.id)
            return (
              <li
                key={constraint.id}
                className={`${ruledRowClass} py-3 ${
                  !constraint.enabled ? 'text-ink-muted' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-sm leading-relaxed">
                    {label}
                    <span className="mt-1 block">
                      {!constraint.enabled ? (
                        <Badge tone="dashed">無効</Badge>
                      ) : violated ? (
                        constraint.severity === 'must' ? (
                          <span className="field-error">満たしていません</span>
                        ) : (
                          <span className="text-xs text-ink-muted">
                            まだ満たしていません
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-ink-muted">
                          満たしています
                        </span>
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'toggleConstraint', id: constraint.id })
                    }
                    className={quietIconButtonClass}
                    aria-label={`「${label}」を${
                      constraint.enabled ? '無効にする' : '有効にする'
                    }`}
                    title={constraint.enabled ? '無効にする' : '有効にする'}
                  >
                    {constraint.enabled ? (
                      <Eye size={15} aria-hidden />
                    ) : (
                      <EyeOff size={15} aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'removeConstraint', id: constraint.id })
                    }
                    className={quietIconButtonClass}
                    aria-label={`「${label}」を削除`}
                    title="条件を削除"
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
                <div className="mt-2">
                  <SeverityControl
                    label={`「${label}」の重さ`}
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
        <p className="mt-4 border-[1.5px] border-dashed border-ink-muted px-3 py-3 text-sm text-ink-muted">
          条件はまだありません。
        </p>
      )}

      <div className="mt-5">
        <h3 className="text-sm font-bold">気になるところ</h3>
        {derived.violations.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            いまのところ条件はすべて満たしています。
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {derived.violations.map((violation, index) => (
              <ViolationLine
                key={`${violation.constraintId}-${index}`}
                severity={violation.severity}
              >
                {violation.message}
              </ViolationLine>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

const severityOptions: Array<{ value: ConstraintSeverity; label: string }> = [
  { value: 'must', label: '必須' },
  { value: 'want', label: 'できれば' },
]

function SeverityControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: ConstraintSeverity
  onChange: (severity: ConstraintSeverity) => void
}) {
  return (
    <SegmentedControl
      size="sm"
      label={label}
      value={value}
      options={severityOptions}
      onChange={onChange}
    />
  )
}
