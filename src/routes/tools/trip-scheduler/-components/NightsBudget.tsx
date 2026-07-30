import { Moon } from 'lucide-react'
import type { DerivedTrip } from '../../../../lib/trip-scheduler/types'

interface NightsBudgetProps {
  derived: DerivedTrip
}

/**
 * このツールの主役。限られた泊数をゼロまで配り切るゲームのスコアボード。
 * 超過しても編集はブロックせず、赤で警告するだけにする。
 */
export function NightsBudget({ derived }: NightsBudgetProps) {
  const { totalNights, assignedNights, overnightLegNights, unassignedNights } =
    derived
  const used = assignedNights + overnightLegNights
  const over = unassignedNights < 0
  const done = unassignedNights === 0 && totalNights > 0

  const denominator = Math.max(totalNights, used, 1)
  const pct = (value: number) => `${(value / denominator) * 100}%`

  const tone = over
    ? 'border-red-300 bg-red-50'
    : done
      ? 'border-emerald-300 bg-emerald-50'
      : 'border-cyan-200 bg-cyan-50'

  const numberTone = over
    ? 'text-red-600'
    : done
      ? 'text-emerald-600'
      : 'text-cyan-700'

  return (
    <section
      className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${tone}`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <span className="text-sm font-medium text-gray-600">残り</span>
          <span
            className={`text-5xl font-bold leading-none tabular-nums sm:text-6xl ${numberTone}`}
          >
            {Math.abs(unassignedNights)}
          </span>
          <span className="text-lg font-semibold text-gray-700">泊</span>
        </div>
        <p
          className={`text-sm font-medium ${
            over
              ? 'text-red-700'
              : done
                ? 'text-emerald-700'
                : 'text-cyan-800/80'
          }`}
        >
          {over
            ? `${-unassignedNights}泊オーバーしています。どこかを削るか、夜行を昼行に戻してください`
            : done
              ? 'ぴったり配り切りました 🎉'
              : `全${totalNights}泊のうち ${used}泊 を配分済み`}
        </p>
      </div>

      <div className="relative mt-4 h-5 w-full overflow-hidden rounded-full border border-white/60 bg-white">
        <div className="flex h-full w-full">
          <div
            className="h-full bg-cyan-500 transition-all"
            style={{ width: pct(assignedNights) }}
            title={`滞在に配分: ${assignedNights}泊`}
          />
          <div
            className="h-full bg-indigo-500 transition-all"
            style={{ width: pct(overnightLegNights) }}
            title={`夜行移動: ${overnightLegNights}泊`}
          />
          <div
            className="h-full bg-gray-200 transition-all"
            style={{ width: pct(Math.max(0, unassignedNights)) }}
            title={`未割り当て: ${Math.max(0, unassignedNights)}泊`}
          />
        </div>
        {over ? (
          <div
            className="absolute inset-y-0 right-0 border-l-2 border-red-600 bg-[repeating-linear-gradient(45deg,rgba(220,38,38,0.85)_0px,rgba(220,38,38,0.85)_6px,rgba(255,255,255,0.6)_6px,rgba(255,255,255,0.6)_12px)]"
            style={{ width: pct(-unassignedNights) }}
            title={`オーバー: ${-unassignedNights}泊`}
          />
        ) : null}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-500" />
          滞在に配分 {assignedNights}泊
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <Moon size={12} className="text-indigo-500" />
          夜行移動 {overnightLegNights}泊
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
          未割り当て {Math.max(0, unassignedNights)}泊
        </li>
        <li className="text-gray-400">全 {totalNights}泊</li>
      </ul>
    </section>
  )
}
