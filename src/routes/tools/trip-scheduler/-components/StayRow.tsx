import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Minus,
  Plus,
  X,
} from 'lucide-react'
import { getCity } from '../../../../lib/trip-scheduler/cities'
import { formatDays } from '../-lib/format'
import { Badge, Swatch } from '../../../../components/ui'
import { iconButtonClass, ruledRowClass } from '../-lib/styles'
import { DateLabel } from './DateLabel'
import { ViolationLine } from './ViolationLine'
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
  /** 同じ都市の何回目の滞在か(1 = 初回)。2 以上なら「再訪」 */
  revisitOrder: number
  /** 直前の滞在が同じ都市か(移動が発生しない続きの滞在) */
  continuedFromPrevious: boolean
}

const gripClass =
  'inline-flex h-10 w-7 shrink-0 cursor-grab touch-manipulation items-center justify-center rounded-ui text-ink-muted transition-colors hover:bg-wash hover:text-ink active:cursor-grabbing'

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
  revisitOrder,
  continuedFromPrevious,
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
      className={`relative px-2 py-3 ${ruledRowClass} ${
        hasViolation ? 'bg-pink-wash' : 'bg-paper'
      } ${isDragging ? 'z-10 opacity-40' : ''}`}
    >
      {/* プールからドラッグ中の挿入位置 */}
      {showInsertBefore ? (
        <span className="absolute -top-[2px] left-0 right-0 block h-[3px] bg-ink" />
      ) : null}
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            ref={setActivatorNodeRef}
            className={gripClass}
            aria-label={`${cityLabel} をドラッグして並べ替え`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} aria-hidden />
          </button>
          <Swatch color={color.fill} size={14} />
          <span className="text-sm font-bold tabular-nums text-ink-muted">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="text-base font-bold">{cityLabel}</span>
            <span className="ml-2 text-xs text-ink-muted">{city?.country}</span>
            {continuedFromPrevious ? (
              <Badge
                tone="muted"
                className="ml-2"
                title="直前の滞在と同じ都市なので、移動なしで続けて泊まります"
              >
                続き
              </Badge>
            ) : revisitOrder > 1 ? (
              <Badge
                className="ml-2"
                title={`${cityLabel} は ${revisitOrder} 回目の滞在です`}
              >
                再訪
              </Badge>
            ) : null}
          </span>

          <span className="flex items-center gap-1 sm:ml-auto">
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'changeNights', stayId: stay.id, delta: -1 })
              }
              className={iconButtonClass}
              aria-label={`${cityLabel} の泊数を1減らす`}
            >
              <Minus size={16} />
            </button>
            <span className="w-14 text-center text-lg font-bold tabular-nums">
              {stay.nights}
              <span className="ml-0.5 text-xs font-medium text-ink-muted">
                泊
              </span>
            </span>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'changeNights', stayId: stay.id, delta: 1 })
              }
              className={iconButtonClass}
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
              aria-label={`${cityLabel} を前へ移動`}
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
              aria-label={`${cityLabel} を後ろへ移動`}
            >
              <ChevronDown size={16} />
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'removeStay', stayId: stay.id })}
              className={iconButtonClass}
              aria-label={`${cityLabel} を日程から外す`}
            >
              <X size={16} />
            </button>
          </span>
        </div>

        {stayWindow ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span>
              <DateLabel iso={stayWindow.arriveDate} />〜
              <DateLabel iso={stayWindow.departDate} />
            </span>
            <span>実質観光 {formatDays(stayWindow.effectiveDays)}日</span>
          </p>
        ) : null}

        {hasViolation ? (
          <ul className="mt-2 space-y-1">
            {violations.map((violation, i) => (
              <ViolationLine
                key={`${violation.constraintId}-${i}`}
                severity={violation.severity}
                title={violation.message}
              >
                {violation.message}
              </ViolationLine>
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
    <div className="misreg flex cursor-grabbing items-center gap-3 rounded-ui p-3">
      <GripVertical size={16} className="text-ink-muted" aria-hidden />
      <Swatch color={color.fill} size={14} />
      <span className="text-base font-bold">{city?.name ?? stay.cityId}</span>
      <span className="text-xs text-ink-muted">{city?.country}</span>
      <span className="ml-auto text-lg font-bold tabular-nums">
        {stay.nights}
        <span className="ml-0.5 text-xs font-medium text-ink-muted">泊</span>
      </span>
    </div>
  )
}
