import { describe, expect, it } from 'vitest'
import { constraintLabel, evaluateConstraints } from './constraints'
import { deriveTrip } from './derive'
import { parseTripState } from './storage'
import type { Stay, TripState, Violation } from './types'

/**
 * IN/OUT 都市は既定で null にしてある。
 * 組み込みアンカー(builtin:inCity / builtin:outCity)を混ぜないためで、
 * アンカーを見たいテストだけが明示的に指定する。
 */
function makeState(overrides: Partial<TripState> = {}): TripState {
  return {
    schemaVersion: 1,
    startDate: '2026-06-12',
    endDate: '2026-06-26', // 14 泊 15 日
    inCityId: null,
    outCityId: null,
    poolCityIds: [],
    stays: [],
    legModes: {},
    constraints: [],
    ...overrides,
  }
}

function stay(id: string, cityId: string, nights: number): Stay {
  return { id, cityId, nights }
}

/** UI と同じ経路(deriveTrip の窓・帳簿)で制約を評価する */
function evaluate(state: TripState): Array<Violation> {
  const derived = deriveTrip(state)
  return evaluateConstraints(state, derived.windows, derived.unassignedNights)
}

function idsOf(violations: Array<Violation>): Array<string> {
  return violations.map((v) => v.constraintId)
}

describe('制約: stayNights', () => {
  it('min を下回ると違反になる', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 2)],
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'stayNights',
          cityId: 'paris',
          min: 3,
          max: null,
        },
      ],
    })
    const violations = evaluate(state)
    expect(idsOf(violations)).toEqual(['c1'])
    expect(violations[0].message).toContain('パリ')
    expect(violations[0].message).toContain('2 泊')
    expect(violations[0].stayIds).toEqual(['s1'])
  })

  it('max を上回ると違反になる', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 5)],
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'stayNights',
          cityId: 'paris',
          min: null,
          max: 3,
        },
      ],
    })
    const violations = evaluate(state)
    expect(idsOf(violations)).toEqual(['c1'])
    expect(violations[0].message).toContain('3 泊まで')
  })

  it('範囲内なら違反なし', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 3)],
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'stayNights',
          cityId: 'paris',
          min: 2,
          max: 4,
        },
      ],
    })
    expect(evaluate(state)).toEqual([])
  })

  it('同じ都市に分けて泊まっても合算して判定する', () => {
    const base = {
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must' as const,
          kind: 'stayNights' as const,
          cityId: 'paris',
          min: 4,
          max: null,
        },
      ],
    }
    // パリ 2 泊 + ローマ 3 泊 + パリ 2 泊 = パリ合計 4 泊 → 充足
    const enough = makeState({
      ...base,
      stays: [
        stay('s1', 'paris', 2),
        stay('s2', 'rome', 3),
        stay('s3', 'paris', 2),
      ],
    })
    expect(evaluate(enough)).toEqual([])

    // 合計 3 泊 → 違反、ハイライトはパリの滞在すべて
    const short = makeState({
      ...base,
      stays: [
        stay('s1', 'paris', 2),
        stay('s2', 'rome', 3),
        stay('s3', 'paris', 1),
      ],
    })
    const violations = evaluate(short)
    expect(idsOf(violations)).toEqual(['c1'])
    expect(violations[0].stayIds).toEqual(['s1', 's3'])
    expect(violations[0].message).toContain('3 泊')
  })

  it('まだ日程に入れていない都市は違反にしない(mustVisit の守備範囲)', () => {
    const state = makeState({
      poolCityIds: ['paris'],
      stays: [stay('s1', 'rome', 3)],
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'stayNights',
          cityId: 'paris',
          min: 3,
          max: null,
        },
      ],
    })
    expect(evaluate(state)).toEqual([])
  })
})

