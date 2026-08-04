/**
 * 進捗タブの表示テスト。
 *
 * 見ているのは「利用者がその画面から何を読み取れるか」だけで、
 * 内部の state 名やクラス名には触らない。
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { computeSummary } from '../../../../lib/trip-notes/derive'
import { ProgressPanel } from './ProgressPanel'
import type { Booking, TripNotesState } from '../../../../lib/trip-notes/types'

const TZ = 'Asia/Tokyo'
/** 旅行のはるか手前。「今」の判定に引っかからない時刻を基準にする */
const NOW_MS = Date.parse('2026-01-01T00:00:00Z')

const noop = () => undefined

function makeBooking(id: string, overrides: Partial<Booking> = {}): Booking {
  return {
    id,
    kind: 'lodging',
    title: `宿 ${id}`,
    start: { zdt: '2026-06-12T15:00:00+09:00[Asia/Tokyo]', allDay: false },
    end: { zdt: '2026-06-14T10:00:00+09:00[Asia/Tokyo]', allDay: false },
    status: 'confirmed',
    payment: 'paid',
    ...overrides,
  }
}

function makeState(bookings: Array<Booking>): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'テスト旅行',
    startDate: '2026-06-12',
    endDate: '2026-06-16',
    pinnedTz: TZ,
    bookings,
    emergencyContacts: [],
  }
}

function renderPanel(
  state: TripNotesState,
  onSelectDate: (date: string) => void = noop,
) {
  return render(
    <ProgressPanel
      state={state}
      summary={computeSummary(state, NOW_MS, TZ)}
      displayTz={TZ}
      onSelectDate={onSelectDate}
      onJumpToUnverified={noop}
    />,
  )
}

afterEach(cleanup)

describe('旅程の整合性チェックの表示', () => {
  /** 東京の宿の翌日に大阪の宿。間に移動が無いので missing-transport が出る */
  const stateWithGap = makeState([
    makeBooking('tokyo', {
      title: '東京の宿',
      place: { name: '東京' },
      start: { zdt: '2026-06-12T15:00:00+09:00[Asia/Tokyo]', allDay: false },
      end: { zdt: '2026-06-14T10:00:00+09:00[Asia/Tokyo]', allDay: false },
    }),
    makeBooking('osaka', {
      title: '大阪の宿',
      place: { name: '大阪' },
      start: { zdt: '2026-06-14T15:00:00+09:00[Asia/Tokyo]', allDay: false },
      end: { zdt: '2026-06-16T10:00:00+09:00[Asia/Tokyo]', allDay: false },
    }),
  ])

  it('不整合の種別・日付・次のアクションまで含んだ説明が出る', () => {
    renderPanel(stateWithGap)

    expect(screen.getByText('旅程の不整合')).toBeTruthy()
    expect(screen.getByText('移動が未登録')).toBeTruthy()
    expect(
      screen.getByText(/東京 → 大阪 の移動が登録されていません/),
    ).toBeTruthy()
    expect(screen.getByText(/移動を追加してください/)).toBeTruthy()
  })

  it('日付から日程タブへ飛べる', () => {
    const onSelectDate = vi.fn()
    renderPanel(stateWithGap, onSelectDate)

    fireEvent.click(
      screen.getByRole('button', { name: '6/14(日)の日程を開く' }),
    )
    expect(onSelectDate).toHaveBeenCalledWith('2026-06-14')
  })

  it('件数が上段のアラートに反映される', () => {
    const { container } = renderPanel(stateWithGap)
    const banner = container.querySelector('.bg-rose-50')
    expect(banner?.textContent).toContain('旅程の不整合')
    expect(banner?.textContent).toContain('1')
  })

  it('不整合が無ければアラートも一覧も出ない', () => {
    // 寝る場所の穴も無い状態にする(どちらか片方でもアラートは点く)
    const clean = makeState([
      makeBooking('only', {
        place: { name: '東京' },
        end: { zdt: '2026-06-16T10:00:00+09:00[Asia/Tokyo]', allDay: false },
      }),
    ])
    renderPanel(clean)

    expect(screen.queryByText('旅程の不整合')).toBeNull()
    expect(
      screen.getByText(
        '穴はありません。寝る場所も移動のつながりもすべて確保できています',
      ),
    ).toBeTruthy()
  })
})
