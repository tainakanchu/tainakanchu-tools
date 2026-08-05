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
 * 「出発の何分前か」の入力欄を上限で見分ける。
 * オンラインチェックイン開始の欄には 4320、締切の 2 欄には 1440 が入っている。
 */
function minutesBeforeInputs(container: HTMLElement, max: number) {
  return [
    ...container.querySelectorAll<HTMLInputElement>(
      `input[type="number"][max="${max}"]`,
    ),
  ]
}

/**
 * 上限を超えた値の保存は、保存ボタンではなく submit イベントを直接投げて試す。
 *
 * ボタンを押す形にすると、入力欄の max 属性を見た jsdom(実ブラウザも同じ)が
 * 手前で弾いてしまい、submit がそもそも起きない。確かめたいのはその先にある
 * JavaScript 側の判定で、そちらこそが storage.ts と範囲を共有している本体である
 * (max 属性は同じ範囲を先回りで見せているだけで、AI が貼り込んだ値のように
 * 欄を経由しない値には効かない)。
 */
function submitForm(container: HTMLElement) {
  const form = container.querySelector('form')
  if (form === null) throw new Error('フォームが見つからない')
  fireEvent.submit(form)
}

/**
 * オンラインチェックイン開始と締切 2 つの入力欄は、移動系のときだけ出す。
 * 宿泊で出しても入れるものが無く、詳細の丈が伸びるだけなので、
 * 種別で出し分けていることを固定しておく。
 * 既存の値がフォームに戻ることも一緒に見る(FormState と Booking の
 * 対応を取り違えると、編集して保存するたびに値が消える)。
 *
 * 上限が項目で違う(締切 1440 分 / 開始 4320 分)ことも境界の値で固定する。
 * ここを 1 本の判定にまとめると、正しい 4320(72時間前)が弾かれるか、
 * ありえない 2000 分前の締切が通るかのどちらかになる。
 */
