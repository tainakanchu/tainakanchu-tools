import { describe, expect, it } from 'vitest'
import { deriveTrip, legKeyOf } from './derive'
import type { Stay, TripState } from './types'

function makeState(overrides: Partial<TripState> = {}): TripState {
  return {
    schemaVersion: 1,
    startDate: '2026-06-12',
    endDate: '2026-06-26', // 14 泊 15 日
    inCityId: 'paris',
    outCityId: 'paris',
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

describe('deriveTrip: 泊の帳簿', () => {
  it('滞在なしなら全泊が未割り当て', () => {
    const derived = deriveTrip(makeState())
    expect(derived.totalNights).toBe(14)
    expect(derived.totalDays).toBe(15)
    expect(derived.unassignedNights).toBe(14)
  })

  it('Σ泊数 + 夜行泊 + 未割り当て = 総泊数', () => {
    const state = makeState({
      stays: [
        stay('s1', 'paris', 4),
        stay('s2', 'rome', 3),
        stay('s3', 'florence', 2),
      ],
    })
    const derived = deriveTrip(state)
    expect(derived.assignedNights).toBe(9)
    expect(derived.unassignedNights).toBe(
      derived.totalNights - derived.assignedNights - derived.overnightLegNights,
    )
  })

  it('割り当て超過はマイナスになる', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 10), stay('s2', 'rome', 8)],
    })
    expect(deriveTrip(state).unassignedNights).toBeLessThan(0)
  })

  it('夜行列車を選ぶと泊を 1 消費する', () => {
    const base = makeState({
      stays: [stay('s1', 'paris', 4), stay('s2', 'vienna', 4)],
    })
    const withoutNight = deriveTrip(base)
    const withNight = deriveTrip({
      ...base,
      legModes: { [legKeyOf('paris', 'vienna')]: 'nightTrain' },
    })
    expect(withoutNight.overnightLegNights).toBe(0)
    expect(withNight.overnightLegNights).toBe(1)
    expect(withNight.unassignedNights).toBe(withoutNight.unassignedNights - 1)
  })
})

describe('deriveTrip: 日付窓', () => {
  it('昼行移動では前の滞在の出発日 = 次の滞在の到着日', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 4), stay('s2', 'rome', 3)],
    })
    const [w1, w2] = deriveTrip(state).windows
    expect(w1.arriveDay).toBe(0)
    expect(w1.departDay).toBe(4)
    expect(w2.arriveDay).toBe(4)
    expect(w2.departDay).toBe(7)
    expect(w1.arriveDate).toBe('2026-06-12')
    expect(w1.departDate).toBe('2026-06-16')
  })

  it('夜行移動では翌朝着になり日付が 1 日ずれる', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 4), stay('s2', 'vienna', 3)],
      legModes: { [legKeyOf('paris', 'vienna')]: 'nightTrain' },
    })
    const [w1, w2] = deriveTrip(state).windows
    expect(w1.departDay).toBe(4) // 4 日目の夜に乗車
    expect(w2.arriveDay).toBe(5) // 翌朝着
  })

  it('夜行にすると実質観光日数が増える(出発日も到着日も丸ごと使える)', () => {
    const base = makeState({
      stays: [stay('s1', 'paris', 5), stay('s2', 'vienna', 5)],
    })
    const dayTrip = deriveTrip(base)
    const nightTrip = deriveTrip({
      ...base,
      legModes: { [legKeyOf('paris', 'vienna')]: 'nightTrain' },
    })
    expect(nightTrip.metrics.totalEffectiveDays).toBeGreaterThan(
      dayTrip.metrics.totalEffectiveDays,
    )
  })

  it('legs の移動日は出発都市の最終日', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 4), stay('s2', 'rome', 3)],
    })
    const derived = deriveTrip(state)
    expect(derived.legs).toHaveLength(1)
    expect(derived.legs[0].dayIndex).toBe(4)
  })
})

