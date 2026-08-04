/**
 * 旅のしおりの操作フロー統合テスト。
 *
 * -components/render.test.tsx が「各パネルが初回描画で落ちない」だけを見る
 * 煙感知器なのに対して、こちらは画面全体(index.tsx のページ)をマウントして
 * 利用者の操作を最初から最後まで通す。
 *
 * 検証は「利用者から見える振る舞い」に寄せる。role とアクセシブル名で要素を
 * 引き、内部の state 名やクラス名には依存しない(未確認フィールドの黄色い下線だけは、
 * 見た目そのものが仕様なので例外的にクラスを見る)。
 *
 * ページは createFileRoute に渡した component をそのまま取り出して描画する。
 * ルーターのコンテキストには依存していないので、Router を組み立てる必要はない。
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  decodeShareState,
  encodeShareUrl,
} from '../../../../lib/trip-notes/share'
import { loadFromStorage } from '../../../../lib/trip-notes/storage'
import { Route } from '../index'
import type { RenderResult } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import type { Booking, TripNotesState } from '../../../../lib/trip-notes/types'

// component は RouteOptions では省略可能なので、型の上では undefined を含む。
// index.tsx が必ず渡しているので実際には来ないが、取り違えて空のまま
// 「何も落ちなかった」テストが通るほうが怖いので、無ければここで止める。
// 絞り込んだ値を別の const に受け直しているのは、if の絞り込みは
// 後続の関数の中まで届かず、renderPage() の JSX でまた undefined 込みに戻るため
const routeComponent = Route.options.component
if (routeComponent === undefined) {
  throw new Error('trip-notes のルートに component が設定されていません')
}
const TripNotesPage = routeComponent

/** storage.ts の STORAGE_KEY。テストから状態を仕込むためだけに複製する */
const STORAGE_KEY = 'trip-notes:v1'

// 日程タブの「その日へ飛ぶ」演出が呼ぶ。jsdom には実装が無い
Element.prototype.scrollIntoView = vi.fn()

function makeState(over: Partial<TripNotesState> = {}): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'テスト旅行',
    // 3泊4日。「今」の判定に引っかからないよう十分に先の日付にする
    startDate: '2030-06-12',
    endDate: '2030-06-15',
    // 実行環境のタイムゾーンに結果が左右されないよう固定する
    pinnedTz: 'Asia/Tokyo',
    bookings: [],
    emergencyContacts: [],
    ...over,
  }
}

function lodging(over: Partial<Booking> = {}): Booking {
  return {
    id: 'bk-1',
    kind: 'lodging',
    title: '東京の宿',
    start: { zdt: '2030-06-12T15:00:00+09:00[Asia/Tokyo]', allDay: false },
    end: { zdt: '2030-06-14T10:00:00+09:00[Asia/Tokyo]', allDay: false },
    status: 'confirmed',
    payment: 'paid',
    ...over,
  }
}

