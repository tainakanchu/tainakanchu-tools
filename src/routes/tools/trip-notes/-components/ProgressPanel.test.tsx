/**
 * 進捗タブの表示テスト。
 *
 * 見ているのは「利用者がその画面から何を読み取れるか」だけで、
 * 内部の state 名やクラス名には触らない。
 * 具体的には、カンバンに切り替えたときの列(名前と件数と小計)、
 * ドラッグ以外の操作手段(カード内の選択メニュー)が本当に効くこと、
 * そして旅程の不整合が画面に出ていることの 3 点。
 *
 * ドラッグ&ドロップ自体は座標の世界なので jsdom では追わない。
 * 列の振り分けとドロップの読み替えは -lib/kanban.test.ts が受け持つ。
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { computeSummary } from '../../../../lib/trip-notes/derive'
import { formatMoney } from '../-lib/format'
import { ProgressPanel } from './ProgressPanel'
import type { TripNotesDispatch } from '../-lib/reducer'
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
  dispatch: TripNotesDispatch = noop,
) {
  return render(
    <ProgressPanel
      state={state}
      summary={computeSummary(state, NOW_MS, TZ)}
      displayTz={TZ}
      dispatch={dispatch}
      onSelectDate={noop}
      onJumpToUnverified={noop}
    />,
  )
}

/** カンバンに切り替える。初期表示は一覧なので、どのテストも最初にこれを通る */
function switchToKanban() {
  fireEvent.click(screen.getByRole('button', { name: 'カンバン' }))
}

/** カードのチェックボックスを入れる。選択の手段は修飾キーではなく触れる印 */
function selectCard(title: string) {
  fireEvent.click(
    screen.getByRole('checkbox', { name: `${title} をまとめて移す対象に選ぶ` }),
  )
}

/**
 * 選択件数の表示。目に見えるバーの文言と、読み上げ用の live region の
 * 2 か所に出るのが正しい状態(画面を見ずに操作している人にも件数が届く)
 */
function selectionCountTexts(count: number) {
  return screen.queryAllByText(`${count}件を選択中`)
}

afterEach(cleanup)

