import { describe, expect, it } from 'vitest'
import { findTravelDocIssues } from './docs'
import type { TravelDoc, TravelDocIssue, TripNotesState } from './types'

/** 旅行は 9/10 〜 9/20。手続きの判定はこの期間との突き合わせで決まる */
function makeState(
  travelDocs: Array<TravelDoc>,
  overrides: Partial<TripNotesState> = {},
): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'マルタ',
    startDate: '2026-09-10',
    endDate: '2026-09-20',
    pinnedTz: null,
    bookings: [],
    emergencyContacts: [],
    travelDocs,
    ...overrides,
  }
}

function makeDoc(overrides: Partial<TravelDoc> = {}): TravelDoc {
  return {
    id: 'td-1',
    kind: 'sim',
    title: 'マルタの eSIM',
    status: 'done',
    ...overrides,
  }
}

function kindsOf(issues: Array<TravelDocIssue>): Array<string> {
  return issues.map((issue) => issue.kind)
}

describe('findTravelDocIssues / coverage-gap', () => {
  it('有効期間の終わりが旅行の終了日より前なら警告する', () => {
    const issues = findTravelDocIssues(
      makeState([
        makeDoc({ validFrom: '2026-09-01', validUntil: '2026-09-15' }),
      ]),
      '2026-09-01',
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe('coverage-gap')
    expect(issues[0].severity).toBe('warning')
    // 何日足りないかまで出す(9/15 までの有効期間で 9/20 まで旅行する = 5 日足りない)
    expect(issues[0].message).toContain('5日分')
    expect(issues[0].docId).toBe('td-1')
  })

  it('有効期間の始まりが旅行の開始日より後なら警告する', () => {
    const issues = findTravelDocIssues(
      makeState([
        makeDoc({ validFrom: '2026-09-12', validUntil: '2026-09-30' }),
      ]),
      '2026-09-01',
    )
    expect(kindsOf(issues)).toEqual(['coverage-gap'])
    expect(issues[0].message).toContain('2日分')
  })

  it('前も後ろもはみ出していれば 2 件出す(片方を直しても残りは残るため)', () => {
    const issues = findTravelDocIssues(
      makeState([
        makeDoc({ validFrom: '2026-09-12', validUntil: '2026-09-15' }),
      ]),
      '2026-09-01',
    )
    expect(kindsOf(issues)).toEqual(['coverage-gap', 'coverage-gap'])
  })

  it('旅程をすべて覆っていれば何も出さない(端がちょうど一致する場合も含む)', () => {
    expect(
      findTravelDocIssues(
        makeState([
          makeDoc({ validFrom: '2026-09-10', validUntil: '2026-09-20' }),
        ]),
        '2026-09-01',
      ),
    ).toEqual([])
    expect(
      findTravelDocIssues(
        makeState([
          makeDoc({ validFrom: '2026-09-01', validUntil: '2026-09-30' }),
        ]),
        '2026-09-01',
      ),
    ).toEqual([])
  })

  it('validUntil だけ入っていれば後ろ側だけを見る', () => {
    expect(
      kindsOf(
        findTravelDocIssues(
          makeState([makeDoc({ validUntil: '2026-09-15' })]),
          '2026-09-01',
        ),
      ),
    ).toEqual(['coverage-gap'])
    // 後ろが足りていれば、validFrom が無いことを理由に前側を疑ったりはしない
    expect(
      findTravelDocIssues(
        makeState([makeDoc({ validUntil: '2026-09-25' })]),
        '2026-09-01',
      ),
    ).toEqual([])
  })

  it('validFrom だけ入っていれば前側だけを見る', () => {
    expect(
      kindsOf(
        findTravelDocIssues(
          makeState([makeDoc({ validFrom: '2026-09-12' })]),
          '2026-09-01',
        ),
      ),
    ).toEqual(['coverage-gap'])
    expect(
      findTravelDocIssues(
        makeState([makeDoc({ validFrom: '2026-09-05' })]),
        '2026-09-01',
      ),
    ).toEqual([])
  })

  it('有効期間が両方とも未入力なら判定しない', () => {
    expect(findTravelDocIssues(makeState([makeDoc()]), '2026-09-01')).toEqual(
      [],
    )
  })

  it('まだ取得していない手続きでも有効期間は見る(買う前に直せるうちに知らせる)', () => {
    const issues = findTravelDocIssues(
      makeState([makeDoc({ status: 'todo', validUntil: '2026-09-15' })]),
      // 旅行のはるか手前。not-done は info に留まる時期にしておく
      '2026-01-01',
    )
    expect(kindsOf(issues)).toEqual(['not-done', 'coverage-gap'])
    expect(issues[0].severity).toBe('info')
    expect(issues[1].severity).toBe('warning')
  })
})

describe('findTravelDocIssues / not-done', () => {
  it('取得済みなら何も出さない', () => {
    expect(
      findTravelDocIssues(
        makeState([makeDoc({ status: 'done' })]),
        '2026-09-01',
      ),
    ).toEqual([])
  })

  it('旅行開始まで日数があるうちは info(まだ手を付ける時期ではない)', () => {
    const issues = findTravelDocIssues(
      makeState([makeDoc({ status: 'todo' })]),
      '2026-07-01',
    )
    expect(kindsOf(issues)).toEqual(['not-done'])
    expect(issues[0].severity).toBe('info')
  })

  it('旅行開始が近づくと warning に格上げされる(しきい値は 30 日)', () => {
    const justOutside = findTravelDocIssues(
      makeState([makeDoc({ status: 'todo' })]),
      // 9/10 の 31 日前
      '2026-08-10',
    )
    expect(justOutside[0].severity).toBe('info')

    const justInside = findTravelDocIssues(
      makeState([makeDoc({ status: 'todo' })]),
      // 9/10 の 30 日前
      '2026-08-11',
    )
    expect(justInside[0].severity).toBe('warning')
  })

  it('旅行が始まっていれば warning になり、文面も「始まっている」側に変わる', () => {
    const issues = findTravelDocIssues(
      makeState([makeDoc({ status: 'todo' })]),
      '2026-09-12',
    )
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].message).toContain('旅行が始まっています')
  })

  it('申請中(applied)も「取得できていない」として扱う', () => {
    const issues = findTravelDocIssues(
      makeState([makeDoc({ status: 'applied' })]),
      '2026-07-01',
    )
    expect(kindsOf(issues)).toEqual(['not-done'])
    expect(issues[0].message).toContain('発給待ち')
  })

  it('旅行の開始日が壊れていて数えられないときは warning に倒す', () => {
    const issues = findTravelDocIssues(
      makeState([makeDoc({ status: 'todo' })], { startDate: 'いつか' }),
      '2026-07-01',
    )
    expect(issues[0].severity).toBe('warning')
  })
})