describe('制約: presenceOnDate', () => {
  const stays = [stay('s1', 'paris', 4), stay('s2', 'rome', 3)]
  // パリ: 6/12 着 〜 6/16 発 / ローマ: 6/16 着 〜 6/19 発

  it('滞在期間内の日付は充足', () => {
    const state = makeState({
      stays,
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'presenceOnDate',
          cityId: 'paris',
          date: '2026-06-14',
        },
      ],
    })
    expect(evaluate(state)).toEqual([])
  })

  it('移動日は前の都市でも次の都市でも充足扱い', () => {
    const state = makeState({
      stays,
      constraints: [
        {
          id: 'c-from',
          enabled: true,
          severity: 'must',
          kind: 'presenceOnDate',
          cityId: 'paris',
          date: '2026-06-16',
        },
        {
          id: 'c-to',
          enabled: true,
          severity: 'must',
          kind: 'presenceOnDate',
          cityId: 'rome',
          date: '2026-06-16',
        },
      ],
    })
    expect(evaluate(state)).toEqual([])
  })

  it('違反メッセージにはその日の実際の都市名が入る', () => {
    const state = makeState({
      stays,
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'presenceOnDate',
          cityId: 'rome',
          date: '2026-06-14',
        },
      ],
    })
    const violations = evaluate(state)
    expect(idsOf(violations)).toEqual(['c1'])
    expect(violations[0].message).toContain('6/14(日)')
    expect(violations[0].message).toContain('パリ') // 実際にいる都市
    expect(violations[0].message).toContain('ローマ') // 指定した都市
    expect(violations[0].stayIds).toEqual(['s1'])
  })

  it('どの滞在もない日は「未配置」として違反になる', () => {
    const state = makeState({
      stays,
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'presenceOnDate',
          cityId: 'rome',
          date: '2026-06-24', // 滞在は 6/19 で終わっている
        },
      ],
    })
    const violations = evaluate(state)
    expect(idsOf(violations)).toEqual(['c1'])
    expect(violations[0].message).toContain('未配置')
    expect(violations[0].stayIds).toEqual([])
  })

  it('旅程の期間外の日付は違反になる', () => {
    const before = makeState({
      stays,
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'presenceOnDate',
          cityId: 'paris',
          date: '2026-06-11', // 到着日の前日
        },
      ],
    })
    const beforeViolations = evaluate(before)
    expect(idsOf(beforeViolations)).toEqual(['c1'])
    expect(beforeViolations[0].message).toContain('期間外')

    const after = makeState({
      stays,
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'presenceOnDate',
          cityId: 'paris',
          date: '2026-06-27', // 帰国日の翌日
        },
      ],
    })
    expect(idsOf(evaluate(after))).toEqual(['c1'])
  })

  it('最終日(帰国便の出発日)は期間内として扱う', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 14)],
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'presenceOnDate',
          cityId: 'paris',
          date: '2026-06-26',
        },
      ],
    })
    expect(evaluate(state)).toEqual([])
  })
})

describe('制約: order', () => {
  it('指定どおりの順なら充足', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 4), stay('s2', 'rome', 3)],
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'order',
          beforeCityId: 'paris',
          afterCityId: 'rome',
        },
      ],
    })
    expect(evaluate(state)).toEqual([])
  })

  it('逆順なら違反になり両方の滞在をハイライトする', () => {
    const state = makeState({
      stays: [stay('s1', 'rome', 3), stay('s2', 'paris', 4)],
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'order',
          beforeCityId: 'paris',
          afterCityId: 'rome',
        },
      ],
    })
    const violations = evaluate(state)
    expect(idsOf(violations)).toEqual(['c1'])
    expect(violations[0].message).toContain('パリ')
    expect(violations[0].message).toContain('ローマ')
    expect(violations[0].stayIds.sort()).toEqual(['s1', 's2'])
  })

  it('片方が未配置なら判定しない', () => {
    const state = makeState({
      poolCityIds: ['rome'],
      stays: [stay('s1', 'paris', 4)],
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'order',
          beforeCityId: 'rome',
          afterCityId: 'paris',
        },
      ],
    })
    expect(evaluate(state)).toEqual([])
  })
})

describe('制約: mustVisit', () => {
  it('日程に入っていなければ違反', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 4)],
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'mustVisit',
          cityId: 'rome',
        },
      ],
    })
    const violations = evaluate(state)
    expect(idsOf(violations)).toEqual(['c1'])
    expect(violations[0].message).toContain('ローマ')
    expect(violations[0].stayIds).toEqual([])
  })

  it('日程に入っていれば充足', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 4), stay('s2', 'rome', 3)],
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'mustVisit',
          cityId: 'rome',
        },
      ],
    })
    expect(evaluate(state)).toEqual([])
  })

  it('候補プールに入れただけでは充足しない', () => {
    const state = makeState({
      poolCityIds: ['rome'],
      stays: [stay('s1', 'paris', 4)],
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'must',
          kind: 'mustVisit',
          cityId: 'rome',
        },
      ],
    })
    expect(idsOf(evaluate(state))).toEqual(['c1'])
  })
})

