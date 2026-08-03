import { describe, expect, it } from 'vitest'
import { makeAllDayStamp, makeStamp, stampToEpoch, stampTz } from './datetime'
import {
  QR_SAFE_LENGTH,
  decodeShareState,
  encodeShareUrl,
  estimateShareSize,
} from './share'
import type { Booking, TripNotesState } from './types'

const BASE_URL = 'https://tainakanchu-tools.example/trip-notes/'

function randomHex(length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += Math.floor(Math.random() * 16).toString(16)
  }
  return out
}

/** 宿泊・フライト・終日アクティビティ・緊急連絡先・任意フィールド全部入りの現実的な state */
function buildFullState(): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'ヨーロッパ周遊',
    startDate: '2026-09-10',
    endDate: '2026-09-20',
    pinnedTz: 'Europe/Paris',
    bookings: [
      {
        id: 'booking-1',
        kind: 'lodging',
        title: 'Hotel Le Marais',
        start: makeStamp('2026-09-10', '15:00', 'Europe/Paris'),
        end: makeStamp('2026-09-13', '11:00', 'Europe/Paris'),
        place: {
          name: 'Hotel Le Marais',
          localName: 'オテル・ル・マレ',
          address: '12 Rue de Rivoli, Paris',
          lat: 48.8566,
          lng: 2.3522,
        },
        status: 'confirmed',
        payment: 'paid',
        confirmationNumber: 'ABC123',
        provider: 'Booking.com',
        price: { amount: 45000, currency: 'JPY' },
        freeCancelUntil: '2026-09-01',
        note: 'エレベーターなし、3階の部屋',
        unverified: ['freeCancelUntil'],
        evidence: {
          freeCancelUntil: '「9/1までは無料キャンセル可」とメールに記載',
        },
      },
      {
        id: 'booking-2',
        kind: 'flight',
        title: 'JL415',
        start: makeStamp('2026-09-10', '00:50', 'Asia/Tokyo'),
        end: makeStamp('2026-09-10', '06:10', 'Europe/Paris'),
        from: { name: '羽田空港', address: '東京都大田区羽田空港' },
        to: { name: 'シャルル・ド・ゴール空港' },
        status: 'confirmed',
        payment: 'paid',
        confirmationNumber: 'XYZ987',
        provider: 'JAL',
        price: { amount: 180000, currency: 'JPY' },
      },
      {
        id: 'booking-3',
        kind: 'activity',
        title: 'ルーブル美術館',
        start: makeAllDayStamp('2026-09-14', 'Europe/Paris'),
        end: null,
        status: 'idea',
        payment: 'unpaid',
      },
    ],
    emergencyContacts: [
      {
        id: 'contact-1',
        label: '在フランス日本大使館',
        value: '+33-1-4888-6200',
        note: '平日9-17時のみ',
      },
      {
        id: 'contact-2',
        label: '海外旅行保険 緊急デスク',
        value: '0120-xxx-xxx',
      },
    ],
  }
}

/** デコード結果と比較するための期待値。evidence だけを取り除く */
function withoutEvidence(state: TripNotesState): TripNotesState {
  const clone = structuredClone(state)
  for (const booking of clone.bookings) {
    delete booking.evidence
  }
  return clone
}

function extractHash(url: string): string {
  const index = url.indexOf('#')
  return index === -1 ? '' : url.slice(index + 1)
}

/** decodeShareState の結果が null でないことを検証しつつ型を絞り込む */
function requireDecoded(state: TripNotesState | null): TripNotesState {
  if (state === null) throw new Error('decodeShareState が null を返した')
  return state
}

