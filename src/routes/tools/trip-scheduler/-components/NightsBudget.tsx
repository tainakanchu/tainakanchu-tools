import type { DerivedTrip } from '../../../../lib/trip-scheduler/types'

interface NightsBudgetProps {
  derived: DerivedTrip
}

/**
 * このツールの主役。限られた泊数をゼロまで配り切るゲームのスコアボード。
 * 超過しても編集はブロックせず、ピンクの印で知らせるだけにする。
 * 画面の上に貼り付くので、地は不透明な紙にする。
 */
export function NightsBudget({ derived }: NightsBudgetProps) {
  const { totalNights, assignedNights, overnightLegNights, unassignedNights } =
    derived
  const used = assignedNights + overnightLegNights
  const over = unassignedNights < 0
  const done = unassignedNights === 0 && totalNights > 0

  const denominator = Math.max(totalNights, used, 1)
  const pct = (value: number) => `${(value / denominator) * 100}%`

  return (
    <section
      className={`panel px-4 py-3 sm:px-6 sm:py-4 ${over ? 'bg-pink-wash' : ''}`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-ink-muted">
            {over ? '超過' : '残り'}
          </span>
          <span className="text-4xl font-bold leading-none tabular-nums sm:text-5xl">
            {Math.abs(unassignedNights)}
          </span>
          <span className="text-lg font-bold">泊</span>
        </div>
        {over ? (
          <p className="field-error">
            {-unassignedNights}
            泊オーバーしています。どこかを削るか、夜行を昼行に戻してください。
          </p>
        ) : done ? (
          <p className="text-sm font-bold">
            <span className="mark-pink">ぴったり配り切りました</span>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            全{totalNights}泊のうち {used}泊を配分済みです。
          </p>
        )}
      </div>

      <div className="relative mt-3 h-4 w-full overflow-hidden border-[1.5px] border-ink bg-paper">
        <div className="flex h-full w-full">
          <div
            className="h-full bg-ink transition-[width]"
            style={{ width: pct(assignedNights) }}
            title={`滞在に配分 ${assignedNights}泊`}
          />
          <div
            className="h-full bg-riso-purple transition-[width]"
            style={{ width: pct(overnightLegNights) }}
            title={`夜行移動 ${overnightLegNights}泊`}
          />
          <div
            className="h-full bg-wash transition-[width]"
            style={{ width: pct(Math.max(0, unassignedNights)) }}
            title={`未割り当て ${Math.max(0, unassignedNights)}泊`}
          />
        </div>
        {over ? (
          <div
            className="absolute inset-y-0 right-0 border-l-[1.5px] border-ink bg-pink"
            style={{ width: pct(-unassignedNights) }}
            title={`${-unassignedNights}泊オーバー`}
          />
        ) : null}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 border border-ink bg-ink" />
          滞在に配分 {assignedNights}泊
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 border border-ink bg-riso-purple" />
          夜行移動 {overnightLegNights}泊
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 border border-ink bg-wash" />
          未割り当て {Math.max(0, unassignedNights)}泊
        </li>
        <li>全部で {totalNights}泊</li>
      </ul>
    </section>
  )
}
