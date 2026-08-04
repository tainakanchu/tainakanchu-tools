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
import { activeStateOf, loadLibrary } from '../../../../lib/trip-notes/trips'
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

/**
 * storage.ts の旧 STORAGE_KEY。テストから状態を仕込むためだけに複製する。
 *
 * 現在の保存先は trips.ts の新キーだが、仕込みは旧キーのままにしてある。
 * loadLibrary が旧キーを 1 件目の旅程として取り込むので、
 * 「以前のバージョンで作った旅程を持つ利用者がページを開く」という
 * 移行そのものが、フローのテストを回すたびに一緒に検証されることになる。
 */
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
 *
 * 待ち時間を既定(1秒)より長く取っているのは、このファイルで最初に描画される
 * 1 本だけがページのチャンクを実際に読み込む役を負うためである。
 * ページが依存するコンポーネントが増えるたびにその 1 本だけが不安定になり、
 * 「たまたま最初に走ったテストが落ちる」という中身と無関係な失敗になる。
 * 2 本目以降はモジュールが温まっていて即座に解決するので、上限を伸ばしても
 * テスト全体が遅くなることはない。
 */
async function renderPage(): Promise<RenderResult> {
  let view!: RenderResult
  await act(async () => {
    view = render(<TripNotesPage />)
    await Promise.resolve()
  })
  await screen.findByRole('main', {}, { timeout: 10_000 })
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

/**
 * 予約フォームの「AI に読ませて貼り付ける」を開いて JSON を貼り、
 * 「読み取る」まで押す。開いたままの状態で二度呼んでもよい
 */
async function pasteAndParseInBookingForm(
  user: UserEvent,
  form: HTMLElement,
  json: string,
): Promise<void> {
  const section = within(form)
    .getByText('AI に読ませて貼り付ける')
    .closest('details')
  if (section === null) throw new Error('AI セクションが見つからない')
  if (!section.open) {
    await user.click(within(form).getByText('AI に読ませて貼り付ける'))
  }
  const textarea = within(form).getByLabelText('AI が返した JSON を貼り付ける')
  await user.clear(textarea)
  await user.click(textarea)
  await user.paste(json)
  await user.click(within(form).getByRole('button', { name: '読み取る' }))
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

  it('取り込んだ直後に「日程で確認する」で日程タブの該当日へ飛べる', async () => {
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
      await screen.findByRole('button', { name: '日程で確認する' }),
    )

    expect(
      screen.getByRole('tab', { name: /日程/ }).getAttribute('aria-selected'),
    ).toBe('true')

    // 3件のうち一番早い日(6/12・確認済みの宿)がハイライトされる
    const day = within(main())
      .getByRole('heading', { level: 3, name: /^6\/12/ })
      .closest('li')
    if (day === null) throw new Error('6/12 の日付ブロックが見つからない')
    expect(day.className).toContain('ring-cyan-400')
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

describe('AI インポートの重複マージ', () => {
  /**
   * 既存の宿と同じ確認番号(区切り文字・大小文字違い)を持つ再取り込み。
   * 予約確認メールをもう一度 AI に読ませて貼り付けたときの再現。
   */
  const RESENT_LODGING = JSON.stringify([
    {
      kind: 'lodging',
      title: '東京の宿(再送)',
      start: { date: '2030-06-12', time: '15:00', tz: 'Asia/Tokyo' },
      end: { date: '2030-06-14', time: '10:00', tz: 'Asia/Tokyo' },
      status: 'confirmed',
      payment: 'paid',
      confirmationNumber: 'TKY-0001',
      price: { amount: 25000, currency: 'JPY' },
    },
  ])

  it('確認番号が一致する予約はプレビューで更新バッジが付き、取り込んでも重複せずマージされる', async () => {
    const user = userEvent.setup()
    seed(
      makeState({
        bookings: [lodging({ confirmationNumber: 'tky 0001' })],
      }),
    )
    await renderPage()

    await goToTab(user, '設定')
    await user.click(
      screen.getByRole('button', { name: '次へ: 結果を貼り付ける' }),
    )
    const textarea = screen.getByLabelText('AI が返した JSON')
    await user.click(textarea)
    await user.paste(RESENT_LODGING)
    await user.click(screen.getByRole('button', { name: '読み込む' }))

    // プレビュー一覧のこの予約に「更新」バッジが付く
    const previewCard = (await screen.findByText('東京の宿(再送)')).closest(
      'li',
    )
    if (previewCard === null) throw new Error('プレビューの行が見つからない')
    expect(within(previewCard).getByText('更新')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '取り込む' }))
    const dialog = await screen.findByRole('dialog', {
      name: '日時とタイムゾーンの確認',
    })
    await user.click(
      within(dialog).getByRole('button', {
        name: '1件すべての日時とタイムゾーンを確認済みとして取り込む',
      }),
    )

    // 完了メッセージが「新規」ではなく「更新」だったことを伝える
    expect(
      await screen.findByText(
        /^1件を取り込みました\(うち1件は既存の予約を更新\)/,
      ),
    ).toBeTruthy()

    // 重複して増えず、既存の1件がマージされて残るだけ
    await goToTab(user, '日程')
    expect(within(main()).getByText('東京の宿(再送)')).toBeTruthy()
    expect(within(main()).queryByText('東京の宿')).toBeNull()
  })
})

describe('予約追加フォームからの AI 貼り付け', () => {
  /** 航空券 1 件ぶん。前後に散文が付いた、AI が普通に返してくる形 */
  const ONE_FLIGHT = [
    '以下が読み取れました。',
    '```json',
    JSON.stringify([
      {
        kind: 'flight',
        title: 'AI357 羽田→ニューデリー',
        start: { date: '2030-06-13', time: '11:30', tz: 'Asia/Tokyo' },
        end: { date: '2030-06-13', time: '17:40', tz: 'Asia/Kolkata' },
        status: 'confirmed',
        payment: 'paid',
        confirmationNumber: 'JL-778899',
        evidence: { start: '11:30 羽田発' },
      },
    ]),
    '```',
  ].join('\n')

  /** 2 件。フォームには収まらないので一括取り込みへ回るはず */
  const TWO_BOOKINGS = JSON.stringify([
    {
      kind: 'lodging',
      title: 'デリーの宿',
      start: { date: '2030-06-13', time: '20:00', tz: 'Asia/Kolkata' },
      end: { date: '2030-06-15', time: '10:00', tz: 'Asia/Kolkata' },
      status: 'confirmed',
      payment: 'paid',
      evidence: { start: 'チェックイン 20:00' },
    },
    {
      kind: 'activity',
      title: '市内観光',
      start: { date: '2030-06-14', time: '09:00', tz: 'Asia/Kolkata' },
      status: 'idea',
      payment: 'unpaid',
      evidence: { start: '09:00 集合' },
    },
  ])

  it('既定では畳まれていて、手入力の邪魔をしない', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()

    const form = await openAddFormFromOnboarding(user)
    const section = within(form)
      .getByText('AI に読ませて貼り付ける')
      .closest('details')
    if (section === null) throw new Error('AI セクションが見つからない')
    expect(section.open).toBe(false)

    await user.click(within(form).getByText('AI に読ませて貼り付ける'))
    expect(section.open).toBe(true)
  })

  it('1件だけ読み取れたら、そのままフォームの各欄に反映される', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()

    const form = await openAddFormFromOnboarding(user)
    await pasteAndParseInBookingForm(user, form, ONE_FLIGHT)

    expect(within(form).getByText(/1件を読み取って/)).toBeTruthy()

    const kind = within(form).getByLabelText<HTMLSelectElement>(/^種別/)
    expect(kind.value).toBe('flight')
    const title = within(form).getByLabelText<HTMLInputElement>(/^タイトル/)
    expect(title.value).toBe('AI357 羽田→ニューデリー')
    const startGroup = within(form).getByRole('group', { name: '開始日時' })
    expect(
      within(startGroup).getByLabelText<HTMLInputElement>(/^日付/).value,
    ).toBe('2030-06-13')
    expect(
      within(startGroup).getByLabelText<HTMLInputElement>(/^時刻/).value,
    ).toBe('11:30')
    expect(
      within(form).getByLabelText<HTMLInputElement>(/^確認番号/).value,
    ).toBe('JL-778899')

    // AI 由来なので、確認するまで黄色い下線が残る
    expect(title.className).toContain('border-amber-400')
    expect(
      within(form).getAllByText(/^AI が入力した値です/).length,
    ).toBeGreaterThan(0)

    // 人が書き換えた欄は、その場で未確認から外れる
    await user.clear(title)
    await user.type(title, '手で直した便名')
    expect(
      within(form).getByLabelText<HTMLInputElement>(/^タイトル/).className,
    ).not.toContain('border-amber-400')

    // そのまま保存すれば 1 件として入る
    await user.click(within(form).getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(within(main()).getByText('手で直した便名')).toBeTruthy(),
    )
    expect(within(main()).getByText(/^未確認 \d+件$/)).toBeTruthy()
  })

  it('複数件なら、日時レビューを経る一括取り込みに流れる', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()

    const form = await openAddFormFromOnboarding(user)
    await pasteAndParseInBookingForm(user, form, TWO_BOOKINGS)

    // フォームには入れず、まとめて取り込むかを尋ねる
    expect(
      within(form).getByText('2件見つかりました。まとめて取り込みますか?'),
    ).toBeTruthy()
    expect(
      within(form).getByLabelText<HTMLInputElement>(/^タイトル/).value,
    ).toBe('')

    await user.click(
      within(form).getByRole('button', { name: '2件をまとめて取り込む' }),
    )

    // 日時とタイムゾーンの確認を飛ばさない
    const dialog = await screen.findByRole('dialog', {
      name: '日時とタイムゾーンの確認',
    })
    expect(
      within(dialog).getByText('2030-06-13 20:00 / Asia/Kolkata'),
    ).toBeTruthy()

    // Esc はレビューだけを閉じる。下敷きの予約フォームまで一緒に消えない
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '日時とタイムゾーンの確認' }),
      ).toBeNull(),
    )
    expect(screen.getByRole('dialog', { name: '予約を追加' })).toBeTruthy()

    await user.click(
      within(form).getByRole('button', { name: '2件をまとめて取り込む' }),
    )
    const reopened = await screen.findByRole('dialog', {
      name: '日時とタイムゾーンの確認',
    })
    await user.click(
      within(reopened).getByRole('button', {
        name: '2件すべての日時とタイムゾーンを確認済みとして取り込む',
      }),
    )

    // 取り込んだらフォームごと閉じ、2件が日程に並ぶ
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(main()).getByText('デリーの宿')).toBeTruthy()
    expect(within(main()).getByText('市内観光')).toBeTruthy()
  })

  it('読み取れなかったときは問題の詳細が残る', async () => {
    const user = userEvent.setup()
    seed(makeState())
    await renderPage()

    const form = await openAddFormFromOnboarding(user)
    await pasteAndParseInBookingForm(
      user,
      form,
      'すみません、読み取れませんでした',
    )

    expect(within(form).getByText(/予約を読み取れませんでした/)).toBeTruthy()
    expect(within(form).getByText(/^問題の詳細/)).toBeTruthy()
  })

  it('宿泊の穴の「予約を追加」から開いたフォームでもそのまま使える', async () => {
    const user = userEvent.setup()
    // 宿があるのは 6/12・6/13 の夜だけ。6/14 が未確保の穴として残る
    seed(makeState({ bookings: [lodging()] }))
    await renderPage()
    await goToTab(user, '日程')

    // 穴のカードから追加フォームを開く(種別は宿泊で開く)
    await user.click(
      within(main()).getAllByRole('button', { name: /の宿泊予約を追加$/ })[0],
    )
    const form = await screen.findByRole('dialog', { name: '予約を追加' })
    expect(within(form).getByLabelText<HTMLSelectElement>(/^種別/).value).toBe(
      'lodging',
    )

    await pasteAndParseInBookingForm(user, form, ONE_FLIGHT)
    expect(within(form).getByLabelText<HTMLSelectElement>(/^種別/).value).toBe(
      'flight',
    )
    expect(
      within(form).getByLabelText<HTMLInputElement>(/^タイトル/).value,
    ).toBe('AI357 羽田→ニューデリー')
  })

  it('編集モードでは、上書きの確認を挟んでから反映する', async () => {
    const user = userEvent.setup()
    seed(makeState({ bookings: [lodging()] }))
    await renderPage()
    await goToTab(user, '日程')

    await user.click(
      within(main()).getByRole('button', { name: '東京の宿 を編集' }),
    )
    const form = await screen.findByRole('dialog', { name: '予約を編集' })
    await pasteAndParseInBookingForm(user, form, ONE_FLIGHT)

    // 確認を出すだけで、入力中の値はまだ触らない
    expect(
      within(form).getByText(/AI が読み取った値で置き換わります/),
    ).toBeTruthy()
    expect(
      within(form).getByLabelText<HTMLInputElement>(/^タイトル/).value,
    ).toBe('東京の宿')

    // やめれば元のまま
    await user.click(within(form).getByRole('button', { name: 'やめる' }))
    expect(
      within(form).getByLabelText<HTMLInputElement>(/^タイトル/).value,
    ).toBe('東京の宿')

    await pasteAndParseInBookingForm(user, form, ONE_FLIGHT)
    await user.click(
      within(form).getByRole('button', { name: '上書きして反映する' }),
    )
    expect(
      within(form).getByLabelText<HTMLInputElement>(/^タイトル/).value,
    ).toBe('AI357 羽田→ニューデリー')
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

    // ロジック層のラウンドトリップ。
    //
    // 共有URLは id を載せず、復元側で newId() を振り直す(payload を縮めるため)。
    // TripNotesState の中に id の相互参照は無い
    // (夜の充足・移動の抜け・キャンセル期限などは保存されない導出値で、
    //  毎回 state から計算し直される)ので、id が変わっても画面の見え方は変わらない。
    // だからここでは id の一致ではなく、件数と id 以外の中身が保たれることを見る。
    const decoded = await decodeShareState(hash)
    expect(decoded?.bookings.length).toBe(shared.bookings.length)
    expect(decoded).toEqual({
      ...shared,
      bookings: shared.bookings.map((booking, index) => ({
        ...booking,
        id: decoded?.bookings[index].id ?? booking.id,
      })),
    })

    window.location.hash = hash
    await renderPage()

    // 黙って上書きせず、件数を見せてから確認を取る
    const dialog = await screen.findByRole('dialog', {
      name: /共有された旅のしおり/,
    })
    expect(within(dialog).getByText('1件')).toBeTruthy()

    // 主導線は非破壊の「新しい旅程として追加」
    await user.click(
      within(dialog).getByRole('button', { name: '新しい旅程として追加' }),
    )

    // 2泊ぶん(6/12・6/13)の夜が共有された宿で埋まる
    expect(
      await screen.findAllByRole('button', { name: /宿泊確定: 共有された宿$/ }),
    ).toHaveLength(2)
    // 再読み込みのたびに同じ確認が出ないよう、ハッシュは読んだ時点で消す
    expect(window.location.hash).toBe('')

    // 元の旅程は消えず、共有された旅程と並んで残る
    await user.click(screen.getByRole('button', { name: /^同行者の旅程/ }))
    const menu = screen.getByRole('menu', { name: '旅程の切り替えと操作' })
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(2)
  })

  it('置き換えを選ぶと、いまの旅程だけが入れ替わる', async () => {
    const user = userEvent.setup()
    seed(makeState({ tripTitle: '自分の旅程', bookings: [lodging()] }))

    const shared = makeState({
      tripTitle: '同行者の旅程',
      bookings: [lodging({ id: 'shared-1', title: '共有された宿' })],
    })
    const url = await encodeShareUrl(
      shared,
      'https://example.test/tools/trip-notes/',
    )
    window.location.hash = url.slice(url.indexOf('#'))
    await renderPage()

    const dialog = await screen.findByRole('dialog', {
      name: /共有された旅のしおり/,
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'いまの旅程を置き換える' }),
    )

    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /宿泊確定: 共有された宿$/ }),
      ).toHaveLength(2),
    )
    // 旅程は増えない(いまの 1 件の中身が入れ替わっただけ)
    await user.click(screen.getByRole('button', { name: /^同行者の旅程/ }))
    const menu = screen.getByRole('menu', { name: '旅程の切り替えと操作' })
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(1)
  })
})

