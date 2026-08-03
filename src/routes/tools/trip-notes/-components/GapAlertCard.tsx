/**
 * 「この夜の宿が未確保」を知らせるカード。
 *
 * 予約カードと同じ見た目にすると流し読みで見落とされるので、
 * 破線の縁取り + 警告色で意図的に異質な見た目にしている。
 * 連続する未確保の夜は 1 枚にまとめて渡してもらう(呼び出し側の
 * SchedulePanel が日付をマージ済み)ので、ここでは受け取った配列を
 * そのまま「8/4(金)・8/5(土)」のように連結して表示するだけでよい。
 */

import { AlertTriangle, Plus } from 'lucide-react'
import { formatDateJa } from '../../../../lib/trip-notes/datetime'
import { primaryButtonClass } from '../-lib/styles'

interface GapAlertCardProps {
  /** 連続する未確保の夜の日付(YYYY-MM-DD の配列、1つ以上) */
  dates: Array<string>
  /** 直前・直後の宿から推測した滞在地名。分からなければ undefined */
  areaLabel?: string
  onAddLodging: () => void
}

export function GapAlertCard({
  dates,
  areaLabel,
  onAddLodging,
}: GapAlertCardProps) {
  const dateLabel = dates.map((date) => formatDateJa(date)).join('・')
  const message =
    areaLabel !== undefined
      ? `${areaLabel}滞在中の宿泊が未予約です`
      : '宿泊が未予約です'

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          size={18}
          className="mt-0.5 shrink-0 text-amber-600"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-amber-900">
            宿泊先が未定
            <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white">
              要対応
            </span>
          </p>
          <p className="mt-1 text-sm font-medium text-amber-800">
            {dateLabel}
            <span className="ml-3">{dates.length}泊</span>
          </p>
          <p className="mt-1 text-xs text-amber-700">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAddLodging}
        className={`${primaryButtonClass} shrink-0 self-start bg-amber-600 hover:bg-amber-700 focus-visible:outline-amber-500 sm:self-center`}
        aria-label={`${dateLabel}の宿泊予約を追加`}
      >
        <Plus size={15} aria-hidden="true" />
        予約を追加
      </button>
    </div>
  )
}
