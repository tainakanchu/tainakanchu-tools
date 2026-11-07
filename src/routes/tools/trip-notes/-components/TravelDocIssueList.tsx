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
 * 種別ごとの短い見出し、罫で区切った行の形、severity ごとの本文の強さ
 * (警告=濃い文字、情報=弱い文字)は ItineraryIssueList.tsx と同じにしている。
 * 定数そのものを import で共有していないのは ItineraryIssueList 側が
 * export していないためだが、値をここで独自に決め直すと進捗タブの中で
 * 警告の見た目が場所によって違う、という事故が起きるので、値は必ず揃える。
 */

import type {
  ItineraryIssueSeverity,
  TravelDocIssue,
  TravelDocIssueKind,
} from '../../../../lib/trip-notes/types'

/** 一覧を目で走らせるための短い見出し。詳細は message が持つ */
const ISSUE_LABELS: Record<TravelDocIssueKind, string> = {
  'not-done': '未取得',
  'due-soon': '申請期限',
  'coverage-gap': '有効期間が足りない',
}

/** ItineraryIssueList.tsx の SEVERITY_BODY_CLASSES と同じ値 */
const SEVERITY_BODY_CLASSES: Record<ItineraryIssueSeverity, string> = {
  warning: 'text-ink',
  info: 'text-ink-muted',
}

interface IssueSectionProps {
  title: string
  issues: Array<TravelDocIssue>
}

function IssueSection({ title, issues }: IssueSectionProps) {
  if (issues.length === 0) return null

  return (
    <div className="mt-4">
      <p className="palt mb-1.5 flex items-center gap-1 text-xs font-medium text-ink-muted">
        {title}
        <span className="tabular-nums">{issues.length}件</span>
      </p>
      <ul className="ink-line-t ink-line-b">
        {issues.map((issue, index) => {
          const body = SEVERITY_BODY_CLASSES[issue.severity]
          return (
            <li
              // 有効期間の不足(coverage-gap)は前(validFrom)と後ろ(validUntil)の
              // 両方が足りないと、同じ docId・同じ kind の指摘が2件出る
              // (docs.ts の findCoverageGapIssues 参照)。docId と kind だけでは
              // React の key が重複してしまうので、一覧内の並び順である index を
              // 足して一意にする
              key={`${issue.kind}:${issue.docId}:${index}`}
              className="border-t border-rule py-3 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {ISSUE_LABELS[issue.kind]}
                </p>
                <p className={`mt-0.5 text-xs leading-relaxed ${body}`}>
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
      <IssueSection title="手続きの不足" issues={warnings} />
      <IssueSection title="確認しておきたい点" issues={notices} />
    </>
  )
}
