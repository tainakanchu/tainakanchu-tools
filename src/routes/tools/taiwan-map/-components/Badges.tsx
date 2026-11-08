/**
 * 訪問状況バッジ・気持ちラベル・カテゴリチップ。
 *
 * ■ 「未訪問・気になる」をおすすめに見せないための約束
 *   このマップでいちばん避けたい誤読は、行ったことのない場所を
 *   「かんちゅのおすすめ」と受け取られること。なので want_to_go は
 *   - ラベル文言に「未訪問」を必ず含める（色が分からなくても読める）
 *   - 破線の枠という「未確定」の形にする（地図の白抜きのピン、絞り込みの
 *     「未訪問・気になる」チップと同じ形。styles.ts のチップの約束）
 *   - 気持ちラベル（♥○◇）と同じ塗りの pill には絶対にしない
 *   の 3 点で、見た目の系統そのものを visited と分けている。
 */

import { CheckCircle2, CircleDashed } from 'lucide-react'
import {
  SPOT_CATEGORIES,
  SPOT_LABELS,
  VISIT_STATUSES,
} from '../../../../lib/taiwan-map/types'
import type {
  SpotCategory,
  SpotLabel,
  VisitStatus,
} from '../../../../lib/taiwan-map/types'

export function statusName(status: VisitStatus): string {
  return VISIT_STATUSES.find((s) => s.id === status)!.name
}

export function categoryName(category: SpotCategory): string {
  return SPOT_CATEGORIES.find((c) => c.id === category)!.name
}

export function labelDef(label: SpotLabel) {
  return SPOT_LABELS.find((l) => l.id === label)!
}

export function StatusBadge({ status }: { status: VisitStatus }) {
  if (status === 'visited') {
    return (
      // 塗りは「選んでいる絞り込み条件」専用なので、バッジは枠だけにする
      // （styles.ts のチップの約束）
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600 bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500 dark:bg-gray-900 dark:text-emerald-300">
        <CheckCircle2 size={12} aria-hidden />
        {statusName(status)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-400 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-500 dark:bg-gray-900 dark:text-slate-300">
      <CircleDashed size={12} aria-hidden />
      {statusName(status)}
    </span>
  )
}

export function LabelBadge({ label }: { label: SpotLabel }) {
  const def = labelDef(label)
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2 py-0.5 text-xs font-medium text-rose-700 dark:border-rose-800 dark:bg-gray-900 dark:text-rose-300">
      <span aria-hidden>{def.mark}</span>
      {def.name}
    </span>
  )
}

export function CategoryChip({ category }: { category: SpotCategory }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300">
      {categoryName(category)}
    </span>
  )
}