describe('BookingForm のオンラインチェックイン・締切の入力欄', () => {
  const formProps = {
    initialDate: null,
    state,
    displayTz: tz,
    dispatch: noop,
    onClose: noop,
  }

  const flight = () => bk('form-flight', { kind: 'flight', title: 'AF276' })

  /** dispatch を覗ける形で開く。保存まで進むテストはこちらを使う */
  function renderForm(booking: Booking) {
    const dispatch = vi.fn()
    const { container } = render(
      <BookingForm booking={booking} {...formProps} dispatch={dispatch} />,
    )
    return { container, scope: within(container), dispatch }
  }

  it('移動系では 3 つとも出て、既存の値が入力欄に戻る', () => {
    const { container, scope } = renderForm(
      bk('form-flight', {
        kind: 'flight',
        title: 'AF276',
        onlineCheckInOpensMinutesBefore: 1440,
        checkInClosesMinutesBefore: 45,
        bagDropClosesMinutesBefore: 60,
      }),
    )

    expect(scope.getByText('オンラインチェックイン開始')).toBeTruthy()
    expect(scope.getByText('搭乗手続きの締切')).toBeTruthy()
    expect(scope.getByText('受託手荷物を預ける締切')).toBeTruthy()
    // プリセットは押せるボタンとして出す(自由入力も残っている)。
    // 開始のプリセットだけは分ではなく時間で書く(1440 では何時間前か読めない)
    expect(scope.getAllByText('60分前').length).toBeGreaterThan(0)
    expect(scope.getAllByText('24時間前').length).toBeGreaterThan(0)

    expect(
      minutesBeforeInputs(container, 4320).map((input) => input.value),
    ).toEqual(['1440'])
    // 締切の並びは画面と同じ「手荷物 → 搭乗手続き」(先に締まるほうが上)
    expect(
      minutesBeforeInputs(container, 1440).map((input) => input.value),
    ).toEqual(['60', '45'])
  })

  it('大きい分数には時間の換算を添える(1440 のままでは読めない)', () => {
    const { scope } = renderForm(
      bk('form-flight', {
        kind: 'flight',
        title: 'AF276',
        onlineCheckInOpensMinutesBefore: 2880,
      }),
    )
    expect(scope.getByText('= 48時間前')).toBeTruthy()
  })

  it('宿泊では出さない', () => {
    const { scope } = renderForm(bk('form-stay'))
    expect(scope.queryByText('搭乗手続きの締切')).toBeNull()
    expect(scope.queryByText('オンラインチェックイン開始')).toBeNull()
  })

  it('オンラインチェックイン開始は 4320 分(72時間前)まで保存できる', () => {
    const { container, scope, dispatch } = renderForm(flight())

    fireEvent.change(minutesBeforeInputs(container, 4320)[0], {
      target: { value: '4320' },
    })
    fireEvent.click(scope.getByRole('button', { name: '保存' }))

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'updateBooking',
        booking: expect.objectContaining({
          onlineCheckInOpensMinutesBefore: 4320,
        }),
      }),
    )
  })

  it('4321 分は上限を超えているので、保存させずエラーを出す', () => {
    const { container, scope, dispatch } = renderForm(flight())

    fireEvent.change(minutesBeforeInputs(container, 4320)[0], {
      target: { value: '4321' },
    })
    submitForm(container)

    expect(dispatch).not.toHaveBeenCalled()
    // どちらの欄を直せばよいか分かるよう、締切とはメッセージを分けてある
    expect(scope.getByRole('alert').textContent).toContain(
      'オンラインチェックイン開始は 1〜4320 分',
    )
  })

  it('締切の上限は 1440 分のままで、1441 分はエラーになる', () => {
    const { container, scope, dispatch } = renderForm(flight())

    fireEvent.change(minutesBeforeInputs(container, 1440)[0], {
      target: { value: '1441' },
    })
    submitForm(container)

    expect(dispatch).not.toHaveBeenCalled()
    expect(scope.getByRole('alert').textContent).toContain('締切は 1〜1440 分')
  })

  it('プリセット「24時間前」を押すと分の値(1440)が入る', () => {
    // 見せ方は時間でも、保存する単位は分のままにする。項目ごとに単位が
    // 変わると、締切の 60 と開始の 60 が別の意味の同じ数字になる
    const { container, scope } = renderForm(flight())

    fireEvent.click(scope.getByRole('button', { name: '24時間前' }))

    expect(minutesBeforeInputs(container, 4320)[0].value).toBe('1440')
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
 * 印刷しおりは画面に出ないので、壊れても誰も気付けない。
 * 「この紙 1 部で旅程を遂行できる」を支えている情報が、実際に紙へ落ちているかを
 * ここで固定しておく。見ているのは次の 4 点。
 * - カウンターで探す確認番号と、運転手に見せる現地語表記が載っていること
 * - キャンセル済みが載っていないこと(行かないと決めた予定は紙で見るものではない)
 * - 夜の一覧が出て、未確保の夜を正直に「未確保」と書くこと
 * - 継続行が画面と同じく時刻順に混ざること
 */
describe('印刷しおりは紙で使う情報を載せる', () => {
  it('確認番号・現地語表記・夜の一覧が出て、キャンセル済みは載らない', () => {
    const { container } = render(<PrintSheet state={state} displayTz={tz} />)
    const scope = within(container)

    // bk() の既定なので、キャンセル済みを除いた 2 件ぶん出る
    expect(scope.getAllByText('ABC-123')).toHaveLength(2)
    expect(scope.getAllByText('確認番号')).toHaveLength(2)
    expect(scope.getAllByText('Hôtel de Paris')).toHaveLength(2)

    expect(scope.queryByText('キャンセルした予定')).toBeNull()

    expect(scope.getByText('夜の一覧')).toBeTruthy()
    // 6/12〜6/22 の 10 泊のうち、宿と夜行がカバーするのは 3 泊だけ
    expect(scope.getByText('10泊中 7泊が未確保')).toBeTruthy()
    expect(scope.getAllByText('未確保').length).toBeGreaterThan(0)

    // 手続きの参照番号も紙で持ち歩く目的そのものなので落とさない
    expect(scope.getByText('VISA-0001')).toBeTruthy()
  })

  it('継続行はまとめて先頭に出さず、その日の予定と時刻順に混ざる', () => {
    // 6/14 は「09:00 に美術館へ行き、12:00 に宿を出る」日。継続行を先頭に
    // まとめていた頃は、12:00 のチェックアウトが 09:00 の予定より上に出ていた
    const mixed: TripNotesState = {
      ...stateWithoutTravelDocs,
      endDate: '2026-06-15',
      bookings: [
        bk('mix-stay', {
          end: {
            zdt: '2026-06-14T12:00:00+02:00[Europe/Paris]',
            allDay: false,
          },
        }),
        bk('mix-morning', {
          kind: 'activity',
          title: '朝の美術館',
          start: {
            zdt: '2026-06-14T09:00:00+02:00[Europe/Paris]',
            allDay: false,
          },
          end: null,
        }),
      ],
      emergencyContacts: [],
    }

    const { container } = render(<PrintSheet state={mixed} displayTz={tz} />)
    const text = container.textContent

    expect(text).toContain('朝の美術館')
    expect(text).toContain('チェックアウト')
    expect(text.indexOf('朝の美術館')).toBeLessThan(
      text.indexOf('チェックアウト'),
    )
  })

  it('移動の締切は「出発の何分前」ではなく時刻に直して出る', () => {
    // 紙は空港のカウンターの前で読むものなので、暗算を残さない
    const flight: TripNotesState = {
      ...stateWithoutTravelDocs,
      bookings: [
        bk('dl-flight', {
          kind: 'flight',
          title: 'AF276',
          start: {
            zdt: '2026-06-14T13:00:00+02:00[Europe/Paris]',
            allDay: false,
          },
          end: null,
          bagDropClosesMinutesBefore: 60,
          checkInClosesMinutesBefore: 45,
        }),
      ],
      emergencyContacts: [],
    }

    const { container } = render(<PrintSheet state={flight} displayTz={tz} />)
    const scope = within(container)

    expect(scope.getByText('手荷物を預ける締切 12:00')).toBeTruthy()
    expect(scope.getByText('搭乗手続きの締切 12:15')).toBeTruthy()
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

  /**
   * カレンダーへの 1 件登録リンク。
   * 折りたたみ時に出さないのは、確定済みでも消えないリンクなので
   * 常時出すと全カードに 1 行増えてしまうため(BookingCard の CalendarAddLink)。
   */
  function renderCard(booking: Booking, expanded: boolean) {
    const { container } = render(
      <BookingCard
        booking={booking}
        displayTz={tz}
        expanded={expanded}
        onToggleExpand={noop}
        onEdit={noop}
        onDelete={noop}
        onVerifyAll={noop}
        onVerifyField={noop}
      />,
    )
    return within(container)
  }

  it('Googleカレンダーに追加のリンクは展開したときだけ出る', () => {
    const booking = bk('cal-1')
    expect(
      renderCard(booking, false).queryByRole('link', {
        name: 'Googleカレンダーに追加',
      }),
    ).toBeNull()

    const link = renderCard(booking, true).getByRole('link', {
      name: 'Googleカレンダーに追加',
    })
    expect(link.getAttribute('href')).toContain(
      'calendar.google.com/calendar/render',
    )
    // 外部リンクの流儀(SearchLinks と同じ)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('キャンセル済みの予約には出さない', () => {
    // 行かないと決めた予定をカレンダーに入れる意味はない(.ics 側の扱いと揃える)
    expect(
      renderCard(bk('cal-2', { status: 'cancelled' }), true).queryByRole(
        'link',
        { name: 'Googleカレンダーに追加' },
      ),
    ).toBeNull()
  })
})

/**
 * 「いま滞在中の町でやりたいことが『今』のところで見られる」ことと、
 * 「思い付いたその場で 1 行足せる」ことの 2 つ。この機能の要求そのもの。
 *
 * ここで固定したいのは 3 点。
 * - 滞在中の町の分が上に出て、他の町の分は消えずに折りたたみに残ること
 *   (推定が外れても何も失わない、という設計をここで踏み外していないか)
 * - チェックが本当に済みに変わること(本物の reducer をつないだ器で見る)
 * - クイック追加の場所が「いまの町」で埋まること
 */
/** 「いまの町」の束。3 つの束が並ぶので、名前で引いて取り違えないようにする */
function hereList(scope: ReturnType<typeof within>) {
  return within(scope.getByRole('list', { name: 'いまの町のやりたいこと' }))
}

describe('「今」タブは滞在中の町のやりたいことを出す', () => {
  const wishTrip: TripNotesState = {
    ...stateWithoutTravelDocs,
    bookings: [
      bk('stay-cph', {
        title: 'コペンハーゲン滞在',
        start: {
          zdt: '2026-06-12T15:00:00+02:00[Europe/Copenhagen]',
          allDay: false,
        },
        end: {
          zdt: '2026-06-15T10:00:00+02:00[Europe/Copenhagen]',
          allDay: false,
        },
        // 実際の旅程で使われている書き方(place.name が都市名そのもの)
        place: { name: 'コペンハーゲン滞在' },
        confirmationNumber: undefined,
      }),
    ],
    emergencyContacts: [],
    wishes: [
      {
        id: 'w-here',
        title: 'ニューハウンを歩く',
        area: 'コペンハーゲン',
        done: false,
      },
      { id: 'w-there', title: '夜市を歩く', area: '台北', done: false },
      { id: 'w-any', title: '本屋に入る', done: false },
    ],
  }

  /** 本物の reducer をつないだ器。dispatch した結果が画面に返ってくる */
  function NowHarness({ initial }: { initial: TripNotesState }) {
    const [current, dispatch] = useReducer(tripNotesReducer, initial)
    return (
      <NowPanel
        state={current}
        displayTz={tz}
        dispatch={dispatch}
        onGoToSchedule={noop}
      />
    )
  }

  // NowPanel は useState(() => Date.now()) で現在時刻の初期値を取るので、
  // 時計は必ず render より前に動かす
  function renderNow(iso = '2026-06-13T10:00:00Z') {
    vi.setSystemTime(Date.parse(iso))
    const { container } = render(<NowHarness initial={wishTrip} />)
    return within(container)
  }

  it('滞在中の町のやりたいことが上の束に出る', () => {
    vi.useFakeTimers()
    const scope = renderNow()

    // 推定した町は必ず文字で出す(黙って並べ替えない)。
    // 宿の題名にも同じ文字列が出るので、説明文のほうで引く
    const estimate = scope.getByText(/とみて、この町の分を先に出しています/)
    expect(estimate.textContent).toContain('コペンハーゲン滞在')
    expect(
      hereList(scope).getByRole('checkbox', { name: 'ニューハウンを歩く' }),
    ).toBeTruthy()
    vi.useRealTimers()
  })

  it('他の町の分と場所なしの分は消えず、折りたたみに件数付きで残る', () => {
    // 推定は持ち上げのためのもので、フィルタのためのものではない(wishes.ts)
    vi.useFakeTimers()
    const scope = renderNow()

    expect(scope.getByText('他の町のやりたいこと')).toBeTruthy()
    expect(scope.getByText('場所を決めていないもの')).toBeTruthy()
    // 畳まれていても DOM には出ている(details を開けばそのまま読める)
    expect(
      within(
        scope.getByRole('list', { name: '他の町のやりたいこと' }),
      ).getByRole('checkbox', { name: /夜市を歩く/ }),
    ).toBeTruthy()
    expect(
      within(
        scope.getByRole('list', { name: '場所を決めていないもの' }),
      ).getByRole('checkbox', { name: '本屋に入る' }),
    ).toBeTruthy()
    vi.useRealTimers()
  })

  it('チェックを入れると済みになる', () => {
    vi.useFakeTimers()
    const scope = renderNow()

    const box = hereList(scope).getByRole<HTMLInputElement>('checkbox', {
      name: 'ニューハウンを歩く',
    })
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    expect(
      hereList(scope).getByRole<HTMLInputElement>('checkbox', {
        name: 'ニューハウンを歩く',
      }).checked,
    ).toBe(true)
    vi.useRealTimers()
  })

  it('クイック追加は「いまの町」を場所に入れて 1 行で足せる', () => {
    vi.useFakeTimers()
    const scope = renderNow()

    // プリセットは黙って入れず、外せるチップとして見せる
    expect(
      scope.getByRole('button', {
        name: '場所の指定「コペンハーゲン滞在」を外す',
      }),
    ).toBeTruthy()

    fireEvent.change(scope.getByLabelText('やりたいことを追加'), {
      target: { value: '人魚姫像を見る' },
    })
    fireEvent.click(scope.getByRole('button', { name: '追加' }))

    // 足したものが「いまの町」の束にそのまま出る = area が入っている
    expect(
      hereList(scope).getByRole('checkbox', { name: '人魚姫像を見る' }),
    ).toBeTruthy()
    vi.useRealTimers()
  })

  it('プリセットを外すと場所なしとして足される', () => {
    vi.useFakeTimers()
    const scope = renderNow()

    fireEvent.click(
      scope.getByRole('button', {
        name: '場所の指定「コペンハーゲン滞在」を外す',
      }),
    )
    fireEvent.change(scope.getByLabelText('やりたいことを追加'), {
      target: { value: '絵葉書を書く' },
    })
    fireEvent.click(scope.getByRole('button', { name: '追加' }))

    expect(
      within(
        scope.getByRole('list', { name: '場所を決めていないもの' }),
      ).getByRole('checkbox', { name: '絵葉書を書く' }),
    ).toBeTruthy()
    vi.useRealTimers()
  })

  it('いまの町を推定できないときは束ねず、1 本の一覧にする', () => {
    // 旅行前は突き合わせる相手がいない。空の「いまの町」の束を出すと、
    // 折りたたみの中に全部入っているのに何も無いように見える
    vi.useFakeTimers()
    const scope = renderNow('2026-06-01T00:00:00Z')

    expect(scope.queryByText('他の町のやりたいこと')).toBeNull()
    const all = within(scope.getByRole('list', { name: 'やりたいこと' }))
    expect(
      all.getByRole('checkbox', { name: /ニューハウンを歩く/ }),
    ).toBeTruthy()
    expect(all.getByRole('checkbox', { name: /夜市を歩く/ })).toBeTruthy()
    expect(all.getByRole('checkbox', { name: '本屋に入る' })).toBeTruthy()
    vi.useRealTimers()
  })
})
