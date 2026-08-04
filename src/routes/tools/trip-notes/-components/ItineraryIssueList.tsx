/**
 * 旅程の不整合(itinerary.ts の findItineraryIssues)の一覧。
 *
 * message は「次に何をすればよいか」まで含んだ 1 文として組み立てられているので、
 * ここでは加工せずそのまま出す。画面側で言い換えると、判定の根拠
 * (どの予約とどの予約を突き合わせた結果なのか)と食い違う恐れがあるうえ、
 * 文言が 2 か所に散って片方だけ直される。
 *
 * 種別ごとにアイコンと短い見出しを変えるのは、4 種類が同じ見た目で並ぶと
 * 「また同じ警告か」と読み飛ばされるためである。一方で色は 4 種とも同じ警告色に揃える。
 * 深刻さの違いは種別ではなく「寝る場所がない夜が何泊あるか」で効くので、
 * ここで色の段階を作ると上段のアラートと重大度の読みが二重になる。
 */

import {
  BedDouble,
  MapPinX,
  PlaneTakeoff,
  Route,
  TriangleAlert,
} from 'lucide-react'
import { formatDateJa } from '../../../../lib/trip-notes/datetime'
import { subtleButtonClass } from '../-lib/styles'
import type { LucideIcon } from 'lucide-react'
import type {
  ItineraryIssue,
  ItineraryIssueKind,
} from '../../../../lib/trip-notes/types'

interface IssueStyle {
  icon: LucideIcon
  /** 一覧を目で走らせるための短い見出し。詳細は message が持つ */
  label: string
}

const ISSUE_STYLES: Record<ItineraryIssueKind, IssueStyle> = {
  'missing-transport': { icon: Route, label: '移動が未登録' },
  'location-mismatch': { icon: MapPinX, label: '到着地の食い違い' },
  'missing-lodging': { icon: BedDouble, label: '宿が未登録' },
  'departure-mismatch': { icon: PlaneTakeoff, label: '出発地の食い違い' },
}

interface ItineraryIssueListProps {
  issues: Array<ItineraryIssue>
  /** その日の日程タブへ飛ばす */
  onSelectDate: (date: string) => void
}

export function ItineraryIssueList({
  issues,
  onSelectDate,
}: ItineraryIssueListProps) {
  if (issues.length === 0) return null

  return (
    <div className="mt-4">
      <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500">
        <TriangleAlert size={13} aria-hidden="true" />
        旅程の不整合
        <span className="tabular-nums">{issues.length}件</span>
      </p>
      <ul className="space-y-2">
        {issues.map((issue) => {
          const style = ISSUE_STYLES[issue.kind]
          const Icon = style.icon
          return (
            <li
              // 同じ予約の組でも種別が違えば別の指摘になるので、種別まで鍵に含める
              key={`${issue.kind}:${issue.date}:${issue.fromBookingId ?? ''}:${issue.toBookingId ?? ''}`}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
            >
              <div className="flex min-w-0 items-start gap-2">
                <Icon
                  size={16}
                  className="mt-0.5 shrink-0 text-amber-600"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-amber-900">
                    {style.label}
                    <span className="rounded-full border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {formatDateJa(issue.date)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                    {issue.message}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectDate(issue.date)}
                className={`${subtleButtonClass} shrink-0 bg-white`}
                aria-label={`${formatDateJa(issue.date)}の日程を開く`}
              >
                日程で直す
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
