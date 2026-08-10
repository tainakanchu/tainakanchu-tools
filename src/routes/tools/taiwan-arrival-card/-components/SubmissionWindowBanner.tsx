/**
 * 入国日に対する TWAC 提出可能期間の簡易表示。
 *
 * 文字説明は最小限にし、状態は色・形・大きな数字で伝える。
 * - まだ早い: カウントダウン + 提出窓の日帯 + カレンダー登録
 * - 申請可: 緑のチェック + 今日を強調した日帯 + 公式サイトへ
 * - 期間外: 静かな表示
 */

import type { ReactNode } from 'react'
import {
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  Hourglass,
  PlaneLanding,
} from 'lucide-react'
import {
  buildTwacOpenDayIcs,
  twacOpenDayGoogleCalendarUrl,
  twacOpenDayIcsFileName,
} from '../-lib/submissionCalendar'
import type { SubmissionWindowStatus } from '../-lib/submissionWindow'
import {
  assessSubmissionWindow,
  formatMonthDay,
  todayInTaipei,
} from '../-lib/submissionWindow'
import { TWAC_OFFICIAL_URL, TWAC_SCAM_NOTE } from '../-lib/twac'

interface SubmissionWindowBannerProps {
  entryDate: string
  /** テスト差し込み用。省略時は台湾の今日 */
  today?: string
}

