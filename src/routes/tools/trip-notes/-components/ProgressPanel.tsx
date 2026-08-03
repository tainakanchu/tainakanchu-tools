/**
 * 進捗ダッシュボード。「あと何を予約すればいいか」を1画面で伝える3段構成。
 *
 * 1段目(穴アラート)を最優先で最大サイズにしているのは、
 * 「寝る場所がない夜」と「移動の穴」が旅行の破綻に直結する一方、
 * 支払い漏れなどは(気まずいが)現地で何とかなることが多いため。
 * 情報の重大度と画面上の面積を一致させる。
 */

import { useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  PiggyBank,
  Route,
  Wallet,
} from 'lucide-react'
import { formatDateJa } from '../../../../lib/trip-notes/datetime'
import { formatDaysLeft, formatMoney } from '../-lib/format'
import { cardClass, sectionTitleClass, subtleButtonClass } from '../-lib/styles'
import { NightCoverageStrip } from './NightCoverageStrip'
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
  /** 夜カバレッジ帯のセル・移動の穴カードから、日程タブの該当日へ飛ぶ */
  onSelectDate: (date: string) => void
  /** 「要確認 N件」から未確認の予約がある日へ飛ぶ */
  onJumpToUnverified: () => void
}

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

export function ProgressPanel({
  state,
  summary,
  displayTz,
  onSelectDate,
  onJumpToUnverified,
}: ProgressPanelProps) {
  const hasHoles =
    summary.uncoveredNights > 0 || summary.transportGaps.length > 0

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
      <h2 className={sectionTitleClass}>
        {hasHoles ? (
          <AlertTriangle
            size={18}
            className="text-rose-600"
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

      {/* 1段目: 穴アラート(最大サイズ・単独配置) */}
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
              移動の穴:{' '}
              <span className="text-2xl font-bold tabular-nums">
                {summary.transportGaps.length}
              </span>
              件
            </span>
          </p>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
          <CheckCircle2 size={20} aria-hidden="true" />
          <p className="text-sm font-semibold">
            穴はありません。寝る場所も移動もすべて確保できています
          </p>
        </div>
      )}

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
        <PaymentStatusTile paidCount={paidCount} notPaidCount={notPaidCount} />
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

      {/* 移動の穴: 宿は取れているのに間の移動手段が未登録の箇所 */}
      {summary.transportGaps.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500">
            <Route size={13} aria-hidden="true" />
            移動の穴
          </p>
          <ul className="space-y-2">
            {summary.transportGaps.map((gap) => (
              <li
                key={`${gap.fromBookingId}-${gap.toBookingId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    {gap.fromLabel} → {gap.toLabel} の移動が未登録です
                  </p>
                  <p className="text-xs text-amber-700">
                    {formatDateJa(gap.date)} に移動が必要
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectDate(gap.date)}
                  className={subtleButtonClass}
                >
                  日程で追加する
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