function seed(state: TripNotesState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/**
 * ページを描画する。
 * autoCodeSplitting でルートの component は遅延読み込みになっているため、
 * 最初の描画が終わる(= <main> が現れる)まで待ってから返す。
 *
 * render() を await した act() で包むのは、遅延読み込みが React 19 の use() で
 * サスペンドするため。render() 自身の act() は同期版なので、その中で発生した
 * サスペンドの再開はキューに積まれたまま流れず、<main> が永遠に現れない。
 */
async function renderPage(): Promise<RenderResult> {
  let view!: RenderResult
  await act(async () => {
    view = render(<TripNotesPage />)
    await Promise.resolve()
  })
  await screen.findByRole('main')
  return view
}

/** 印刷用シートや下部タブバーを巻き込まないよう、本文の中だけを見る */
function main(): HTMLElement {
  return screen.getByRole('main')
}

async function goToTab(user: UserEvent, label: string): Promise<void> {
  await user.click(screen.getByRole('tab', { name: new RegExp(label) }))
}

interface BookingInput {
  /** 種別の表示ラベル。省略すると既定の「宿泊」のまま */
  kind?: string
  title: string
  date: string
  time?: string
  endDate?: string
  endTime?: string
}

/** 予約フォームを埋めて保存する。日付・時刻は fireEvent で直接入れる */
async function fillAndSaveBookingForm(
  user: UserEvent,
  form: HTMLElement,
  input: BookingInput,
): Promise<void> {
  if (input.kind !== undefined) {
    const kindSelect = within(form).getByLabelText(/^種別/)
    await user.selectOptions(
      kindSelect,
      within(kindSelect).getByRole('option', { name: input.kind }),
    )
  }

  await user.type(within(form).getByLabelText(/^タイトル/), input.title)

  const startGroup = within(form).getByRole('group', { name: '開始日時' })
  fireEvent.change(within(startGroup).getByLabelText(/^日付/), {
    target: { value: input.date },
  })
  if (input.time !== undefined) {
    fireEvent.change(within(startGroup).getByLabelText(/^時刻/), {
      target: { value: input.time },
    })
  }

  if (input.endDate !== undefined) {
    const endToggle = within(form).getByLabelText(/を設定する$/)
    await user.click(endToggle)
    const endGroup = endToggle.closest('fieldset')
    if (endGroup === null) throw new Error('終了日時の fieldset が見つからない')
    fireEvent.change(within(endGroup).getByLabelText(/^日付/), {
      target: { value: input.endDate },
    })
    if (input.endTime !== undefined) {
      fireEvent.change(within(endGroup).getByLabelText(/^時刻/), {
        target: { value: input.endTime },
      })
    }
  }

  await user.click(within(form).getByRole('button', { name: '保存' }))
}

/** オンボーディングから予約追加フォームまで開く */
async function openAddFormFromOnboarding(
  user: UserEvent,
): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: /予約を 1 件登録する/ }))
  return screen.findByRole('dialog', { name: '予約を追加' })
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', window.location.pathname)
})

afterEach(() => {
  cleanup()
})

describe('夜カバレッジの更新', () => {
  it('旅行期間を決めて宿を1件足すと、その期間の夜がカバー済みに変わる', async () => {
    const user = userEvent.setup()
    await renderPage()

    // 予約が0件なのでオンボーディング。まず旅行期間を決める
    fireEvent.change(screen.getByLabelText('出発日'), {
      target: { value: '2030-06-12' },
    })
    fireEvent.change(screen.getByLabelText('帰宅日'), {
      target: { value: '2030-06-15' },
    })
    expect(within(main()).getByText('3泊')).toBeTruthy()

    // 期間を決めた直後は、3泊すべてが未確保
    expect(screen.getByLabelText('寝る場所が未確保の夜が 3 泊')).toBeTruthy()

    const form = await openAddFormFromOnboarding(user)
    await fillAndSaveBookingForm(user, form, {
      title: '東京の宿',
      date: '2030-06-12',
      endDate: '2030-06-14',
    })

    // 6/12・6/13 の夜が埋まり、残るのは 6/14 の1泊だけ
    await waitFor(() =>
      expect(screen.getByLabelText('寝る場所が未確保の夜が 1 泊')).toBeTruthy(),
    )

    await goToTab(user, '進捗')
    const strip = within(main())
    expect(
      strip.getByRole('button', { name: /^6\/12.*宿泊仮: 東京の宿$/ }),
    ).toBeTruthy()
    expect(
      strip.getByRole('button', { name: /^6\/13.*宿泊仮: 東京の宿$/ }),
    ).toBeTruthy()
    expect(strip.getByRole('button', { name: /^6\/14.*未確保$/ })).toBeTruthy()
    expect(strip.getAllByRole('button', { name: /未確保$/ })).toHaveLength(1)
  })

  it('日をまたぐ移動を足すと、その夜は未確保でなくなる', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()
    expect(screen.getByLabelText('寝る場所が未確保の夜が 3 泊')).toBeTruthy()

    const form = await openAddFormFromOnboarding(user)
    await fillAndSaveBookingForm(user, form, {
      kind: '列車',
      title: '夜行列車',
      date: '2030-06-14',
      time: '21:00',
      endDate: '2030-06-15',
      endTime: '07:00',
    })

    await waitFor(() =>
      expect(screen.getByLabelText('寝る場所が未確保の夜が 2 泊')).toBeTruthy(),
    )

    await goToTab(user, '進捗')
    expect(
      within(main()).getByRole('button', {
        name: /^6\/14.*夜行移動: 夜行列車$/,
      }),
    ).toBeTruthy()
  })
})

