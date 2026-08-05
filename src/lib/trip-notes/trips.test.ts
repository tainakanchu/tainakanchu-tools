import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  activeStateOf,
  addTripToLibrary,
  createInitialLibrary,
  loadLibrary,
  parseTripLibrary,
  saveLibrary,
  withActiveState,
} from './trips'
import { createInitialState } from './storage'
import type { TripLibrary } from './trips'
import type { TripNotesState } from './types'

/** 旧キー。移行元として読むだけで、書き戻しはしない */
const LEGACY_KEY = 'trip-notes:v1'
const LIBRARY_KEY = 'trip-notes:trips:v1'

/**
 * storage.test.ts と同じやり方で、node 環境に最小限の window を差し込む。
 * 中身を直接覗きたい(旧キーが残っているかを見たい)ので Map を返す。
 */
function installFakeStorage(): Map<string, string> {
  const store = new Map<string, string>()
  const localStorage: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
  // @ts-expect-error node 環境に window が無いので最小限のフェイクを差し込む
  globalThis.window = { localStorage }
  return store
}

function makeState(over: Partial<TripNotesState> = {}): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'マルタ9月',
    startDate: '2026-09-05',
    endDate: '2026-09-20',
    pinnedTz: 'Europe/Malta',
    bookings: [],
    emergencyContacts: [],
    ...over,
  }
}

function makeLibrary(): TripLibrary {
  return {
    schemaVersion: 1,
    activeTripId: 'trip-b',
    trips: [
      { id: 'trip-a', state: makeState({ tripTitle: 'マルタ9月' }) },
      { id: 'trip-b', state: makeState({ tripTitle: '台湾年末' }) },
    ],
  }
}

let store: Map<string, string>

beforeEach(() => {
  store = installFakeStorage()
})

afterEach(() => {
  // @ts-expect-error テスト用に差し込んだ window を必ず後片付けする
  delete globalThis.window
})

describe('createInitialLibrary', () => {
  it('旅程 1 件だけの入れ物を作り、それがアクティブになる', () => {
    const library = createInitialLibrary('2026-06-12')
    expect(library.trips).toHaveLength(1)
    expect(library.activeTripId).toBe(library.trips[0].id)
    expect(activeStateOf(library)).toEqual(createInitialState('2026-06-12'))
  })
})

describe('parseTripLibrary', () => {
  it('正常な入れ物がそのまま復元される', () => {
    const library = makeLibrary()
    expect(parseTripLibrary(library)).toEqual(library)
  })

  it('トップレベルが壊れていれば null', () => {
    expect(parseTripLibrary(null)).toBeNull()
    expect(parseTripLibrary('not-an-object')).toBeNull()
    expect(parseTripLibrary({ ...makeLibrary(), schemaVersion: 2 })).toBeNull()
    expect(parseTripLibrary({ ...makeLibrary(), trips: 'なにか' })).toBeNull()
  })

  it('壊れた旅程だけが落ち、残りは活きる', () => {
    const parsed = parseTripLibrary({
      schemaVersion: 1,
      activeTripId: 'trip-a',
      trips: [
        { id: 'trip-a', state: makeState({ tripTitle: '生き残る旅程' }) },
        { id: 'trip-broken', state: { schemaVersion: 2 } }, // state が壊れている
        { state: makeState() }, // id が無い
        'not-an-object',
      ],
    })
    expect(parsed?.trips.map((trip) => trip.id)).toEqual(['trip-a'])
    expect(parsed?.trips[0].state.tripTitle).toBe('生き残る旅程')
  })

  it('全滅したら null(初期状態の生成は loadLibrary の仕事)', () => {
    expect(
      parseTripLibrary({
        schemaVersion: 1,
        activeTripId: 'trip-a',
        trips: [{ id: 'trip-a', state: { schemaVersion: 99 } }],
      }),
    ).toBeNull()
    expect(
      parseTripLibrary({ schemaVersion: 1, activeTripId: 'x', trips: [] }),
    ).toBeNull()
  })

  it('activeTripId が trips に無ければ先頭に寄る', () => {
    const parsed = parseTripLibrary({
      ...makeLibrary(),
      activeTripId: 'trip-消えた',
    })
    expect(parsed?.activeTripId).toBe('trip-a')

    // 指定そのものが壊れている場合も同じ扱い
    expect(
      parseTripLibrary({ ...makeLibrary(), activeTripId: 42 })?.activeTripId,
    ).toBe('trip-a')
  })

  it('アクティブな旅程が壊れて落ちても、残った旅程の先頭が開く', () => {
    const parsed = parseTripLibrary({
      schemaVersion: 1,
      activeTripId: 'trip-broken',
      trips: [
        { id: 'trip-broken', state: { schemaVersion: 2 } },
        { id: 'trip-ok', state: makeState() },
      ],
    })
    expect(parsed?.activeTripId).toBe('trip-ok')
  })
})

