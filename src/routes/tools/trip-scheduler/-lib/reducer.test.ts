import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STAY_NIGHTS,
  createHistory,
  historyReducer,
  tripReducer,
} from './reducer'
import type { Stay, TripState } from '../../../../lib/trip-scheduler/types'

function makeState(overrides: Partial<TripState> = {}): TripState {
  return {
    schemaVersion: 1,
    startDate: '2026-06-12',
    endDate: '2026-06-22', // 10 泊 11 日
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

/** 並び順の確認は都市 ID の列で十分 */
function cityIdsOf(state: TripState): Array<string> {
  return state.stays.map((s) => s.cityId)
}

describe('tripReducer / reorderStay(ドラッグでの並べ替え)', () => {
  const base = makeState({
    stays: [
      stay('s1', 'paris', 3),
      stay('s2', 'rome', 2),
      stay('s3', 'vienna', 2),
    ],
  })

  it('下方向へ動かすと、掴んだ滞在が指定位置に入る', () => {
    const next = tripReducer(base, {
      type: 'reorderStay',
      stayId: 's1',
      toIndex: 2,
    })
    expect(cityIdsOf(next)).toEqual(['rome', 'vienna', 'paris'])
  })

  it('上方向へ動かすと、掴んだ滞在が指定位置に入る', () => {
    const next = tripReducer(base, {
      type: 'reorderStay',
      stayId: 's3',
      toIndex: 0,
    })
    expect(cityIdsOf(next)).toEqual(['vienna', 'paris', 'rome'])
  })

  it('同じ位置に落としたときは同一参照を返す(履歴を汚さない)', () => {
    const next = tripReducer(base, {
      type: 'reorderStay',
      stayId: 's2',
      toIndex: 1,
    })
    expect(next).toBe(base)
  })

  it('リストの外に落としても端に丸める', () => {
    const down = tripReducer(base, {
      type: 'reorderStay',
      stayId: 's1',
      toIndex: 99,
    })
    expect(cityIdsOf(down)).toEqual(['rome', 'vienna', 'paris'])

    const up = tripReducer(base, {
      type: 'reorderStay',
      stayId: 's3',
      toIndex: -5,
    })
    expect(cityIdsOf(up)).toEqual(['vienna', 'paris', 'rome'])
  })

  it('並べ替えても泊数と候補プールは変わらない', () => {
    const withPool = makeState({
      poolCityIds: ['prague'],
      stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
    })
    const next = tripReducer(withPool, {
      type: 'reorderStay',
      stayId: 's2',
      toIndex: 0,
    })
    expect(next.stays.map((s) => s.nights)).toEqual([2, 3])
    expect(next.poolCityIds).toEqual(['prague'])
  })

  it('存在しない滞在 ID は何もしない', () => {
    const next = tripReducer(base, {
      type: 'reorderStay',
      stayId: 'missing',
      toIndex: 0,
    })
    expect(next).toBe(base)
  })
})

describe('tripReducer / placeFromPoolAt(候補プールからの差し込み)', () => {
  const base = makeState({
    poolCityIds: ['vienna', 'prague'],
    stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
  })

  it('落とした位置に挿入し、候補プールからは取り除く', () => {
    const next = tripReducer(base, {
      type: 'placeFromPoolAt',
      cityId: 'vienna',
      toIndex: 1,
    })
    expect(cityIdsOf(next)).toEqual(['paris', 'vienna', 'rome'])
    expect(next.poolCityIds).toEqual(['prague'])
  })

  it('先頭にも落とせる', () => {
    const next = tripReducer(base, {
      type: 'placeFromPoolAt',
      cityId: 'prague',
      toIndex: 0,
    })
    expect(cityIdsOf(next)).toEqual(['prague', 'paris', 'rome'])
  })

  it('入れた滞在は 2 泊から始まる', () => {
    expect(DEFAULT_STAY_NIGHTS).toBe(2)
    const next = tripReducer(base, {
      type: 'placeFromPoolAt',
      cityId: 'vienna',
      toIndex: 0,
    })
    expect(next.stays[0].nights).toBe(DEFAULT_STAY_NIGHTS)
  })

  it('末尾より後ろの位置は末尾に丸める', () => {
    const next = tripReducer(base, {
      type: 'placeFromPoolAt',
      cityId: 'vienna',
      toIndex: 42,
    })
    expect(cityIdsOf(next)).toEqual(['paris', 'rome', 'vienna'])
  })

  it('位置を自分で決めているので OUT 都市の手前には寄せない', () => {
    const withOut = makeState({
      outCityId: 'rome',
      poolCityIds: ['vienna'],
      stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
    })
    const next = tripReducer(withOut, {
      type: 'placeFromPoolAt',
      cityId: 'vienna',
      toIndex: 2,
    })
    expect(cityIdsOf(next)).toEqual(['paris', 'rome', 'vienna'])
  })
})

describe('tripReducer / placeFromPool(ボタンで日程に入れる)', () => {
  it('末尾に追加する', () => {
    const state = makeState({
      poolCityIds: ['vienna'],
      stays: [stay('s1', 'paris', 3)],
    })
    const next = tripReducer(state, { type: 'placeFromPool', cityId: 'vienna' })
    expect(cityIdsOf(next)).toEqual(['paris', 'vienna'])
    expect(next.poolCityIds).toEqual([])
  })

  it('末尾が OUT 都市ならその手前に入れる', () => {
    const state = makeState({
      outCityId: 'rome',
      poolCityIds: ['vienna'],
      stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
    })
    const next = tripReducer(state, { type: 'placeFromPool', cityId: 'vienna' })
    expect(cityIdsOf(next)).toEqual(['paris', 'vienna', 'rome'])
  })
})

describe('tripReducer / removeStay', () => {
  it('日程から外した都市は候補プールに戻る', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
    })
    const next = tripReducer(state, { type: 'removeStay', stayId: 's2' })
    expect(cityIdsOf(next)).toEqual(['paris'])
    expect(next.poolCityIds).toEqual(['rome'])
  })

  it('同じ都市がまだ日程に残っていれば候補プールには戻さない', () => {
    const state = makeState({
      stays: [
        stay('s1', 'paris', 3),
        stay('s2', 'rome', 2),
        stay('s3', 'paris', 1),
      ],
    })
    const next = tripReducer(state, { type: 'removeStay', stayId: 's3' })
    expect(cityIdsOf(next)).toEqual(['paris', 'rome'])
    expect(next.poolCityIds).toEqual([])
  })

  it('存在しない滞在 ID は何もしない', () => {
    const state = makeState({ stays: [stay('s1', 'paris', 3)] })
    expect(tripReducer(state, { type: 'removeStay', stayId: 'missing' })).toBe(
      state,
    )
  })
})

