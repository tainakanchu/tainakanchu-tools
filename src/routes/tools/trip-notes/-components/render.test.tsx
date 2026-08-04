/**
 * 各パネルの初回描画が落ちないことだけを見る煙感知器。
 *
 * 画面の中身は検証しない。狙いは「予約 0 件」「30 泊」「キャンセル済み」
 * 「未確認フィールドあり」といった端の入力で描画そのものが死なないことの確認で、
 * ここが赤くなるのは型では拾えない実行時の事故が入ったときだけ。
 */
// @vitest-environment jsdom
import { useReducer } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import { computeSummary } from '../../../../lib/trip-notes/derive'
import { computeNights } from '../../../../lib/trip-notes/nights'
import { tripNotesReducer } from '../-lib/reducer'
import { AiImportPanel } from './AiImportPanel'
import { BookingCard } from './BookingCard'
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
  // 手続きは任意フィールドなので、入っている側の描画をここで踏んでおく。
  // 取得済み(参照番号あり)・申請中・有効期間が旅程からはみ出したものを 1 つずつ
  travelDocs: [
    {
      id: 'td1',
      kind: 'visa',
      title: 'シェンゲンビザ',
      region: 'シェンゲン圏',
      status: 'done',
      referenceNumber: 'VISA-0001',
      validFrom: '2026-06-01',
      validUntil: '2026-07-01',
      url: 'https://example.test/visa',
      price: { amount: 80, currency: 'EUR' },
    },
    {
      id: 'td2',
      kind: 'sim',
      title: 'ヨーロッパ eSIM',
      status: 'applied',
      dueDate: '2026-06-01',
      // 旅行は 6/22 まで続くのに 6/18 で切れる = coverage-gap が出る
      validUntil: '2026-06-18',
      note: '端末が eSIM 対応か要確認',
    },
  ],
}

// 手続きは「1 件も登録していなければフィールドごと存在しない」形なので、
// 空の側ではフィールドごと落とす。これで state 側が「手続きを出す」分岐を、
// empty 側が「セクションごと出さない」分岐を踏む
const { travelDocs: _travelDocs, ...stateWithoutTravelDocs } = state

const empty: TripNotesState = {
  ...stateWithoutTravelDocs,
  bookings: [],
  emergencyContacts: [],
}

const tz = 'Europe/Paris'

