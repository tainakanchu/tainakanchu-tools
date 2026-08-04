/**
 * 旅程の不整合(itinerary.ts の findItineraryIssues)の一覧。
 *
 * message は「次に何をすればよいか」まで含んだ 1 文として組み立てられているので、
 * ここでは加工せずそのまま出す。画面側で言い換えると、判定の根拠
 * (どの予約とどの予約を突き合わせた結果なのか)と食い違う恐れがあるうえ、
 * 文言が 2 か所に散って片方だけ直される。
 *
 * 種別ごとにアイコンと短い見出しを変えるのは、同じ見た目で並ぶと
 * 「また同じ警告か」と読み飛ばされるためである。一方で色は警告どうしなら揃える。
 * 深刻さの違いは種別ではなく「寝る場所がない夜が何泊あるか」で効くので、
 * ここで警告の中に色の段階を作ると上段のアラートと重大度の読みが二重になる。
 * severity が 'info' のもの(乗り継ぎの案内)は色も見出しも分ける。
 * これは直すべき不整合ではなく「知らせるだけ」なので、警告と同じ塊に混ぜると
 * 「不整合 N 件」の N が直しようのない数で膨らみ、本当の穴が埋もれる。
 *
 * 場所の食い違い系には「同じ場所として扱う」も並べる。地名の同一判定は
 * ヒューリスティックなので必ず外れる場面があり(itinerary.ts 冒頭参照)、
 * 直しようのない警告が残り続けると一覧そのものが読まれなくなる。
 * 「日程で直す」が旅程を直す道なら、こちらは判定のほうを直す道である。
 */

import {
  BedDouble,
  Hourglass,
  Info,
  MapPinCheck,
  MapPinX,
  PlaneTakeoff,
  Route,
  TriangleAlert,
} from 'lucide-react'
import { formatDateJa } from '../../../../lib/trip-notes/datetime'
import { isAliasableIssueKind } from '../../../../lib/trip-notes/itinerary'
import { subtleButtonClass } from '../-lib/styles'
import type { LucideIcon } from 'lucide-react'
import type {
  ItineraryIssue,
  ItineraryIssueKind,
  ItineraryIssueSeverity,
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
  layover: { icon: Hourglass, label: '乗り継ぎ' },
}

/** severity ごとの配色。警告は琥珀、情報は空色 */
const SEVERITY_CLASSES: Record<
  ItineraryIssueSeverity,
  { box: string; icon: string; title: string; body: string; badge: string }
> = {
  warning: {
    box: 'border-amber-200 bg-amber-50',
    icon: 'text-amber-600',
    title: 'text-amber-900',
    body: 'text-amber-800',
    badge: 'border-amber-300 text-amber-700',
  },
  info: {
    box: 'border-sky-200 bg-sky-50',
    icon: 'text-sky-600',
    title: 'text-sky-900',
    body: 'text-sky-800',
    badge: 'border-sky-300 text-sky-700',
  },
}

interface IssueSectionProps {
  title: string
  headingIcon: LucideIcon
  issues: Array<ItineraryIssue>
  onSelectDate: (date: string) => void
  onTreatAsSamePlace?: (names: [string, string]) => void
}

function IssueSection({
  title,
  headingIcon: HeadingIcon,
  issues,
  onSelectDate,
  onTreatAsSamePlace,
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
        {issues.map((issue) => {
          const style = ISSUE_STYLES[issue.kind]
          const tone = SEVERITY_CLASSES[issue.severity]
          const Icon = style.icon
          return (
            <li
              // 同じ予約の組でも種別が違えば別の指摘になるので、種別まで鍵に含める
              key={`${issue.kind}:${issue.date}:${issue.fromBookingId ?? ''}:${issue.toBookingId ?? ''}`}
              className={`flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3 py-2 ${tone.box}`}
            >
              <div className="flex min-w-0 items-start gap-2">
                <Icon
                  size={16}
                  className={`mt-0.5 shrink-0 ${tone.icon}`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p
                    className={`flex flex-wrap items-center gap-2 text-sm font-medium ${tone.title}`}
                  >
                    {style.label}
                    <span
                      className={`rounded-full border bg-white px-1.5 py-0.5 text-[10px] font-semibold ${tone.badge}`}
                    >
                      {formatDateJa(issue.date)}
                    </span>
                  </p>
                  <p className={`mt-0.5 text-xs leading-relaxed ${tone.body}`}>
                    {issue.message}
                  </p>
                </div>
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
                    className={`${subtleButtonClass} bg-white`}
                    aria-label={`${issue.fromLabel} と ${issue.toLabel} を同じ場所として扱う`}
                  >
                    <MapPinCheck size={14} aria-hidden="true" />
                    同じ場所として扱う
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelectDate(issue.date)}
                  className={`${subtleButtonClass} bg-white`}
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
        headingIcon={TriangleAlert}
        issues={warnings}
        onSelectDate={onSelectDate}
        onTreatAsSamePlace={onTreatAsSamePlace}
      />
      <IssueSection
        title="確認しておきたい点"
        headingIcon={Info}
        issues={notices}
        onSelectDate={onSelectDate}
        onTreatAsSamePlace={onTreatAsSamePlace}
      />
    </>
  )
}