describe('deriveTrip: 同じ都市が隣り合うとき(再訪で連続した滞在)', () => {
  const adjacent = makeState({
    stays: [
      stay('s1', 'paris', 2),
      stay('s2', 'paris', 3),
      stay('s3', 'rome', 2),
    ],
  })

  it('隣接する同一都市の間には移動 leg を作らない', () => {
    const derived = deriveTrip(adjacent)
    expect(derived.legs.map((l) => l.key)).toEqual(['paris>rome'])
    expect(derived.metrics.legCount).toBe(1)
    expect(derived.metrics.packingCount).toBe(1)
  })

  it('離れた同一都市(パリ IN・パリ OUT)には移動 leg が立つ', () => {
    const state = makeState({
      stays: [
        stay('s1', 'paris', 2),
        stay('s2', 'rome', 3),
        stay('s3', 'paris', 3),
      ],
    })
    expect(deriveTrip(state).legs.map((l) => l.key)).toEqual([
      'paris>rome',
      'rome>paris',
    ])
  })

  it('泊の帳簿はそのまま成立する', () => {
    const derived = deriveTrip(adjacent)
    expect(derived.assignedNights).toBe(7)
    expect(derived.overnightLegNights).toBe(0)
    expect(derived.unassignedNights).toBe(
      derived.totalNights - derived.assignedNights - derived.overnightLegNights,
    )
  })

  it('日付窓が連続する(前の滞在の出発日 = 次の到着日、移動で削られない)', () => {
    const [w1, w2, w3] = deriveTrip(adjacent).windows
    expect(w1.arriveDay).toBe(0)
    expect(w1.departDay).toBe(2)
    expect(w2.arriveDay).toBe(2)
    expect(w2.departDay).toBe(5)
    expect(w2.arriveDate).toBe(w1.departDate)
    expect(w3.arriveDay).toBe(5)
  })

  it('連続に分けても、1つの滞在にまとめたときと日程は変わらない', () => {
    const merged = makeState({
      stays: [stay('m1', 'paris', 5), stay('m2', 'rome', 2)],
    })
    const split = deriveTrip(adjacent)
    const whole = deriveTrip(merged)
    expect(split.metrics.totalEffectiveDays).toBe(
      whole.metrics.totalEffectiveDays,
    )
    expect(split.windows.at(-1)?.departDate).toBe(
      whole.windows.at(-1)?.departDate,
    )
    expect(split.legs[0].dayIndex).toBe(whole.legs[0].dayIndex)
  })
})

describe('deriveTrip: 指標', () => {
  it('荷造り回数 = 移動回数、1 泊都市を数える', () => {
    const state = makeState({
      stays: [
        stay('s1', 'paris', 4),
        stay('s2', 'florence', 1),
        stay('s3', 'rome', 3),
      ],
    })
    const derived = deriveTrip(state)
    expect(derived.metrics.legCount).toBe(2)
    expect(derived.metrics.packingCount).toBe(2)
    expect(derived.metrics.oneNightStayCount).toBe(1)
  })
})

describe('deriveTrip: 移動手段の選択の保持', () => {
  it('並べ替えても都市ペア単位の選択が生きる', () => {
    const legModes = { [legKeyOf('paris', 'rome')]: 'flight' as const }
    const state = makeState({
      stays: [
        stay('s1', 'paris', 4),
        stay('s2', 'rome', 3),
        stay('s3', 'florence', 2),
      ],
      legModes,
    })
    expect(deriveTrip(state).legs[0].chosen.mode).toBe('flight')

    // フィレンツェを間に挟むと paris>rome の leg 自体が消える(選択は温存)
    const reordered = makeState({
      stays: [
        stay('s1', 'paris', 4),
        stay('s3', 'florence', 2),
        stay('s2', 'rome', 3),
      ],
      legModes,
    })
    const derived = deriveTrip(reordered)
    expect(derived.legs.map((l) => l.key)).toEqual([
      'paris>florence',
      'florence>rome',
    ])
  })

  it('候補にない手段が保存されていたら推奨にフォールバック', () => {
    // ローマ→フィレンツェに飛行機は候補として存在しない
    const state = makeState({
      stays: [stay('s1', 'rome', 3), stay('s2', 'florence', 2)],
      legModes: { [legKeyOf('rome', 'florence')]: 'flight' },
    })
    expect(deriveTrip(state).legs[0].chosen.mode).toBe('train')
  })
})
