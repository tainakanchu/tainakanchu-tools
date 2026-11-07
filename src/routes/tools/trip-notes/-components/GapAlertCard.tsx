/**
 * 「この夜の宿が未確保」を知らせるカード。
 *
 * 予約カードと同じ見た目にすると流し読みで見落とされるので、
 * 太い破線の縁取り + 薄塗り + 「要対応」のピンクの印で、意図的に異質な見た目にしている。
 *
 * 連続する未確保の夜は呼び出し側で区間にまとめ、
 * 初日は primary(目立つカード)、2 日目以降は continuation(控えめな 1 行)を出す。
 * 同じカードを毎日フルサイズで並べるとうるさいので、継続日は導線だけ残す。
 */

import { addDays, formatDateJa } from '../../../../lib/trip-notes/datetime'
import { lodgingSearchLinks } from '../../../../lib/trip-notes/searchLinks'
import type { GapAlertVariant } from '../../../../lib/trip-notes/uncovered-gaps'
import { formatRangeShort } from '../-lib/format'
import { subtleButtonClass } from '../-lib/styles'
import { SearchLinks } from './SearchLinks'

interface GapAlertCardProps {
  /** 同じ連続区間の全日付(YYYY-MM-DD)。primary の範囲表示に使う */
  rangeDates: Array<string>
  /** 推定した滞在地名。分からなければ undefined */
  areaLabel?: string
  variant?: GapAlertVariant
  onAddLodging: () => void
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
    nights > 1
      ? `${formatRangeShort(rangeDates[0], rangeDates[nights - 1])} の${nights}泊`
      : null
  const ariaDate =
    nights > 1
      ? `${formatDateJa(rangeDates[0])}から${formatDateJa(rangeDates[nights - 1])}`
      : formatDateJa(rangeDates[0])
  /**
   * 「まだ予約を取っていない」がここで一番効くので宿の検索リンクを添える。
   * チェックインは区間の初日、チェックアウトは最終日の翌日(その夜まで滞在する前提)。
   * areaLabel が無いと検索する地名が決まらないので、そのときはリンクを出さない。
   */
  const searchLinks =
    areaLabel !== undefined
      ? lodgingSearchLinks(
          areaLabel,
          rangeDates[0],
          addDays(rangeDates[nights - 1], 1),
        )
      : []

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 border-2 border-dashed border-ink bg-wash p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
            宿泊先が未定
            <span className="font-medium text-ink">（{stayLabel}）</span>
            <span className="mark-pink text-xs font-bold">要対応</span>
          </p>
          {rangeLabel !== null ? (
            <p className="mt-1 text-sm font-medium text-ink">{rangeLabel}</p>
          ) : null}
          {searchLinks.length > 0 ? (
            <div className="mt-2">
              <SearchLinks links={searchLinks} />
            </div>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onAddLodging}
        className={`${subtleButtonClass} shrink-0 self-start sm:self-center`}
        aria-label={`${ariaDate}の宿泊予約を追加`}
      >
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
      className="flex items-center justify-between gap-2 border border-ink-muted bg-wash px-3 py-1.5 text-xs text-ink"
    >
      <p className="min-w-0 truncate">{label}</p>
      <button
        type="button"
        onClick={onAddLodging}
        className="inline-flex shrink-0 items-center rounded-ui px-1.5 py-0.5 font-medium text-ink underline decoration-rule underline-offset-2 hover:bg-paper hover:decoration-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
        aria-label={`${label}の宿泊予約を追加`}
      >
        追加
      </button>
    </div>
  )
}