describe('進捗タブから日程タブへのジャンプ', () => {
  it('未確保の夜のセルから該当日へ飛び、ハイライトは一定時間で消える', async () => {
    const user = userEvent.setup()
    seed(makeState({ bookings: [lodging()] }))
    await renderPage()

    // 宿があるのは 6/12・6/13 の夜だけ。未確保の 6/14 のセルを押す
    await user.click(
      within(main()).getByRole('button', { name: /^6\/14.*未確保$/ }),
    )
    expect(
      screen.getByRole('tab', { name: /日程/ }).getAttribute('aria-selected'),
    ).toBe('true')

    const day = within(main())
      .getByRole('heading', { level: 3, name: /^6\/14/ })
      .closest('li')
    if (day === null) throw new Error('6/14 の日付ブロックが見つからない')
    expect(day.className).toContain('ring-cyan-400')

    // 一定時間で消えること(消灯タイマーが張り直しで消されていないこと)
    await waitFor(() => expect(day.className).not.toContain('ring-cyan-400'), {
      timeout: 5000,
    })
  })
})

describe('オンボーディング', () => {
  it('「予約を1件登録する」で日程タブの追加フォームがそのまま開く', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()

    const form = await openAddFormFromOnboarding(user)
    expect(form).toBeTruthy()
    expect(
      screen.getByRole('tab', { name: /日程/ }).getAttribute('aria-selected'),
    ).toBe('true')

    // 一度閉じたあとは、日程タブに戻ってきても勝手には開かない
    await user.click(
      within(form).getByRole('button', { name: 'フォームを閉じる' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await goToTab(user, '進捗')
    await goToTab(user, '日程')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('AI インポート', () => {
  /** フェンス・前後の散文・末尾カンマ付きという、LLM が普通に返してくる汚さ */
  const DIRTY_AI_OUTPUT = [
    '承知しました。予約確認メールから以下を抽出しました。',
    '',
    '```json',
    '[',
    '  {',
    '    "kind": "lodging",',
    '    "title": "ホテル・ド・パリ",',
    '    "start": { "date": "2030-06-12", "time": "15:00", "tz": "Europe/Paris" },',
    '    "end": { "date": "2030-06-14", "time": "10:00", "tz": "Europe/Paris" },',
    '    "status": "confirmed",',
    '    "payment": "paid",',
    '    "confirmationNumber": "ABC-12345",',
    '    "evidence": { "start": "チェックイン 15:00 より" },',
    '  }',
    ']',
    '```',
    '',
    'ご確認ください。',
  ].join('\n')

  it('汚いJSONを貼ると、日時のレビューを経てから未確認付きで取り込まれる', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()

    await goToTab(user, '設定')
    await user.click(
      screen.getByRole('button', { name: '次へ: 結果を貼り付ける' }),
    )

    const textarea = screen.getByLabelText('AI が返した JSON')
    await user.click(textarea)
    await user.paste(DIRTY_AI_OUTPUT)
    await user.click(screen.getByRole('button', { name: '読み込む' }))

    expect(
      await screen.findByText('1件を取り込み候補として読み込みました'),
    ).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '取り込む' }))

    // 確定の前に、日時とタイムゾーンのレビューが必ず挟まる
    const dialog = await screen.findByRole('dialog', {
      name: '日時とタイムゾーンの確認',
    })
    // 入力欄を開かなくても、確定される日時とタイムゾーンは一覧で読める
    expect(
      within(dialog).getByText('2030-06-12 15:00 / Europe/Paris'),
    ).toBeTruthy()
    expect(
      within(dialog).getByText('2030-06-14 10:00 / Europe/Paris'),
    ).toBeTruthy()

    // 直したいときだけ入力欄を開く
    expect(
      within(dialog).queryByLabelText('ホテル・ド・パリ の開始日'),
    ).toBeNull()
    await user.click(
      within(dialog).getByRole('button', {
        name: 'ホテル・ド・パリ の日時を直す',
      }),
    )
    const startDate =
      within(dialog).getByLabelText<HTMLInputElement>(
        'ホテル・ド・パリ の開始日',
      )
    const startTz =
      within(dialog).getByLabelText<HTMLInputElement>(
        'ホテル・ド・パリ の開始タイムゾーン',
      )
    expect(startDate.value).toBe('2030-06-12')
    expect(startTz.value).toBe('Europe/Paris')
    // まだ取り込まれていないので、未確保の夜も減っていない
    expect(screen.getByLabelText('寝る場所が未確保の夜が 3 泊')).toBeTruthy()

    await user.click(
      within(dialog).getByRole('button', {
        name: '1件すべての日時とタイムゾーンを確認済みとして取り込む',
      }),
    )

    expect(await screen.findByText(/^1件を取り込みました。/)).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByLabelText('寝る場所が未確保の夜が 1 泊')).toBeTruthy(),
    )

    // 日時以外は未確認のまま。黄色い下線と未確認バッジで気付けること
    await goToTab(user, '日程')
    const title = within(main()).getByText('ホテル・ド・パリ')
    expect(title.className).toContain('border-amber-400')
    expect(within(main()).getByText(/^未確認 \d+件$/)).toBeTruthy()
  })
})