describe('share', () => {
  it('エンコード→デコードのラウンドトリップで状態が保存される(全部入り)', async () => {
    const state = buildFullState()
    const url = await encodeShareUrl(state, BASE_URL)
    const decoded = await decodeShareState(extractHash(url))
    expect(decoded).toEqual(withoutEvidence(state))
  })

  it('evidence はデコード結果から落ちるが、他のフィールドは保持される', async () => {
    const state = buildFullState()
    const url = await encodeShareUrl(state, BASE_URL)
    const decoded = requireDecoded(await decodeShareState(extractHash(url)))
    expect(decoded.bookings[0].evidence).toBeUndefined()
    expect(decoded.bookings[0].confirmationNumber).toBe('ABC123')
    expect(decoded.bookings[0].unverified).toEqual(['freeCancelUntil'])
    expect(decoded.bookings[0].note).toBe('エレベーターなし、3階の部屋')
  })

  it('ラウンドトリップでタイムゾーン情報が失われない(Europe/Paris の予定)', async () => {
    // 共有URLで一番壊れてはいけない性質: タイムゾーンが変わって
    // 「現地時刻は同じ数字なのに指している瞬間がずれる」事故が起きないこと。
    const state = buildFullState()
    const original = state.bookings[0].start
    const url = await encodeShareUrl(state, BASE_URL)
    const decoded = requireDecoded(await decodeShareState(extractHash(url)))
    const restored = decoded.bookings[0].start

    expect(stampTz(restored)).toBe('Europe/Paris')
    expect(stampToEpoch(restored)).toBe(stampToEpoch(original))
  })

  it('ラウンドトリップでタイムゾーン情報が失われない(Asia/Tokyo の予定)', async () => {
    const state = buildFullState()
    const original = state.bookings[1].start
    const url = await encodeShareUrl(state, BASE_URL)
    const decoded = requireDecoded(await decodeShareState(extractHash(url)))
    const restored = decoded.bookings[1].start

    expect(stampTz(restored)).toBe('Asia/Tokyo')
    expect(stampToEpoch(restored)).toBe(stampToEpoch(original))
  })

  it('allDay: true と allDay: false の予定がどちらも正しく往復する', async () => {
    const state = buildFullState()
    const url = await encodeShareUrl(state, BASE_URL)
    const decoded = requireDecoded(await decodeShareState(extractHash(url)))

    const timedBooking = decoded.bookings.find((b) => b.id === 'booking-1')
    const allDayBooking = decoded.bookings.find((b) => b.id === 'booking-3')
    expect(timedBooking).toBeDefined()
    expect(allDayBooking).toBeDefined()
    expect(timedBooking?.start.allDay).toBe(false)
    expect(allDayBooking?.start.allDay).toBe(true)
  })

  it('# を付けても付けなくても同じ結果になる', async () => {
    const state = buildFullState()
    const url = await encodeShareUrl(state, BASE_URL)
    const hash = extractHash(url)
    const withHash = await decodeShareState(`#${hash}`)
    const withoutHash = await decodeShareState(hash)
    expect(withHash).toEqual(withoutEvidence(state))
    expect(withoutHash).toEqual(withoutEvidence(state))
  })

  it('壊れたpayloadはnullを返す: 不正なbase64', async () => {
    // marker('0')自体は正しいが、続く本体が base64 として不正
    await expect(decodeShareState('#d=0!!!!')).resolves.toBeNull()
  })

  it('壊れたpayloadはnullを返す: dパラメータが空', async () => {
    await expect(decodeShareState('#d=')).resolves.toBeNull()
  })

  it('壊れたpayloadはnullを返す: dパラメータが無い', async () => {
    await expect(decodeShareState('#x=1')).resolves.toBeNull()
  })

  it('壊れたpayloadはnullを返す: 先頭文字が未知のマーカー', async () => {
    const state = buildFullState()
    const url = await encodeShareUrl(state, BASE_URL)
    const hash = extractHash(url)
    const dIndex = hash.indexOf('d=')
    const markerIndex = dIndex + 2
    // マーカー文字('0' か '1')だけを未知の文字に差し替える
    const corrupted = `${hash.slice(0, markerIndex)}9${hash.slice(markerIndex + 1)}`
    await expect(decodeShareState(corrupted)).resolves.toBeNull()
  })

  it('estimateShareSizeはpayload長を返し、圧縮で元のJSONより十分小さくなる', async () => {
    const state = buildFullState()
    const size = await estimateShareSize(state)
    const rawJsonLength = JSON.stringify(state).length

    expect(size).toBeGreaterThan(0)
    expect(size).toBeLessThan(rawJsonLength * 0.7)

    // encodeShareUrl の payload 長とも一致すること
    const url = await encodeShareUrl(state, BASE_URL)
    const payload = extractHash(url).slice('d='.length)
    expect(size).toBe(payload.length)
  })

  it('大きなstateはQR_SAFE_LENGTHを超える', async () => {
    // deflate は繰り返しをよく畳むので、圧縮に強い(=容量超過を検出しづらい)データにならないよう
    // 各予約にランダムな16進文字列を持たせて圧縮が効きにくい状態を作る
    const bookings: Array<Booking> = []
    for (let i = 0; i < 120; i += 1) {
      bookings.push({
        id: `booking-${i}`,
        kind: 'activity',
        title: randomHex(48),
        start: makeStamp('2026-09-10', '10:00', 'Europe/Paris'),
        end: null,
        status: 'idea',
        payment: 'unpaid',
        note: randomHex(48),
      })
    }
    const state: TripNotesState = {
      schemaVersion: 1,
      tripTitle: '大きな旅程',
      startDate: '2026-09-10',
      endDate: '2026-10-10',
      pinnedTz: null,
      bookings,
      emergencyContacts: [],
    }

    const size = await estimateShareSize(state)
    expect(size).toBeGreaterThan(QR_SAFE_LENGTH)
  })

  it('encodeShareUrlはbaseUrlに既存のハッシュがあっても#d=が二重にならない', async () => {
    const state = buildFullState()
    const url = await encodeShareUrl(state, `${BASE_URL}#old-hash-value`)
    expect(url.split('#').length).toBe(2)
    expect(url.startsWith(`${BASE_URL}#d=`)).toBe(true)
  })

  describe('CompressionStream が無い環境', () => {
    it('非圧縮でエンコード→デコードのラウンドトリップができ、payloadは"0"始まりになる', async () => {
      const savedCompression = globalThis.CompressionStream
      const savedDecompression = globalThis.DecompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.CompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.DecompressionStream
      try {
        const state = buildFullState()
        const url = await encodeShareUrl(state, BASE_URL)
        const hash = extractHash(url)
        expect(hash.startsWith('d=0')).toBe(true)
        const decoded = await decodeShareState(hash)
        expect(decoded).toEqual(withoutEvidence(state))
      } finally {
        globalThis.CompressionStream = savedCompression
        globalThis.DecompressionStream = savedDecompression
      }
    })

    it('圧縮なし環境でエンコードしたpayloadは、圧縮あり環境に戻しても正しくデコードできる', async () => {
      const savedCompression = globalThis.CompressionStream
      const savedDecompression = globalThis.DecompressionStream
      const state = buildFullState()
      let hash = ''
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.CompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.DecompressionStream
      try {
        const url = await encodeShareUrl(state, BASE_URL)
        hash = extractHash(url)
        expect(hash.startsWith('d=0')).toBe(true)
      } finally {
        globalThis.CompressionStream = savedCompression
        globalThis.DecompressionStream = savedDecompression
      }

      // ここでは圧縮APIが復元されている(通常のテスト環境)
      const decoded = await decodeShareState(hash)
      expect(decoded).toEqual(withoutEvidence(state))
    })

    it('圧縮ありでエンコードしたpayloadを圧縮なし環境でデコードすると、例外を投げずnullを返す', async () => {
      const state = buildFullState()
      const url = await encodeShareUrl(state, BASE_URL)
      const hash = extractHash(url)
      // 通常のテスト環境では圧縮APIが使えるので '1' 始まりになっているはず
      expect(hash.startsWith('d=1')).toBe(true)

      const savedCompression = globalThis.CompressionStream
      const savedDecompression = globalThis.DecompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.CompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.DecompressionStream
      try {
        await expect(decodeShareState(hash)).resolves.toBeNull()
      } finally {
        globalThis.CompressionStream = savedCompression
        globalThis.DecompressionStream = savedDecompression
      }
    })
  })
})