describe('tripReducer / changeNights(±で1泊ずつ)', () => {
  const base = makeState({
    stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 1)],
  })

  it('+1 で泊数が増える', () => {
    const next = tripReducer(base, {
      type: 'changeNights',
      stayId: 's1',
      delta: 1,
    })
    expect(next.stays.map((s) => s.nights)).toEqual([4, 1])
  })

  it('−1 で泊数が減る', () => {
    const next = tripReducer(base, {
      type: 'changeNights',
      stayId: 's1',
      delta: -1,
    })
    expect(next.stays.map((s) => s.nights)).toEqual([2, 1])
  })

  it('1泊で − を押すと日程から外れて候補プールに戻る', () => {
    const next = tripReducer(base, {
      type: 'changeNights',
      stayId: 's2',
      delta: -1,
    })
    expect(cityIdsOf(next)).toEqual(['paris'])
    expect(next.poolCityIds).toEqual(['rome'])
  })
})

describe('tripReducer / moveStay(▲▼で1つずつ)', () => {
  const base = makeState({
    stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
  })

  it('隣の滞在と入れ替わる', () => {
    const next = tripReducer(base, {
      type: 'moveStay',
      stayId: 's2',
      delta: -1,
    })
    expect(cityIdsOf(next)).toEqual(['rome', 'paris'])
  })

  it('端でさらに動かそうとしても同一参照を返す', () => {
    expect(
      tripReducer(base, { type: 'moveStay', stayId: 's1', delta: -1 }),
    ).toBe(base)
    expect(
      tripReducer(base, { type: 'moveStay', stayId: 's2', delta: 1 }),
    ).toBe(base)
  })
})

