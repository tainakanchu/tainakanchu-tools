/**
 * 旅程の不整合(itinerary.ts の findItineraryIssues)の一覧。
 *
 * message は「次に何をすればよいか」まで含んだ 1 文として組み立てられているので、
 * ここでは加工せずそのまま出す。画面側で言い換えると、判定の根拠
 * (どの予約とどの予約を突き合わせた結果なのか)と食い違う恐れがあるうえ、
 * 文言が 2 か所に散って片方だけ直される。
 *
 * 種別ごとに短い見出しを変えるのは、同じ見出しで並ぶと
 * 「また同じ警告か」と読み飛ばされるためである。一方で形は警告どうしなら揃える。
 * 深刻さの違いは種別ではなく「寝る場所がない夜が何泊あるか」で効くので、
 * ここで警告の中に強さの段階を作ると上段のアラートと重大度の読みが二重になる。
 * severity が 'info' のもの(乗り継ぎの案内)は一覧ごと分け、行も弱い文字にする。
 * これは直すべき不整合ではなく「知らせるだけ」なので、警告と同じ塊に混ぜると
 * 「不整合 N 件」の N が直しようのない数で膨らみ、本当の穴が埋もれる。
 *
 * 場所の食い違い系には「同じ場所として扱う」も並べる。地名の同一判定は
 * ヒューリスティックなので必ず外れる場面があり(itinerary.ts 冒頭参照)、
 * 直しようのない警告が残り続けると一覧そのものが読まれなくなる。
 * 「日程で直す」が旅程を直す道なら、こちらは判定のほうを直す道である。
 */

import { Badge } from '../../../../components/ui'
import { formatDateJa } from '../../../../lib/trip-notes/datetime'
import { isAliasableIssueKind } from '../../../../lib/trip-notes/itinerary'
import { subtleButtonClass } from '../-lib/styles'
import type {
  ItineraryIssue,
  ItineraryIssueKind,
  ItineraryIssueSeverity,
} from '../../../../lib/trip-notes/types'

/** 一覧を目で走らせるための短い見出し。詳細は message が持つ */
const ISSUE_LABELS: Record<ItineraryIssueKind, string> = {
  'missing-transport': '移動が未登録',
  'location-mismatch': '到着地の食い違い',
  'missing-lodging': '宿が未登録',
  'departure-mismatch': '出発地の食い違い',
  layover: '乗り継ぎ',
}

/** severity ごとの本文の強さ。警告は濃い文字、情報は弱い文字 */
const SEVERITY_BODY_CLASSES: Record<ItineraryIssueSeverity, string> = {
  warning: 'text-ink',
  info: 'text-ink-muted',
}

interface IssueSectionProps {
  title: string
  issues: Array<ItineraryIssue>
  onSelectDate: (date: string) => void
  onTreatAsSamePlace?: (names: [string, string]) => void
}

function IssueSection({
  title,
  issues,
  onSelectDate,
  onTreatAsSamePlace,
}: IssueSectionProps) {
  if (issues.length === 0) return null

  return (
    <div className="mt-4">
      <p className="palt mb-1.5 flex items-center gap-1 text-xs font-medium text-ink-muted">
        {title}
        <span className="tabular-nums">{issues.length}件</span>
      </p>
      {/* 同じ種類の指摘が続くので、箱を積まずに罫で区切った行にする */}
      <ul className="ink-line-t ink-line-b">
        {issues.map((issue) => {
          const label = ISSUE_LABELS[issue.kind]
          const body = SEVERITY_BODY_CLASSES[issue.severity]
          return (
            <li
              // 同じ予約の組でも種別が違えば別の指摘になるので、種別まで鍵に含める
              key={`${issue.kind}:${issue.date}:${issue.fromBookingId ?? ''}:${issue.toBookingId ?? ''}`}
              className="flex flex-wrap items-start justify-between gap-2 border-t border-rule py-3 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {label}
                  <Badge
                    tone={issue.severity === 'warning' ? 'outline' : 'muted'}
                  >
                    {formatDateJa(issue.date)}
                  </Badge>
                </p>
                <p className={`mt-0.5 text-xs leading-relaxed ${body}`}>
                  {issue.message}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {/*
                  「同じ場所として扱う」は、判定が外れているときだけ意味がある。
                  場所の食い違い系にしか出さないのは、宿の有無の指摘に出しても
                  押した結果が何も変わらないためで、条件は lib 側と共有する
                */}
                {onTreatAsSamePlace !== undefined &&
                isAliasableIssueKind(issue.kind) ? (
                  <button
                    type="button"
                    onClick={() =>
                      onTreatAsSamePlace([issue.fromLabel, issue.toLabel])
                    }
                    className={subtleButtonClass}
                    aria-label={`${issue.fromLabel} と ${issue.toLabel} を同じ場所として扱う`}
                  >
                    同じ場所として扱う
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelectDate(issue.date)}
                  className={subtleButtonClass}
                  aria-label={`${formatDateJa(issue.date)}の日程を開く`}
                >
                  {/* 情報の指摘は直すものではないので、行き先だけ示す */}
                  {issue.severity === 'warning' ? '日程で直す' : '日程で見る'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface ItineraryIssueListProps {
  issues: Array<ItineraryIssue>
  /** その日の日程タブへ飛ばす */
  onSelectDate: (date: string) => void
  /**
   * 「この 2 つは同じ場所」の登録。渡されていなければボタンごと出さない
   * (印刷用など、その場で状態を変えられない文脈からも使えるようにするため)。
   */
  onTreatAsSamePlace?: (names: [string, string]) => void
}

export function ItineraryIssueList({
  issues,
  onSelectDate,
  onTreatAsSamePlace,
}: ItineraryIssueListProps) {
  const warnings = issues.filter((issue) => issue.severity === 'warning')
  const notices = issues.filter((issue) => issue.severity === 'info')

  return (
    <>
      <IssueSection
        title="旅程の不整合"
        issues={warnings}
        onSelectDate={onSelectDate}
        onTreatAsSamePlace={onTreatAsSamePlace}
      />
      <IssueSection
        title="確認しておきたい点"
        issues={notices}
        onSelectDate={onSelectDate}
        onTreatAsSamePlace={onTreatAsSamePlace}
      />
    </>
  )
}
