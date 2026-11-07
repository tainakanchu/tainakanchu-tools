/**
 * 訪問状況バッジ・気持ちラベル・カテゴリチップ。
 *
 * ■ 「未訪問・気になる」をおすすめに見せないための約束
 *   このマップでいちばん避けたい誤読は、行ったことのない場所を
 *   「かんちゅのおすすめ」と受け取られること。なので want_to_go は
 *   - ラベル文言に「未訪問」を必ず含める（色が分からなくても読める）
 *   - 破線の枠・グレーの地色という「未確定」の形にする
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
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
        <CheckCircle2 size={12} aria-hidden />
        {statusName(status)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-400 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
      <CircleDashed size={12} aria-hidden />
      {statusName(status)}
    </span>
  )
}

export function LabelBadge({ label }: { label: SpotLabel }) {
  const def = labelDef(label)
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
      <span aria-hidden>{def.mark}</span>
      {def.name}
    </span>
  )
}

export function CategoryChip({ category }: { category: SpotCategory }) {
  return (
    <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600">
      {categoryName(category)}
    </span>
  )
}
