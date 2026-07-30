import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Minus,
  Plus,
  X,
} from 'lucide-react'
import { getCity } from '../../../../lib/trip-scheduler/cities'
import { formatDays } from '../-lib/format'
import { iconButtonClass, stepperButtonClass } from '../-lib/styles'
import { DateLabel } from './DateLabel'
import type { CityColor } from '../-lib/palette'
import type { TripDispatch } from '../-lib/reducer'
import type {
  Stay,
  StayWindow,
  Violation,
} from '../../../../lib/trip-scheduler/types'

interface StayRowProps {
  stay: Stay
  index: number
  total: number
  color: CityColor
  stayWindow: StayWindow | undefined
  violations: Array<Violation>
  dispatch: TripDispatch
  /** 候補プールからのドラッグで、この行の直前に差し込まれる状態か */
  showInsertBefore: boolean
}

const gripClass =
  'inline-flex h-8 w-6 shrink-0 cursor-grab touch-manipulation items-center justify-center rounded-lg text-gray-300 transition hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500'

/**
 * 滞在1件分の行。ハンドルを掴んでドラッグ並べ替えできるが、
 * 2人で1泊ずつ相談する用途のために ▲▼ と ± も残してある。
 */
export function StayRow({
  stay,
  index,
  total,
  color,
  stayWindow,
  violations,
  dispatch,
  showInsertBefore,
}: StayRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stay.id })

  const city = getCity(stay.cityId)
  const cityLabel = city?.name ?? stay.cityId
  const hasViolation = violations.length > 0

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative pl-4 ${isDragging ? 'z-10 opacity-40' : ''}`}
    >
      {/* プールからドラッグ中の挿入位置 */}
      {showInsertBefore ? (
        <span className="absolute -top-1 left-8 right-0 block h-0.5 rounded-full bg-cyan-500" />
      ) : null}
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
          <button
            type="button"
            ref={setActivatorNodeRef}
            className={gripClass}
            aria-label={`${cityLabel} をドラッグして並べ替え`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
          <span className="text-xs font-semibold tabular-nums text-gray-400">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="text-base font-semibold text-gray-900">
              {cityLabel}
            </span>
            <span className="ml-2 text-xs text-gray-500">{city?.country}</span>
          </span>

          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'changeNights', stayId: stay.id, delta: -1 })
              }
              className={stepperButtonClass}
              aria-label={`${cityLabel} の泊数を1減らす`}
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
                dispatch({ type: 'changeNights', stayId: stay.id, delta: 1 })
              }
              className={stepperButtonClass}
              aria-label={`${cityLabel} の泊数を1増やす`}
            >
              <Plus size={16} />
            </button>
          </span>

          <span className="flex items-center gap-1">
            <button
              type="button"
              disabled={index === 0}
              onClick={() =>
                dispatch({ type: 'moveStay', stayId: stay.id, delta: -1 })
              }
              className={iconButtonClass}
              aria-label="前へ移動"
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              disabled={index === total - 1}
              onClick={() =>
                dispatch({ type: 'moveStay', stayId: stay.id, delta: 1 })
              }
              className={iconButtonClass}
              aria-label="後ろへ移動"
            >
              <ChevronDown size={16} />
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'removeStay', stayId: stay.id })}
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
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>{violation.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  )
}

interface StayRowPreviewProps {
  stay: Stay
  color: CityColor
}

/** ドラッグ中にカーソルへ追従する見た目(操作はできない持ち上げ表現) */
export function StayRowPreview({ stay, color }: StayRowPreviewProps) {
  const city = getCity(stay.cityId)
  return (
    <div className="flex cursor-grabbing items-center gap-3 rounded-xl border border-cyan-300 bg-white p-3 shadow-lg ring-2 ring-cyan-200">
      <GripVertical size={16} className="text-gray-400" />
      <span
        className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ${color.dot}`}
      />
      <span className="text-base font-semibold text-gray-900">
        {city?.name ?? stay.cityId}
      </span>
      <span className="text-xs text-gray-500">{city?.country}</span>
      <span className="ml-auto text-lg font-bold tabular-nums text-gray-900">
        {stay.nights}
        <span className="ml-0.5 text-xs font-medium text-gray-500">泊</span>
      </span>
    </div>
  )
}