describe('loadLibrary / 旧キーからの移行', () => {
  it('旧キーだけがあれば 1 件の旅程として取り込み、アクティブにする', () => {
    const legacy = makeState({ tripTitle: '移行される旅程' })
    store.set(LEGACY_KEY, JSON.stringify(legacy))

    const library = loadLibrary('2026-06-12')
    expect(library.trips).toHaveLength(1)
    expect(library.activeTripId).toBe(library.trips[0].id)
    expect(activeStateOf(library)).toEqual(legacy)
  })

  it('移行しても旧キーは消さない(実装を間違えたときの最後の綱にする)', () => {
    const legacy = makeState({ tripTitle: '移行される旅程' })
    store.set(LEGACY_KEY, JSON.stringify(legacy))

    loadLibrary('2026-06-12')
    expect(store.get(LEGACY_KEY)).toBe(JSON.stringify(legacy))
  })

  it('移行しただけでは新キーに書かない(保存は呼び出し側の責務)', () => {
    store.set(LEGACY_KEY, JSON.stringify(makeState()))
    loadLibrary('2026-06-12')
    expect(store.has(LIBRARY_KEY)).toBe(false)
  })

  it('新キーと旧キーの両方があれば新キーが勝つ', () => {
    store.set(LEGACY_KEY, JSON.stringify(makeState({ tripTitle: '古い方' })))
    saveLibrary(makeLibrary())

    const library = loadLibrary('2026-06-12')
    expect(library.trips.map((trip) => trip.state.tripTitle)).toEqual([
      'マルタ9月',
      '台湾年末',
    ])
    expect(activeStateOf(library).tripTitle).toBe('台湾年末')
  })

  it('新キーが壊れていれば旧キーへ落ちる', () => {
    store.set(LIBRARY_KEY, '{壊れた JSON')
    store.set(
      LEGACY_KEY,
      JSON.stringify(makeState({ tripTitle: '救出された' })),
    )

    expect(activeStateOf(loadLibrary('2026-06-12')).tripTitle).toBe(
      '救出された',
    )
  })

  it('新キーの旅程が全滅したら初期状態 1 件になる', () => {
    store.set(
      LIBRARY_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeTripId: 'trip-a',
        trips: [{ id: 'trip-a', state: { schemaVersion: 99 } }],
      }),
    )

    const library = loadLibrary('2026-06-12')
    expect(library.trips).toHaveLength(1)
    expect(activeStateOf(library)).toEqual(createInitialState('2026-06-12'))
  })

  it('どちらのキーも無ければ初期状態 1 件になる', () => {
    const library = loadLibrary('2026-06-12')
    expect(library.trips).toHaveLength(1)
    expect(activeStateOf(library)).toEqual(createInitialState('2026-06-12'))
  })

  it('window が無い環境でも例外を投げず初期状態を返す', () => {
    // @ts-expect-error 保存できない環境(プライベートモード等)の再現
    delete globalThis.window
    expect(() => loadLibrary('2026-06-12')).not.toThrow()
    expect(loadLibrary('2026-06-12').trips).toHaveLength(1)
  })
})

describe('saveLibrary / loadLibrary のラウンドトリップ', () => {
  it('保存した内容がそのまま読み戻る', () => {
    const library = makeLibrary()
    saveLibrary(library)
    expect(loadLibrary('2026-06-12')).toEqual(library)
  })

  it('window が無い環境では saveLibrary は例外を投げない', () => {
    // @ts-expect-error 保存できない環境(プライベートモード等)の再現
    delete globalThis.window
    expect(() => saveLibrary(makeLibrary())).not.toThrow()
  })
})

describe('addTripToLibrary', () => {
  it('末尾に足して、足した旅程がアクティブになる', () => {
    const added = makeState({ tripTitle: 'パリ・ローマの旅' })
    const next = addTripToLibrary(makeLibrary(), added)

    expect(next.trips).toHaveLength(3)
    expect(next.trips[2].state).toEqual(added)
    expect(next.activeTripId).toBe(next.trips[2].id)
    expect(activeStateOf(next)).toEqual(added)
  })

  it('既存の旅程には触れない(旅程パズルからの引き継ぎで消えないこと)', () => {
    const before = makeLibrary()
    const next = addTripToLibrary(before, makeState({ tripTitle: '追加分' }))

    expect(next.trips.slice(0, 2)).toEqual(before.trips)
    // 元の入れ物も書き換えない
    expect(before.trips).toHaveLength(2)
    expect(before.activeTripId).toBe('trip-b')
  })
})

describe('activeStateOf / withActiveState', () => {
  it('アクティブな旅程だけが差し替わる', () => {
    const edited = makeState({ tripTitle: '書き換えた台湾年末' })
    const next = withActiveState(makeLibrary(), edited)

    expect(activeStateOf(next)).toEqual(edited)
    // 別の旅程は巻き込まない
    expect(next.trips[0].state.tripTitle).toBe('マルタ9月')
    expect(next.activeTripId).toBe('trip-b')
  })
})