describe('AI インポートの一括承認', () => {
  /**
   * 3件。1件目だけが「そのまま通してよい」形で、
   * 2件目は tz が欠けており、3件目は旅行期間から外れている。
   */
  const THREE_BOOKINGS = JSON.stringify([
    {
      kind: 'lodging',
      title: '確認済みの宿',
      start: { date: '2030-06-12', time: '15:00', tz: 'Asia/Tokyo' },
      end: { date: '2030-06-14', time: '10:00', tz: 'Asia/Tokyo' },
      status: 'confirmed',
      payment: 'paid',
      evidence: { start: 'チェックイン 15:00', end: 'チェックアウト 10:00' },
    },
    {
      kind: 'train',
      title: 'タイムゾーン不明の列車',
      start: { date: '2030-06-14', time: '09:00' },
      status: 'confirmed',
      payment: 'paid',
      evidence: { start: '09:00 発' },
    },
    {
      kind: 'activity',
      title: '期間外の予定',
      start: { date: '2030-07-01', time: '12:00', tz: 'Asia/Tokyo' },
      status: 'idea',
      payment: 'unpaid',
      evidence: { start: '7月1日 12:00' },
    },
  ])

  /** 設定タブの AI インポートに JSON を流し込み、レビュー画面まで進める */
  async function openReviewDialog(
    user: UserEvent,
    json: string,
  ): Promise<HTMLElement> {
    await goToTab(user, '設定')
    await user.click(
      screen.getByRole('button', { name: '次へ: 結果を貼り付ける' }),
    )
    const textarea = screen.getByLabelText('AI が返した JSON')
    await user.click(textarea)
    await user.paste(json)
    await user.click(screen.getByRole('button', { name: '読み込む' }))
    await user.click(await screen.findByRole('button', { name: '取り込む' }))
    return screen.findByRole('dialog', { name: '日時とタイムゾーンの確認' })
  }

  it('全件の日時が一覧で見え、要確認の予約が先頭に寄る', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()

    const dialog = await openReviewDialog(user, THREE_BOOKINGS)

    // 展開しなくても3件ぶんの日時とタイムゾーンが読める
    expect(
      within(dialog).getByText('2030-06-12 15:00 / Asia/Tokyo'),
    ).toBeTruthy()
    expect(
      within(dialog).getByText('2030-06-14 09:00 / Asia/Tokyo'),
    ).toBeTruthy()
    expect(
      within(dialog).getByText('2030-07-01 12:00 / Asia/Tokyo'),
    ).toBeTruthy()

    // 要確認の2件が先に並ぶ。「まとめてOKする前に、ここだけは見て」の提示
    expect(within(dialog).getByText(/2件は特に確認してください/)).toBeTruthy()
    expect(within(dialog).getByText('タイムゾーンを補完')).toBeTruthy()
    expect(within(dialog).getByText('旅行期間外')).toBeTruthy()
    expect(
      within(dialog)
        .getAllByRole('button', { name: /の日時を直す$/ })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'タイムゾーン不明の列車 の日時を直す',
      '期間外の予定 の日時を直す',
      '確認済みの宿 の日時を直す',
    ])
  })

  it('「すべて確認して取り込む」1回で3件まとめて取り込める', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()

    const dialog = await openReviewDialog(user, THREE_BOOKINGS)
    await user.click(
      within(dialog).getByRole('button', {
        name: '3件すべての日時とタイムゾーンを確認済みとして取り込む',
      }),
    )

    expect(
      await screen.findByText(
        '3件を取り込みました。3件に未確認の項目があります',
      ),
    ).toBeTruthy()

    await goToTab(user, '日程')
    expect(within(main()).getByText('確認済みの宿')).toBeTruthy()
    expect(within(main()).getByText('タイムゾーン不明の列車')).toBeTruthy()
    expect(within(main()).getByText('期間外の予定')).toBeTruthy()
  })

  it('取り込まないにチェックした予約は件数からも結果からも外れる', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()

    const dialog = await openReviewDialog(user, THREE_BOOKINGS)
    // 「期間外の予定」の行にあるチェックボックスだけを外す
    const excludeTarget = within(dialog)
      .getByRole('button', { name: '期間外の予定 の日時を直す' })
      .closest('li')
    if (excludeTarget === null) throw new Error('対象の行が見つからない')
    await user.click(
      within(excludeTarget).getByRole('checkbox', { name: '取り込まない' }),
    )

    await user.click(
      within(dialog).getByRole('button', {
        name: '2件すべての日時とタイムゾーンを確認済みとして取り込む',
      }),
    )

    expect(
      await screen.findByText(
        '2件を取り込みました。2件に未確認の項目があります',
      ),
    ).toBeTruthy()
    await goToTab(user, '日程')
    expect(within(main()).queryByText('期間外の予定')).toBeNull()
  })

  it('取り込んだ直後に、その場でまとめて確認済みにできる', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()

    const dialog = await openReviewDialog(user, THREE_BOOKINGS)
    await user.click(
      within(dialog).getByRole('button', {
        name: '3件すべての日時とタイムゾーンを確認済みとして取り込む',
      }),
    )
    await user.click(
      await screen.findByRole('button', {
        name: '取り込んだ3件の未確認をまとめて確認済みにする',
      }),
    )

    // 誤操作が怖い操作なので、実行前に必ず確認を挟む
    const confirm = await screen.findByRole('dialog', {
      name: /未確認をまとめて解除しますか/,
    })
    await user.click(
      within(confirm).getByRole('button', {
        name: '取り込んだ3件の未確認をすべて解除する',
      }),
    )

    expect(
      await screen.findByText('3件の未確認をすべて解除しました'),
    ).toBeTruthy()
    await goToTab(user, '日程')
    expect(within(main()).queryByText(/^未確認 \d+件$/)).toBeNull()
  })
})

