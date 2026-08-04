/**
 * 手続き(TravelDoc)の抜け(docs.ts の findTravelDocIssues)の一覧。
 *
 * message は「次に何をすればよいか」まで含んだ1文として組み立てられているので、
 * ItineraryIssueList と同じ方針で、ここでも加工せずそのまま出す。
 *
 * 日付ジャンプ(ItineraryIssueList の onSelectDate)を持たないのは、
 * 手続きが特定の日程の1コマではなく旅行全体にまたがる存在だからである。
 * 旅程の不整合は「6/14 の移動が抜けている」のように直す場所が日程タブの
 * 1日に決まるが、手続きの抜けは「シェンゲンビザをまだ取っていない」のように
 * 直す場所が日程のどこにも無い(行き先があるとすれば設定タブのその手続き自体で、
 * 日付には紐づかない)。だから「日程で見る」に相当するボタンをそもそも置かない。
 *
 * 種別ごとの見出しとアイコン、severity ごとの配色(警告=琥珀、情報=空色)は
 * ItineraryIssueList.tsx の SEVERITY_CLASSES と同じ値を持たせている。
 * 定数そのものを import で共有していないのは ItineraryIssueList 側が
 * export していないためだが、値をここで独自に決め直すと進捗タブの中で
 * 警告の色が場所によって違う、という事故が起きるので、値は必ず揃える。
 */

import {
  CalendarClock,
  CalendarX2,
  CircleDashed,
  Info,
  TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  ItineraryIssueSeverity,
  TravelDocIssue,
  TravelDocIssueKind,
} from '../../../../lib/trip-notes/types'

interface IssueStyle {
  icon: LucideIcon
  /** 一覧を目で走らせるための短い見出し。詳細は message が持つ */
  label: string
}

const ISSUE_STYLES: Record<TravelDocIssueKind, IssueStyle> = {
  'not-done': { icon: CircleDashed, label: '未取得' },
  'due-soon': { icon: CalendarClock, label: '申請期限' },
  'coverage-gap': { icon: CalendarX2, label: '有効期間が足りない' },
}

/** ItineraryIssueList.tsx の SEVERITY_CLASSES と同じ値(警告は琥珀、情報は空色) */
const SEVERITY_CLASSES: Record<
  ItineraryIssueSeverity,
  { box: string; icon: string; title: string; body: string }
> = {
  warning: {
    box: 'border-amber-200 bg-amber-50',
    icon: 'text-amber-600',
    title: 'text-amber-900',
    body: 'text-amber-800',
  },
  info: {
    box: 'border-sky-200 bg-sky-50',
    icon: 'text-sky-600',
    title: 'text-sky-900',
    body: 'text-sky-800',
  },
}

interface IssueSectionProps {
  title: string
  headingIcon: LucideIcon
  issues: Array<TravelDocIssue>
}

function IssueSection({
  title,
  headingIcon: HeadingIcon,
  issues,
}: IssueSectionProps) {
  if (issues.length === 0) return null

  return (
    <div className="mt-4">
      <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500">
        <HeadingIcon size={13} aria-hidden="true" />
        {title}
        <span className="tabular-nums">{issues.length}件</span>
      </p>
      <ul className="space-y-2">
        {issues.map((issue, index) => {
          const style = ISSUE_STYLES[issue.kind]
          const tone = SEVERITY_CLASSES[issue.severity]
          const Icon = style.icon
          return (
            <li
              // 有効期間の不足(coverage-gap)は前(validFrom)と後ろ(validUntil)の
              // 両方が足りないと、同じ docId・同じ kind の指摘が2件出る
              // (docs.ts の findCoverageGapIssues 参照)。docId と kind だけでは
              // React の key が重複してしまうので、一覧内の並び順である index を
              // 足して一意にする
              key={`${issue.kind}:${issue.docId}:${index}`}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${tone.box}`}
            >
              <Icon
                size={16}
                className={`mt-0.5 shrink-0 ${tone.icon}`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className={`text-sm font-medium ${tone.title}`}>
                  {style.label}
                </p>
                <p className={`mt-0.5 text-xs leading-relaxed ${tone.body}`}>
                  {issue.message}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function TravelDocIssueList({
  issues,
}: {
  issues: Array<TravelDocIssue>
}) {
  const warnings = issues.filter((issue) => issue.severity === 'warning')
  const notices = issues.filter((issue) => issue.severity === 'info')

  // issues が空なら warnings も notices も空になり、下の2つの IssueSection は
  // どちらも null を返す。ItineraryIssueList と同じく、ここに明示的な
  // 早期returnは置かず、各セクションの空チェックだけに任せる
  return (
    <>
      <IssueSection
        title="手続きの不足"
        headingIcon={TriangleAlert}
        issues={warnings}
      />
      <IssueSection
        title="確認しておきたい点"
        headingIcon={Info}
        issues={notices}
      />
    </>
  )
}
