/**
 * 各パネルの初回描画が落ちないことだけを見る煙感知器。
 * src/routes/tools/trip-notes/-components/render.test.tsx と同じ狙い。
 *
 * 画面の中身は検証しない。狙いは「旅行者 0 件」「探親を選んだ状態」
 * 「履歴あり」といった端の入力で描画そのものが死なないことの確認で、
 * ここが赤くなるのは型では拾えない実行時の事故が入ったときだけ。
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import { createEmptyTraveler, createEmptyTrip } from '../-lib/storage'
import { AiImportPanel } from './AiImportPanel'
import { DataLists } from './Fields'
import { TravelerCard } from './TravelerCard'
import { TripForm } from './TripForm'
import type { ArrivalCardState, PastTrip } from '../-lib/types'

const noop = () => undefined

const state: ArrivalCardState = {
  trip: {
    ...createEmptyTrip(),
    dateOfEntry: '2026-03-15',
    entryFlightCode: 'BR : EVA Air',
    entryFlightNumber: '190',
    addressOrHotel: 'Grand Hyatt Taipei',
  },
  travelers: [
    { ...createEmptyTraveler(), englishName: 'YAMADA TARO' },
    createEmptyTraveler(),
  ],
  pastTrips: [],
}

const pastTrips: Array<PastTrip> = [
  {
    id: 'past-1',
    savedAt: '2026-01-01T00:00:00.000Z',
    trip: {
      ...createEmptyTrip(),
      entryFlightCode: 'JX : STARLUX Airlines',
      entryFlightNumber: '801',
      addressOrHotel: 'Old Hotel',
    },
  },
  // savedAt が壊れている履歴でも一覧に出せる(日時不明として扱う)
  { id: 'past-2', savedAt: 'broken', trip: createEmptyTrip() },
]

describe('描画の煙感知', () => {
  it('DataLists', () => {
    expect(() => render(<DataLists />)).not.toThrow()
  })

  it('TripForm(既定の目的)', () => {
    expect(() =>
      render(
        <TripForm
          trip={state.trip}
          onChange={noop}
          pastTrips={[]}
          onApplyPastTrip={noop}
        />,
      ),
    ).not.toThrow()
  })

  it('TripForm(探親・其他・SEA・Transfer の分岐)', () => {
    for (const trip of [
      { ...state.trip, purpose: '5.探親 Visit Relative' },
      { ...state.trip, purpose: '10.其他 Others' },
      { ...state.trip, entryMode: 'SEA' as const, exitMode: 'SEA' as const },
      { ...state.trip, accommodation: 'Transfer' as const },
    ]) {
      expect(() =>
        render(
          <TripForm
            trip={trip}
            onChange={noop}
            pastTrips={[]}
            onApplyPastTrip={noop}
          />,
        ),
      ).not.toThrow()
    }
  })

  it('TripForm の履歴を開いて 1 件選べる', () => {
    const applied: Array<PastTrip> = []
    // 自動 cleanup が効かない設定なので、毎回この描画ぶんの中だけを探す
    const { container } = render(
      <TripForm
        trip={createEmptyTrip()}
        onChange={noop}
        pastTrips={pastTrips}
        onApplyPastTrip={(past) => applied.push(past)}
      />,
    )
    const scope = within(container)
    fireEvent.click(scope.getByText(/過去の旅程からコピー/))
    fireEvent.click(scope.getByText(/JX 801/))
    expect(applied.map((past) => past.id)).toEqual(['past-1'])
  })

  it('履歴が空なら「過去の旅程からコピー」は出ない', () => {
    const { container } = render(
      <TripForm
        trip={createEmptyTrip()}
        onChange={noop}
        pastTrips={[]}
        onApplyPastTrip={noop}
      />,
    )
    expect(within(container).queryByText(/過去の旅程からコピー/)).toBeNull()
  })

  it('TravelerCard(国籍ごとのビザ区分の分岐)', () => {
    for (const nationality of [
      'JPN,JAPAN',
      'ROC,REPUBLIC OF CHINA(TAIWAN)',
      'HKG,HONG KONG',
      'これはリストにない値',
    ]) {
      expect(() =>
        render(
          <TravelerCard
            traveler={{ ...createEmptyTraveler(), nationality }}
            position={1}
            onChange={noop}
            onRemove={noop}
            canRemove
          />,
        ),
      ).not.toThrow()
    }
  })

  it('AiImportPanel', () => {
    expect(() =>
      render(<AiImportPanel state={state} onApply={noop} />),
    ).not.toThrow()
  })
})

/*
  AI 取り込みは「取り込む」を押した瞬間の state に当てなければならない。

  プレビューを見ている間にフォームを直すのはごく自然な操作で(AI が読めなかった
  欄を先に埋める、など)、読み込んだ時点のスナップショットを当てると
  その修正が巻き戻る。しかも巻き戻ったことは画面に何も出ない。
*/
describe('AI 取り込みは押した瞬間の state に当てる', () => {
  const AI_JSON = JSON.stringify({
    dateOfEntry: '2026-03-15',
    entryAirlineCode: 'BR',
    entryFlightNumber: '190',
  })

  /** ステップ 2 まで進めて JSON を読み込ませ、「取り込む」を押すところまで */
  function runImport(
    initial: ArrivalCardState,
  ): Array<(prev: ArrivalCardState) => ArrivalCardState> {
    const updates: Array<(prev: ArrivalCardState) => ArrivalCardState> = []
    const { container } = render(
      <AiImportPanel
        state={initial}
        onApply={(update) => updates.push(update)}
      />,
    )
    const scope = within(container)
    fireEvent.click(scope.getByText('次へ: 結果を貼り付ける'))
    fireEvent.change(scope.getByLabelText('AI が返した JSON'), {
      target: { value: AI_JSON },
    })
    fireEvent.click(scope.getByText('読み込む'))
    fireEvent.click(scope.getByText('取り込む'))
    return updates
  }

  it('プレビュー中にフォームで直した内容を巻き戻さない', () => {
    const initial: ArrivalCardState = {
      trip: createEmptyTrip(),
      travelers: [createEmptyTraveler()],
      pastTrips: [],
    }
    const updates = runImport(initial)
    expect(updates).toHaveLength(1)

    // 読み込んだあとに利用者がホテル名を入れた、という状況
    const edited: ArrivalCardState = {
      ...initial,
      trip: { ...initial.trip, addressOrHotel: '手で入れたホテル' },
    }
    const next = updates[0](edited)

    // 手で入れたぶんは残る
    expect(next.trip.addressOrHotel).toBe('手で入れたホテル')
    // AI が読み取ったぶんも入る
    expect(next.trip.dateOfEntry).toBe('2026-03-15')
    expect(next.trip.entryFlightCode).toBe('BR : EVA Air')
    expect(next.trip.entryFlightNumber).toBe('190')
  })

  it('取り込みが関知しない欄(履歴)も残す', () => {
    const initial: ArrivalCardState = {
      trip: createEmptyTrip(),
      travelers: [createEmptyTraveler()],
      pastTrips,
    }
    const updates = runImport(initial)
    expect(updates[0](initial).pastTrips).toEqual(pastTrips)
  })
})