describe('findTravelDocIssues / due-soon', () => {
  it('申請期限が過ぎていれば warning', () => {
    const issues = findTravelDocIssues(
      makeState([makeDoc({ status: 'todo', dueDate: '2026-06-30' })]),
      '2026-07-01',
    )
    expect(kindsOf(issues)).toEqual(['not-done', 'due-soon'])
    expect(issues[1].severity).toBe('warning')
    expect(issues[1].message).toContain('過ぎています')
  })

  it('申請期限が今日なら warning(その日いっぱいはまだ間に合う)', () => {
    const issues = findTravelDocIssues(
      makeState([makeDoc({ status: 'todo', dueDate: '2026-07-01' })]),
      '2026-07-01',
    )
    expect(issues[1].severity).toBe('warning')
    expect(issues[1].message).toContain('今日')
  })

  it('申請期限が近ければ info(しきい値は 14 日)', () => {
    const justInside = findTravelDocIssues(
      makeState([makeDoc({ status: 'todo', dueDate: '2026-07-15' })]),
      '2026-07-01',
    )
    expect(kindsOf(justInside)).toEqual(['not-done', 'due-soon'])
    expect(justInside[1].severity).toBe('info')
    expect(justInside[1].message).toContain('あと14日')

    const justOutside = findTravelDocIssues(
      makeState([makeDoc({ status: 'todo', dueDate: '2026-07-16' })]),
      '2026-07-01',
    )
    expect(kindsOf(justOutside)).toEqual(['not-done'])
  })

  it('取得済みなら申請期限が過ぎていても指摘しない', () => {
    expect(
      findTravelDocIssues(
        makeState([makeDoc({ status: 'done', dueDate: '2026-06-01' })]),
        '2026-07-01',
      ),
    ).toEqual([])
  })

  it('壊れた申請期限は数えられないので黙る(直しようのない警告を出さない)', () => {
    const issues = findTravelDocIssues(
      makeState([makeDoc({ status: 'todo', dueDate: '2026-13-99' })]),
      '2026-07-01',
    )
    expect(kindsOf(issues)).toEqual(['not-done'])
  })
})

describe('findTravelDocIssues / 全体', () => {
  it('手続きが 1 件も無ければ空配列(フィールドごと無い state も同じ)', () => {
    expect(findTravelDocIssues(makeState([]), '2026-09-01')).toEqual([])

    const { travelDocs: _travelDocs, ...withoutField } = makeState([])
    expect(findTravelDocIssues(withoutField, '2026-09-01')).toEqual([])
  })

  it('1 つの手続きから複数の指摘が出る(直す手順がそれぞれ違うため)', () => {
    const issues = findTravelDocIssues(
      makeState([
        makeDoc({
          status: 'todo',
          dueDate: '2026-08-20',
          validUntil: '2026-09-15',
        }),
      ]),
      '2026-08-25',
    )
    expect(kindsOf(issues)).toEqual(['not-done', 'due-soon', 'coverage-gap'])
    expect(issues.every((issue) => issue.docId === 'td-1')).toBe(true)
  })

  it('メッセージは題名と地域を含み、次に何をすればよいかまで書いてある', () => {
    const issues = findTravelDocIssues(
      makeState([
        makeDoc({
          kind: 'visa',
          title: 'ETIAS',
          region: 'シェンゲン圏',
          status: 'todo',
        }),
      ]),
      '2026-09-01',
    )
    expect(issues[0].message).toContain('ETIAS(シェンゲン圏)')
    expect(issues[0].message).toContain('用意してください')
  })

  it('複数の手続きは登録順に並ぶ', () => {
    const issues = findTravelDocIssues(
      makeState([
        makeDoc({ id: 'td-1', status: 'todo' }),
        makeDoc({ id: 'td-2', status: 'todo' }),
      ]),
      '2026-09-01',
    )
    expect(issues.map((issue) => issue.docId)).toEqual(['td-1', 'td-2'])
  })
})