describe('制約の共通の振る舞い', () => {
  it('無効にした制約は評価されない', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 4)],
      constraints: [
        {
          id: 'off',
          enabled: false,
          severity: 'must',
          kind: 'mustVisit',
          cityId: 'rome',
        },
        {
          id: 'on',
          enabled: true,
          severity: 'must',
          kind: 'mustVisit',
          cityId: 'venice',
        },
      ],
    })
    expect(idsOf(evaluate(state))).toEqual(['on'])
  })

  it('severity は違反にそのまま伝わる', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 4)],
      constraints: [
        {
          id: 'want-1',
          enabled: true,
          severity: 'want',
          kind: 'mustVisit',
          cityId: 'rome',
        },
        {
          id: 'must-1',
          enabled: true,
          severity: 'must',
          kind: 'mustVisit',
          cityId: 'venice',
        },
      ],
    })
    const violations = evaluate(state)
    expect(violations.find((v) => v.constraintId === 'want-1')?.severity).toBe(
      'want',
    )
    expect(violations.find((v) => v.constraintId === 'must-1')?.severity).toBe(
      'must',
    )
  })
})

describe('組み込みチェック', () => {
  it('泊数を超過すると builtin:nightsBudget が出る', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 10), stay('s2', 'rome', 8)], // 18 泊 > 14 泊
    })
    const derived = deriveTrip(state)
    expect(derived.unassignedNights).toBeLessThan(0)

    const violations = evaluate(state)
    expect(idsOf(violations)).toEqual(['builtin:nightsBudget'])
    expect(violations[0].severity).toBe('must')
    expect(violations[0].message).toContain(
      `${-derived.unassignedNights} 泊オーバー`,
    )
    expect(violations[0].message).toContain('全 14 泊')
  })

  it('泊数が余っていても違反にはしない', () => {
    const state = makeState({ stays: [stay('s1', 'paris', 4)] })
    expect(evaluate(state)).toEqual([])
  })

  it('最初の滞在が到着都市と違うと builtin:inCity が出る', () => {
    const state = makeState({
      inCityId: 'paris',
      stays: [stay('s1', 'rome', 3), stay('s2', 'paris', 4)],
    })
    const violations = evaluate(state)
    expect(idsOf(violations)).toEqual(['builtin:inCity'])
    expect(violations[0].message).toContain('パリ')
    expect(violations[0].stayIds).toEqual(['s1'])

    const ok = makeState({
      inCityId: 'paris',
      stays: [stay('s1', 'paris', 4), stay('s2', 'rome', 3)],
    })
    expect(evaluate(ok)).toEqual([])
  })

  it('最後の滞在が出発都市と違うと builtin:outCity が出る', () => {
    const state = makeState({
      outCityId: 'paris',
      stays: [stay('s1', 'paris', 4), stay('s2', 'rome', 3)],
    })
    const violations = evaluate(state)
    expect(idsOf(violations)).toEqual(['builtin:outCity'])
    expect(violations[0].message).toContain('パリ')
    expect(violations[0].stayIds).toEqual(['s2'])

    const ok = makeState({
      outCityId: 'paris',
      stays: [stay('s1', 'rome', 3), stay('s2', 'paris', 4)],
    })
    expect(evaluate(ok)).toEqual([])
  })

  it('滞在が空ならアンカー違反は出さない(これから並べる状態)', () => {
    const state = makeState({ inCityId: 'paris', outCityId: 'rome', stays: [] })
    expect(evaluate(state)).toEqual([])
  })

  it('滞在が 1 つだけなら IN/OUT の両方と突き合わせる', () => {
    const state = makeState({
      inCityId: 'paris',
      outCityId: 'paris',
      stays: [stay('s1', 'rome', 3)],
    })
    expect(idsOf(evaluate(state))).toEqual([
      'builtin:inCity',
      'builtin:outCity',
    ])
  })
})

