import { describe, expect, it } from 'vitest'
import { convertToTripNotes, suggestTripTitle } from './toTripNotes'
import { parseTripNotesState } from '../trip-notes/storage'
import type { Booking, TripNotesState } from '../trip-notes/types'
import type { Stay, TripState } from './types'

const TZ = 'Europe/Paris'

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

/** null が返ってきたらテストとして意味が無いので、そこで落とす */
function convert(
  state: TripState,
  options: { tz?: string; tripTitle?: string } = {},
): TripNotesState {
  const { tz = TZ, tripTitle } = options
  const result = convertToTripNotes(state, { tz, tripTitle })
  if (result === null) throw new Error('引き継ぎの変換が null を返した')
  return result
}

function lodgings(state: TripNotesState): Array<Booking> {
  return state.bookings.filter((booking) => booking.kind === 'lodging')
}

function moves(state: TripNotesState): Array<Booking> {
  return state.bookings.filter((booking) => booking.kind === 'other')
}

describe('convertToTripNotes: 滞在 → 検討中の宿', () => {
  it('泊数からチェックイン日とチェックアウト日が決まる', () => {
    const notes = convert(
      makeState({ stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)] }),
    )
    const [paris, rome] = lodgings(notes)

    expect(paris.title).toBe('パリ滞在')
    expect(paris.start.allDay).toBe(true)
    expect(paris.start.zdt).toContain('2026-06-12T00:00:00')
    // 3 泊なので 6/12 に入って 6/15 に出る
    expect(paris.end?.zdt).toContain('2026-06-15T00:00:00')
    expect(paris.end?.allDay).toBe(true)

    // 次の滞在は前の滞在のチェックアウト日から始まる
    expect(rome.start.zdt).toContain('2026-06-15T00:00:00')
    expect(rome.end?.zdt).toContain('2026-06-17T00:00:00')
  })

  it('まだ何も予約していない事実を status: idea / payment: unpaid で表す', () => {
    const notes = convert(makeState({ stays: [stay('s1', 'paris', 3)] }))
    const [paris] = lodgings(notes)

    expect(paris.status).toBe('idea')
    expect(paris.payment).toBe('unpaid')
    // AI が読み取った値ではないので未確認フィールドは付けない
    expect(paris.unverified).toBeUndefined()
    expect(paris.evidence).toBeUndefined()
  })

  it('同じ都市が隣り合う滞在は 1 件の宿にまとめる', () => {
    const notes = convert(
      makeState({
        stays: [
          stay('s1', 'paris', 2),
          stay('s2', 'paris', 3),
          stay('s3', 'rome', 1),
        ],
      }),
    )
    const rooms = lodgings(notes)

    expect(rooms).toHaveLength(2)
    expect(rooms[0].start.zdt).toContain('2026-06-12')
    // 2 泊 + 3 泊 = 5 泊ぶんが 1 件のチェックアウト日になる
    expect(rooms[0].end?.zdt).toContain('2026-06-17')
    expect(rooms[0].note).toContain('5泊')
    // 移動が発生しない区間に移動は作らない
    expect(moves(notes)).toHaveLength(1)
  })
})

describe('convertToTripNotes: 都市間 → 手段未定の移動', () => {
  it('連続する滞在の間に kind: other の移動が入る', () => {
    const notes = convert(
      makeState({ stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)] }),
    )
    const [move] = moves(notes)

    expect(move.kind).toBe('other')
    expect(move.status).toBe('idea')
    expect(move.from?.name).toBe('パリ')
    expect(move.to?.name).toBe('ローマ')
    // 移動日は前の都市のチェックアウト日
    expect(move.start.zdt).toContain('2026-06-15T00:00:00')
    expect(move.start.allDay).toBe(true)
    // 同日中に着く移動に end は入れない
    expect(move.end).toBeNull()
    // 見積もりは note にだけ残す(手段を決めたことにしない)
    expect(move.note).toContain('手段は未定')
  })

  it('移動と宿が旅程の順に並ぶ', () => {
    const notes = convert(
      makeState({
        stays: [
          stay('s1', 'paris', 2),
          stay('s2', 'rome', 2),
          stay('s3', 'vienna', 2),
        ],
      }),
    )

    expect(notes.bookings.map((booking) => booking.kind)).toEqual([
      'lodging',
      'other',
      'lodging',
      'other',
      'lodging',
    ])
  })

  it('夜行での移動は翌朝着なので end に到着日が入る', () => {
    const notes = convert(
      makeState({
        stays: [stay('s1', 'paris', 3), stay('s2', 'rome', 2)],
        legModes: { 'paris>rome': 'nightTrain' },
      }),
    )
    const [move] = moves(notes)
    const [, rome] = lodgings(notes)

    expect(move.start.zdt).toContain('2026-06-15T00:00:00')
    expect(move.end?.zdt).toContain('2026-06-16T00:00:00')
    // 夜行が泊を 1 つ食うので、次の滞在は 1 日後ろにずれる
    expect(rome.start.zdt).toContain('2026-06-16T00:00:00')
    expect(move.note).toContain('夜行列車')
  })
})