describe('進捗タブの表示切替', () => {
  it('初期表示は一覧で、カンバンの列は出ていない', () => {
    renderPanel(makeState([makeBooking('b1')]))
    expect(
      screen.getByRole('button', { name: '一覧' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.queryByRole('region', { name: /確定/ })).toBeNull()
  })

  it('カンバンに切り替えると予約状況の4列が件数付きで出る', () => {
    renderPanel(
      makeState([
        makeBooking('b1', { status: 'idea' }),
        makeBooking('b2', { status: 'confirmed' }),
        makeBooking('b3', { status: 'confirmed' }),
      ]),
    )
    switchToKanban()

    // 列の名前に件数まで含めているのは、読み上げで見出しのバッジまで
    // 辿り着かないことがあるため
    expect(screen.getByRole('region', { name: '検討中 1件' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '仮押さえ 0件' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '確定 2件' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'キャンセル 0件' })).toBeTruthy()
  })

  it('カードには種別・題名・日付・もう一方の軸のバッジ・金額が出る', () => {
    renderPanel(
      makeState([
        makeBooking('b1', {
          title: 'パリのホテル',
          payment: 'unpaid',
          price: { amount: 120, currency: 'EUR' },
        }),
        // 列の小計と 1 枚のカードの金額が同額にならないよう、もう 1 件置く
        makeBooking('b2', {
          price: { amount: 80, currency: 'EUR' },
          start: {
            zdt: '2026-06-13T15:00:00+09:00[Asia/Tokyo]',
            allDay: false,
          },
        }),
      ]),
    )
    switchToKanban()

    const column = screen.getByRole('region', { name: '確定 2件' })
    expect(within(column).getByText('パリのホテル')).toBeTruthy()
    expect(within(column).getByText('6/12(金)')).toBeTruthy()
    // 予約状況の軸なので、カードには支払状況のバッジが出る
    expect(within(column).getByLabelText('支払状況: 未払')).toBeTruthy()
    expect(within(column).getByText(formatMoney(120, 'EUR'))).toBeTruthy()
  })

  it('軸を支払状況に切り替えると列が入れ替わる', () => {
    renderPanel(makeState([makeBooking('b1', { payment: 'unpaid' })]))
    switchToKanban()
    fireEvent.click(screen.getByRole('button', { name: '支払状況' }))

    expect(screen.getByRole('region', { name: '未払 1件' })).toBeTruthy()
    expect(
      screen.getByRole('region', { name: 'デポジットのみ 0件' }),
    ).toBeTruthy()
    expect(screen.getByRole('region', { name: '完済 0件' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '現地払い 0件' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: /確定/ })).toBeNull()
  })

  it('支払状況の軸ではキャンセル済みを外す(残額の答えが狂うため)', () => {
    renderPanel(
      makeState([
        makeBooking('alive', { payment: 'unpaid' }),
        makeBooking('dead', { payment: 'unpaid', status: 'cancelled' }),
      ]),
    )
    switchToKanban()
    fireEvent.click(screen.getByRole('button', { name: '支払状況' }))

    const unpaid = screen.getByRole('region', { name: '未払 1件' })
    expect(within(unpaid).getByText('宿 alive')).toBeTruthy()
    expect(within(unpaid).queryByText('宿 dead')).toBeNull()
  })

  it('列見出しに通貨別の小計と、金額未入力の件数が出る', () => {
    renderPanel(
      makeState([
        makeBooking('b1', {
          payment: 'unpaid',
          price: { amount: 120, currency: 'EUR' },
        }),
        makeBooking('b2', {
          payment: 'unpaid',
          price: { amount: 80, currency: 'EUR' },
        }),
        makeBooking('b3', {
          payment: 'unpaid',
          price: { amount: 20000, currency: 'JPY' },
        }),
        makeBooking('b4', {
          payment: 'unpaid',
          price: { amount: 10000, currency: 'JPY' },
        }),
        makeBooking('b5', { payment: 'unpaid' }),
      ]),
    )
    switchToKanban()
    fireEvent.click(screen.getByRole('button', { name: '支払状況' }))

    // 個々のカードの金額と紛れないよう、小計にしか現れない額で確かめる
    const unpaid = screen.getByRole('region', { name: '未払 5件' })
    expect(within(unpaid).getByText(formatMoney(200, 'EUR'))).toBeTruthy()
    expect(within(unpaid).getByText(formatMoney(30000, 'JPY'))).toBeTruthy()
    expect(within(unpaid).getByText('1件は金額未入力')).toBeTruthy()
  })
})

describe('カンバンのドラッグ以外の操作手段', () => {
  it('カード内の選択メニューで予約状況を変えられる', () => {
    const dispatch = vi.fn()
    renderPanel(makeState([makeBooking('b1', { status: 'idea' })]), dispatch)
    switchToKanban()

    const select = screen.getByLabelText('宿 b1 の予約状況')
    fireEvent.change(select, {
      target: { value: 'kanban-column:status:confirmed' },
    })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setBookingStatus',
      id: 'b1',
      status: 'confirmed',
    })
  })

  it('カード内の選択メニューで支払状況を変えられる', () => {
    const dispatch = vi.fn()
    renderPanel(makeState([makeBooking('b1', { payment: 'unpaid' })]), dispatch)
    switchToKanban()
    fireEvent.click(screen.getByRole('button', { name: '支払状況' }))

    fireEvent.change(screen.getByLabelText('宿 b1 の支払状況'), {
      target: { value: 'kanban-column:payment:deposit' },
    })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setBookingPayment',
      id: 'b1',
      payment: 'deposit',
    })
  })

  it('カードにはキーボードで到達できるつかみ手がある', () => {
    renderPanel(makeState([makeBooking('b1')]))
    switchToKanban()

    const handle = screen.getByRole('button', {
      name: '宿 b1 をつかんで別の予約状況に移す',
    })
    // dnd-kit が付ける tabIndex。ドラッグの開始点にキーボードで届く
    expect(handle.tabIndex).toBe(0)
  })
})

