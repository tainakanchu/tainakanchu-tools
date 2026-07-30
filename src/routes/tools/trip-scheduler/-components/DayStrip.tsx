import { useMemo } from 'react'
import { Moon } from 'lucide-react'
import { buildDayPlan } from '../../../../lib/trip-scheduler/dayPlan'
import { cityName } from '../../../../lib/trip-scheduler/cities'
import {
  formatShortJa,
  weekdayIndex,
  weekdayJa,
} from '../../../../lib/trip-scheduler/dates'
import { fallbackCityColor, weekdayToneClass } from '../-lib/palette'
import type { CityColor } from '../-lib/palette'
import type { DayCell } from '../../../../lib/trip-scheduler/dayPlan'
import type { DerivedTrip } from '../../../../lib/trip-scheduler/types'

/** 描画するマスの上限。日付の入力ミスで数千日になっても DOM を作り過ぎないための保険 */
const MAX_CELLS = 120

/** 曜日ごとのマスの地色。土=青・日=赤で週末が帯として浮かび上がるようにする */
function cellSurfaceClass(iso: string, assigned: boolean): string {
  const border = assigned ? 'border-solid' : 'border-dashed'
  switch (weekdayIndex(iso)) {
    case 0:
      return `${border} border-red-200 bg-red-50`
    case 6:
      return `${border} border-blue-200 bg-blue-50`
    default:
      return `${border} border-gray-200 ${assigned ? 'bg-white' : 'bg-gray-50'}`
  }
}

/** 月初と先頭だけ '7/1'、それ以外は日にちだけ */
function dayNumberLabel(cell: DayCell): string {
  const [, month, day] = cell.date.split('-').map(Number)
  return cell.dayIndex === 0 || day === 1 ? `${month}/${day}` : String(day)
}

function cellTitle(cell: DayCell): string {
  const where =
    cell.cityIds.length === 0
      ? '未割り当て'
      : cell.cityIds.map(cityName).join(' → ')
  const suffix = cell.overnight ? '(夜行移動)' : cell.travel ? '(移動日)' : ''
  return `${formatShortJa(cell.date)} ${where}${suffix}`
}

interface DayStripProps {
  /** ヨーロッパ到着日 */
  startDate: string
  derived: DerivedTrip
  colors: Map<string, CityColor>
}

/**
 * 1日1マスのカレンダーストリップ。
 * タイムラインが「泊の配分」を見せるのに対して、こちらは
 * 「何曜日にどの街にいるか」(月曜の休館日・週末の混雑)を見るためのもの。
 * モバイルでも横スクロールで常時表示する。
 */
export function DayStrip({ startDate, derived, colors }: DayStripProps) {
  const plan = useMemo(
    () => buildDayPlan(startDate, derived),
    [startDate, derived],
  )
  const cells = plan.slice(0, MAX_CELLS)
  const hiddenCount = plan.length - cells.length
  const hasOvernight = cells.some((cell) => cell.overnight)

  if (cells.length === 0) return null

  return (
    <div>
      <div
        className="-mx-1 overflow-x-auto px-1 py-1"
        role="group"
        aria-label="日ごとのカレンダー"
      >
        <div className="flex min-w-max items-stretch gap-1">
          {cells.map((cell) => {
            const assigned = cell.cityIds.length > 0
            const [, , day] = cell.date.split('-').map(Number)
            const monthBreak = cell.dayIndex > 0 && day === 1
            return (
              <div
                key={cell.date}
                title={cellTitle(cell)}
                className={`flex w-10 shrink-0 flex-col items-center gap-0.5 rounded-lg border px-1 pb-1.5 pt-1 ${cellSurfaceClass(
                  cell.date,
                  assigned,
                )} ${monthBreak ? 'ml-2' : ''}`}
              >
                <span
                  className={`text-[10px] font-medium tabular-nums leading-none ${
                    assigned ? 'text-gray-700' : 'text-gray-400'
                  }`}
                >
                  {dayNumberLabel(cell)}
                </span>
                <span
                  className={`text-[10px] leading-none ${
                    weekdayToneClass(weekdayIndex(cell.date)) || 'text-gray-500'
                  }`}
                >
                  {weekdayJa(cell.date)}
                </span>
                {hasOvernight ? (
                  <span className="flex h-3 items-center justify-center">
                    {cell.overnight ? (
                      <Moon size={10} className="text-indigo-500" />
                    ) : null}
                  </span>
                ) : null}
                <span className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full">
                  {assigned ? (
                    cell.cityIds.map((cityId, index) => (
                      <span
                        key={`${cityId}-${index}`}
                        className={`h-full flex-1 ${
                          (colors.get(cityId) ?? fallbackCityColor).bar
                        }`}
                      />
                    ))
                  ) : (
                    <span className="h-full w-full rounded-full border border-dashed border-gray-400" />
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm border border-blue-200 bg-blue-50" />
          土
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm border border-red-200 bg-red-50" />
          日
        </span>
        <span>下の色帯 = その日いる都市(移動日は2色)</span>
        {hasOvernight ? (
          <span className="inline-flex items-center gap-1">
            <Moon size={11} className="text-indigo-500" />
            夜行
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-1.5 w-4 rounded-full border border-dashed border-gray-400" />
          未割り当て
        </span>
        {hiddenCount > 0 ? <span>(以降 {hiddenCount} 日は省略)</span> : null}
      </div>
    </div>
  )
}