describe('旅のしおりの各パネルが初回描画で落ちない', () => {
  const summary = computeSummary(state, Date.parse('2026-06-13T12:00:00Z'))

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
          dispatch={noop}
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
      render(
        <SettingsPanel
          state={state}
          displayTz={tz}
          dispatch={noop}
          onSelectDate={noop}
          onAddTrip={noop}
        />,
      ),
    ).not.toThrow()
    expect(() =>
      render(
        <AiImportPanel
          state={state}
          displayTz={tz}
          dispatch={noop}
          onSelectDate={noop}
        />,
      ),
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

/**
 * 締切の入力欄は移動系のときだけ出す。宿泊で出しても入れるものが無く、
 * 詳細の丈が伸びるだけなので、種別で出し分けていることを固定しておく。
 * 既存の値がフォームに戻ることも一緒に見る(FormState と Booking の
 * 対応を取り違えると、編集して保存するたびに締切が消える)。
 */
describe('BookingForm の締切の入力欄', () => {
  const formProps = {
    initialDate: null,
    state,
    displayTz: tz,
    dispatch: noop,
    onClose: noop,
  }

  it('移動系では出て、既存の値が入力欄に戻る', () => {
    const flight = bk('form-flight', {
      kind: 'flight',
      title: 'AF276',
      checkInClosesMinutesBefore: 45,
      bagDropClosesMinutesBefore: 60,
    })
    const { container } = render(
      <BookingForm booking={flight} {...formProps} />,
    )
    const scope = within(container)

    expect(scope.getByText('搭乗手続きの締切')).toBeTruthy()
    expect(scope.getByText('受託手荷物を預ける締切')).toBeTruthy()
    // プリセットは押せるボタンとして出す(自由入力も残っている)
    expect(scope.getAllByText('60分前').length).toBeGreaterThan(0)
    const deadlineInputs = container.querySelectorAll<HTMLInputElement>(
      'input[type="number"][max="1440"]',
    )
    expect(deadlineInputs).toHaveLength(2)
    // 並びは画面と同じ「手荷物 → 搭乗手続き」(先に締まるほうが上)
    expect([...deadlineInputs].map((input) => input.value)).toEqual([
      '60',
      '45',
    ])
  })

  it('宿泊では出さない', () => {
    const { container } = render(
      <BookingForm booking={bk('form-stay')} {...formProps} />,
    )
    expect(within(container).queryByText('搭乗手続きの締切')).toBeNull()
  })
})

/**
 * 上の describe はあくまで「初回描画で落ちない」ことしか見ないが、
 * ここだけは例外的に見た目まで踏み込む。検討中(idea)・仮押さえ(held)の
 * 予約が確定済みとほぼ同じ見た目になり、一覧を流し見しても
 * 「まだ仮だ」に気付けない、という具体的な不満への回帰テストなので、
 * BookingStatusBadge のラベルだけでなくカード自体の縁が変わっているかを見る。
 */
describe('BookingCard は予約状況でカード自体の見た目を変える', () => {
  const cardProps = {
    displayTz: tz,
    expanded: false,
    onToggleExpand: noop,
    onEdit: noop,
    onDelete: noop,
    onVerifyAll: noop,
    onVerifyField: noop,
  }

  it('idea は破線ボーダーになり、confirmed とは見た目が違う', () => {
    const { container: ideaContainer } = render(
      <BookingCard booking={bk('idea-1', { status: 'idea' })} {...cardProps} />,
    )
    const { container: confirmedContainer } = render(
      <BookingCard
        booking={bk('confirmed-1', { status: 'confirmed' })}
        {...cardProps}
      />,
    )

    expect(ideaContainer.querySelector('.border-dashed')).toBeTruthy()
    expect(confirmedContainer.querySelector('.border-dashed')).toBeNull()
  })

  it('held は実線のまま琥珀のボーダーが付き、idea の破線とは違う', () => {
    const { container } = render(
      <BookingCard booking={bk('held-1', { status: 'held' })} {...cardProps} />,
    )

    expect(container.querySelector('.border-amber-300')).toBeTruthy()
    expect(container.querySelector('.border-dashed')).toBeNull()
  })
})

/**
 * ここも BookingCard と同じ理由で、例外的に見た目(クラス名)まで踏み込む。
 *
 * 継続行の「チェックアウト HH:MM」が「滞在中(N泊目)」とまったく同じ
 * 破線グレーの 1 行で出ていて、過ぎれば延泊料金が出る旅行中もっとも硬い締切が
 * 読み飛ばされる、という具体的な不満への回帰テストだから。ラベルの文字列が
 * 出ているかを見るだけでは「2 つが同じ見た目である」という不満そのものは
 * 再発を検出できないので、行が実際に別のクラスを持つところまで固定する。
 *
 * このファイルには afterEach(cleanup) が無く、前のテストが描いた DOM が
 * body に残ったままなので、クエリは必ず自分の container に閉じ込める
 * (screen も render 戻り値の getByText も baseElement = body を見てしまう)。
 */
describe('日程タブの継続行は締切のあるイベントだけを持ち上げる', () => {
  // 共有の state は予約が 3 件あって継続行が複数出るので、
  // 「滞在中の日」と「チェックアウトの日」が 1 つずつになる最小の state を組む。
  // bk() の既定は Europe/Paris の 6/12 15:00 → 6/14 10:00 なので、
  // 6/13 が「滞在中(2泊目)」、6/14 が「チェックアウト 10:00」になる
  const oneLodging: TripNotesState = {
    ...stateWithoutTravelDocs,
    bookings: [bk('stay-1')],
    emergencyContacts: [],
  }

  it('チェックアウトの行は破線をやめて時刻が太字になり、滞在中の行とは違う', () => {
    const { container } = render(
      <SchedulePanel
        state={oneLodging}
        displayTz={tz}
        dispatch={noop}
        focusDate={null}
        onFocusHandled={noop}
      />,
    )
    const scope = within(container)

    // 行の取り出しはラベルの文字から button へ辿る。DOM の階層や並び順に
    // 依存しないぶん、行の中身を足し引きしても壊れにくい
    const checkoutRow = scope.getByText(/チェックアウト/).closest('button')
    const stayingRow = scope.getByText(/滞在中/).closest('button')
    expect(checkoutRow).toBeTruthy()
    expect(stayingRow).toBeTruthy()

    expect(checkoutRow?.className).not.toContain('border-dashed')
    expect(stayingRow?.className).toContain('border-dashed')

    expect(checkoutRow?.querySelector('.font-bold')).toBeTruthy()
    expect(stayingRow?.querySelector('.font-bold')).toBeNull()
  })
})

/**
 * こちらも同じく見た目まで踏み込む。
 *
 * 「今」タブの進行中カードは 15:00 → 11:00 と時刻を並べるだけで、終了までの
 * カウントダウンが無かった。チェックアウトの残り時間が出ること自体と、
 * 「残りわずか」に切り替わる境界の両側を固定する。境界を含む側(<=)の
 * 取り違えは画面を見ても気付けないので、しきい値ちょうどと 1 分手前の
 * 2 ケースで挟んで動かせないようにするのがこの節の主眼。
 */
describe('「今」タブは進行中の予約に終了までのカウントダウンを出す', () => {
  // 予約を 1 件だけにすると、進行中のこの 1 件からはマイルストーンが作られず
  // (milestones.ts の「進行中の予約からは作らない」規則)、画面に出る
  // カウントダウンがこのチップだけになる。強調の判定に別の数字が
  // 混ざらないようにするため
  const lodgingOnly: TripNotesState = {
    ...stateWithoutTravelDocs,
    bookings: [bk('now-stay')],
    emergencyContacts: [],
  }

  // NowPanel は useState(() => Date.now()) で現在時刻の初期値を取るので、
  // 時計は必ず render より前に動かす
  function renderAt(iso: string) {
    vi.setSystemTime(Date.parse(iso))
    const { container } = render(
      <NowPanel
        state={lodgingOnly}
        displayTz={tz}
        dispatch={noop}
        onGoToSchedule={noop}
      />,
    )
    return { container, scope: within(container) }
  }

  it('進行中の宿泊には「チェックアウトまで」の残り時間が出る', () => {
    vi.useFakeTimers()
    const { scope } = renderAt('2026-06-13T12:00:00Z')

    expect(scope.getByText('チェックアウトまで')).toBeTruthy()
    expect(scope.getByText(/^あと/)).toBeTruthy()
    vi.useRealTimers()
  })

  it('残り2時間ちょうどから強調が始まる(境界は強調側)', () => {
    vi.useFakeTimers()
    // bk() の既定の end は 2026-06-14T10:00:00+02:00 = 08:00Z
    const before = renderAt('2026-06-14T05:59:00Z')
    expect(before.scope.getByText('あと2時間1分')).toBeTruthy()
    expect(before.container.querySelector('.border-rose-400')).toBeNull()

    const after = renderAt('2026-06-14T06:00:00Z')
    expect(after.scope.getByText('あと2時間')).toBeTruthy()
    expect(after.container.querySelector('.border-rose-400')).toBeTruthy()
    vi.useRealTimers()
  })
})

/**
 * 「今」タブの主役が予約からマイルストーン(次に来る時刻)に変わったので、
 * 画面に出ることを固定しておく。とくに見たいのは 2 点。
 * - 締切が入っていない予約から締切を捏造していないこと
 * - 大きなカウントダウンが画面にただ 1 つであること(進行中カードの
 *   「終了まで」と二重に同じ数字を出さない、が守られているかはここで気付ける)
 */
describe('「今」タブは次に来る時刻をマイルストーンとして出す', () => {
  const flight = bk('flight-1', {
    kind: 'flight',
    title: 'AF276 CDG→HND',
    start: { zdt: '2026-06-14T13:00:00+02:00[Europe/Paris]', allDay: false },
    end: { zdt: '2026-06-15T08:00:00+09:00[Asia/Tokyo]', allDay: false },
    bagDropClosesMinutesBefore: 60,
    checkInClosesMinutesBefore: 45,
  })

  function renderAt(iso: string, bookings: Array<Booking>) {
    vi.setSystemTime(Date.parse(iso))
    const { container } = render(
      <NowPanel
        state={{ ...stateWithoutTravelDocs, bookings, emergencyContacts: [] }}
        displayTz={tz}
        dispatch={noop}
        onGoToSchedule={noop}
      />,
    )
    return { container, scope: within(container) }
  }

  it('締切・出発・到着が近い順に並び、いちばん近いものが主役になる', () => {
    vi.useFakeTimers()
    // 出発は 13:00+02:00 = 11:00Z。手荷物は 10:00Z、搭乗手続きは 10:15Z
    const { scope } = renderAt('2026-06-14T06:00:00Z', [flight])

    expect(scope.getByText('次に来る時刻')).toBeTruthy()
    // いちばん近いのは手荷物の締切(4 時間後)
    expect(scope.getByText('あと4時間')).toBeTruthy()
    expect(scope.getByText('手荷物を預ける締切')).toBeTruthy()
    expect(scope.getByText('搭乗手続きの締切')).toBeTruthy()
    expect(scope.getByText('出発')).toBeTruthy()
    expect(scope.getByText('到着')).toBeTruthy()
    vi.useRealTimers()
  })

  it('締切が入っていない予約からは締切を作らない', () => {
    vi.useFakeTimers()
    const noDeadlines = bk('flight-2', {
      kind: 'flight',
      title: 'NH216 HND→CDG',
      start: { zdt: '2026-06-14T13:00:00+02:00[Europe/Paris]', allDay: false },
      end: null,
    })
    const { scope } = renderAt('2026-06-14T06:00:00Z', [noDeadlines])

    expect(scope.getByText('出発')).toBeTruthy()
    expect(scope.queryByText('手荷物を預ける締切')).toBeNull()
    expect(scope.queryByText('搭乗手続きの締切')).toBeNull()
    vi.useRealTimers()
  })

  it('締切が迫ると強調に切り替わる(境界は強調側)', () => {
    vi.useFakeTimers()
    // 手荷物の締切は 10:00Z。DEADLINE_SOON_MS は 45 分なので 09:15Z が境界
    const before = renderAt('2026-06-14T09:14:00Z', [flight])
    expect(before.container.querySelector('.border-rose-400')).toBeNull()

    const after = renderAt('2026-06-14T09:15:00Z', [flight])
    expect(after.container.querySelector('.border-rose-400')).toBeTruthy()
    vi.useRealTimers()
  })

  it('進行中の宿泊のチェックイン開始は「受付中」に言い換える', () => {
    vi.useFakeTimers()
    // bk() の既定は 6/12 15:00 → 6/14 10:00(Europe/Paris)の宿泊
    const { scope } = renderAt('2026-06-13T12:00:00Z', [bk('stay-2')])

    expect(scope.getByText('チェックイン受付中')).toBeTruthy()
    // 過ぎた「チェックイン開始」はマイルストーンとして出さない
    expect(scope.queryByText('チェックイン開始')).toBeNull()
    vi.useRealTimers()
  })
})

/**
 * AI が入れた値の確認を、編集フォームを開かずにその場で済ませられること。
 *
 * 以前は未確認フィールドを 1 つずつ確認するのに鉛筆 → 編集フォームしか道が無く、
 * 「見て確かめたいだけ」の操作に編集の入口を通らせていた、という不満への回帰テスト。
 * だからここで固定したいのは「詳細が出ること」そのものより、
 * 抽出根拠と値が同じ行に並ぶこと・1 行だけ確認済みにできることの 2 つになる。
 *
 * 状態の変化(1 フィールドだけ確認済みになる)まで見たいので、
 * 本物の reducer をつないだ器から SchedulePanel を描く。dispatch をスパイに
 * するだけでは「他のフィールドの未確認が残っているか」を確かめられない。
 */
describe('日程タブの予約カードはタップでその場に展開する', () => {
  // AI 取り込み直後を模した予約を 1 件だけ置く。未確認を 2 つにしてあるのは、
  // 片方を確認済みにしたときにもう片方が残ることを見たいため
  const NIGHT_TRAIN_TITLE = '夜行列車 パリ→ローマ'
  const expandTrip: TripNotesState = {
    ...stateWithoutTravelDocs,
    bookings: [
      bk('exp-1', {
        kind: 'train',
        title: NIGHT_TRAIN_TITLE,
        start: {
          zdt: '2026-06-14T21:00:00+02:00[Europe/Paris]',
          allDay: false,
        },
        end: { zdt: '2026-06-15T07:00:00+02:00[Europe/Rome]', allDay: false },
        // 移動なので place は持たず from/to を持つ(bk() の既定を打ち消す)
        place: undefined,
        from: {
          name: 'パリ・リヨン駅',
          localName: 'Gare de Lyon',
          address: '20 Boulevard Diderot, 75012 Paris',
        },
        to: { name: 'ローマ・テルミニ駅' },
        provider: 'Trenitalia',
        confirmationNumber: 'ABC-123',
        unverified: ['start', 'confirmationNumber'],
        evidence: {
          start: 'Departure 21:00 from Paris Gare de Lyon (14 Jun)',
          confirmationNumber: 'Booking reference: ABC-123',
        },
      }),
    ],
    emergencyContacts: [],
  }

  /** 本物の reducer をつないだ器。dispatch した結果が画面に返ってくる */
  function ScheduleHarness({ initial }: { initial: TripNotesState }) {
    const [current, dispatch] = useReducer(tripNotesReducer, initial)
    return (
      <SchedulePanel
        state={current}
        displayTz={tz}
        dispatch={dispatch}
        focusDate={null}
        onFocusHandled={noop}
      />
    )
  }

  function renderSchedule() {
    const { container } = render(<ScheduleHarness initial={expandTrip} />)
    const scope = within(container)
    // 開閉ボタンは aria-expanded を持つ唯一の要素として引く。
    // タイトルで引くと鉛筆・ゴミ箱(aria-label にタイトルを含む)まで拾ってしまう
    return {
      container,
      scope,
      toggle: scope.getByRole('button', { expanded: false }),
    }
  }

  it('カードを押すと詳細が開き、もう一度押すと閉じる', () => {
    const { scope, toggle } = renderSchedule()

    // 現地語表記(タクシー運転手に見せる用)は、展開して初めて画面に出る
    expect(scope.queryByText('Gare de Lyon')).toBeNull()

    fireEvent.click(toggle)
    expect(scope.getByRole('button', { expanded: true })).toBeTruthy()
    expect(scope.getByText('Gare de Lyon')).toBeTruthy()
    expect(scope.getByText('20 Boulevard Diderot, 75012 Paris')).toBeTruthy()
    expect(scope.getByText('Trenitalia')).toBeTruthy()

    fireEvent.click(toggle)
    expect(scope.queryByText('Gare de Lyon')).toBeNull()
  })

  it('未確認フィールドの行には AI の抽出根拠がそのまま出る', () => {
    const { scope, toggle } = renderSchedule()
    fireEvent.click(toggle)

    // 元の予約確認メールを開き直さずに照合できることが狙いなので、
    // 引用は切り詰めず全文が出ていること
    expect(
      scope.getByText('Departure 21:00 from Paris Gare de Lyon (14 Jun)'),
    ).toBeTruthy()
    expect(scope.getByText('Booking reference: ABC-123')).toBeTruthy()
  })

  it('行の「確認済みにする」は、その1フィールドだけを確認済みにする', () => {
    const { scope, toggle } = renderSchedule()
    fireEvent.click(toggle)

    fireEvent.click(
      scope.getByRole('button', {
        name: `${NIGHT_TRAIN_TITLE} の確認番号を確認済みにする`,
      }),
    )

    // 押した行は消え、根拠の引用も一緒に消える
    expect(
      scope.queryByRole('button', {
        name: `${NIGHT_TRAIN_TITLE} の確認番号を確認済みにする`,
      }),
    ).toBeNull()
    expect(scope.queryByText('Booking reference: ABC-123')).toBeNull()

    // もう片方は未確認のまま残る(まとめて外れてしまわない)
    expect(
      scope.getByRole('button', {
        name: `${NIGHT_TRAIN_TITLE} の開始日時を確認済みにする`,
      }),
    ).toBeTruthy()
    expect(
      scope.getByText('Departure 21:00 from Paris Gare de Lyon (14 Jun)'),
    ).toBeTruthy()
    expect(scope.getByText(/未確認 1件/)).toBeTruthy()

    // 展開したままなので、続けて残りを確認しにいける
    expect(scope.getByRole('button', { expanded: true })).toBeTruthy()
  })

  it('展開トグルは鉛筆・ゴミ箱のクリックを妨げない', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const onToggleExpand = vi.fn()
    const { container } = render(
      <BookingCard
        booking={bk('icon-1')}
        displayTz={tz}
        expanded={false}
        onToggleExpand={onToggleExpand}
        onEdit={onEdit}
        onDelete={onDelete}
        onVerifyAll={noop}
        onVerifyField={noop}
      />,
    )
    const scope = within(container)

    fireEvent.click(scope.getByRole('button', { name: '宿 icon-1 を編集' }))
    fireEvent.click(scope.getByRole('button', { name: '宿 icon-1 を削除' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onToggleExpand).not.toHaveBeenCalled()

    // 本文を押したときだけ開閉する
    fireEvent.click(scope.getByRole('button', { expanded: false }))
    expect(onToggleExpand).toHaveBeenCalledTimes(1)
  })

  it('展開しても操作の要素が入れ子にならない', () => {
    // 検索リンク(idea/held のときだけ出る a)と一括確認ボタンが同時に出る条件で、
    // button の中に button / a が入っていないことを見る。入れ子は不正な HTML で、
    // 押したときにどちらが反応するかが決まらない
    const { container } = render(
      <BookingCard
        booking={bk('nest-1', {
          status: 'held',
          unverified: ['title', 'place'],
        })}
        displayTz={tz}
        expanded
        onToggleExpand={noop}
        onEdit={noop}
        onDelete={noop}
        onVerifyAll={noop}
        onVerifyField={noop}
      />,
    )

    expect(container.querySelector('button button')).toBeNull()
    expect(container.querySelector('button a')).toBeNull()
    expect(container.querySelector('a button')).toBeNull()
  })
})