describe('未確認フィールドの一括解除', () => {
  function unverifiedState(): TripNotesState {
    return makeState({
      bookings: [
        lodging({ unverified: ['title', 'start'] }),
        lodging({
          id: 'bk-2',
          title: '京都の宿',
          start: {
            zdt: '2030-06-14T15:00:00+09:00[Asia/Tokyo]',
            allDay: false,
          },
          end: { zdt: '2030-06-15T10:00:00+09:00[Asia/Tokyo]', allDay: false },
          unverified: ['title'],
        }),
      ],
    })
  }

  it('予約カードのボタンで、その予約だけまとめて確認済みになる', async () => {
    const user = userEvent.setup()
    seed(unverifiedState())
    await renderPage()
    await goToTab(user, '日程')

    await user.click(
      within(main()).getByRole('button', {
        name: '東京の宿 の未確認 2件をすべて確認済みにする',
      }),
    )

    await waitFor(() =>
      expect(within(main()).queryByText('未確認 2件')).toBeNull(),
    )
    // 別の予約の未確認は巻き込まない
    expect(within(main()).getByText('未確認 1件')).toBeTruthy()
  })

  it('一覧の「未確認をすべて解除」は確認を挟み、undo 1回で戻せる', async () => {
    const user = userEvent.setup()
    seed(unverifiedState())
    await renderPage()
    await goToTab(user, '日程')

    await user.click(
      within(main()).getByRole('button', {
        name: '未確認の項目が残る2件の予約を、まとめて確認済みにする',
      }),
    )
    const confirm = await screen.findByRole('dialog', {
      name: /未確認をすべて解除しますか/,
    })

    // 実行前にやめれば何も起きない
    await user.click(within(confirm).getByRole('button', { name: 'やめる' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(main()).getByText('未確認 2件')).toBeTruthy()

    await user.click(
      within(main()).getByRole('button', {
        name: '未確認の項目が残る2件の予約を、まとめて確認済みにする',
      }),
    )
    const reopened = await screen.findByRole('dialog', {
      name: /未確認をすべて解除しますか/,
    })
    await user.click(
      within(reopened).getByRole('button', {
        name: '2件の予約の未確認をすべて解除する',
      }),
    )

    await waitFor(() =>
      expect(within(main()).queryByText(/^未確認 \d+件$/)).toBeNull(),
    )

    // 件数ぶん undo を押させない。1回で元に戻る
    await user.click(screen.getByRole('button', { name: '元に戻す' }))
    expect(within(main()).getByText('未確認 2件')).toBeTruthy()
    expect(within(main()).getByText('未確認 1件')).toBeTruthy()
  })
})

describe('共有URL', () => {
  it('生成したハッシュから状態を復元して画面に反映できる', async () => {
    const user = userEvent.setup()
    const shared = makeState({
      tripTitle: '同行者の旅程',
      bookings: [lodging({ id: 'shared-1', title: '共有された宿' })],
    })

    const url = await encodeShareUrl(
      shared,
      'https://example.test/tools/trip-notes/',
    )
    const hash = url.slice(url.indexOf('#'))

    // ロジック層のラウンドトリップ
    expect(await decodeShareState(hash)).toEqual(shared)

    window.location.hash = hash
    await renderPage()

    // 黙って上書きせず、件数を見せてから確認を取る
    const dialog = await screen.findByRole('dialog', {
      name: /共有された旅のしおり/,
    })
    expect(within(dialog).getByText('1件')).toBeTruthy()

    await user.click(
      within(dialog).getByRole('button', { name: '読み込んで置き換える' }),
    )

    // 2泊ぶん(6/12・6/13)の夜が共有された宿で埋まる
    expect(
      await screen.findAllByRole('button', { name: /宿泊確定: 共有された宿$/ }),
    ).toHaveLength(2)
    // 再読み込みのたびに同じ確認が出ないよう、ハッシュは読んだ時点で消す
    expect(window.location.hash).toBe('')
  })
})

describe('Undo / Redo', () => {
  it('追加した予約を元に戻して、やり直せる', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()

    const form = await openAddFormFromOnboarding(user)
    await fillAndSaveBookingForm(user, form, {
      title: '取り消される宿',
      date: '2030-06-12',
    })
    expect(within(main()).getByText('取り消される宿')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '元に戻す' }))
    expect(within(main()).queryByText('取り消される宿')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'やり直す' }))
    expect(within(main()).getByText('取り消される宿')).toBeTruthy()
  })
})

