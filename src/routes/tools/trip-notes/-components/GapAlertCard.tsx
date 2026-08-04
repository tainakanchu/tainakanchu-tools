/**
 * 「この夜の宿が未確保」を知らせるカード。
 *
 * 予約カードと同じ見た目にすると流し読みで見落とされるので、
 * 破線の縁取り + 警告色で意図的に異質な見た目にしている。
 *
 * 連続する未確保の夜は呼び出し側で区間にまとめ、
 * 初日は primary(目立つカード)、2 日目以降は continuation(控えめな 1 行)を出す。
 * 同じカードを毎日フルサイズで並べるとうるさいので、継続日は導線だけ残す。
 */

import { AlertTriangle, Plus } from 'lucide-react'
import { formatDateJa } from '../../../../lib/trip-notes/datetime'
import type { GapAlertVariant } from '../../../../lib/trip-notes/uncovered-gaps'
import { primaryButtonClass } from '../-lib/styles'

interface GapAlertCardProps {
  /** 同じ連続区間の全日付(YYYY-MM-DD)。primary の範囲表示に使う */
  rangeDates: Array<string>
  /** 推定した滞在地名。分からなければ undefined */
  areaLabel?: string
  variant?: GapAlertVariant
  onAddLodging: () => void
}

/** ISO 日付から先頭ゼロ無しの月日を取り出す */
function monthDay(iso: string): string {
  const date = Temporal.PlainDate.from(iso)
  return `${date.month}/${date.day}`
}

/** '9/6〜9/8' のように月日だけをつなぐ。1 日だけのときは使わない */
function formatRangeShort(dates: Array<string>): string {
  return `${monthDay(dates[0])}〜${monthDay(dates[dates.length - 1])}`
}

export function GapAlertCard({
  rangeDates,
  areaLabel,
  variant = 'primary',
  onAddLodging,
}: GapAlertCardProps) {
  if (variant === 'continuation') {
    return <ContinuationRow areaLabel={areaLabel} onAddLodging={onAddLodging} />
  }
  return (
    <PrimaryCard
      rangeDates={rangeDates}
      areaLabel={areaLabel}
      onAddLodging={onAddLodging}
    />
  )
}

function PrimaryCard({
  rangeDates,
  areaLabel,
  onAddLodging,
}: {
  rangeDates: Array<string>
  areaLabel?: string
  onAddLodging: () => void
}) {
  const nights = rangeDates.length
  const stayLabel = areaLabel !== undefined ? `${areaLabel}泊` : '滞在地不明'
  // 複数泊のときだけ「9/6〜9/8 の 3 泊」で全体像を示す
  const rangeLabel =
    nights > 1 ? `${formatRangeShort(rangeDates)} の${nights}泊` : null
  const ariaDate =
    nights > 1
      ? `${formatDateJa(rangeDates[0])}から${formatDateJa(rangeDates[nights - 1])}`
      : formatDateJa(rangeDates[0])

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
            <span className="font-medium text-amber-800">— {stayLabel}</span>
            <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white">
              要対応
            </span>
          </p>
          {rangeLabel !== null ? (
            <p className="mt-1 text-sm font-medium text-amber-800">
              {rangeLabel}
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onAddLodging}
        className={`${primaryButtonClass} shrink-0 self-start bg-amber-600 hover:bg-amber-700 focus-visible:outline-amber-500 sm:self-center`}
        aria-label={`${ariaDate}の宿泊予約を追加`}
      >
        <Plus size={15} aria-hidden="true" />
        予約を追加
      </button>
    </div>
  )
}

/** 区間 2 日目以降。同じ目立つカードを並べないための控えめな 1 行 */
function ContinuationRow({
  areaLabel,
  onAddLodging,
}: {
  areaLabel?: string
  onAddLodging: () => void
}) {
  const placePart = areaLabel !== undefined ? `（${areaLabel}泊）` : ''
  const label = `宿泊先が未定${placePart}`

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-2 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-1.5 text-xs text-amber-800"
    >
      <p className="min-w-0 truncate">
        <span className="mr-1.5 text-amber-500" aria-hidden="true">
          ・
        </span>
        {label}
      </p>
      <button
        type="button"
        onClick={onAddLodging}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium text-amber-700 underline-offset-2 hover:bg-amber-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-500"
        aria-label={`${label}の宿泊予約を追加`}
      >
        <Plus size={12} aria-hidden="true" />
        追加
      </button>
    </div>
  )
}
