/**
 * 進捗ダッシュボード。「あと何を予約すればいいか」を1画面で伝える3段構成。
 *
 * 1段目(穴アラート)を最優先で最大サイズにしているのは、
 * 「寝る場所がない夜」と「旅程の不整合」が旅行の破綻に直結する一方、
 * 支払い漏れなどは(気まずいが)現地で何とかなることが多いため。
 * 情報の重大度と画面上の面積を一致させる。
 *
 * 「一覧」と「カンバン」を同じタブの中の表示切替にしているのは、
 * どちらも答えているのが「あと何が残っているか」という同じ問いだからである。
 * タブを増やすと、旅行前に見るべき場所が 2 つに割れて、
 * どちらか片方しか見られていない状態が生まれる。
 * 一覧は「日付に沿った穴」を、カンバンは「状態ごとの積み残しと金額」を見せる。
 */

import { useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  CircleHelp,
  ClipboardList,
  Columns3,
  IdCard,
  List,
  PiggyBank,
  Wallet,
} from 'lucide-react'
import { formatDateJa } from '../../../../lib/trip-notes/datetime'
import { warningIssuesOf } from '../../../../lib/trip-notes/itinerary'
import { findTentativeNights } from '../../../../lib/trip-notes/nights'
import { formatDaysLeft, formatMoney } from '../-lib/format'
import { KANBAN_AXIS_LABELS } from '../-lib/kanban'
import { cardClass, sectionTitleClass, subtleButtonClass } from '../-lib/styles'
import { ItineraryIssueList } from './ItineraryIssueList'
import { KanbanBoard } from './KanbanBoard'
import { NightCoverageStrip } from './NightCoverageStrip'
import { TravelDocIssueList } from './TravelDocIssueList'
import type { KanbanAxis } from '../-lib/kanban'
import type { TripNotesDispatch } from '../-lib/reducer'
import type {
  BudgetByCurrency,
  PaymentStatus,
  TripNotesState,
  TripSummary,
} from '../../../../lib/trip-notes/types'

interface ProgressPanelProps {
  state: TripNotesState
  summary: TripSummary
  displayTz: string
  /** カンバンで列を移したときの状態更新。Undo を効かせるため reducer を通す */
  dispatch: TripNotesDispatch
  /** 夜カバレッジ帯・不整合カードから、日程タブの該当日へ飛ぶ */
  onSelectDate: (date: string) => void
  /** 「要確認 N件」から未確認の予約がある日へ飛ぶ */
  onJumpToUnverified: () => void
}

type ProgressView = 'list' | 'kanban'

/**
 * 件数比率のミニ横積みバー。チャートライブラリは使わず、flex の div を
 * 幅%だけで積む。色だけに頼らないよう各セグメントに title を付ける。
 */
