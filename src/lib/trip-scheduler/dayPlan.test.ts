import { describe, expect, it } from 'vitest'
import { buildDayPlan } from './dayPlan'
import { deriveTrip, legKeyOf } from './derive'
import type { Stay, TripState } from './types'

function makeState(overrides: Partial<TripState> = {}): TripState {
  return {
    schemaVersion: 1,
    startDate: '2026-06-12', // 金曜
    endDate: '2026-06-19', // 7 泊 8 日
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

function planOf(state: TripState) {
  return buildDayPlan(state.startDate, deriveTrip(state))
}

describe('buildDayPlan', () => {
  it('旅程の全日ぶんのセルを日付つきで返す', () => {
    const state = makeState()
    const plan = planOf(state)
    expect(plan).toHaveLength(8)
    expect(plan[0].date).toBe('2026-06-12')
    expect(plan[0].dayIndex).toBe(0)
    expect(plan[7].date).toBe('2026-06-19')
  })

  it('滞在中の日はその都市が入る', () => {
    const plan = planOf(
      makeState({ stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 4)] }),
    )
    expect(plan[0].cityIds).toEqual(['paris'])
    expect(plan[1].cityIds).toEqual(['paris'])
    expect(plan[5].cityIds).toEqual(['rome'])
  })

  it('同一都市の連続滞在(再訪の続き)の境界日は都市が重複しない', () => {
    const plan = planOf(
      makeState({ stays: [stay('s1', 'paris', 2), stay('s2', 'paris', 3)] }),
    )
    // 2 泊 + 3 泊の境界日 (dayIndex 2) は両方の滞在窓に引っかかるが 1 つに畳む
    expect(plan[2].cityIds).toEqual(['paris'])
    expect(plan[2].travel).toBe(false)
  })

  it('昼行移動の日は出発都市と到着都市の 2 つを持つ', () => {
    const plan = planOf(
      makeState({ stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 4)] }),
    )
    // 3 泊したので 4 日目 (dayIndex 3) が移動日
    expect(plan[3].cityIds).toEqual(['paris', 'rome'])
    expect(plan[3].travel).toBe(true)
    expect(plan[3].overnight).toBe(false)
  })

  it('夜行移動の日は出発都市だけを持ち overnight になる', () => {
    const plan = planOf(
      makeState({
        stays: [stay('s1', 'paris', 3), stay('s2', 'vienna', 3)],
        legModes: { [legKeyOf('paris', 'vienna')]: 'nightTrain' },
      }),
    )
    expect(plan[3].cityIds).toEqual(['paris'])
    expect(plan[3].travel).toBe(true)
    expect(plan[3].overnight).toBe(true)
    // 翌朝着なので 5 日目からウィーン
    expect(plan[4].cityIds).toEqual(['vienna'])
    expect(plan[4].travel).toBe(false)
  })

  it('泊が余っている末尾は未割り当て(都市なし)になる', () => {
    const plan = planOf(makeState({ stays: [stay('s1', 'paris', 2)] }))
    expect(plan[2].cityIds).toEqual(['paris']) // 出発日
    expect(plan[3].cityIds).toEqual([])
    expect(plan[7].cityIds).toEqual([])
    expect(plan[3].travel).toBe(false)
  })

  it('滞在が 1 つもなければ全日が未割り当て', () => {
    const plan = planOf(makeState())
    expect(plan).toHaveLength(8)
    expect(plan.every((cell) => cell.cityIds.length === 0)).toBe(true)
  })

  it('泊数が超過していても旅程の日数ぶんしか返さない', () => {
    const plan = planOf(
      makeState({ stays: [stay('s1', 'paris', 10), stay('s2', 'rome', 10)] }),
    )
    expect(plan).toHaveLength(8)
    expect(plan[7].cityIds).toEqual(['paris'])
  })
})