describe('tripReducer / IN・OUT 都市', () => {
  it('IN 都市を選ぶと先頭の滞在として置かれ、候補プールから消える', () => {
    const state = makeState({
      poolCityIds: ['paris'],
      stays: [stay('s1', 'rome', 2)],
    })
    const next = tripReducer(state, { type: 'setInCity', cityId: 'paris' })
    expect(next.inCityId).toBe('paris')
    expect(cityIdsOf(next)).toEqual(['paris', 'rome'])
    expect(next.poolCityIds).toEqual([])
  })

  it('OUT 都市を選ぶと末尾の滞在として置かれる', () => {
    const state = makeState({ stays: [stay('s1', 'paris', 3)] })
    const next = tripReducer(state, { type: 'setOutCity', cityId: 'rome' })
    expect(cityIdsOf(next)).toEqual(['paris', 'rome'])
  })

  it('すでに日程に入っている都市を IN にしても並びは変えない', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
    })
    const next = tripReducer(state, { type: 'setInCity', cityId: 'rome' })
    expect(cityIdsOf(next)).toEqual(['paris', 'rome'])
  })
})

describe('tripReducer / addToPool', () => {
  it('すでに候補にある都市は二重に追加しない', () => {
    const state = makeState({ poolCityIds: ['vienna'] })
    expect(tripReducer(state, { type: 'addToPool', cityId: 'vienna' })).toBe(
      state,
    )
  })

  it('すでに日程に入っている都市は候補に追加しない', () => {
    const state = makeState({ stays: [stay('s1', 'paris', 3)] })
    expect(tripReducer(state, { type: 'addToPool', cityId: 'paris' })).toBe(
      state,
    )
  })
})

describe('historyReducer(Undo/Redo)', () => {
  const initial = makeState({
    poolCityIds: ['vienna'],
    stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
  })

  it('ドラッグの並べ替えは1手として積まれ、Undo 1回で戻せる', () => {
    const edited = historyReducer(createHistory(initial), {
      type: 'reorderStay',
      stayId: 's1',
      toIndex: 1,
    })
    expect(cityIdsOf(edited.present)).toEqual(['rome', 'paris'])
    expect(edited.past).toHaveLength(1)

    const undone = historyReducer(edited, { type: 'undo' })
    expect(undone.present).toBe(initial)

    const redone = historyReducer(undone, { type: 'redo' })
    expect(cityIdsOf(redone.present)).toEqual(['rome', 'paris'])
  })

  it('状態が変わらない操作は履歴を汚さない', () => {
    const history = createHistory(initial)
    const same = historyReducer(history, {
      type: 'reorderStay',
      stayId: 's1',
      toIndex: 0,
    })
    expect(same).toBe(history)
    expect(same.past).toHaveLength(0)
  })

  it('Undo したあとに編集すると、やり直しの分は捨てられる', () => {
    const edited = historyReducer(createHistory(initial), {
      type: 'placeFromPoolAt',
      cityId: 'vienna',
      toIndex: 0,
    })
    const undone = historyReducer(edited, { type: 'undo' })
    const rewritten = historyReducer(undone, {
      type: 'changeNights',
      stayId: 's1',
      delta: 1,
    })
    expect(rewritten.future).toEqual([])
    expect(cityIdsOf(rewritten.present)).toEqual(['paris', 'rome'])
  })

  it('履歴が空のときの Undo/Redo は何もしない', () => {
    const history = createHistory(initial)
    expect(historyReducer(history, { type: 'undo' })).toBe(history)
    expect(historyReducer(history, { type: 'redo' })).toBe(history)
  })
})
