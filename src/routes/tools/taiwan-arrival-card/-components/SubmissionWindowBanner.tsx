/**
 * 入国日に対する TWAC 提出可能期間の簡易表示。
 *
 * 文字説明は最小限にし、状態は線の種類・大きな数字・ラベルで伝える。
 * - まだ早い: 破線の面 + カウントダウン + 提出窓の日帯 + カレンダー登録
 * - 申請可: 実線の面 + 今日を強調した日帯 + 公式サイトへ
 * - 期間外: 薄い罫の静かな表示
 */

import type { ReactNode } from 'react'
import { buttonClass } from '../../../../components/ui'
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
          base = 'border border-rule bg-paper text-ink-muted'
        } else if (tone === 'open') {
          base = isToday
            ? 'border-[1.5px] border-ink bg-pink-tint font-bold'
            : 'border border-ink bg-wash'
        } else {
          // waiting: まだ開いていない。開始日だけ目印、他は破線の枠
          base = isStart
            ? 'border-[1.5px] border-ink bg-pink-tint font-bold'
            : 'border border-dashed border-ink-muted bg-paper text-ink-muted'
        }

        const label = isEntry
          ? '入国'
          : tone === 'open' && isToday
            ? '今日'
            : isStart && tone === 'waiting'
              ? '開始'
              : ''

        return (
          <div
            key={day}
            role="listitem"
            title={`${formatMonthDay(day)}${isStart ? ' 開始' : ''}${isEntry ? ' 入国' : ''}${isToday ? ' 今日' : ''}`}
            className={`flex h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-ui text-[11px] leading-tight ${base}`}
          >
            <span className="tabular-nums">{formatMonthDay(day)}</span>
            <span className="h-3.5">{label}</span>
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
      ? 'panel'
      : tone === 'waiting'
        ? 'panel panel-dashed'
        : 'panel border-rule'
  return (
    <div className={`${shell} mt-4`} role="status">
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
          className={buttonClass('secondary', 'sm')}
        >
          {formatMonthDay(opensOn)} をカレンダーに登録(別サイト)
        </a>
      )}
      <button
        type="button"
        onClick={() => downloadIcs(opensOn)}
        className={buttonClass('quiet', 'sm')}
      >
        .ics をダウンロード
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
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-3">
            <p className="flex shrink-0 items-baseline gap-1">
              <span className="text-3xl font-bold tabular-nums leading-none">
                {status.daysUntilOpen}
              </span>
              <span className="text-sm font-bold">日後</span>
            </p>
            <div className="min-w-0">
              <p className="text-sm font-bold">申請開始まで</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                <span className="font-bold tabular-nums text-ink">
                  {formatMonthDay(status.opensOn)}
                </span>
                〜
                <span className="tabular-nums">
                  {formatMonthDay(status.entryDate)}
                </span>
                {' の 7 日間'}
              </p>
            </div>
          </div>
          <div className="sm:ml-auto">
            <CalendarActions opensOn={status.opensOn} />
          </div>
        </div>
        <div className="border-t border-rule px-4 pb-4 pt-3">
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
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0">
            <p className="text-base font-bold">
              <span className="mark-pink">今日は申請できます</span>
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              入国日まで
              <span className="mx-1 font-bold tabular-nums text-ink">
                {status.daysUntilEntry === 0
                  ? '本日'
                  : `あと ${status.daysUntilEntry} 日`}
              </span>
            </p>
          </div>
          <a
            href={TWAC_OFFICIAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={TWAC_SCAM_NOTE}
            className={`${buttonClass('secondary', 'sm')} sm:ml-auto`}
          >
            TWAC 公式サイトを開く(別サイト)
          </a>
        </div>
        <div className="border-t border-rule px-4 pb-4 pt-3">
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
      <div className="p-4">
        <p className="text-sm font-bold text-ink-muted">
          申請期間をすぎています
        </p>
        <p className="text-sm text-ink-muted">
          入国日 {formatMonthDay(status.entryDate)}{' '}
          をすぎているため、申請できる期間ではありません。
        </p>
      </div>
      <div className="border-t border-rule px-4 pb-4 pt-3">
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