/**
 * onChange の呼び出しを記録して、キーごとに渡された値を取り出せるようにする。
 * 「どの欄が、何回、どんな値で更新されたか」を見たいので、最後の 1 回ではなく
 * 呼び出しの列をそのまま返す(消し忘れは「呼ばれていない」で落ちる)。
 */
function recorder() {
  const calls: Array<[string, unknown]> = []
  return {
    calls,
    onChange: (key: string, value: unknown) => calls.push([key, value]),
    valueOf: (key: string) =>
      calls.filter(([k]) => k === key).map(([, v]) => v),
  }
}

describe('依存する欄の後片付け', () => {
  it('渡航目的を探親から観光に変えると、親族の欄をクリアする', () => {
    const rec = recorder()
    const { container } = render(
      <TripForm
        trip={{
          ...createEmptyTrip(),
          purpose: '5.探親 Visit Relative',
          relativesName: 'WANG',
          relativesMobile: '0912345678',
        }}
        onChange={rec.onChange}
        pastTrips={[]}
        onApplyPastTrip={noop}
      />,
    )
    const select = within(container).getByLabelText('渡航目的')
    fireEvent.change(select, {
      target: { value: '3.觀光 Sightseeing / Travel / Leisure' },
    })

    expect(rec.valueOf('purpose')).toEqual([
      '3.觀光 Sightseeing / Travel / Leisure',
    ])
    // 画面から欄が消えるだけでは値が state に残り続ける
    expect(rec.valueOf('relativesName')).toEqual([''])
    expect(rec.valueOf('relativesMobile')).toEqual([''])
    expect(rec.valueOf('reason')).toEqual([''])
  })

  it('渡航目的を探親にしたときは、親族の欄をクリアしない', () => {
    const rec = recorder()
    const { container } = render(
      <TripForm
        trip={createEmptyTrip()}
        onChange={rec.onChange}
        pastTrips={[]}
        onApplyPastTrip={noop}
      />,
    )
    fireEvent.change(within(container).getByLabelText('渡航目的'), {
      target: { value: '5.探親 Visit Relative' },
    })
    expect(rec.valueOf('relativesName')).toEqual([])
    expect(rec.valueOf('relativesMobile')).toEqual([])
    // 其他ではないので理由だけは消える
    expect(rec.valueOf('reason')).toEqual([''])
  })

  it('滞在先を Transfer にすると、住所・ホテル名をクリアする', () => {
    const rec = recorder()
    const { container } = render(
      <TripForm
        trip={{ ...createEmptyTrip(), addressOrHotel: 'Grand Hyatt Taipei' }}
        onChange={rec.onChange}
        pastTrips={[]}
        onApplyPastTrip={noop}
      />,
    )
    fireEvent.change(within(container).getByLabelText('滞在先の種別'), {
      target: { value: 'Transfer' },
    })
    expect(rec.valueOf('accommodation')).toEqual(['Transfer'])
    expect(rec.valueOf('addressOrHotel')).toEqual([''])
  })

  /*
    ビザ番号は区分を変えたら必ず消す。番号を持つ区分は複数あり
    (持有簽證・落地簽證など)、その間を行き来すると入力欄が出たままなので、
    前の区分の番号が残っていることに気付けない。
  */
  it('ビザの区分を変えるとビザ番号をクリアする(番号を持つ区分どうしでも)', () => {
    const rec = recorder()
    const { container } = render(
      <TravelerCard
        traveler={{
          ...createEmptyTraveler(),
          visaType: '持有簽證(Holding a Visa)',
          visaNumber: 'OLD-12345',
        }}
        position={1}
        onChange={rec.onChange}
        onRemove={noop}
        canRemove
      />,
    )
    fireEvent.change(within(container).getByLabelText(/^ビザの区分/), {
      target: { value: '落地簽證Landing Visa/臨時入國Temporary Entry' },
    })
    expect(rec.valueOf('visaType')).toEqual([
      '落地簽證Landing Visa/臨時入國Temporary Entry',
    ])
    expect(rec.valueOf('visaNumber')).toEqual([''])
  })

  it('国籍を変えてビザ区分が切り替わるときもビザ番号を消す', () => {
    const rec = recorder()
    const { container } = render(
      <TravelerCard
        traveler={{
          ...createEmptyTraveler(),
          visaType: '持有簽證(Holding a Visa)',
          visaNumber: 'OLD-12345',
        }}
        position={1}
        onChange={rec.onChange}
        onRemove={noop}
        canRemove
      />,
    )
    fireEvent.change(within(container).getByLabelText('国籍'), {
      target: { value: 'ROC,REPUBLIC OF CHINA(TAIWAN)' },
    })
    // 台湾国籍では別のリストになるので、先頭の区分に寄せて番号も消す
    expect(rec.valueOf('visaType')).toEqual(['未具入國許可 Permit-Exempt'])
    expect(rec.valueOf('visaNumber')).toEqual([''])
  })

  it('同じビザ区分を選び直しただけなら番号を消さない', () => {
    const rec = recorder()
    const { container } = render(
      <TravelerCard
        traveler={{
          ...createEmptyTraveler(),
          visaType: '持有簽證(Holding a Visa)',
          visaNumber: 'KEEP-12345',
        }}
        position={1}
        onChange={rec.onChange}
        onRemove={noop}
        canRemove
      />,
    )
    fireEvent.change(within(container).getByLabelText(/^ビザの区分/), {
      target: { value: '持有簽證(Holding a Visa)' },
    })
    expect(rec.valueOf('visaNumber')).toEqual([])
  })
})