function MiniBar({
  segments,
}: {
  segments: Array<{ value: number; className: string; label: string }>
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  return (
    <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-gray-200">
      {segments.map((s) => (
        <div
          key={s.label}
          className={s.className}
          style={{ width: total > 0 ? `${(s.value / total) * 100}%` : '0%' }}
          title={`${s.label}: ${s.value}`}
        />
      ))}
    </div>
  )
}

const kpiTileClass = 'rounded-xl bg-gray-50 p-3'
const kpiLabelClass = 'flex items-center gap-1 text-xs text-gray-500'
const kpiValueClass = 'mt-1 text-lg font-semibold tabular-nums text-gray-900'

function BookingStatusTile({
  confirmedCount,
  tentativeCount,
  cancelledCount,
}: {
  confirmedCount: number
  tentativeCount: number
  cancelledCount: number
}) {
  return (
    <div className={kpiTileClass}>
      <p className={kpiLabelClass}>
        <ClipboardList size={13} aria-hidden="true" />
        予約状況
      </p>
      <p className={kpiValueClass}>
        確定{confirmedCount}
        <span className="text-sm font-normal text-gray-400">
          /仮{tentativeCount}
        </span>
      </p>
      <MiniBar
        segments={[
          { value: confirmedCount, className: 'bg-emerald-500', label: '確定' },
          { value: tentativeCount, className: 'bg-amber-400', label: '仮' },
        ]}
      />
      {cancelledCount > 0 ? (
        <p className="mt-1 text-[11px] text-gray-400">
          キャンセル {cancelledCount}件
        </p>
      ) : null}
    </div>
  )
}

function PaymentStatusTile({
  paidCount,
  notPaidCount,
}: {
  paidCount: number
  notPaidCount: number
}) {
  return (
    <div className={kpiTileClass}>
      <p className={kpiLabelClass}>
        <Wallet size={13} aria-hidden="true" />
        支払状況
      </p>
      <p className={kpiValueClass}>
        完済{paidCount}
        <span className="text-sm font-normal text-gray-400">
          /未{notPaidCount}
        </span>
      </p>
      <MiniBar
        segments={[
          { value: paidCount, className: 'bg-emerald-500', label: '完済' },
          { value: notPaidCount, className: 'bg-amber-400', label: '未払い等' },
        ]}
      />
    </div>
  )
}

function BudgetTile({ budget }: { budget: Array<BudgetByCurrency> }) {
  const [expanded, setExpanded] = useState(false)

  if (budget.length === 0) {
    return (
      <div className={kpiTileClass}>
        <p className={kpiLabelClass}>
          <PiggyBank size={13} aria-hidden="true" />
          予算合計
        </p>
        <p className="mt-1 text-sm text-gray-400">金額未入力</p>
      </div>
    )
  }

  // 複数通貨あり得るため、最も大きい1通貨だけを主表示にし、他はバッジで存在を示す
  const primary = budget.reduce((max, b) => (b.total > max.total ? b : max))
  const others = budget.filter((b) => b !== primary)

  return (
    <div className={kpiTileClass}>
      <p className={kpiLabelClass}>
        <PiggyBank size={13} aria-hidden="true" />
        予算合計
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
        <p className="text-lg font-semibold tabular-nums text-gray-900">
          {formatMoney(primary.total, primary.currency)}
        </p>
        {others.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 transition hover:bg-cyan-200"
          >
            +{others.length}通貨
          </button>
        ) : null}
      </div>
      <MiniBar
        segments={[
          {
            value: primary.paid,
            className: 'bg-emerald-500',
            label: '支払済み',
          },
          {
            value: primary.outstanding,
            className: 'bg-amber-400',
            label: '残額',
          },
        ]}
      />
      <p className="mt-1 truncate text-[11px] text-gray-500">
        支払済み {formatMoney(primary.paid, primary.currency)} / 残額{' '}
        {formatMoney(primary.outstanding, primary.currency)}
      </p>
      {expanded && others.length > 0 ? (
        <ul className="mt-2 space-y-0.5 border-t border-gray-200 pt-2 text-[11px] text-gray-600">
          {others.map((b) => (
            <li key={b.currency} className="flex justify-between gap-2">
              <span>{b.currency}</span>
              <span className="tabular-nums">
                {formatMoney(b.total, b.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function UnverifiedTile({
  count,
  onJumpToUnverified,
}: {
  count: number
  onJumpToUnverified: () => void
}) {
  if (count === 0) return null
  return (
    <button
      type="button"
      onClick={onJumpToUnverified}
      className="rounded-xl bg-amber-50 p-3 text-left transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
    >
      <p className="flex items-center gap-1 text-xs text-amber-700">
        <CircleHelp size={13} aria-hidden="true" />
        要確認
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-amber-900">
        {count}件
      </p>
      <p className="mt-1 flex items-center gap-0.5 text-[11px] font-medium text-amber-700">
        確認する
        <ChevronRight size={12} aria-hidden="true" />
      </p>
    </button>
  )
}

/**
 * 2〜3 択の表示切替。role="tab" ではなく aria-pressed のボタン列にしているのは、
 * 切り替わるのがページの一部で、タブパネルとしての読み上げ(何枚目/全何枚)が
 * かえって回りくどくなるため。
 */
function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string; icon?: typeof List }>
  onChange: (next: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${
              selected
                ? 'bg-white text-cyan-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {Icon === undefined ? null : <Icon size={13} aria-hidden="true" />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 仮のままの夜がある琥珀のアラートに添える一言。
 * 「あと何をすればよいか」まで書くのは、この段階が警告ではなく
 * 「割り当ては済んだが、まだ取っていない」という途中経過だからで、
 * 何をすれば緑になるのかが分からないと、琥珀のまま放置される
 */
const TENTATIVE_NIGHTS_HINT =
  '移動のつながりに不整合はありません。仮の予約を取って確定にすれば、寝る場所が確保できます'

export function ProgressPanel({
  state,
  summary,
  displayTz,
  dispatch,
  onSelectDate,
  onJumpToUnverified,
}: ProgressPanelProps) {
  // 表示の好みは端末やその時の関心で変わるだけで、旅行のデータではない。
  // 保存すると共有 URL にも載ってしまうので、開いている間だけの状態にする
  const [view, setView] = useState<ProgressView>('list')
  const [axis, setAxis] = useState<KanbanAxis>('status')

  // 乗り継ぎの案内(severity: 'info')は直す対象ではないので、
  // 赤いアラートの点灯にも件数にも数えない。
  // 手続き(travelDocIssues)も同じ理由でここには混ぜない。
  // 上段の穴アラートは「旅程そのものが壊れているか(寝る場所がない/移動が
  // つながっていない)」を示す場所で、手続きの抜けは旅程が壊れているかとは
  // 別の軸(現地に行く前ならまだ埋め合わせが効く)なので、点灯条件を共有すると
  // 「旅程は完璧なのに手続き待ちで赤くなる」のような読み違えが起きる
  const warningIssues = warningIssuesOf(summary.itineraryIssues)
  const hasHoles = summary.uncoveredNights > 0 || warningIssues.length > 0

  // 穴が無くても「確保できています」と言い切れるとは限らない。
  // 検討中・仮押さえの宿で埋めただけの夜は、割り当てがあるだけで何も取れていない。
  // 未確保(赤)とは別の段階として琥珀で出す。赤と同じ強さで出すと、
  // 本当に寝る場所がない夜の警告と区別が付かなくなる
  const hasTentativeNights = !hasHoles && summary.tentativeNights > 0
  // 「日程で確定させる」の飛び先。件数は summary から取れるので、
  // ここで一覧が要るのは最初の 1 泊の日付を知るためだけ
  const firstTentativeDate = hasTentativeNights
    ? findTentativeNights(summary.nights, state.bookings)[0]?.date
    : undefined

  // 1 件も登録していなければフィールドごと存在しない(types.ts 参照)
  const travelDocs = state.travelDocs ?? []
  const doneTravelDocCount = travelDocs.filter(
    (doc) => doc.status === 'done',
  ).length

  const confirmedCount = summary.statusCounts.confirmed
  const tentativeCount = summary.statusCounts.idea + summary.statusCounts.held
  const cancelledCount = summary.statusCounts.cancelled

  // 支払状況は summary.budget(金額の集計)ではなく件数として見たいので、
  // state.bookings を直接数える(キャンセル済みは対象外)
  const paymentCounts: Record<PaymentStatus, number> = {
    unpaid: 0,
    deposit: 0,
    paid: 0,
    onsite: 0,
  }
  for (const booking of state.bookings) {
    if (booking.status === 'cancelled') continue
    paymentCounts[booking.payment] += 1
  }
  const paidCount = paymentCounts.paid
  const notPaidCount = summary.bookingCount - paidCount

  // 「あと3日」は今日をどのタイムゾーンで見るかで1日ずれうるので、
  // 基準にした「今日」を表示タイムゾーンで明示する
  const todayInTz = Temporal.Now.plainDateISO(displayTz).toString()

  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={sectionTitleClass}>
          {hasHoles ? (
            <AlertTriangle
              size={18}
              className="text-rose-600"
              aria-hidden="true"
            />
          ) : hasTentativeNights ? (
            <CircleDashed
              size={18}
              className="text-amber-600"
              aria-hidden="true"
            />
          ) : (
            <CheckCircle2
              size={18}
              className="text-emerald-600"
              aria-hidden="true"
            />
          )}
          旅の進捗
        </h2>
        <SegmentedToggle
          label="進捗の表示方法"
          value={view}
          onChange={setView}
          options={[
            { value: 'list', label: '一覧', icon: List },
            { value: 'kanban', label: 'カンバン', icon: Columns3 },
          ]}
        />
      </div>

      {/*
        1段目: 穴アラート(最大サイズ・単独配置)。表示方法によらず常に出す。

        3 段階にしているのは、「割り当てが無い」と「割り当てはあるが仮のまま」を
        同じ言葉で片付けると嘘になるため。仮の宿しか置いていないのに
        「すべて確保できています」と言われると、この画面を見て安心した人が
        何も予約しないまま出発することになる。かといって仮を未確保と同じ赤で出すと、
        警告が旅程じゅうに広がって本当の穴が埋もれる(nights.ts の
        findTentativeNights 参照)。危険度の順に 赤 → 琥珀 → 緑 と落とす
      */}
      {hasHoles ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-rose-800">
            <AlertTriangle size={20} className="shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium">
              寝る場所がない夜:{' '}
              <span className="text-2xl font-bold tabular-nums">
                {summary.uncoveredNights}
              </span>
              泊
            </span>
            <span className="text-rose-300" aria-hidden="true">
              ／
            </span>
            <span className="text-sm font-medium">
              旅程の不整合:{' '}
              <span className="text-2xl font-bold tabular-nums">
                {warningIssues.length}
              </span>
              件
            </span>
          </p>
        </div>
      ) : hasTentativeNights ? (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2 text-amber-900">
            <CircleDashed
              size={20}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              {/*
                数字を span で囲まないのは、1 つの文として読み上げさせたいため。
                「N泊」だけが独立した塊になると、前後の文と切れて意味が変わる
              */}
              <p className="text-sm font-semibold">
                {`寝る場所の割り当てはすべての夜にありますが、${summary.tentativeNights}泊は検討中・仮押さえのままです`}
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                {TENTATIVE_NIGHTS_HINT}
              </p>
            </div>
          </div>
          {firstTentativeDate === undefined ? null : (
            <button
              type="button"
              onClick={() => onSelectDate(firstTentativeDate)}
              className={`${subtleButtonClass} shrink-0 bg-white`}
              aria-label={`${formatDateJa(firstTentativeDate)}の日程を開いて予約を確定させる`}
            >
              日程で確定させる
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
          <CheckCircle2 size={20} aria-hidden="true" />
          <p className="text-sm font-semibold">
            穴はありません。寝る場所も移動のつながりもすべて確保できています
          </p>
        </div>
      )}

      {view === 'kanban' ? (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <SegmentedToggle
              label="カンバンの軸"
              value={axis}
              onChange={setAxis}
              options={[
                { value: 'status', label: KANBAN_AXIS_LABELS.status },
                { value: 'payment', label: KANBAN_AXIS_LABELS.payment },
              ]}
            />
            <p className="text-[11px] text-gray-400">
              {axis === 'status'
                ? 'カードをつかんで列を移すと、その予約の予約状況が変わります'
                : 'キャンセル済みの予約は支払いの対象外なので出していません'}
            </p>
          </div>
          <KanbanBoard
            bookings={state.bookings}
            axis={axis}
            dispatch={dispatch}
          />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <NightCoverageStrip
              nights={summary.nights}
              bookings={state.bookings}
              onSelectDate={onSelectDate}
            />
          </div>

          {/* 2段目: サブKPI 4タイル */}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <BookingStatusTile
              confirmedCount={confirmedCount}
              tentativeCount={tentativeCount}
              cancelledCount={cancelledCount}
            />
            <PaymentStatusTile
              paidCount={paidCount}
              notPaidCount={notPaidCount}
            />
            <BudgetTile budget={summary.budget} />
            <UnverifiedTile
              count={summary.unverifiedCount}
              onJumpToUnverified={onJumpToUnverified}
            />
          </div>

          {/* 3段目: 無料キャンセル期限チップ */}
          {summary.cancelDeadlines.length > 0 ? (
            <div className="mt-4">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <p className="flex items-center gap-1 text-xs font-medium text-gray-500">
                  <CalendarClock size={13} aria-hidden="true" />
                  無料キャンセル期限
                </p>
                <p className="text-[11px] text-gray-400">
                  {formatDateJa(todayInTz)} 時点
                </p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {summary.cancelDeadlines.map((deadline) => {
                  const urgent = deadline.daysLeft <= 2
                  return (
                    <li
                      key={deadline.bookingId}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                        urgent
                          ? 'border-rose-300 bg-rose-50 font-semibold text-rose-700'
                          : 'border-gray-300 bg-white text-gray-600'
                      }`}
                    >
                      <span>{formatDaysLeft(deadline.daysLeft)}</span>
                      <span aria-hidden="true">・</span>
                      <span>{formatDateJa(deadline.date)}</span>
                      <span className="font-medium">{deadline.title}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {/*
            旅程の不整合。移動の穴(derive.ts の findTransportGaps)だけを出していた
            場所を置き換えたもので、宿と宿の間に加えて、到着地と次の予約の食い違いや
            移動と移動の間の宿抜けまで拾う。lib 側の findTransportGaps は
            後方互換のため残っているが、画面はこちらだけを見る
          */}
          <ItineraryIssueList
            issues={summary.itineraryIssues}
            onSelectDate={onSelectDate}
            // カンバンの列移動と同じで、ページ側の状態は要らず reducer に流すだけ。
            // 押し間違えても Undo で戻せるうえ、設定タブの一覧からも取り消せる
            onTreatAsSamePlace={(names) =>
              dispatch({ type: 'addPlaceAlias', names })
            }
          />

          {/*
            手続き(ビザ・eSIMなど)のセクション。位置は旅程の不整合の直後にする
            (どちらも「あと何を潰せば旅行に行けるか」という同じ問いに答える
            一覧だから)。

            手続きを1件も登録していない旅程のほうが多いはずで、そこにまで
            空のセクションを増やすと「これは何をする機能か」の説明ごと
            画面が伸びてしまう。travelDocs が無ければ(空配列も含め)
            セクションごと出さない
          */}
          {travelDocs.length > 0 ? (
            <div className="mt-4">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500">
                <IdCard size={13} aria-hidden="true" />
                手続き
                <span className="tabular-nums">
                  {travelDocs.length}件中{doneTravelDocCount}件が取得済み
                </span>
              </p>
              {summary.travelDocIssues.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <p className="text-sm font-medium">
                    手続きの抜けはありません
                  </p>
                </div>
              ) : (
                <TravelDocIssueList issues={summary.travelDocIssues} />
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