describe('カンバンの複数選択', () => {
  it('選んだ件数が、見える形でも読み上げでも分かる', () => {
    renderPanel(
      makeState([
        makeBooking('b1', { status: 'idea' }),
        makeBooking('b2', { status: 'idea' }),
      ]),
    )
    switchToKanban()
    // 選ぶ前はバーそのものが無い
    expect(screen.queryByText(/件を選択中/)).toBeNull()

    selectCard('宿 b1')
    selectCard('宿 b2')
    expect(selectionCountTexts(2)).toHaveLength(2)
  })

  it('一括操作バーの移動先を選ぶと、選んだ全件が 1 アクションで動く', () => {
    const dispatch = vi.fn()
    renderPanel(
      makeState([
        makeBooking('b1', { status: 'idea' }),
        makeBooking('b2', { status: 'held' }),
        makeBooking('b3', { status: 'idea' }),
      ]),
      dispatch,
    )
    switchToKanban()
    selectCard('宿 b1')
    selectCard('宿 b2')

    fireEvent.change(
      screen.getByLabelText('選択中の2件の予約状況をまとめて変える'),
      { target: { value: 'kanban-column:status:confirmed' } },
    )
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'setBookingsStatus',
      ids: ['b1', 'b2'],
      status: 'confirmed',
    })
    // 適用したら選択は解ける(次の操作を誤爆させないため)
    expect(screen.queryByText(/件を選択中/)).toBeNull()
  })

  it('列ヘッダーのトグルでその列のカードをまとめて選べる', () => {
    renderPanel(
      makeState([
        makeBooking('b1', { status: 'idea' }),
        makeBooking('b2', { status: 'idea' }),
        makeBooking('b3', { status: 'confirmed' }),
      ]),
    )
    switchToKanban()
    const toggle = screen.getByRole('checkbox', {
      name: '検討中の2件をすべて選ぶ',
    })

    fireEvent.click(toggle)
    expect(selectionCountTexts(2)).toHaveLength(2)

    // もう一度押すと解除される
    fireEvent.click(toggle)
    expect(screen.queryByText(/件を選択中/)).toBeNull()
  })

  it('盤から外れた予約は選択に残らない(軸を変えるとキャンセル済みは消える)', () => {
    renderPanel(
      makeState([
        makeBooking('alive', { payment: 'unpaid' }),
        makeBooking('dead', { payment: 'unpaid', status: 'cancelled' }),
      ]),
    )
    switchToKanban()
    selectCard('宿 alive')
    selectCard('宿 dead')
    expect(selectionCountTexts(2)).toHaveLength(2)

    // 支払状況の軸ではキャンセル済みが盤から外れる。
    // 見えていないカードが一括操作に巻き込まれないよう、選択からも落ちる
    fireEvent.click(screen.getByRole('button', { name: '支払状況' }))
    expect(selectionCountTexts(1)).toHaveLength(2)
  })

  it('「選択を解除」で選択が空に戻る', () => {
    renderPanel(makeState([makeBooking('b1')]))
    switchToKanban()
    selectCard('宿 b1')

    fireEvent.click(screen.getByRole('button', { name: '選択を解除' }))
    expect(screen.queryByText(/件を選択中/)).toBeNull()
    expect(screen.queryByLabelText(/まとめて変える/)).toBeNull()
  })
})

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
    render(
      <ProgressPanel
        state={stateWithGap}
        summary={computeSummary(stateWithGap, NOW_MS, TZ)}
        displayTz={TZ}
        dispatch={noop}
        onSelectDate={onSelectDate}
        onJumpToUnverified={noop}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: '6/14(日)の日程を開く' }),
    )
    expect(onSelectDate).toHaveBeenCalledWith('2026-06-14')
  })

  it('「同じ場所として扱う」で、そのカードに出ていた 2 つの地名が登録される', () => {
    // 地名の同一判定はどうしても外れるので、外れたときの逃げ道が要る。
    // 押した組は、画面に出ていた文言そのままで渡す
    const dispatch = vi.fn()
    renderPanel(stateWithGap, dispatch)
    fireEvent.click(
      screen.getByRole('button', { name: '東京 と 大阪 を同じ場所として扱う' }),
    )
    expect(dispatch).toHaveBeenCalledWith({
      type: 'addPlaceAlias',
      names: ['東京', '大阪'],
    })
  })

  it('件数が上段のアラートに反映される', () => {
    const { container } = renderPanel(stateWithGap)
    const banner = container.querySelector('.bg-rose-50')
    expect(banner?.textContent).toContain('旅程の不整合')
    expect(banner?.textContent).toContain('1')
  })

  it('乗り継ぎの案内は不整合として数えず、別の見出しで出す', () => {
    // 同じ空港に着いて同じ空港から発つ乗り継ぎ。宿は無いが直す対象ではないので、
    // 赤いアラートを点けず「確認しておきたい点」として出す。
    // 旅行期間を 6/13 の 1 日だけにして、寝る場所の穴のほうでアラートが
    // 点かないようにしてある(点くと severity の切り分けが見えない)
    const layover = makeState([
      makeBooking('leg1', {
        kind: 'flight',
        title: '羽田 → ニューデリー',
        start: { zdt: '2026-06-12T11:15:00+09:00[Asia/Tokyo]', allDay: false },
        end: { zdt: '2026-06-12T17:35:00+05:30[Asia/Kolkata]', allDay: false },
        from: { name: '羽田空港' },
        to: { name: 'インディラ・ガンディー国際空港 T3' },
      }),
      makeBooking('leg2', {
        kind: 'flight',
        title: 'ニューデリー → パリ',
        start: {
          zdt: '2026-06-13T12:20:00+05:30[Asia/Kolkata]',
          allDay: false,
        },
        end: { zdt: '2026-06-13T17:20:00+02:00[Europe/Paris]', allDay: false },
        from: { name: 'インディラ・ガンディー国際空港 T3' },
        to: { name: 'パリ' },
      }),
    ])
    const { container } = renderPanel({
      ...layover,
      startDate: '2026-06-13',
      endDate: '2026-06-13',
    })

    expect(screen.getByText('確認しておきたい点')).toBeTruthy()
    expect(screen.getByText('乗り継ぎ')).toBeTruthy()
    expect(screen.queryByText('旅程の不整合')).toBeNull()
    expect(container.querySelector('.bg-rose-50')).toBeNull()
    // 宿の要否の話なので「同じ場所として扱う」は出さない(押しても何も消えない)
    expect(screen.queryByText('同じ場所として扱う')).toBeNull()
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
