import { describe, expect, it } from 'vitest'
import { AI_SERVICE_LINKS, buildImportPrompt } from './aiPrompt'
import { makeStamp } from './datetime'
import {
  BOOKING_KINDS,
  BOOKING_STATUSES,
  FIELD_KEYS,
  PAYMENT_STATUSES,
} from './storage'
import type { Booking, TripNotesState } from './types'

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    kind: 'lodging',
    title: 'Hotel Le Marais',
    start: makeStamp('2026-09-12', '15:00', 'Europe/Paris'),
    end: makeStamp('2026-09-15', '11:00', 'Europe/Paris'),
    place: { name: 'Paris' },
    status: 'confirmed',
    payment: 'paid',
    ...overrides,
  }
}

function state(overrides: Partial<TripNotesState> = {}): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'ヨーロッパ周遊',
    startDate: '2026-09-10',
    endDate: '2026-09-20',
    pinnedTz: 'Europe/Paris',
    bookings: [],
    emergencyContacts: [],
    ...overrides,
  }
}

describe('buildImportPrompt: スキーマの同期', () => {
  it('kind の全候補値がプロンプトに含まれる', () => {
    const prompt = buildImportPrompt(state())
    for (const kind of BOOKING_KINDS) {
      expect(prompt).toContain(`'${kind}'`)
    }
  })

  it('status / payment の全候補値がプロンプトに含まれる', () => {
    const prompt = buildImportPrompt(state())
    for (const value of [...BOOKING_STATUSES, ...PAYMENT_STATUSES]) {
      expect(prompt).toContain(`'${value}'`)
    }
  })

  it('evidence のキーとして FieldKey の全量が含まれる', () => {
    const prompt = buildImportPrompt(state())
    for (const key of FIELD_KEYS) {
      expect(prompt).toContain(`'${key}'`)
    }
  })

  it('中間形式のフィールド名が型定義として並ぶ', () => {
    const prompt = buildImportPrompt(state())
    expect(prompt).toContain('interface DateTimeInput')
    expect(prompt).toContain('interface ExtractedBooking')
    expect(prompt).toContain('date: string')
    expect(prompt).toContain('time: string | null')
    expect(prompt).toContain('tz: string | null')
  })

  it('オフセットを書かせない指示が入っている', () => {
    const prompt = buildImportPrompt(state())
    expect(prompt).toContain('UTC に変換しない')
    expect(prompt).toContain('+02:00')
    expect(prompt).toContain('IANA')
  })

  it('推測を禁じる指示と出力形式の指定が入っている', () => {
    const prompt = buildImportPrompt(state())
    expect(prompt).toContain('null')
    expect(prompt).toContain('推測で埋めないこと')
    expect(prompt).toContain('```json')
    expect(prompt).toContain('evidence')
  })
})

describe('buildImportPrompt: 旅行のコンテキスト', () => {
  it('旅行期間と旅行名が含まれる', () => {
    const prompt = buildImportPrompt(state())
    expect(prompt).toContain('2026-09-10')
    expect(prompt).toContain('2026-09-20')
    expect(prompt).toContain('ヨーロッパ周遊')
  })

  it('旅行名が空なら行ごと省略する', () => {
    const prompt = buildImportPrompt(state({ tripTitle: '   ' }))
    expect(prompt).not.toContain('旅行名')
    expect(prompt).toContain('2026-09-10')
  })

  it('pinnedTz が基準タイムゾーンとして入る', () => {
    expect(buildImportPrompt(state())).toContain('Europe/Paris')
  })

  it('pinnedTz が無ければ deviceTz を使う', () => {
    const prompt = buildImportPrompt(state({ pinnedTz: null }), {
      deviceTz: 'Asia/Tokyo',
    })
    expect(prompt).toContain('基準タイムゾーン: Asia/Tokyo')
  })
})

describe('buildImportPrompt: 登録済み予約', () => {
  it('登録済みの予約のタイトル・場所・日付が並ぶ', () => {
    const prompt = buildImportPrompt(state({ bookings: [booking()] }))
    expect(prompt).toContain('すでに登録済みの予約')
    expect(prompt).toContain('Hotel Le Marais')
    expect(prompt).toContain('Paris')
    expect(prompt).toContain('2026-09-12')
  })

  it('includeExistingBookings: false なら列挙しない', () => {
    // スキーマの例文にも出てくる文字列だと判定にならないので、固有の題名を使う
    const bookings = [booking({ title: 'ヴェネツィアの宿' })]
    const prompt = buildImportPrompt(state({ bookings }), {
      includeExistingBookings: false,
    })
    expect(prompt).not.toContain('すでに登録済みの予約')
    expect(prompt).not.toContain('ヴェネツィアの宿')
  })

  it('予約が 0 件なら節ごと出さない', () => {
    expect(buildImportPrompt(state())).not.toContain('すでに登録済みの予約')
  })

  it('maxExistingBookings を超えた分は件数だけ伝える', () => {
    const bookings = [
      booking({ id: 'b1', title: '予約A' }),
      booking({ id: 'b2', title: '予約B' }),
      booking({ id: 'b3', title: '予約C' }),
    ]
    const prompt = buildImportPrompt(state({ bookings }), {
      maxExistingBookings: 2,
    })
    expect(prompt).toContain('予約A')
    expect(prompt).toContain('予約B')
    expect(prompt).not.toContain('予約C')
    expect(prompt).toContain('ほか 1 件')
  })

  it('キャンセル済みの予約は重複判定の対象にしない', () => {
    const bookings = [
      booking({ id: 'b1', title: '生きている予約' }),
      booking({ id: 'b2', title: '取り消した予約', status: 'cancelled' }),
    ]
    const prompt = buildImportPrompt(state({ bookings }))
    expect(prompt).toContain('生きている予約')
    expect(prompt).not.toContain('取り消した予約')
  })

  it('場所が無い予約でも行が壊れない', () => {
    const prompt = buildImportPrompt(
      state({
        bookings: [
          booking({ place: undefined, from: undefined, to: undefined }),
        ],
      }),
    )
    expect(prompt).toContain('- 2026-09-12 Hotel Le Marais')
  })
})

describe('AI_SERVICE_LINKS', () => {
  it('主要な 3 サービスへの https URL を持つ', () => {
    expect(AI_SERVICE_LINKS.map((link) => link.id)).toEqual([
      'chatgpt',
      'claude',
      'gemini',
    ])
    for (const link of AI_SERVICE_LINKS) {
      expect(link.url.startsWith('https://')).toBe(true)
      expect(link.label.length).toBeGreaterThan(0)
    }
  })
})