function downloadIcs(opensOn: string): void {
  const ics = buildTwacOpenDayIcs(opensOn)
  if (ics === null) return
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = twacOpenDayIcsFileName(opensOn)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/** 提出窓の 7 日を横帯で見せる。today が窓外ならマーカーなし */
function WindowStrip({
  windowDays,
  today,
  tone,
}: {
  windowDays: ReadonlyArray<string>
  today: string
  tone: 'waiting' | 'open' | 'past'
}) {
  return (
    <div className="flex gap-1" role="list" aria-label="提出可能な日">
      {windowDays.map((day, index) => {
        const isToday = day === today
        const isEntry = index === windowDays.length - 1
        const isStart = index === 0

        let base: string
        if (tone === 'past') {
          base = 'bg-gray-200 text-gray-500'
        } else if (tone === 'open') {
          base = isToday
            ? 'bg-emerald-500 text-white shadow-sm'
            : 'bg-emerald-100 text-emerald-800'
        } else {
          // waiting: まだ開いていない。開始日だけ目印、他は薄い枠
          base = isStart
            ? 'bg-amber-200 text-amber-950 ring-1 ring-amber-400'
            : 'bg-white text-gray-400 ring-1 ring-dashed ring-gray-200'
        }

        const ring =
          isToday && tone === 'open'
            ? 'ring-2 ring-emerald-600 ring-offset-1'
            : ''

        return (
          <div
            key={day}
            role="listitem"
            title={`${formatMonthDay(day)}${isStart ? ' 開始' : ''}${isEntry ? ' 入国' : ''}${isToday ? ' 今日' : ''}`}
            className={`relative flex h-9 min-w-0 flex-1 flex-col items-center justify-center rounded-lg text-[10px] font-semibold leading-none ${base} ${ring}`}
          >
            <span className="tabular-nums">{formatMonthDay(day)}</span>
            {isEntry ? (
              <PlaneLanding
                size={10}
                aria-hidden="true"
                className="mt-0.5 opacity-80"
              />
            ) : tone === 'open' && isToday ? (
              <span className="mt-0.5 text-[9px] font-bold tracking-wide">
                今日
              </span>
            ) : isStart && tone === 'waiting' ? (
              <span className="mt-0.5 text-[9px] font-bold tracking-wide">
                開始
              </span>
            ) : (
              <span className="mt-0.5 h-2.5" aria-hidden="true" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatusHero({
  tone,
  children,
}: {
  tone: 'waiting' | 'open' | 'past'
  children: ReactNode
}) {
  const shell =
    tone === 'open'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'waiting'
        ? 'border-amber-200 bg-amber-50'
        : 'border-gray-200 bg-gray-50'
  return (
    <div
      className={`mt-3 overflow-hidden rounded-xl border ${shell}`}
      role="status"
    >
      {children}
    </div>
  )
}

function CalendarActions({ opensOn }: { opensOn: string }) {
  const googleUrl = twacOpenDayGoogleCalendarUrl(opensOn)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {googleUrl !== null && (
        <a
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 shadow-sm ring-1 ring-amber-200 transition hover:bg-amber-100"
        >
          <CalendarPlus size={14} aria-hidden="true" />
          {formatMonthDay(opensOn)} を登録
        </a>
      )}
      <button
        type="button"
        onClick={() => downloadIcs(opensOn)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-amber-800/80 underline-offset-2 hover:underline"
      >
        .ics
      </button>
    </div>
  )
}

function BannerBody({
  status,
  today,
}: {
  status: SubmissionWindowStatus
  today: string
}) {
  if (status.kind === 'empty' || status.kind === 'invalid') return null

  if (status.kind === 'too_early') {
    return (
      <StatusHero tone="waiting">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-amber-100 text-amber-900">
              <span className="text-2xl font-bold tabular-nums leading-none">
                {status.daysUntilOpen}
              </span>
              <span className="mt-0.5 text-[10px] font-semibold tracking-wide">
                日後
              </span>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-950">
                <Hourglass size={14} aria-hidden="true" className="shrink-0" />
                申請開始まで
              </p>
              <p className="mt-0.5 text-xs text-amber-800/90">
                <span className="font-semibold tabular-nums">
                  {formatMonthDay(status.opensOn)}
                </span>
                <span className="mx-1 text-amber-700/60">→</span>
                <span className="tabular-nums">
                  {formatMonthDay(status.entryDate)}
                </span>
                <span className="ml-1 text-amber-700/70">の 7 日間</span>
              </p>
            </div>
          </div>
          <div className="sm:ml-auto">
            <CalendarActions opensOn={status.opensOn} />
          </div>
        </div>
        <div className="border-t border-amber-100 px-3 pb-3 pt-2">
          <WindowStrip
            windowDays={status.windowDays}
            today={today}
            tone="waiting"
          />
        </div>
      </StatusHero>
    )
  }

  if (status.kind === 'open') {
    return (
      <StatusHero tone="open">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-sm">
              <CheckCircle2 size={28} aria-hidden="true" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-950">
                今日は申請できます
              </p>
              <p className="mt-0.5 text-xs text-emerald-800/90">
                入国日まで
                <span className="mx-1 font-semibold tabular-nums">
                  {status.daysUntilEntry === 0
                    ? '本日'
                    : `あと ${status.daysUntilEntry} 日`}
                </span>
              </p>
            </div>
          </div>
          <a
            href={TWAC_OFFICIAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={TWAC_SCAM_NOTE}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:ml-auto"
          >
            TWAC 公式
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </div>
        <div className="border-t border-emerald-100 px-3 pb-3 pt-2">
          <WindowStrip
            windowDays={status.windowDays}
            today={today}
            tone="open"
          />
        </div>
      </StatusHero>
    )
  }

  // past
  return (
    <StatusHero tone="past">
      <div className="flex items-center gap-3 p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-200 text-gray-500">
          <PlaneLanding size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-700">申請期間外</p>
          <p className="text-xs text-gray-500">
            入国日 {formatMonthDay(status.entryDate)} まで
          </p>
        </div>
      </div>
      <div className="border-t border-gray-100 px-3 pb-3 pt-2">
        <WindowStrip windowDays={status.windowDays} today={today} tone="past" />
      </div>
    </StatusHero>
  )
}

export function SubmissionWindowBanner({
  entryDate,
  today,
}: SubmissionWindowBannerProps) {
  const resolvedToday = today ?? todayInTaipei()
  const status = assessSubmissionWindow(entryDate, resolvedToday)
  if (status.kind === 'empty' || status.kind === 'invalid') return null
  return <BannerBody status={status} today={resolvedToday} />
}