describe('未確認フィールド', () => {
  it('確認操作や値の書き換えで未確認から外れる', async () => {
    const user = userEvent.setup()
    seed(
      makeState({
        bookings: [
          lodging({
            confirmationNumber: 'XYZ-999',
            unverified: ['title', 'confirmationNumber'],
          }),
        ],
      }),
    )
    await renderPage()

    await goToTab(user, '日程')
    expect(within(main()).getByText('未確認 2件')).toBeTruthy()

    await user.click(
      within(main()).getByRole('button', { name: '東京の宿 を編集' }),
    )
    const form = await screen.findByRole('dialog', { name: '予約を編集' })

    // タイトル欄の「確認済みにする」だけを押す
    const titleLabel = within(form)
      .getByLabelText(/^タイトル/)
      .closest('label')
    if (titleLabel === null) throw new Error('タイトルの label が見つからない')
    await user.click(
      within(titleLabel).getByRole('button', { name: '確認済みにする' }),
    )
    await waitFor(() =>
      expect(within(main()).getByText('未確認 1件')).toBeTruthy(),
    )

    // 確認番号は値を書き換えて保存すれば、確認したものとして自動で外れる
    const confirmationField = within(form).getByLabelText(/^確認番号/)
    await user.clear(confirmationField)
    await user.type(confirmationField, 'XYZ-000')
    await user.click(within(form).getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(within(main()).queryByText(/^未確認 \d+件$/)).toBeNull(),
    )
  })
})

