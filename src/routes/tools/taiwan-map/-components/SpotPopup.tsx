/**
 * 地図のピンを押したときに、そのピンの上に出す小さなカード（デスクトップ用）。
 *
 * 一覧のカード（SpotCard）の要点だけ: 名前・訪問状況・ジャンル・エリア・
 * 現在地からの距離・一言コメント・訪問時期と、カードと同じ操作
 * （Google マップ・地図で見る・共有、名前の横に公式サイト。SpotActions.tsx）。
 * 書きかけ（TODO）のコメントは SpotCard と同じく publicText で落とす。
 *
 * 位置は MapView が地図の動きに合わせて style で直接動かす（-lib/popupPlacement.ts）。
 * ここは中身だけを描く。スマホは地図の下端に別のカード（index.tsx）を
 * 出すので、このポップアップは使わない。
 */

import { MapPin, Navigation, X } from 'lucide-react'
import {
  extraNameZh,
  formatVisitedAt,
  publicText,
} from '../../../../lib/taiwan-map/format'
import { formatDistance } from '../../../../lib/taiwan-map/nearby'
import { CategoryChip, StatusBadge } from './Badges'
import { SpotActions, SpotComment, SpotLinkIcons } from './SpotActions'
import type { Ref } from 'react'
import type { TaiwanSpot } from '../../../../lib/taiwan-map/types'

type Props = {
  ref?: Ref<HTMLDivElement>
  spot: TaiwanSpot
  areaName: string | undefined
  /** 現在地からの距離（m）。分からない・台湾の外なら undefined */
  distance: number | undefined
  /** 「地図で見る」。そのピンへ寄る */
  onShowOnMap: (id: string) => void
  onClose: () => void
}

export function SpotPopup({
  ref,
  spot,
  areaName,
  distance,
  onShowOnMap,
  onClose,
}: Props) {
  const nameZh = extraNameZh(spot)
  const summary = publicText(spot.summary)
  const titleId = `spot-popup-${spot.id}`
  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      // 地図の動きに合わせて MapView が left / top を書き換える。
      // 最初の位置が決まるまでは見せない（左上に一瞬出るのを防ぐ）
      style={{ visibility: 'hidden' }}
      tabIndex={-1}
      className="absolute top-0 left-0 z-20 w-80 rounded-xl border border-gray-200 bg-white p-3 text-gray-900 shadow-lg focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:shadow-black/50"
    >
      <div className="flex items-start gap-2">
        <h3 id={titleId} className="min-w-0 flex-1 leading-snug font-bold">
          {spot.name}
          {nameZh && (
            <span
              lang="zh-Hant-TW"
              className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400"
            >
              {nameZh}
            </span>
          )}
        </h3>
        <SpotLinkIcons spot={spot} />
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="-mt-1 -mr-1 shrink-0 rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 focus-visible:outline-cyan-500 dark:focus-visible:outline-cyan-400"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <StatusBadge status={spot.status} />
        {spot.categories.map((c) => (
          <CategoryChip key={c} category={c} />
        ))}
        {areaName && (
          <span className="inline-flex items-center gap-0.5 text-xs text-gray-500 dark:text-gray-400">
            <MapPin size={12} aria-hidden />
            {areaName}
          </span>
        )}
        {distance !== undefined && (
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
            <Navigation size={11} aria-hidden />
            現在地から{formatDistance(distance)}
          </span>
        )}
      </div>
      {summary && (
        <SpotComment
          text={summary}
          wantToGo={spot.status === 'want_to_go'}
          clamp={4}
          className="mt-2 text-sm"
        />
      )}
      {spot.visitedAt && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          訪問：{formatVisitedAt(spot.visitedAt)}
        </p>
      )}
      <div className="mt-2.5">
        <SpotActions spot={spot} onShowOnMap={onShowOnMap} compact />
      </div>
      {/* ピンを指す三角。left は MapView が arrowX で合わせる */}
      <span
        aria-hidden
        data-popup-arrow
        className="absolute h-3 w-3 -translate-x-1/2 rotate-45 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
      />
    </div>
  )
}
