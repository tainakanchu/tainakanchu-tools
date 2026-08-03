/**
 * 各パネルの初回描画が落ちないことだけを見る煙感知器。
 *
 * 画面の中身は検証しない。狙いは「予約 0 件」「30 泊」「キャンセル済み」
 * 「未確認フィールドあり」といった端の入力で描画そのものが死なないことの確認で、
 * ここが赤くなるのは型では拾えない実行時の事故が入ったときだけ。
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { computeSummary } from '../../../../lib/trip-notes/derive'
import { computeNights } from '../../../../lib/trip-notes/nights'
import { AiImportPanel } from './AiImportPanel'
import { BookingForm } from './BookingForm'
import { NightCoverageStrip } from './NightCoverageStrip'
import { NowPanel } from './NowPanel'
import { Onboarding } from './Onboarding'
import { PrintSheet } from './PrintSheet'
import { ProgressPanel } from './ProgressPanel'
import { SchedulePanel } from './SchedulePanel'
import { SettingsPanel } from './SettingsPanel'
import type { Booking, TripNotesState } from '../../../../lib/trip-notes/types'

const noop = () => undefined

function bk(id: string, over: Partial<Booking> = {}): Booking {
  return {
    id,
    kind: 'lodging',
    title: `宿 ${id}`,
    start: { zdt: '2026-06-12T15:00:00+02:00[Europe/Paris]', allDay: false },
    end: { zdt: '2026-06-14T10:00:00+02:00[Europe/Paris]', allDay: false },
    status: 'confirmed',
    payment: 'paid',
    place: { name: 'パリのホテル', localName: 'Hôtel de Paris' },
    confirmationNumber: 'ABC-123',
    price: { amount: 42000, currency: 'EUR' },
    ...over,
  }
}

const state: TripNotesState = {
  schemaVersion: 1,
  tripTitle: 'ヨーロッパ周遊',
  startDate: '2026-06-12',
  endDate: '2026-06-22',
  pinnedTz: null,
  bookings: [
    bk('b1'),
    bk('b2', {
      kind: 'train',
      title: '夜行列車',
      start: { zdt: '2026-06-14T21:00:00+02:00[Europe/Paris]', allDay: false },
      end: { zdt: '2026-06-15T07:00:00+02:00[Europe/Rome]', allDay: false },
      status: 'held',
      payment: 'unpaid',
      unverified: ['start', 'confirmationNumber'],
      evidence: { start: '21:00 発' },
      freeCancelUntil: '2026-06-01',
    }),
    bk('b3', {
      kind: 'activity',
      title: 'キャンセルした予定',
      status: 'cancelled',
      payment: 'onsite',
      price: { amount: 12000, currency: 'JPY' },
    }),
  ],
  emergencyContacts: [{ id: 'c1', label: '大使館', value: '+33-1-1111-1111' }],
}

const empty: TripNotesState = {
  ...state,
  bookings: [],
  emergencyContacts: [],
}

const tz = 'Europe/Paris'

describe('旅のしおりの各パネルが初回描画で落ちない', () => {
  const summary = computeSummary(state, Date.parse('2026-06-13T12:00:00Z'), tz)

  it('NightCoverageStrip (通常 / 30泊 / 空)', () => {
    expect(() =>
      render(
        <NightCoverageStrip
          nights={summary.nights}
          bookings={state.bookings}
          onSelectDate={noop}
        />,
      ),
    ).not.toThrow()

    const long = { ...state, endDate: '2026-07-12' }
    expect(() =>
      render(
        <NightCoverageStrip
          nights={computeNights(long)}
          bookings={long.bookings}
          onSelectDate={noop}
        />,
      ),
    ).not.toThrow()

    expect(() =>
      render(
        <NightCoverageStrip nights={[]} bookings={[]} onSelectDate={noop} />,
      ),
    ).not.toThrow()
  })

  it('ProgressPanel', () => {
    expect(() =>
      render(
        <ProgressPanel
          state={state}
          summary={summary}
          displayTz={tz}
          onSelectDate={noop}
          onJumpToUnverified={noop}
        />,
      ),
    ).not.toThrow()
  })

  it('SchedulePanel (予約あり / 空)', () => {
    expect(() =>
      render(
        <SchedulePanel
          state={state}
          displayTz={tz}
          dispatch={noop}
          focusDate={null}
          onFocusHandled={noop}
        />,
      ),
    ).not.toThrow()
    expect(() =>
      render(
        <SchedulePanel
          state={empty}
          displayTz={tz}
          dispatch={noop}
          focusDate={null}
          onFocusHandled={noop}
        />,
      ),
    ).not.toThrow()
  })

  it('NowPanel (予約あり / 空)', () => {
    vi.useFakeTimers()
    expect(() =>
      render(
        <NowPanel
          state={state}
          displayTz={tz}
          dispatch={noop}
          onGoToSchedule={noop}
        />,
      ),
    ).not.toThrow()
    expect(() =>
      render(
        <NowPanel
          state={empty}
          displayTz={tz}
          dispatch={noop}
          onGoToSchedule={noop}
        />,
      ),
    ).not.toThrow()
    vi.useRealTimers()
  })

  it('SettingsPanel / AiImportPanel / PrintSheet / Onboarding / BookingForm', () => {
    expect(() =>
      render(<SettingsPanel state={state} displayTz={tz} dispatch={noop} />),
    ).not.toThrow()
    expect(() =>
      render(<AiImportPanel state={state} displayTz={tz} dispatch={noop} />),
    ).not.toThrow()
    expect(() =>
      render(<PrintSheet state={state} displayTz={tz} />),
    ).not.toThrow()
    expect(() =>
      render(<PrintSheet state={empty} displayTz={tz} />),
    ).not.toThrow()
    expect(() =>
      render(
        <Onboarding
          state={empty}
          dispatch={noop}
          onAddBooking={noop}
          onOpenSettings={noop}
        />,
      ),
    ).not.toThrow()
    expect(() =>
      render(
        <BookingForm
          booking={state.bookings[1]}
          initialDate={null}
          state={state}
          displayTz={tz}
          dispatch={noop}
          onClose={noop}
        />,
      ),
    ).not.toThrow()
    expect(() =>
      render(
        <BookingForm
          booking={null}
          initialDate="2026-06-15"
          state={state}
          displayTz={tz}
          dispatch={noop}
          onClose={noop}
        />,
      ),
    ).not.toThrow()
  })
})
