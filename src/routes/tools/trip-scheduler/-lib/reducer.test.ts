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

  it('落とした位置に挿入する。チップは候補プールに残る', () => {
    const next = tripReducer(base, {
      type: 'placeFromPoolAt',
      cityId: 'vienna',
      toIndex: 1,
    })
    expect(cityIdsOf(next)).toEqual(['paris', 'vienna', 'rome'])
    expect(next.poolCityIds).toEqual(['vienna', 'prague'])
  })

  it('配置済みの都市をもう一度差し込める(再訪の滞在が増える)', () => {
    const once = tripReducer(base, {
      type: 'placeFromPoolAt',
      cityId: 'vienna',
      toIndex: 1,
    })
    const twice = tripReducer(once, {
      type: 'placeFromPoolAt',
      cityId: 'vienna',
      toIndex: 3,
    })
    expect(cityIdsOf(twice)).toEqual(['paris', 'vienna', 'rome', 'vienna'])
    expect(twice.stays.map((s) => s.id)).toHaveLength(4)
    expect(new Set(twice.stays.map((s) => s.id)).size).toBe(4)
    expect(twice.poolCityIds).toEqual(['vienna', 'prague'])
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
  it('末尾に追加する。チップは候補プールに残る', () => {
    const state = makeState({
      poolCityIds: ['vienna'],
      stays: [stay('s1', 'paris', 3)],
    })
    const next = tripReducer(state, { type: 'placeFromPool', cityId: 'vienna' })
    expect(cityIdsOf(next)).toEqual(['paris', 'vienna'])
    expect(next.poolCityIds).toEqual(['vienna'])
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

  it('「もう一度入れる」で同じ都市の2つ目の滞在ができる', () => {
    const state = makeState({
      poolCityIds: ['vienna'],
      stays: [stay('s1', 'paris', 3), stay('s2', 'vienna', 2)],
    })
    const next = tripReducer(state, { type: 'placeFromPool', cityId: 'vienna' })
    expect(cityIdsOf(next)).toEqual(['paris', 'vienna', 'vienna'])
    expect(next.stays.filter((s) => s.cityId === 'vienna')).toHaveLength(2)
    expect(next.poolCityIds).toEqual(['vienna'])
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

  it('すでに候補プールにある都市は二重に追加しない', () => {
    const state = makeState({
      poolCityIds: ['rome'],
      stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
    })
    const next = tripReducer(state, { type: 'removeStay', stayId: 's2' })
    expect(next.poolCityIds).toEqual(['rome'])
  })

  it('同じ都市の滞在が残っていても、候補になければ候補に戻す', () => {
    const state = makeState({
      stays: [
        stay('s1', 'paris', 3),
        stay('s2', 'rome', 2),
        stay('s3', 'paris', 1),
      ],
    })
    const next = tripReducer(state, { type: 'removeStay', stayId: 's3' })
    expect(cityIdsOf(next)).toEqual(['paris', 'rome'])
    expect(next.poolCityIds).toEqual(['paris'])
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

describe('tripReducer / IN・OUT 都市(端で判定する)', () => {
  it('IN 都市を選ぶと先頭の滞在として置かれる。候補プールのチップは残る', () => {
    const state = makeState({
      poolCityIds: ['paris'],
      stays: [stay('s1', 'rome', 2)],
    })
    const next = tripReducer(state, { type: 'setInCity', cityId: 'paris' })
    expect(next.inCityId).toBe('paris')
    expect(cityIdsOf(next)).toEqual(['paris', 'rome'])
    expect(next.poolCityIds).toEqual(['paris'])
  })

  it('OUT 都市を選ぶと末尾の滞在として置かれる', () => {
    const state = makeState({ stays: [stay('s1', 'paris', 3)] })
    const next = tripReducer(state, { type: 'setOutCity', cityId: 'rome' })
    expect(cityIdsOf(next)).toEqual(['paris', 'rome'])
    expect(next.stays[1].nights).toBe(DEFAULT_STAY_NIGHTS)
  })

  it('先頭がすでに IN 都市なら何も足さない', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
    })
    const next = tripReducer(state, { type: 'setInCity', cityId: 'paris' })
    expect(cityIdsOf(next)).toEqual(['paris', 'rome'])
  })

  it('末尾がすでに OUT 都市なら何も足さない', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
    })
    const next = tripReducer(state, { type: 'setOutCity', cityId: 'rome' })
    expect(cityIdsOf(next)).toEqual(['paris', 'rome'])
  })

  it('日程の途中にある都市を IN にすると、先頭にもう1つ立つ', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
    })
    const next = tripReducer(state, { type: 'setInCity', cityId: 'rome' })
    expect(cityIdsOf(next)).toEqual(['rome', 'paris', 'rome'])
  })

  it('パリ IN・パリ OUT で、周遊のあとに最後のパリが立つ', () => {
    const state = makeState({
      poolCityIds: ['paris', 'rome'],
      stays: [stay('s1', 'paris', 2), stay('s2', 'rome', 3)],
      inCityId: 'paris',
    })
    const next = tripReducer(state, { type: 'setOutCity', cityId: 'paris' })
    expect(cityIdsOf(next)).toEqual(['paris', 'rome', 'paris'])
    expect(next.outCityId).toBe('paris')
  })

  it('滞在が [パリ] だけなら IN=OUT=パリ でも増えない(1滞在で成立)', () => {
    const start = makeState({ stays: [] })
    const withIn = tripReducer(start, { type: 'setInCity', cityId: 'paris' })
    expect(cityIdsOf(withIn)).toEqual(['paris'])
    const withOut = tripReducer(withIn, {
      type: 'setOutCity',
      cityId: 'paris',
    })
    expect(cityIdsOf(withOut)).toEqual(['paris'])
  })
})

describe('tripReducer / addToPool', () => {
  it('すでに候補にある都市は二重に追加しない', () => {
    const state = makeState({ poolCityIds: ['vienna'] })
    expect(tripReducer(state, { type: 'addToPool', cityId: 'vienna' })).toBe(
      state,
    )
  })

  it('日程に入っている都市も候補に追加できる(再訪させたいとき用)', () => {
    const state = makeState({ stays: [stay('s1', 'paris', 3)] })
    const next = tripReducer(state, { type: 'addToPool', cityId: 'paris' })
    expect(next.poolCityIds).toEqual(['paris'])
    expect(cityIdsOf(next)).toEqual(['paris'])
  })
})

describe('tripReducer / removeFromPool', () => {
  it('候補から外しても、日程に入れてある滞在はそのまま残る', () => {
    const state = makeState({
      poolCityIds: ['paris'],
      stays: [stay('s1', 'paris', 3)],
    })
    const next = tripReducer(state, { type: 'removeFromPool', cityId: 'paris' })
    expect(next.poolCityIds).toEqual([])
    expect(cityIdsOf(next)).toEqual(['paris'])
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
