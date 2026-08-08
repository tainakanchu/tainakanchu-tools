import { afterEach, describe, expect, it } from 'vitest'
import { applyPastTrip, isPristineTrip, pushPastTrip } from './pastTrips'
import {
  clearState,
  createEmptyTraveler,
  createEmptyTrip,
  createInitialState,
  isPristineTraveler,
  loadState,
  parsePastTrip,
  parseState,
  parseTraveler,
  saveState,
} from './storage'
import type { ArrivalCardState, PastTrip, TripInfo } from './types'

/** localStorage の無い node 環境に差し込む最小のフェイク */
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

function filledState(): ArrivalCardState {
  return {
    trip: {
      ...createEmptyTrip(),
      dateOfEntry: '2026-03-15',
      entryFlightCode: 'BR : EVA Air',
      entryFlightNumber: '190',
      addressOrHotel: 'Grand Hyatt Taipei',
    },
    travelers: [
      {
        ...createEmptyTraveler(),
        id: 'traveler-1',
        englishName: 'YAMADA TARO',
        passportNumber: 'TR1234567',
      },
    ],
    pastTrips: [],
  }
}

function pastTrip(overrides: Partial<TripInfo> = {}): PastTrip {
  return {
    id: 'past-1',
    savedAt: '2026-01-01T00:00:00.000Z',
    trip: { ...createEmptyTrip(), ...overrides },
  }
}

describe('parseTraveler', () => {
  it('オブジェクトでなければ null', () => {
    expect(parseTraveler('YAMADA TARO')).toBeNull()
    expect(parseTraveler(null)).toBeNull()
    expect(parseTraveler(42)).toBeNull()
  })

  it('欠けた欄は既定値で埋める', () => {
    const traveler = parseTraveler({ englishName: 'YAMADA TARO' })
    expect(traveler?.englishName).toBe('YAMADA TARO')
    expect(traveler?.nationality).toBe('JPN,JAPAN')
    expect(traveler?.regionCode).toBe('+81 JPN')
    expect(traveler?.passportNumber).toBe('')
  })

  it('未知の sex は空にする', () => {
    expect(parseTraveler({ sex: 'X' })?.sex).toBe('')
    expect(parseTraveler({ sex: 'Female' })?.sex).toBe('Female')
  })

  it('id が無ければ採番し直す', () => {
    const traveler = parseTraveler({ englishName: 'A B' })
    expect(traveler?.id.length).toBeGreaterThan(0)
  })
})