/** 旅程セレクタ(いま開いている旅程名がそのままボタン名になる)を開く */
async function openTripMenu(
  user: UserEvent,
  activeTitle: string,
): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: activeTitle }))
  return screen.findByRole('menu', { name: '旅程の切り替えと操作' })
}

/** 旅程の名前を変える。Undo 履歴に 1 手積む手軽な編集としても使う */
async function renameTrip(
  user: UserEvent,
  activeTitle: string,
  next: string,
): Promise<void> {
  const menu = await openTripMenu(user, activeTitle)
  await user.click(within(menu).getByRole('menuitem', { name: '名前を変える' }))
  const dialog = await screen.findByRole('dialog', {
    name: '旅程の名前を変える',
  })
  const input =
    within(dialog).getByLabelText<HTMLInputElement>('旅行のタイトル')
  await user.clear(input)
  await user.type(input, next)
  await user.click(within(dialog).getByRole('button', { name: '保存' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

describe('旅程の複数管理', () => {
  it('新しい旅程を作ると、元の旅程の予約は持ち込まれず、切り替えで戻れる', async () => {
    const user = userEvent.setup()
    seed(makeState({ tripTitle: 'マルタ9月', bookings: [lodging()] }))
    await renderPage()
    await goToTab(user, '日程')
    expect(within(main()).getByText('東京の宿')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '新しい旅程を作る' }))

    // 新しい旅程はまっさらなので、オンボーディングに戻る
    expect(
      await screen.findByRole('button', { name: /予約を 1 件登録する/ }),
    ).toBeTruthy()

    // セレクタから元の旅程に戻れば、予約もそのまま残っている
    const menu = await openTripMenu(user, '名称未設定')
    await user.click(
      within(menu).getByRole('menuitemradio', { name: /マルタ9月/ }),
    )
    await goToTab(user, '日程')
    expect(within(main()).getByText('東京の宿')).toBeTruthy()
  })

  it('旅程を切り替えると Undo 履歴は持ち越されない', async () => {
    const user = userEvent.setup()
    seed(makeState({ tripTitle: 'マルタ9月', bookings: [lodging()] }))
    await renderPage()

    // 1 手だけ編集して、Undo が効く状態を作る
    await renameTrip(user, 'マルタ9月', 'マルタ再訪')
    expect(
      screen.getByRole('button', { name: '元に戻す' }).hasAttribute('disabled'),
    ).toBe(false)

    await user.click(screen.getByRole('button', { name: '新しい旅程を作る' }))

    // 別の旅程を開いた以上、前の旅程の履歴には戻れない
    expect(
      screen.getByRole('button', { name: '元に戻す' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('複製すると「のコピー」が増え、元の旅程は残る', async () => {
    const user = userEvent.setup()
    seed(makeState({ tripTitle: 'マルタ9月', bookings: [lodging()] }))
    await renderPage()

    const menu = await openTripMenu(user, 'マルタ9月')
    await user.click(within(menu).getByRole('menuitem', { name: '複製' }))

    const reopened = await openTripMenu(user, 'マルタ9月 のコピー')
    expect(
      within(reopened)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('マルタ9月'),
      expect.stringContaining('マルタ9月 のコピー'),
    ])

    // 複製先を編集しても元の旅程には波及しない(構造ごとコピーしている)
    await goToTab(user, '日程')
    expect(within(main()).getByText('東京の宿')).toBeTruthy()
  })

  it('最後の1件を削除しても空にはならず、新しい空の旅程に置き換わる', async () => {
    const user = userEvent.setup()
    seed(makeState({ tripTitle: 'マルタ9月', bookings: [lodging()] }))
    await renderPage()

    const menu = await openTripMenu(user, 'マルタ9月')
    await user.click(within(menu).getByRole('menuitem', { name: '削除' }))
    const confirm = await screen.findByRole('dialog', {
      name: /この旅程を削除しますか/,
    })
    await user.click(
      within(confirm).getByRole('button', { name: /を削除する$/ }),
    )

    // 予約 0 件のまっさらな旅程が 1 件だけ開いている
    expect(
      await screen.findByRole('button', { name: /予約を 1 件登録する/ }),
    ).toBeTruthy()
    const reopened = await openTripMenu(user, '名称未設定')
    expect(within(reopened).getAllByRole('menuitemradio')).toHaveLength(1)
  })

  it('名前を変えるとセレクタの表示もその場で変わる', async () => {
    const user = userEvent.setup()
    seed(makeState({ tripTitle: 'マルタ9月' }))
    await renderPage()

    await renameTrip(user, 'マルタ9月', 'マルタ再訪')
    expect(screen.getByRole('button', { name: 'マルタ再訪' })).toBeTruthy()
  })

  it('旅程ごとに別々に保存され、開き直しても両方残る', async () => {
    const user = userEvent.setup()
    seed(makeState({ tripTitle: 'マルタ9月', bookings: [lodging()] }))
    const view = await renderPage()

    await user.click(screen.getByRole('button', { name: '新しい旅程を作る' }))
    await renameTrip(user, '名称未設定', '台湾年末')

    await waitFor(
      () => {
        expect(
          loadLibrary('2030-06-12').trips.map((trip) => trip.state.tripTitle),
        ).toEqual(['マルタ9月', '台湾年末'])
      },
      { timeout: 3000 },
    )

    view.unmount()
    await renderPage()
    // 最後に開いていた旅程がそのまま開く
    const menu = await openTripMenu(user, '台湾年末')
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(2)
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
        expect(
          activeStateOf(loadLibrary('2030-06-12')).bookings.map((b) => b.title),
        ).toEqual(['保存される宿'])
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