describe('convertToTripNotes: 都市の情報の引き継ぎ', () => {
  it('カタログにある都市は英名と座標まで引き継ぐ', () => {
    const notes = convert(
      makeState({ stays: [stay('s1', 'paris', 2), stay('s2', 'rome', 1)] }),
    )
    const [paris] = lodgings(notes)
    const [move] = moves(notes)

    expect(paris.place).toEqual({
      name: 'パリ',
      latinName: 'Paris',
      lat: 48.8566,
      lng: 2.3522,
    })
    // 移動の出発地・到着地にも同じ情報が入る(外部検索リンクと地名判定のため)
    expect(move.from?.latinName).toBe('Paris')
    expect(move.to?.latinName).toBe('Rome')
    expect(move.to?.lat).toBe(41.9028)
  })

  it('カタログに無い都市は名前だけの場所にして滞在は残す', () => {
    const notes = convert(makeState({ stays: [stay('s1', 'atlantis', 2)] }))
    const [unknown] = lodgings(notes)

    expect(unknown.place).toEqual({ name: 'atlantis' })
    expect(unknown.place?.latinName).toBeUndefined()
    expect(unknown.place?.lat).toBeUndefined()
  })

  it('City はタイムゾーンを持たないので、渡されたタイムゾーンで Stamp を作る', () => {
    const state = makeState({ stays: [stay('s1', 'paris', 2)] })

    const paris = convert(state, { tz: 'Europe/Paris' })
    expect(lodgings(paris)[0].start.zdt).toContain('[Europe/Paris]')

    const tokyo = convert(state, { tz: 'Asia/Tokyo' })
    expect(lodgings(tokyo)[0].start.zdt).toContain('[Asia/Tokyo]')
    // タイムゾーンが変わっても日付はずれない(終日は暦の日付が事実)
    expect(lodgings(tokyo)[0].start.zdt).toContain('2026-06-12')
  })

  it('不正なタイムゾーンでも例外を投げず Asia/Tokyo に寄せる', () => {
    const notes = convert(makeState({ stays: [stay('s1', 'paris', 2)] }), {
      tz: 'Mars/Olympus_Mons',
    })

    expect(lodgings(notes)[0].start.zdt).toContain('[Asia/Tokyo]')
  })
})

describe('convertToTripNotes: 旅程そのもの', () => {
  it('旅行期間はパズルからそのまま引き継ぐ', () => {
    const notes = convert(
      makeState({
        startDate: '2026-09-12',
        endDate: '2026-09-20',
        stays: [stay('s1', 'paris', 3)],
      }),
    )

    expect(notes.startDate).toBe('2026-09-12')
    expect(notes.endDate).toBe('2026-09-20')
    // パズルに無い設定は持ち込まない
    expect(notes.pinnedTz).toBeNull()
    expect(notes.emergencyContacts).toEqual([])
  })

  it('タイトルは指定があればそれを使い、無ければ都市名から組み立てる', () => {
    const state = makeState({
      stays: [stay('s1', 'paris', 2), stay('s2', 'rome', 2)],
    })

    expect(convert(state).tripTitle).toBe('パリ・ローマの旅')
    expect(convert(state, { tripTitle: '新婚旅行' }).tripTitle).toBe('新婚旅行')
  })

  it('滞在が 1 つも無ければ null', () => {
    expect(convertToTripNotes(makeState(), { tz: TZ })).toBeNull()
  })
})

describe('suggestTripTitle', () => {
  it('再訪する都市は 1 回だけ数える', () => {
    expect(
      suggestTripTitle(
        makeState({
          stays: [
            stay('s1', 'paris', 2),
            stay('s2', 'rome', 2),
            stay('s3', 'paris', 1),
          ],
        }),
      ),
    ).toBe('パリ・ローマの旅')
  })

  it('4 都市以上は「ほか N 都市」に畳む', () => {
    expect(
      suggestTripTitle(
        makeState({
          stays: [
            stay('s1', 'paris', 1),
            stay('s2', 'rome', 1),
            stay('s3', 'vienna', 1),
            stay('s4', 'prague', 1),
            stay('s5', 'berlin', 1),
          ],
        }),
      ),
    ).toBe('パリ・ローマ・ウィーンほか2都市の旅')
  })

  it('滞在が無ければ空文字', () => {
    expect(suggestTripTitle(makeState())).toBe('')
  })
})

describe('しおり側の検証との整合', () => {
  /*
   * ここが通らないと「引き継いだのに旅のしおりで開けない(黙って消える)」になる。
   * JSON を経由するのは、実際の保存が localStorage 経由の文字列になるため。
   */
  it('生成した状態が parseTripNotesState をそのまま通る', () => {
    const notes = convert(
      makeState({
        stays: [
          stay('s1', 'paris', 3),
          stay('s2', 'rome', 2),
          stay('s3', 'atlantis', 1),
        ],
        legModes: { 'paris>rome': 'nightTrain' },
      }),
    )

    const restored = parseTripNotesState(JSON.parse(JSON.stringify(notes)))

    expect(restored).toEqual(notes)
    // 予約が 1 件も落ちていないこと(落ちても parse は null にならないので個別に見る)
    expect(restored?.bookings).toHaveLength(notes.bookings.length)
  })
})