describe('parseState', () => {
  it('オブジェクトでなければ null', () => {
    expect(parseState('{}')).toBeNull()
    expect(parseState(null)).toBeNull()
    expect(parseState([])).toBeNull()
  })

  it('travelers の不正な要素だけを落とす', () => {
    const parsed = parseState({
      trip: {},
      travelers: [
        { englishName: 'YAMADA TARO' },
        'broken',
        null,
        { englishName: 'YAMADA HANAKO' },
      ],
    })
    expect(parsed?.travelers.map((t) => t.englishName)).toEqual([
      'YAMADA TARO',
      'YAMADA HANAKO',
    ])
  })

  it('travelers が全滅しても、空の 1 人を用意する', () => {
    const parsed = parseState({ trip: {}, travelers: ['broken'] })
    expect(parsed?.travelers).toHaveLength(1)
    expect(parsed?.travelers[0].englishName).toBe('')
  })

  it('travelers は 16 名で打ち切る', () => {
    const parsed = parseState({
      trip: {},
      travelers: Array.from({ length: 20 }, (_, i) => ({
        englishName: `PERSON ${i}`,
      })),
    })
    expect(parsed?.travelers).toHaveLength(16)
  })

  it('pastTrips が欠けていても空の履歴として読む', () => {
    const parsed = parseState({ trip: {}, travelers: [] })
    expect(parsed?.pastTrips).toEqual([])
  })

  it('pastTrips の不正な要素だけを落とす', () => {
    const parsed = parseState({
      trip: {},
      travelers: [],
      pastTrips: [
        { id: 'a', savedAt: '2026-01-01T00:00:00.000Z', trip: {} },
        'broken',
        null,
        // trip がオブジェクトでないものは履歴として意味を成さない
        { id: 'c', savedAt: '2026-01-03T00:00:00.000Z', trip: 'nope' },
        { id: 'd', savedAt: '2026-01-04T00:00:00.000Z', trip: {} },
      ],
    })
    expect(parsed?.pastTrips.map((past) => past.id)).toEqual(['a', 'd'])
  })

  it('pastTrips は 10 件で打ち切る', () => {
    const parsed = parseState({
      trip: {},
      travelers: [],
      pastTrips: Array.from({ length: 15 }, (_, i) => ({
        id: `past-${i}`,
        savedAt: '2026-01-01T00:00:00.000Z',
        trip: {},
      })),
    })
    expect(parsed?.pastTrips).toHaveLength(10)
  })

  it('壊れた trip でも既定値で立ち上がる', () => {
    const parsed = parseState({ trip: 'broken', travelers: [] })
    expect(parsed?.trip).toEqual(createEmptyTrip())
  })

  /*
    id が重複していると、React の key が重なって描画が乱れるだけでなく、
    id で本人を特定している updateTraveler が同じ id の人をまとめて書き換える。
    1 人ぶん直したパスポート番号が別人にも入る、という気付きにくい壊れ方をする。
  */
  it('重複した旅行者 id を振り直す', () => {
    const parsed = parseState({
      trip: {},
      travelers: [
        { id: 'same', englishName: 'A A' },
        { id: 'same', englishName: 'B B' },
        { id: 'same', englishName: 'C C' },
      ],
    })
    const ids = parsed?.travelers.map((traveler) => traveler.id) ?? []
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    // 最初の 1 件は元の id をそのまま使う(不要に変えない)
    expect(ids[0]).toBe('same')
    // 中身は取り違えずに残る
    expect(parsed?.travelers.map((t) => t.englishName)).toEqual([
      'A A',
      'B B',
      'C C',
    ])
  })

  it('id が空の旅行者にも id を振る', () => {
    const parsed = parseState({
      trip: {},
      travelers: [{ englishName: 'A A' }, { id: '', englishName: 'B B' }],
    })
    const ids = parsed?.travelers.map((traveler) => traveler.id) ?? []
    expect(ids.every((id) => id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(2)
  })

  /*
    実在しない日付は復元の時点で空にする。`<input type="date">` は読めない値を
    空欄として描くので、残すと「画面は空欄・state には値・警告は出ない」という
    誰も気付けない状態になり、日付の入っていない Excel ができあがる。
  */
  it('実在しない日付は空欄に落とす', () => {
    const parsed = parseState({
      trip: { dateOfEntry: '2026-02-30', exitDate: '2026-13-01' },
      travelers: [{ dateOfBirth: '1990-02-31', passportExpiry: '2030-00-10' }],
    })
    expect(parsed?.trip.dateOfEntry).toBe('')
    expect(parsed?.trip.exitDate).toBe('')
    expect(parsed?.travelers[0].dateOfBirth).toBe('')
    expect(parsed?.travelers[0].passportExpiry).toBe('')
  })

  it('実在する日付はそのまま残す', () => {
    const parsed = parseState({
      trip: { dateOfEntry: '2026-03-15', exitDate: '2026-03-20' },
      travelers: [{ dateOfBirth: '1990-05-04', passportExpiry: '2030-01-31' }],
    })
    expect(parsed?.trip.dateOfEntry).toBe('2026-03-15')
    expect(parsed?.trip.exitDate).toBe('2026-03-20')
    expect(parsed?.travelers[0].dateOfBirth).toBe('1990-05-04')
    expect(parsed?.travelers[0].passportExpiry).toBe('2030-01-31')
  })
})

describe('parsePastTrip', () => {
  it('trip がオブジェクトでなければ null', () => {
    expect(parsePastTrip({ id: 'a', savedAt: 'x', trip: 'nope' })).toBeNull()
    expect(parsePastTrip(null)).toBeNull()
  })

  it('savedAt が無ければ空文字にして残す', () => {
    const past = parsePastTrip({ id: 'a', trip: { purpose: 'X' } })
    expect(past?.savedAt).toBe('')
    expect(past?.trip.purpose).toBe('X')
  })
})

describe('保存と復元', () => {
  afterEach(() => {
    // @ts-expect-error テスト用に差し込んだ window を必ず後片付けする
    delete globalThis.window
  })

  it('保存 → 復元で同じ状態に戻る', () => {
    installFakeStorage()
    const state = filledState()
    saveState(state)
    expect(loadState()).toEqual({ state, rescued: false })
  })

  it('履歴も一緒に往復する', () => {
    installFakeStorage()
    const state: ArrivalCardState = {
      ...filledState(),
      pastTrips: [pastTrip({ addressOrHotel: 'Old Hotel' })],
    }
    saveState(state)
    expect(loadState().state?.pastTrips).toEqual(state.pastTrips)
  })

  it('何も保存されていなければ null(退避もしない)', () => {
    installFakeStorage()
    expect(loadState()).toEqual({ state: null, rescued: false })
  })

  it('clearState のあとは null に戻る', () => {
    installFakeStorage()
    saveState(filledState())
    clearState()
    expect(loadState()).toEqual({ state: null, rescued: false })
  })

  it('window が無い環境でも例外を投げない', () => {
    expect(loadState()).toEqual({ state: null, rescued: false })
    expect(() => saveState(createInitialState())).not.toThrow()
    expect(() => clearState()).not.toThrow()
  })
})

/*
  読めなかった保存データを黙って上書きさせないための仕組み。

  この画面は起動直後から自動保存が走るので、loadState が「読めなかった」を
  返した瞬間に、元のデータは空の初期状態で潰される寸前になる。読めなかった
  理由が一時的な不具合や将来のスキーマ変更だった場合、パスポート番号を含む
  入力内容がそこで永久に失われる。だから読めなかったときは必ず退避する。
*/
describe('読めない保存データの退避', () => {
  const BACKUP_KEY = 'taiwan-arrival-card:v1:backup'

  afterEach(() => {
    // @ts-expect-error テスト用に差し込んだ window を必ず後片付けする
    delete globalThis.window
  })

  it('壊れた JSON は退避してから初期状態で立ち上がる', () => {
    const store = installFakeStorage()
    const broken = '{ this is not json'
    store.set('taiwan-arrival-card:v1', broken)

    expect(loadState()).toEqual({ state: null, rescued: true })
    expect(store.get(BACKUP_KEY)).toBe(broken)
    // 元のキーはそのまま(このあと自動保存が上書きするまでは残る)
    expect(store.get('taiwan-arrival-card:v1')).toBe(broken)
  })

  it('JSON だが state として読めない形も退避する', () => {
    const store = installFakeStorage()
    // 配列や数値など、将来のスキーマ変更で起こりうる形
    const alien = JSON.stringify(['not', 'a', 'state'])
    store.set('taiwan-arrival-card:v1', alien)

    expect(loadState()).toEqual({ state: null, rescued: true })
    expect(store.get(BACKUP_KEY)).toBe(alien)
  })

  it('退避は最新 1 件だけを保持する', () => {
    const store = installFakeStorage()
    store.set('taiwan-arrival-card:v1', 'broken-1')
    loadState()
    store.set('taiwan-arrival-card:v1', 'broken-2')
    loadState()
    expect(store.get(BACKUP_KEY)).toBe('broken-2')
  })

  it('正常に読めたときは退避しない', () => {
    const store = installFakeStorage()
    saveState(filledState())
    expect(loadState().rescued).toBe(false)
    expect(store.has(BACKUP_KEY)).toBe(false)
  })

  it('clearState は退避データも消す', () => {
    const store = installFakeStorage()
    store.set('taiwan-arrival-card:v1', 'broken')
    loadState()
    expect(store.has(BACKUP_KEY)).toBe(true)

    clearState()
    // 「すべて削除」と言った以上、読めなかったぶんのパスポート情報も残さない
    expect(store.has(BACKUP_KEY)).toBe(false)
    expect(store.has('taiwan-arrival-card:v1')).toBe(false)
  })
})

describe('isPristineTraveler', () => {
  it('作られたままなら true(id が違っても)', () => {
    expect(isPristineTraveler(createEmptyTraveler())).toBe(true)
    expect(
      isPristineTraveler({ ...createEmptyTraveler(), id: 'まったく別の id' }),
    ).toBe(true)
  })

  it('1 欄でも入力されていれば false', () => {
    expect(
      isPristineTraveler({ ...createEmptyTraveler(), englishName: 'A B' }),
    ).toBe(false)
    // 既定値から変えただけでも「触った」とみなす
    expect(
      isPristineTraveler({ ...createEmptyTraveler(), nationality: 'USA,USA' }),
    ).toBe(false)
  })
})

/** 宿泊先だけが違う旅程。履歴の並びを追うための目印に使う */
function trip(hotel: string): TripInfo {
  return { ...createEmptyTrip(), addressOrHotel: hotel }
}

describe('pushPastTrip', () => {
  it('新しいものを先頭に足す', () => {
    const first = pushPastTrip([], trip('A'), '2026-01-01T00:00:00.000Z')
    const second = pushPastTrip(first, trip('B'), '2026-01-02T00:00:00.000Z')
    expect(second.map((past) => past.trip.addressOrHotel)).toEqual(['B', 'A'])
  })

  it('直近と同じ内容ならスキップする', () => {
    const first = pushPastTrip([], trip('A'), '2026-01-01T00:00:00.000Z')
    const again = pushPastTrip(first, trip('A'), '2026-01-02T00:00:00.000Z')
    expect(again).toHaveLength(1)
    expect(again[0].savedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('直近でなければ、同じ内容でも足す', () => {
    let history = pushPastTrip([], trip('A'), '2026-01-01T00:00:00.000Z')
    history = pushPastTrip(history, trip('B'), '2026-01-02T00:00:00.000Z')
    history = pushPastTrip(history, trip('A'), '2026-01-03T00:00:00.000Z')
    expect(history.map((past) => past.trip.addressOrHotel)).toEqual([
      'A',
      'B',
      'A',
    ])
  })

  it('10 件を超えたら古いものから捨てる', () => {
    let history: Array<PastTrip> = []
    for (let i = 0; i < 15; i += 1) {
      history = pushPastTrip(history, trip(`hotel-${i}`))
    }
    expect(history).toHaveLength(10)
    expect(history[0].trip.addressOrHotel).toBe('hotel-14')
    expect(history[9].trip.addressOrHotel).toBe('hotel-5')
  })

  it('元の配列を書き換えない', () => {
    const original = pushPastTrip([], trip('A'), '2026-01-01T00:00:00.000Z')
    const copy = [...original]
    pushPastTrip(original, trip('B'), '2026-01-02T00:00:00.000Z')
    expect(original).toEqual(copy)
  })
})

describe('applyPastTrip', () => {
  it('日付だけを空にして、それ以外はすべてコピーする', () => {
    const past = pastTrip({
      dateOfEntry: '2024-05-01',
      exitDate: '2024-05-06',
      entryFlightCode: 'BR : EVA Air',
      entryFlightNumber: '190',
      exitFlightCode: 'JX : STARLUX Airlines',
      exitFlightNumber: '801',
      purpose: '5.探親 Visit Relative',
      relativesName: 'WANG',
      relativesMobile: '0912345678',
      reason: 'なにか',
      accommodation: 'Residential Address',
      addressOrHotel: 'No. 1, Taipei',
    })
    const applied = applyPastTrip(past)

    // 古い日付をそのまま書き出す事故を防ぐため、日付だけは必ず空になる
    expect(applied.dateOfEntry).toBe('')
    expect(applied.exitDate).toBe('')

    expect(applied.entryFlightCode).toBe('BR : EVA Air')
    expect(applied.entryFlightNumber).toBe('190')
    expect(applied.exitFlightCode).toBe('JX : STARLUX Airlines')
    expect(applied.exitFlightNumber).toBe('801')
    expect(applied.purpose).toBe('5.探親 Visit Relative')
    expect(applied.relativesName).toBe('WANG')
    expect(applied.relativesMobile).toBe('0912345678')
    expect(applied.reason).toBe('なにか')
    expect(applied.accommodation).toBe('Residential Address')
    expect(applied.addressOrHotel).toBe('No. 1, Taipei')
  })

  it('元の履歴を書き換えない', () => {
    const past = pastTrip({ dateOfEntry: '2024-05-01' })
    applyPastTrip(past)
    expect(past.trip.dateOfEntry).toBe('2024-05-01')
  })
})

describe('isPristineTrip', () => {
  it('初期状態なら true', () => {
    expect(isPristineTrip(createEmptyTrip())).toBe(true)
  })

  it('1 欄でも入力されていれば false', () => {
    expect(
      isPristineTrip({ ...createEmptyTrip(), dateOfEntry: '2026-03-15' }),
    ).toBe(false)
  })
})