describe('ローカル保存', () => {
  it('入力した予約が保存され、開き直しても復元される', async () => {
    const user = userEvent.setup()
    seed(makeState())
    const view = await renderPage()

    const form = await openAddFormFromOnboarding(user)
    await fillAndSaveBookingForm(user, form, {
      title: '保存される宿',
      date: '2030-06-13',
    })

    await waitFor(
      () => {
        expect(loadFromStorage()?.bookings.map((b) => b.title)).toEqual([
          '保存される宿',
        ])
      },
      { timeout: 3000 },
    )

    view.unmount()
    await renderPage()
    await goToTab(user, '日程')
    expect(within(main()).getByText('保存される宿')).toBeTruthy()
  })
})

describe('ダイアログのフォーカス管理', () => {
  it('Tab でダイアログの外に出られず、閉じると元の位置にフォーカスが戻る', async () => {
    const user = userEvent.setup()
    seed(makeState({ bookings: [lodging()] }))
    await renderPage()

    await goToTab(user, '日程')
    const editButton = within(main()).getByRole('button', {
      name: '東京の宿 を編集',
    })
    await user.click(editButton)
    const form = await screen.findByRole('dialog', { name: '予約を編集' })

    // 開いた直後からフォーカスはダイアログ内にある
    expect(form.contains(document.activeElement)).toBe(true)

    // フォームの項目数を一周してもダイアログの外へは出ない
    for (let i = 0; i < 30; i += 1) {
      await user.tab()
      expect(form.contains(document.activeElement)).toBe(true)
    }
    for (let i = 0; i < 5; i += 1) {
      await user.tab({ shift: true })
      expect(form.contains(document.activeElement)).toBe(true)
    }

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(editButton)
  })
})