describe('constraintLabel', () => {
  it('stayNights は min/max の組み合わせで文面が変わる', () => {
    const base = {
      id: 'c1',
      enabled: true,
      severity: 'must' as const,
      kind: 'stayNights' as const,
      cityId: 'paris',
    }
    expect(constraintLabel({ ...base, min: 3, max: 3 })).toBe(
      'パリ にちょうど 3 泊する',
    )
    expect(constraintLabel({ ...base, min: 2, max: 4 })).toBe(
      'パリ に 2〜4 泊する',
    )
    expect(constraintLabel({ ...base, min: 2, max: null })).toBe(
      'パリ に 2 泊以上する',
    )
    expect(constraintLabel({ ...base, min: null, max: 4 })).toBe(
      'パリ は 4 泊までにする',
    )
  })

  it('他の種類も日本語の穴埋め文になる', () => {
    expect(
      constraintLabel({
        id: 'c2',
        enabled: true,
        severity: 'must',
        kind: 'presenceOnDate',
        cityId: 'rome',
        date: '2026-06-16',
      }),
    ).toBe('6/16(火) は ローマ にいる')
    expect(
      constraintLabel({
        id: 'c3',
        enabled: true,
        severity: 'want',
        kind: 'order',
        beforeCityId: 'paris',
        afterCityId: 'rome',
      }),
    ).toBe('パリ を ローマ より先に回る')
    expect(
      constraintLabel({
        id: 'c4',
        enabled: true,
        severity: 'must',
        kind: 'mustVisit',
        cityId: 'venice',
      }),
    ).toBe('ヴェネツィア には必ず行く')
  })
})

describe('parseTripState', () => {
  it('正常なデータは往復できる', () => {
    const state = makeState({
      inCityId: 'paris',
      outCityId: 'rome',
      poolCityIds: ['venice'],
      stays: [stay('s1', 'paris', 4), stay('s2', 'rome', 3)],
      legModes: { 'paris>rome': 'flight' },
      constraints: [
        {
          id: 'c1',
          enabled: true,
          severity: 'want',
          kind: 'stayNights',
          cityId: 'paris',
          min: 3,
          max: null,
        },
      ],
    })
    expect(parseTripState(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('オブジェクトでない・schemaVersion が違うものは null', () => {
    expect(parseTripState(null)).toBeNull()
    expect(parseTripState('{}')).toBeNull()
    expect(parseTripState({ ...makeState(), schemaVersion: 2 })).toBeNull()
    expect(
      parseTripState({ ...makeState(), startDate: '2026-6-12' }),
    ).toBeNull()
  })

  it('カタログにない都市 ID は黙って落とす', () => {
    const parsed = parseTripState({
      ...makeState(),
      inCityId: 'atlantis',
      outCityId: 'paris',
      poolCityIds: ['venice', 'atlantis'],
      stays: [
        stay('s1', 'paris', 4),
        stay('s2', 'atlantis', 2),
        { id: 's3', cityId: 'rome', nights: 0 }, // 泊数が不正
      ],
    })
    expect(parsed).not.toBeNull()
    expect(parsed?.inCityId).toBeNull()
    expect(parsed?.outCityId).toBe('paris')
    expect(parsed?.poolCityIds).toEqual(['venice'])
    expect(parsed?.stays.map((s) => s.id)).toEqual(['s1'])
  })

  it('形の壊れた制約は落とす', () => {
    const parsed = parseTripState({
      ...makeState(),
      constraints: [
        {
          id: 'ok',
          enabled: true,
          severity: 'must',
          kind: 'mustVisit',
          cityId: 'rome',
        },
        { id: 'no-kind', enabled: true, severity: 'must' },
        {
          id: 'bad-kind',
          enabled: true,
          severity: 'must',
          kind: 'weather',
          cityId: 'rome',
        },
        {
          id: 'bad-severity',
          enabled: true,
          severity: 'maybe',
          kind: 'mustVisit',
          cityId: 'rome',
        },
        {
          id: 'missing-field',
          enabled: true,
          severity: 'must',
          kind: 'order',
          beforeCityId: 'paris',
        },
        {
          enabled: true,
          severity: 'must',
          kind: 'mustVisit',
          cityId: 'rome',
        }, // id なし
        null,
      ],
    })
    expect(parsed?.constraints.map((c) => c.id)).toEqual(['ok'])
  })

  it('未知の移動手段は落とす', () => {
    const parsed = parseTripState({
      ...makeState(),
      legModes: { 'paris>rome': 'flight', 'rome>venice': 'teleport' },
    })
    expect(parsed?.legModes).toEqual({ 'paris>rome': 'flight' })
  })
})
