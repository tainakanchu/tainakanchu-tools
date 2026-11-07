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
import { Note, SegmentedControl } from '../../../../components/ui'
import { formatDateJa } from '../../../../lib/trip-notes/datetime'
import { warningIssuesOf } from '../../../../lib/trip-notes/itinerary'
import { findTentativeNights } from '../../../../lib/trip-notes/nights'
import { formatDaysLeft, formatMoney } from '../-lib/format'
import { KANBAN_AXIS_LABELS } from '../-lib/kanban'
import { sectionTitleClass, subtleButtonClass } from '../-lib/styles'
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
    <div className="mt-1.5 flex h-2 w-full overflow-hidden bg-rule">
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

const kpiTileClass = 'bg-wash p-3'
const kpiLabelClass = 'palt text-xs text-ink-muted'
const kpiValueClass = 'mt-1 text-lg font-bold tabular-nums text-ink'

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
      <p className={kpiLabelClass}>予約状況</p>
      <p className={kpiValueClass}>
        確定{confirmedCount}
        <span className="text-sm font-normal text-ink-muted">
          /仮{tentativeCount}
        </span>
      </p>
      <MiniBar
        segments={[
          { value: confirmedCount, className: 'bg-ink', label: '確定' },
          { value: tentativeCount, className: 'bg-ink-muted', label: '仮' },
        ]}
      />
      {cancelledCount > 0 ? (
        <p className="mt-1 text-xs text-ink-muted">
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
      <p className={kpiLabelClass}>支払状況</p>
      <p className={kpiValueClass}>
        完済{paidCount}
        <span className="text-sm font-normal text-ink-muted">
          /未{notPaidCount}
        </span>
      </p>
      <MiniBar
        segments={[
          { value: paidCount, className: 'bg-ink', label: '完済' },
          { value: notPaidCount, className: 'bg-ink-muted', label: '未払い等' },
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
        <p className={kpiLabelClass}>予算合計</p>
        <p className="mt-1 text-sm text-ink-muted">金額未入力</p>
      </div>
    )
  }

  // 複数通貨あり得るため、最も大きい1通貨だけを主表示にし、他はバッジで存在を示す
  const primary = budget.reduce((max, b) => (b.total > max.total ? b : max))
  const others = budget.filter((b) => b !== primary)

  return (
    <div className={kpiTileClass}>
      <p className={kpiLabelClass}>予算合計</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
        <p className="text-lg font-bold tabular-nums text-ink">
          {formatMoney(primary.total, primary.currency)}
        </p>
        {others.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="rounded-ui bg-wash px-1.5 py-0.5 text-xs font-medium text-ink transition hover:bg-wash"
          >
            +{others.length}通貨
          </button>
        ) : null}
      </div>
      <MiniBar
        segments={[
          {
            value: primary.paid,
            className: 'bg-ink',
            label: '支払済み',
          },
          {
            value: primary.outstanding,
            className: 'bg-ink-muted',
            label: '残額',
          },
        ]}
      />
      <p className="mt-1 truncate text-xs text-ink-muted">
        支払済み {formatMoney(primary.paid, primary.currency)} / 残額{' '}
        {formatMoney(primary.outstanding, primary.currency)}
      </p>
      {expanded && others.length > 0 ? (
        <ul className="mt-2 space-y-0.5 border-t border-rule pt-2 text-xs text-ink-muted">
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
      className="rounded-ui border border-ink bg-paper p-3 text-left transition hover:bg-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <p className="palt text-xs text-ink">要確認</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-ink">{count}件</p>
      <p className="mt-1 text-xs font-medium text-ink underline decoration-rule underline-offset-4">
        確認する
      </p>
    </button>
  )
}

/**
 * 仮のままの夜があるアラートに添える一言。
 * 「あと何をすればよいか」まで書くのは、この段階が警告ではなく
 * 「割り当ては済んだが、まだ取っていない」という途中経過だからで、
 * 何をすれば確定になるのかが分からないと、仮のまま放置される
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
  // 穴アラートの点灯にも件数にも数えない。
  // 手続き(travelDocIssues)も同じ理由でここには混ぜない。
  // 上段の穴アラートは「旅程そのものが壊れているか(寝る場所がない/移動が
  // つながっていない)」を示す場所で、手続きの抜けは旅程が壊れているかとは
  // 別の軸(現地に行く前ならまだ埋め合わせが効く)なので、点灯条件を共有すると
  // 「旅程は完璧なのに手続き待ちで警告が出る」のような読み違えが起きる
  const warningIssues = warningIssuesOf(summary.itineraryIssues)
  const hasHoles = summary.uncoveredNights > 0 || warningIssues.length > 0

  // 穴が無くても「確保できています」と言い切れるとは限らない。
  // 検討中・仮押さえの宿で埋めただけの夜は、割り当てがあるだけで何も取れていない。
  // 未確保(エラーの帯)とは別の段階として、破線の注意の帯で出す。
  // 同じ強さで出すと、本当に寝る場所がない夜の警告と区別が付かなくなる
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
    // 外枠の箱は付けない。中のカンバンの列や帯が箱の中の箱になるため
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={sectionTitleClass}>旅の進捗</h2>
        {/*
          ページの一部だけが切り替わるので、role="tab" ではなく 2 択の radiogroup にする
          (タブパネルとしての読み上げ(何枚目/全何枚)がかえって回りくどくなるため)
        */}
        <SegmentedControl
          label="進捗の表示方法"
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'list', label: '一覧' },
            { value: 'kanban', label: 'カンバン' },
          ]}
        />
      </div>

      {/*
        1段目: 穴アラート(最大サイズ・単独配置)。表示方法によらず常に出す。

        3 段階にしているのは、「割り当てが無い」と「割り当てはあるが仮のまま」を
        同じ言葉で片付けると嘘になるため。仮の宿しか置いていないのに
        「すべて確保できています」と言われると、この画面を見て安心した人が
        何も予約しないまま出発することになる。かといって仮を未確保と同じ強さで出すと、
        警告が旅程じゅうに広がって本当の穴が埋もれる(nights.ts の
        findTentativeNights 参照)。危険度の順に、エラーの帯(ピンクの網)、
        注意の帯(破線)、ふつうの帯(薄塗り)と落とす
      */}
      {hasHoles ? (
        <Note tone="error" className="mt-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink">
            <span className="text-sm font-medium">
              寝る場所がない夜:{' '}
              <span className="text-2xl font-bold tabular-nums">
                {summary.uncoveredNights}
              </span>
              泊
            </span>
            <span className="text-ink" aria-hidden="true">
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
        </Note>
      ) : hasTentativeNights ? (
        <Note
          tone="warn"
          className="mt-3 flex flex-wrap items-start justify-between gap-2"
        >
          <div className="min-w-0 text-ink">
            <div className="min-w-0">
              {/*
                数字を span で囲まないのは、1 つの文として読み上げさせたいため。
                「N泊」だけが独立した塊になると、前後の文と切れて意味が変わる
              */}
              <p className="text-sm font-bold">
                {`寝る場所の割り当てはすべての夜にありますが、${summary.tentativeNights}泊は検討中・仮押さえのままです`}
              </p>
              <p className="mt-0.5 text-xs text-ink">{TENTATIVE_NIGHTS_HINT}</p>
            </div>
          </div>
          {firstTentativeDate === undefined ? null : (
            <button
              type="button"
              onClick={() => onSelectDate(firstTentativeDate)}
              className={`${subtleButtonClass} shrink-0 bg-paper`}
              aria-label={`${formatDateJa(firstTentativeDate)}の日程を開いて予約を確定させる`}
            >
              日程で確定させる
            </button>
          )}
        </Note>
      ) : (
        <Note className="mt-3">
          <p className="text-sm font-bold">
            穴はありません。寝る場所も移動のつながりもすべて確保できています
          </p>
        </Note>
      )}

      {view === 'kanban' ? (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl
              label="カンバンの軸"
              size="sm"
              value={axis}
              onChange={setAxis}
              options={[
                { value: 'status', label: KANBAN_AXIS_LABELS.status },
                { value: 'payment', label: KANBAN_AXIS_LABELS.payment },
              ]}
            />
            <p className="text-xs text-ink-muted">
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
                <p className="palt text-xs font-medium text-ink-muted">
                  無料キャンセル期限
                </p>
                <p className="text-xs text-ink-muted">
                  {formatDateJa(todayInTz)} 時点
                </p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {summary.cancelDeadlines.map((deadline) => {
                  const urgent = deadline.daysLeft <= 2
                  return (
                    <li
                      key={deadline.bookingId}
                      className={`flex items-center gap-1.5 rounded-ui border px-2.5 py-1 text-xs ${
                        urgent
                          ? 'border-pink bg-pink-wash font-bold text-ink'
                          : 'border-ink bg-paper text-ink-muted'
                      }`}
                    >
                      <span className="font-bold">
                        {formatDaysLeft(deadline.daysLeft)}
                      </span>
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
              <p className="palt mb-1.5 flex items-center gap-1 text-xs font-medium text-ink-muted">
                手続き
                <span className="tabular-nums">
                  {travelDocs.length}件中{doneTravelDocCount}件が取得済み
                </span>
              </p>
              {summary.travelDocIssues.length === 0 ? (
                <Note>
                  <p className="text-sm font-medium">
                    手続きの抜けはありません
                  </p>
                </Note>
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
