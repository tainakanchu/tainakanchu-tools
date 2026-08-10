import { describe, expect, it } from 'vitest'
import { makeAllDayStamp, makeStamp, stampToEpoch, stampTz } from './datetime'
import {
  QR_SAFE_BYTES,
  QR_SAFE_LENGTH,
  buildShare,
  decodeShareState,
  encodeShareUrl,
  estimateShareSize,
} from './share'
import { SHARE_TIMEZONES, decodeShareTz, encodeShareTz } from './shareTimezones'
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
          latinName: 'Paris',
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
        from: {
          name: '羽田空港',
          latinName: 'Tokyo',
          address: '東京都大田区羽田空港',
        },
        to: { name: 'シャルル・ド・ゴール空港', latinName: 'Paris' },
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

/** 上記2つの payload に入っている state */
function legacyState(): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: '旧フォーマットの旅',
    startDate: '2026-09-10',
    endDate: '2026-09-20',
    pinnedTz: 'Europe/Paris',
    bookings: [
      {
        id: 'bk-legacy-1',
        kind: 'lodging',
        title: 'Hotel Le Marais',
        start: {
          zdt: '2026-09-10T15:00:00+02:00[Europe/Paris]',
          allDay: false,
        },
        end: {
          zdt: '2026-09-13T11:00:00+02:00[Europe/Paris]',
          allDay: false,
        },
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
        note: 'エレベーターなし',
        unverified: ['freeCancelUntil'],
      },
      {
        id: 'bk-legacy-2',
        kind: 'activity',
        title: 'ルーブル美術館',
        start: {
          zdt: '2026-09-14T00:00:00+02:00[Europe/Paris]',
          allDay: true,
        },
        end: null,
        status: 'idea',
        payment: 'unpaid',
      },
    ],
    emergencyContacts: [
      {
        id: 'ec-legacy-1',
        label: '在フランス日本大使館',
        value: '+33-1-4888-6200',
        note: '平日9-17時のみ',
      },
    ],
  }
}

/**
 * id を連番に置き換える。
 * marker '2' 以降は id を payload に載せず復元側で振り直すので、
 * 「id 以外がすべて一致すること」を見るために両辺を正規化してから比較する。
 */
function normalizeIds(state: TripNotesState): TripNotesState {
  return {
    ...state,
    bookings: state.bookings.map((booking, index) => ({
      ...booking,
      id: `b${index}`,
    })),
    emergencyContacts: state.emergencyContacts.map((contact, index) => ({
      ...contact,
      id: `c${index}`,
    })),
    // 1 組も無いときはフィールドごと存在しないので、空配列を生やさないよう分ける
    ...(state.placeAliases === undefined
      ? {}
      : {
          placeAliases: state.placeAliases.map((alias, index) => ({
            ...alias,
            id: `p${index}`,
          })),
        }),
    ...(state.travelDocs === undefined
      ? {}
      : {
          travelDocs: state.travelDocs.map((doc, index) => ({
            ...doc,
            id: `d${index}`,
          })),
        }),
    ...(state.countryInfos === undefined
      ? {}
      : {
          countryInfos: state.countryInfos.map((info, index) => ({
            ...info,
            id: `g${index}`,
          })),
        }),
    ...(state.wishes === undefined
      ? {}
      : {
          wishes: state.wishes.map((wish, index) => ({
            ...wish,
            id: `w${index}`,
          })),
        }),
  }
}

/** 新フォーマットのラウンドトリップで期待する値(evidence を落とし、id を正規化) */
function expected(state: TripNotesState): TripNotesState {
  return normalizeIds(withoutEvidence(state))
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

/** state をエンコードして復元する。id は正規化済み */
async function roundTrip(
  state: TripNotesState,
  options?: { cjk: boolean },
): Promise<TripNotesState> {
  const url = await encodeShareUrl(state, BASE_URL, options)
  return normalizeIds(requireDecoded(await decodeShareState(extractHash(url))))
}

describe('share', () => {
  it('エンコード→デコードのラウンドトリップで状態が保存される(全部入り)', async () => {
    const state = buildFullState()
    expect(await roundTrip(state)).toEqual(expected(state))
  })

  it('既定のフォーマットは marker "2"(辞書 + zdt数値化 + id連番)', async () => {
    const url = await encodeShareUrl(buildFullState(), BASE_URL)
    expect(extractHash(url).startsWith('d=2')).toBe(true)
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

    // id は振り直されるので、並び順で引く(順序は保たれる)
    expect(decoded.bookings[0].start.allDay).toBe(false)
    expect(decoded.bookings[2].start.allDay).toBe(true)
    expect(decoded.bookings[2].start.zdt).toBe(state.bookings[2].start.zdt)
  })

  it('placeAliases がラウンドトリップで保たれる', async () => {
    const state: TripNotesState = {
      ...buildFullState(),
      placeAliases: [
        { id: 'pa-1', names: ['マルタ・ルア国際空港', 'マルタの知人宅'] },
        { id: 'pa-2', names: ['Faro', 'アルガルヴェ'] },
      ],
    }
    expect(await roundTrip(state)).toEqual(expected(state))
  })

  it('travelDocs がラウンドトリップで保たれる(任意フィールド全部入り)', async () => {
    const state: TripNotesState = {
      ...buildFullState(),
      travelDocs: [
        {
          id: 'td-1',
          kind: 'visa',
          title: 'ETIAS',
          region: 'シェンゲン圏',
          status: 'done',
          dueDate: '2026-08-01',
          validFrom: '2026-08-10',
          validUntil: '2029-08-10',
          referenceNumber: 'ETIAS-2026-0001',
          price: { amount: 7, currency: 'EUR' },
          url: 'https://example.test/etias',
          note: '有効期間は 3 年',
        },
        {
          // 必須だけの手続き。任意キーが省略されたまま往復することを見る
          id: 'td-2',
          kind: 'sim',
          title: 'マルタの eSIM',
          status: 'todo',
        },
      ],
    }
    expect(await roundTrip(state)).toEqual(expected(state))
  })

  it('travelDocs が無ければ payload にも復元結果にもフィールドが現れない', async () => {
    // 手続きを使っていない人の共有URLをこの機能で膨らませない
    const state = buildFullState()
    const decoded = requireDecoded(
      await decodeShareState(
        extractHash(await encodeShareUrl(state, BASE_URL)),
      ),
    )
    expect(decoded).not.toHaveProperty('travelDocs')
  })

  it('countryInfos がラウンドトリップで保たれる(任意フィールド全部入り)', async () => {
    const state: TripNotesState = {
      ...buildFullState(),
      countryInfos: [
        {
          id: 'ci-1',
          name: 'マルタ',
          latinName: 'Malta',
          plugTypes: 'G',
          voltage: '230V 50Hz',
          tipping: '不要。高級店では10%',
          emergencyPolice: '112',
          emergencyAmbulance: '112',
          note: '左側通行',
        },
        {
          // 名前だけの国。任意キーが省略されたまま往復することを見る
          id: 'ci-2',
          name: '台湾',
        },
      ],
    }
    expect(await roundTrip(state)).toEqual(expected(state))
  })

  it('countryInfos が無ければ payload にも復元結果にもフィールドが現れない', async () => {
    // 国情報を使っていない人の共有URLをこの機能で膨らませない
    const state = buildFullState()
    const decoded = requireDecoded(
      await decodeShareState(
        extractHash(await encodeShareUrl(state, BASE_URL)),
      ),
    )
    expect(decoded).not.toHaveProperty('countryInfos')
  })

  it('countryInfos の id は復元側で振り直される', async () => {
    const state: TripNotesState = {
      ...buildFullState(),
      countryInfos: [
        { id: 'ci-original-1', name: 'マルタ' },
        { id: 'ci-original-2', name: '台湾' },
      ],
    }
    const decoded = requireDecoded(
      await decodeShareState(
        extractHash(await encodeShareUrl(state, BASE_URL)),
      ),
    )
    const ids = decoded.countryInfos?.map((info) => info.id) ?? []
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) {
      expect(id.startsWith('ci-')).toBe(true)
      expect(id.startsWith('ci-original')).toBe(false)
    }
    expect(decoded.countryInfos?.map((info) => info.name)).toEqual([
      'マルタ',
      '台湾',
    ])
  })

  it('wishes がラウンドトリップで保たれる(任意フィールド全部入り)', async () => {
    const state: TripNotesState = {
      ...buildFullState(),
      wishes: [
        {
          id: 'w-1',
          title: 'ポワラーヌのパンを買う',
          area: 'パリ',
          done: true,
          note: '日曜は休み',
          url: 'https://example.com/poilane',
        },
        {
          // 題名だけのやりたいこと。任意キーが省略されたまま往復することを見る
          id: 'w-2',
          title: '本屋に入る',
          done: false,
        },
      ],
    }
    expect(await roundTrip(state)).toEqual(expected(state))
  })

  it('wishes が無ければ payload にも復元結果にもフィールドが現れない', async () => {
    // やりたいことを使っていない人の共有URLをこの機能で膨らませない
    const state = buildFullState()
    const decoded = requireDecoded(
      await decodeShareState(
        extractHash(await encodeShareUrl(state, BASE_URL)),
      ),
    )
    expect(decoded).not.toHaveProperty('wishes')
  })

  it('wishes の id は復元側で振り直される', async () => {
    const state: TripNotesState = {
      ...buildFullState(),
      wishes: [
        { id: 'w-original-1', title: '夜市を歩く', area: '台北', done: false },
        { id: 'w-original-2', title: '温泉に入る', area: '北投', done: true },
      ],
    }
    const decoded = requireDecoded(
      await decodeShareState(
        extractHash(await encodeShareUrl(state, BASE_URL)),
      ),
    )
    const ids = decoded.wishes?.map((wish) => wish.id) ?? []
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) {
      expect(id.startsWith('w-')).toBe(true)
      expect(id.startsWith('w-original')).toBe(false)
    }
    // done は「自分の進捗」なので、往復で裏返ってはいけない
    expect(decoded.wishes?.map((wish) => wish.done)).toEqual([false, true])
  })

  it('placeAliases が無ければ payload にも復元結果にもフィールドが現れない', async () => {
    // 使っていない人の共有URLをこの機能で膨らませない
    const state = buildFullState()
    const decoded = requireDecoded(
      await decodeShareState(
        extractHash(await encodeShareUrl(state, BASE_URL)),
      ),
    )
    expect(decoded).not.toHaveProperty('placeAliases')
  })

  describe('締切(checkInClosesMinutesBefore / bagDropClosesMinutesBefore)', () => {
    it('締切がラウンドトリップで保たれる', async () => {
      const state = buildFullState()
      // bookings[1] は flight(JL415)。締切は移動の予約にしか意味を持たない
      state.bookings[1] = {
        ...state.bookings[1],
        checkInClosesMinutesBefore: 45,
        bagDropClosesMinutesBefore: 60,
      }
      expect(await roundTrip(state)).toEqual(expected(state))
    })

    it('締切が無い予約では payload にキーが現れない', async () => {
      // buildFullState() の予約はどれも締切を入力していない。
      // travelDocs/placeAliases と同じく「値が無ければキーごと省く」ことを見る
      const state = buildFullState()
      const url = await encodeShareUrl(state, BASE_URL)
      const decoded = requireDecoded(await decodeShareState(extractHash(url)))
      for (const booking of decoded.bookings) {
        expect(booking).not.toHaveProperty('checkInClosesMinutesBefore')
        expect(booking).not.toHaveProperty('bagDropClosesMinutesBefore')
      }
    })
  })

  describe('オンラインチェックインの開放(onlineCheckInOpensMinutesBefore)', () => {
    it('開放時刻がラウンドトリップで保たれる(締切と同居しても混ざらない)', async () => {
      const state = buildFullState()
      // bookings[1] は flight(JL415)。開放も締切も移動の予約にしか意味を持たない
      state.bookings[1] = {
        ...state.bookings[1],
        onlineCheckInOpensMinutesBefore: 4320,
        checkInClosesMinutesBefore: 45,
        bagDropClosesMinutesBefore: 60,
      }
      const decoded = await roundTrip(state)
      expect(decoded).toEqual(expected(state))
      expect(decoded.bookings[1].onlineCheckInOpensMinutesBefore).toBe(4320)
      expect(decoded.bookings[1].checkInClosesMinutesBefore).toBe(45)
    })

    it('開放時刻が無い予約では payload にキーが現れない', async () => {
      // 締切と同じく「値が無ければキーごと省く」
      const state = buildFullState()
      const url = await encodeShareUrl(state, BASE_URL)
      const decoded = requireDecoded(await decodeShareState(extractHash(url)))
      for (const booking of decoded.bookings) {
        expect(booking).not.toHaveProperty('onlineCheckInOpensMinutesBefore')
      }
    })
  })

  describe('荷物枠(baggage)', () => {
    it('荷物枠がラウンドトリップで保たれる', async () => {
      const state = buildFullState()
      state.bookings[1] = {
        ...state.bookings[1],
        baggage: {
          personal: { pieces: 1, weightKg: 3 },
          cabin: { pieces: 1, weightKg: 7, dimensions: '55x40x20cm' },
          checked: { pieces: 1, weightKg: 23 },
        },
      }
      expect(await roundTrip(state)).toEqual(expected(state))
    })

    it('受託なし(pieces: 0)もラウンドトリップで保たれる', async () => {
      const state = buildFullState()
      state.bookings[1] = {
        ...state.bookings[1],
        baggage: { checked: { pieces: 0 } },
      }
      const decoded = await roundTrip(state)
      expect(decoded.bookings[1].baggage).toEqual({ checked: { pieces: 0 } })
    })

    it('荷物枠が無い予約では payload にキーが現れない', async () => {
      const state = buildFullState()
      const url = await encodeShareUrl(state, BASE_URL)
      const decoded = requireDecoded(await decodeShareState(extractHash(url)))
      for (const booking of decoded.bookings) {
        expect(booking).not.toHaveProperty('baggage')
      }
    })
  })

  describe('場所のラテン文字表記(latinName)', () => {
    it('v2 のラウンドトリップで latinName が保たれる', async () => {
      const state = buildFullState()
      const decoded = await roundTrip(state)
      expect(decoded).toEqual(expected(state))
      expect(decoded.bookings[0].place?.latinName).toBe('Paris')
      expect(decoded.bookings[1].from?.latinName).toBe('Tokyo')
      expect(decoded.bookings[1].to?.latinName).toBe('Paris')
    })

    it('v1(非圧縮フォールバック)でも latinName が保たれる', async () => {
      // ShortPlace は v1 / v2 で共通の形なので、圧縮が使えない環境でも落ちない
      const savedCompression = globalThis.CompressionStream
      const savedDecompression = globalThis.DecompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.CompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.DecompressionStream
      try {
        const state = buildFullState()
        const url = await encodeShareUrl(state, BASE_URL)
        expect(extractHash(url).startsWith('d=0')).toBe(true)
        const decoded = requireDecoded(await decodeShareState(extractHash(url)))
        expect(decoded).toEqual(withoutEvidence(state))
        expect(decoded.bookings[0].place?.latinName).toBe('Paris')
      } finally {
        globalThis.CompressionStream = savedCompression
        globalThis.DecompressionStream = savedDecompression
      }
    })

    it('latinName が無い場所には復元後もプロパティが生えない', async () => {
      // 他の任意キーと同じく「値が無ければキーごと省く」
      const state = buildFullState()
      state.bookings[0] = {
        ...state.bookings[0],
        place: { name: 'Hotel Le Marais' },
      }
      const decoded = requireDecoded(
        await decodeShareState(
          extractHash(await encodeShareUrl(state, BASE_URL)),
        ),
      )
      expect(decoded.bookings[0].place).toEqual({ name: 'Hotel Le Marais' })
      expect(decoded.bookings[0].place).not.toHaveProperty('latinName')
    })
  })

  it('# を付けても付けなくても同じ結果になる', async () => {
    const state = buildFullState()
    const url = await encodeShareUrl(state, BASE_URL)
    const hash = extractHash(url)
    const withHash = await decodeShareState(`#${hash}`)
    const withoutHash = await decodeShareState(hash)
    expect(normalizeIds(requireDecoded(withHash))).toEqual(expected(state))
    expect(normalizeIds(requireDecoded(withoutHash))).toEqual(expected(state))
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
    // マーカー文字だけを未知の文字に差し替える
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

  it('大きなstateはQR上限を超える', async () => {
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

    const share = await buildShare(state, BASE_URL)
    expect(share.length).toBeGreaterThan(QR_SAFE_LENGTH)
    expect(share.byteLength).toBeGreaterThan(QR_SAFE_BYTES)
  })

  it('小さなstateはQR上限に収まる', async () => {
    const share = await buildShare(buildFullState(), BASE_URL)
    expect(share.byteLength).toBeLessThanOrEqual(QR_SAFE_BYTES)
  })

  it('encodeShareUrlはbaseUrlに既存のハッシュがあっても#d=が二重にならない', async () => {
    const state = buildFullState()
    const url = await encodeShareUrl(state, `${BASE_URL}#old-hash-value`)
    expect(url.split('#').length).toBe(2)
    expect(url.startsWith(`${BASE_URL}#d=`)).toBe(true)
  })

  describe('id の振り直し', () => {
    it('復元された id は共有元と別の値になり、重複しない', async () => {
      const state = buildFullState()
      const url = await encodeShareUrl(state, BASE_URL)
      const decoded = requireDecoded(await decodeShareState(extractHash(url)))

      const ids = decoded.bookings.map((booking) => booking.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) {
        expect(id.startsWith('bk-')).toBe(true)
      }

      const contactIds = decoded.emergencyContacts.map((c) => c.id)
      expect(new Set(contactIds).size).toBe(contactIds.length)
      for (const id of contactIds) {
        expect(id.startsWith('ec-')).toBe(true)
      }
    })

    it('id を落としたぶん payload が短くなる', async () => {
      // 長い id を持つ state と短い id を持つ state で payload が変わらないこと
      // (= id が payload に含まれていないこと)
      const base = buildFullState()
      const longIds: TripNotesState = {
        ...base,
        bookings: base.bookings.map((booking, index) => ({
          ...booking,
          id: `bk-very-long-identifier-${index}-${'x'.repeat(40)}`,
        })),
      }
      expect(await estimateShareSize(longIds)).toBe(
        await estimateShareSize(base),
      )
    })

    it('予約の並び順は保たれる', async () => {
      const state = buildFullState()
      const decoded = await roundTrip(state)
      expect(decoded.bookings.map((b) => b.title)).toEqual([
        'Hotel Le Marais',
        'JL415',
        'ルーブル美術館',
      ])
    })
  })

  describe('タイムゾーン辞書', () => {
    it('辞書の並びは固定されている(添字がずれると既存URLが壊れる)', () => {
      expect(SHARE_TIMEZONES[0]).toBe('Asia/Tokyo')
      expect(SHARE_TIMEZONES[18]).toBe('Europe/Paris')
      expect(SHARE_TIMEZONES[SHARE_TIMEZONES.length - 1]).toBe('UTC')
      expect(new Set(SHARE_TIMEZONES).size).toBe(SHARE_TIMEZONES.length)
    })

    it('辞書にある名前は添字に、無い名前は生文字列になる', () => {
      expect(encodeShareTz('Europe/Paris')).toBe(18)
      expect(encodeShareTz('Pacific/Chatham')).toBe('Pacific/Chatham')
      expect(decodeShareTz(18)).toBe('Europe/Paris')
      expect(decodeShareTz('Pacific/Chatham')).toBe('Pacific/Chatham')
    })

    it('未知の添字は null(適当なタイムゾーンに寄せない)', () => {
      expect(decodeShareTz(SHARE_TIMEZONES.length)).toBeNull()
      expect(decodeShareTz(-1)).toBeNull()
      expect(decodeShareTz(1.5)).toBeNull()
      expect(decodeShareTz(undefined)).toBeNull()
    })

    it('辞書に無い IANA 名でも往復する', async () => {
      const state = buildFullState()
      state.pinnedTz = 'Pacific/Chatham'
      state.bookings[0].start = makeStamp(
        '2026-09-10',
        '15:00',
        'Pacific/Chatham',
      )
      state.bookings[0].end = makeStamp(
        '2026-09-13',
        '11:00',
        'Pacific/Chatham',
      )

      const decoded = await roundTrip(state)
      expect(decoded.pinnedTz).toBe('Pacific/Chatham')
      expect(stampTz(decoded.bookings[0].start)).toBe('Pacific/Chatham')
      expect(decoded).toEqual(expected(state))
    })

    it('辞書に無いタイムゾーンでも予約が落ちない(共有URLの主目的を壊さない)', async () => {
      const state = buildFullState()
      state.bookings[2].start = makeAllDayStamp('2026-09-14', 'Asia/Kathmandu')
      const decoded = await roundTrip(state)
      expect(decoded.bookings.length).toBe(3)
      expect(stampTz(decoded.bookings[2].start)).toBe('Asia/Kathmandu')
    })
  })

  describe('zdt の数値化', () => {
    /**
     * 秋の DST fall-back で同じ壁時計時刻が 2 回訪れるケース。
     * Europe/Paris は 2026-10-25 に +02:00 → +01:00 へ戻るので、
     * 02:30 が 2 回来る。分単位 epoch は瞬間なので、両方を区別して復元できる。
     */
    function ambiguousState(offset: '+02:00' | '+01:00'): TripNotesState {
      const state = buildFullState()
      state.startDate = '2026-10-24'
      state.endDate = '2026-10-26'
      state.bookings = [
        {
          id: 'ambiguous',
          kind: 'train',
          title: '夜行列車',
          start: {
            zdt: `2026-10-25T02:30:00${offset}[Europe/Paris]`,
            allDay: false,
          },
          end: null,
          status: 'confirmed',
          payment: 'paid',
        },
      ]
      state.emergencyContacts = []
      return state
    }

    it('DST fall-back の 1 回目(+02:00)が正しく復元される', async () => {
      const state = ambiguousState('+02:00')
      const decoded = await roundTrip(state)
      expect(decoded.bookings[0].start.zdt).toBe(
        '2026-10-25T02:30:00+02:00[Europe/Paris]',
      )
      expect(stampToEpoch(decoded.bookings[0].start)).toBe(
        stampToEpoch(state.bookings[0].start),
      )
    })

    it('DST fall-back の 2 回目(+01:00)が正しく復元される', async () => {
      const state = ambiguousState('+01:00')
      const decoded = await roundTrip(state)
      expect(decoded.bookings[0].start.zdt).toBe(
        '2026-10-25T02:30:00+01:00[Europe/Paris]',
      )
      expect(stampToEpoch(decoded.bookings[0].start)).toBe(
        stampToEpoch(state.bookings[0].start),
      )
    })

    it('曖昧な 2 つの時刻は payload の時点で別の値になる', async () => {
      const first = await estimateShareSize(ambiguousState('+02:00'))
      const second = await estimateShareSize(ambiguousState('+01:00'))
      // 長さが同じでも中身が違うことを確かめる
      expect(first).toBe(second)
      const a = await encodeShareUrl(ambiguousState('+02:00'), BASE_URL)
      const b = await encodeShareUrl(ambiguousState('+01:00'), BASE_URL)
      expect(a).not.toBe(b)
    })

    it('DST spring-forward の直後(存在しない時刻の隣)も往復する', async () => {
      const state = buildFullState()
      state.startDate = '2026-03-28'
      state.endDate = '2026-03-30'
      state.bookings = [
        {
          id: 'spring',
          kind: 'flight',
          title: '朝一の便',
          // 2026-03-29 の 02:00〜03:00 は存在しない。その直後の 03:30
          start: makeStamp('2026-03-29', '03:30', 'Europe/Paris'),
          end: null,
          status: 'confirmed',
          payment: 'paid',
        },
      ]
      state.emergencyContacts = []
      const decoded = await roundTrip(state)
      expect(decoded.bookings[0].start.zdt).toBe(
        '2026-03-29T03:30:00+02:00[Europe/Paris]',
      )
    })

    it('分に揃わない時刻(秒を持つ zdt)は生文字列にフォールバックして往復する', async () => {
      const state = buildFullState()
      state.bookings = [
        {
          id: 'seconds',
          kind: 'other',
          title: '秒を持つ予定',
          start: {
            zdt: '2026-09-12T14:20:33+02:00[Europe/Paris]',
            allDay: false,
          },
          end: null,
          status: 'confirmed',
          payment: 'paid',
        },
      ]
      state.emergencyContacts = []
      const decoded = await roundTrip(state)
      expect(decoded.bookings[0].start.zdt).toBe(
        '2026-09-12T14:20:33+02:00[Europe/Paris]',
      )
    })

    it('UTC の予定も往復する', async () => {
      const state = buildFullState()
      state.pinnedTz = 'UTC'
      state.bookings[1].start = makeStamp('2026-09-10', '00:50', 'UTC')
      const decoded = await roundTrip(state)
      expect(decoded).toEqual(expected(state))
    })
  })

  describe('CJK-16384(marker "3")', () => {
    it('明示的に指定したときだけ marker "3" になる', async () => {
      const state = buildFullState()
      const plain = await encodeShareUrl(state, BASE_URL)
      const kanji = await encodeShareUrl(state, BASE_URL, { cjk: true })
      expect(extractHash(plain).startsWith('d=2')).toBe(true)
      expect(extractHash(kanji).startsWith('d=3')).toBe(true)
    })

    it('ラウンドトリップで状態が保存される', async () => {
      const state = buildFullState()
      expect(await roundTrip(state, { cjk: true })).toEqual(expected(state))
    })

    it('marker "2" と同じ内容を運び、文字数は半分以下になる', async () => {
      const state = buildFullState()
      const plain = await buildShare(state, BASE_URL)
      const kanji = await buildShare(state, BASE_URL, { cjk: true })

      // 運んでいる中身(圧縮後のバイト列)は同じ
      expect(kanji.byteLength).toBe(plain.byteLength)
      expect(kanji.length).toBeLessThan(plain.length * 0.5)
    })

    it('payload の本体はすべて CJK統合漢字になる', async () => {
      const url = await encodeShareUrl(buildFullState(), BASE_URL, {
        cjk: true,
      })
      const body = extractHash(url).slice('d=3'.length)
      expect(body.length).toBeGreaterThan(0)
      for (const char of body) {
        const code = char.codePointAt(0) ?? -1
        expect(code).toBeGreaterThanOrEqual(0x4e00)
        expect(code).toBeLessThan(0x4e00 + 16384)
      }
    })

    it('ブラウザがパーセントエンコードしたフラグメントからも復元できる', async () => {
      // new URL() を通すと fragment percent-encode set により非ASCIIが
      // %E4%B8%80 のような形になる。URLSearchParams が自動でデコードするので
      // decodeShareState 側に手当ては要らない、という前提を固定する
      const state = buildFullState()
      const url = await encodeShareUrl(state, BASE_URL, { cjk: true })
      const percentEncoded = new URL(url).hash
      expect(percentEncoded).toContain('%')
      const decoded = requireDecoded(await decodeShareState(percentEncoded))
      expect(normalizeIds(decoded)).toEqual(expected(state))
    })

    it('本文に漢字以外が混ざったpayloadはnullを返す', async () => {
      const url = await encodeShareUrl(buildFullState(), BASE_URL, {
        cjk: true,
      })
      const hash = extractHash(url)
      await expect(decodeShareState(`${hash}A`)).resolves.toBeNull()
    })
  })

  describe('後方互換', () => {
    /**
     * 過去のビルドが実際に発行した形式の payload を固定値で持つ。
     * 共有URLはサーバに保存していないので、一度発行したURLは回収できない。
     * ここが落ちたら「利用者が持っているURLが読めなくなった」ということなので、
     * 期待値のほうを直してはいけない。
     */
    const MARKER_0_PAYLOAD =
      '0eyJ2IjoxLCJ0Ijoi5pen44OV44Kp44O844Oe44OD44OI44Gu5peFIiwicyI6IjIwMjYtMDktMTAiLCJlIjoiMjAyNi0wOS0yMCIsInoiOiJFdXJvcGUvUGFyaXMiLCJiIjpbeyJpIjoiYmstbGVnYWN5LTEiLCJrIjoibG9kZ2luZyIsInQiOiJIb3RlbCBMZSBNYXJhaXMiLCJzIjp7InoiOiIyMDI2LTA5LTEwVDE1OjAwOjAwKzAyOjAwW0V1cm9wZS9QYXJpc10ifSwiZSI6eyJ6IjoiMjAyNi0wOS0xM1QxMTowMDowMCswMjowMFtFdXJvcGUvUGFyaXNdIn0sInAiOnsibiI6IkhvdGVsIExlIE1hcmFpcyIsImwiOiLjgqrjg4bjg6vjg7vjg6vjg7vjg57jg6wiLCJhIjoiMTIgUnVlIGRlIFJpdm9saSwgUGFyaXMiLCJ0Ijo0OC44NTY2LCJnIjoyLjM1MjJ9LCJhIjoiY29uZmlybWVkIiwieSI6InBhaWQiLCJjIjoiQUJDMTIzIiwidiI6IkJvb2tpbmcuY29tIiwiciI6eyJhIjo0NTAwMCwiYyI6IkpQWSJ9LCJ4IjoiMjAyNi0wOS0wMSIsIm4iOiLjgqjjg6zjg5njg7zjgr_jg7zjgarjgZciLCJxIjpbImZyZWVDYW5jZWxVbnRpbCJdfSx7ImkiOiJiay1sZWdhY3ktMiIsImsiOiJhY3Rpdml0eSIsInQiOiLjg6vjg7zjg5bjg6vnvo7ooZPppKgiLCJzIjp7InoiOiIyMDI2LTA5LTE0VDAwOjAwOjAwKzAyOjAwW0V1cm9wZS9QYXJpc10iLCJhIjp0cnVlfSwiYSI6ImlkZWEiLCJ5IjoidW5wYWlkIn1dLCJjIjpbeyJpIjoiZWMtbGVnYWN5LTEiLCJsIjoi5Zyo44OV44Op44Oz44K55pel5pys5aSn5L2_6aSoIiwidiI6IiszMy0xLTQ4ODgtNjIwMCIsIm4iOiLlubPml6U5LTE35pmC44Gu44G_In1dfQ'

    const MARKER_1_PAYLOAD =
      '1fZJPaxNBGMa_yvJcOxtnJ39M59YWQUShlHiQkMN2Mw1DtrtxswnGsIdkUDx5EQ2FUhBamrahl55Kq_kwY1b9FjKbLYZSvQzDyzzzPu_veYfogzsEMTjSyalWn_X4TKtbrY60Ulp90KPLdPIOBF1wMMoqNl23HQoCsVJgpvAWHE96UdgRj7bdSHZBsAteH0KCY7dt-6LlegPbAUEbHH7YbMmghWXzp2EsfOu5sF64kZtpu-DD7M-_XWtOmVPKKV2jjFNaX-3WQJJ5uqcp1hzn_5qO0QQPWvDBocfnWr3X6kKrm7vzSKsZCFxwOMza6QmrKawd2Q99Say72WPwUrVQLVcqBC1wViiWGUuWKi8M9mS0L5ogGICj40pz9cCxsbnlsCKICQabYdiWQavghfsgiIxTF7xUppQuXz_bfmVmeLMyMjWAg8z5VKuZVgcmz_HcnKNzPZqA4DV4HXuREFtu4An_ZRBLH42E3M-K5Vm5Xiz7Mh7kYWUcbrX6otXFz-8ff3399Pt4-mBkpVrG_l_4Mxpx1BM5F9kUbo6kF2RQkkY2aL5FwlvdIhPP4nBqlladaXWlx9fp5CQ9nC2OT398my89GYxrxaLt2KVqtWpXGKU5n8X1VTo5Wbedx-nBWI8u9WiOpJH8AQ'

    it('marker "0"(無圧縮 + base64url)の既存URLが今も読める', async () => {
      const decoded = await decodeShareState(`#d=${MARKER_0_PAYLOAD}`)
      expect(decoded).toEqual(legacyState())
    })

    it('marker "1"(短縮キー + deflate + base64url)の既存URLが今も読める', async () => {
      const decoded = await decodeShareState(`#d=${MARKER_1_PAYLOAD}`)
      expect(decoded).toEqual(legacyState())
    })

    /**
     * placeAliases を足す前のビルドが出した marker "2" の payload。
     * v2 に任意キーを 1 つ増やしたことで、そのキーを持たない既存URLが
     * 読めなくなっていないことを見る(キーが無い = 1 組も登録していない)。
     */
    const MARKER_2_PAYLOAD_WITHOUT_ALIASES =
      '2bZLPattAEMZfRXzXroy0_hN5b00upbQQAj0U44Mqb8wSWUoV2TQ1OlhLS0-9lNQEQqCQECcxueQUmtYPM7XavkVZySku9DIsMzvfzPfbHWME4TKkECimF6SPKL8kfU_6lLQm_YEmN8X0HRgOIMAd3rKdtu06YJBrCW4SbyFcj-EVRGeMPQiEca-voj4q-SdxKkPrmbSe-4mvDirJMQYQvO25Gw3urCSyUvuhwt2ms1bZN5Xov3IhBCi_Iv2e9DXprw_xlPQcDD4EXG7tDKXVk9aOGsWhYta2n5TNKUTDq3nNVouhD8Fr9SbnWdUVxNGuSgayB4ZDCOz7yhwDCDze3HJ5HcxgxGYc76moXwviARgSs6kP0Wg6xoC5_XT7JTKGN2vkHBes9EP5jPSc9LGhny9MnFzRZAqG1xAd7CZSbvlRIMMXUapCdDNWUfaDVI1UerjCXLq-J_2Z9PXP7x9_ffn0-2z2L2zOuef8fS8fIk2GcuVV9aS_sjmMSqNZt1y-My4BL09m5pPoS9K3lN8V0_PiZL48u_jxbVHNMSAe1eu2azc8z7Nb3HFWDpd3t8X0vG27G8VxTpMbmiyQdbM_'

    it('marker "2" の既存URL(placeAliases のキーが無い)が今も読める', async () => {
      const decoded = requireDecoded(
        await decodeShareState(`#d=${MARKER_2_PAYLOAD_WITHOUT_ALIASES}`),
      )
      expect(decoded).not.toHaveProperty('placeAliases')
      expect(normalizeIds(decoded)).toEqual(normalizeIds(legacyState()))
    })

    /**
     * 同じ payload は travelDocs(手続き)のキーも持っていない。
     * v2 に任意キーを足すたびにここを増やすのは、「キーが無い = その機能を
     * 一度も使っていない」と読めることが、発行済みURLが読めるための条件だから。
     * 既存URLの持ち主が手続きを登録していないのは当たり前で、
     * そのURLが「壊れたURL」になってはいけない。
     */
    it('marker "2" の既存URL(travelDocs のキーが無い)が今も読める', async () => {
      const decoded = requireDecoded(
        await decodeShareState(`#d=${MARKER_2_PAYLOAD_WITHOUT_ALIASES}`),
      )
      expect(decoded).not.toHaveProperty('travelDocs')
      expect(decoded.bookings).toHaveLength(2)
      expect(decoded.emergencyContacts).toHaveLength(1)
    })

    /**
     * 同じ payload は締切 2 種(h / b)のキーも持っていない
     * (締切を足す前のビルドが出した URL のため)。placeAliases/travelDocs と
     * 同じ理由で、キーが無い予約に締切のプロパティが生えてはいけない。
     */
    it('marker "2" の既存URL(締切のキーが無い)が今も読める。予約に締切のプロパティは生えない', async () => {
      const decoded = requireDecoded(
        await decodeShareState(`#d=${MARKER_2_PAYLOAD_WITHOUT_ALIASES}`),
      )
      expect(decoded.bookings).toHaveLength(2)
      for (const booking of decoded.bookings) {
        expect(booking).not.toHaveProperty('checkInClosesMinutesBefore')
        expect(booking).not.toHaveProperty('bagDropClosesMinutesBefore')
      }
    })

    /**
     * 同じ payload は countryInfos(国の基本情報)のキーも持っていない。
     * 「キーが無い = その機能を一度も使っていない」と読めることが、
     * 発行済みURLが読めるための条件なので、任意キーを足すたびにここを増やす。
     */
    it('marker "2" の既存URL(countryInfos のキーが無い)が今も読める', async () => {
      const decoded = requireDecoded(
        await decodeShareState(`#d=${MARKER_2_PAYLOAD_WITHOUT_ALIASES}`),
      )
      expect(decoded).not.toHaveProperty('countryInfos')
      expect(decoded.bookings).toHaveLength(2)
      expect(decoded.emergencyContacts).toHaveLength(1)
    })

    /**
     * 同じ payload は wishes(やりたいこと)のキーも持っていない。
     * countryInfos と同じ理由で、任意キーを足すたびにここを増やす。
     */
    it('marker "2" の既存URL(wishes のキーが無い)が今も読める', async () => {
      const decoded = requireDecoded(
        await decodeShareState(`#d=${MARKER_2_PAYLOAD_WITHOUT_ALIASES}`),
      )
      expect(decoded).not.toHaveProperty('wishes')
      expect(decoded.bookings).toHaveLength(2)
      expect(decoded.emergencyContacts).toHaveLength(1)
    })

    /**
     * 同じ payload はオンラインチェックインの開放(w)のキーも持っていない。
     * 締切 2 種と同じ理由で、キーが無い予約に開放時刻のプロパティが生えてはいけない
     * (生えると「入力していない時刻」が入力済みとして扱われる)。
     */
    it('marker "2" の既存URL(開放時刻のキーが無い)が今も読める。予約に開放時刻のプロパティは生えない', async () => {
      const decoded = requireDecoded(
        await decodeShareState(`#d=${MARKER_2_PAYLOAD_WITHOUT_ALIASES}`),
      )
      expect(decoded.bookings).toHaveLength(2)
      for (const booking of decoded.bookings) {
        expect(booking).not.toHaveProperty('onlineCheckInOpensMinutesBefore')
      }
    })

    /**
     * ShortPlace はトップレベルではなく場所の中に任意キーを足した例。
     * 場所を持つ既存URLは大量に発行されているので、キーが無いこと
     * (= ラテン文字表記を入力していない場所)がそのまま読めなければならない。
     */
    it('marker "2" の既存URL(latinName のキーが無い)が今も読める', async () => {
      const decoded = requireDecoded(
        await decodeShareState(`#d=${MARKER_2_PAYLOAD_WITHOUT_ALIASES}`),
      )
      expect(decoded.bookings[0].place?.name).toBe('Hotel Le Marais')
      expect(decoded.bookings[0].place).not.toHaveProperty('latinName')
    })

    it('marker "0" / "1" の既存URLにも latinName は生えない', async () => {
      const fromZero = requireDecoded(
        await decodeShareState(`#d=${MARKER_0_PAYLOAD}`),
      )
      const fromOne = requireDecoded(
        await decodeShareState(`#d=${MARKER_1_PAYLOAD}`),
      )
      expect(fromZero.bookings[0].place?.localName).toBe('オテル・ル・マレ')
      expect(fromZero.bookings[0].place).not.toHaveProperty('latinName')
      expect(fromOne.bookings[0].place).not.toHaveProperty('latinName')
    })

    it('marker "0" / "1" の既存URLにも travelDocs は生えない', async () => {
      // v1 形式にはそもそも手続きのキーが無い(ShortState 参照)
      expect(
        await decodeShareState(`#d=${MARKER_0_PAYLOAD}`),
      ).not.toHaveProperty('travelDocs')
      expect(
        await decodeShareState(`#d=${MARKER_1_PAYLOAD}`),
      ).not.toHaveProperty('travelDocs')
    })

    it('marker "0" / "1" の既存URLにも wishes は生えない', async () => {
      // やりたいことも v2 にだけ載せたので、v1 形式にはキーが無い
      expect(
        await decodeShareState(`#d=${MARKER_0_PAYLOAD}`),
      ).not.toHaveProperty('wishes')
      expect(
        await decodeShareState(`#d=${MARKER_1_PAYLOAD}`),
      ).not.toHaveProperty('wishes')
    })

    it('marker "0" / "1" の既存URLにも countryInfos は生えない', async () => {
      // 国の基本情報も v2 にだけ載せたので、v1 形式にはキーが無い
      expect(
        await decodeShareState(`#d=${MARKER_0_PAYLOAD}`),
      ).not.toHaveProperty('countryInfos')
      expect(
        await decodeShareState(`#d=${MARKER_1_PAYLOAD}`),
      ).not.toHaveProperty('countryInfos')
    })

    it('marker "0" / "1" では id がそのまま復元される(振り直しは v2 以降の挙動)', async () => {
      const fromZero = requireDecoded(
        await decodeShareState(`#d=${MARKER_0_PAYLOAD}`),
      )
      const fromOne = requireDecoded(
        await decodeShareState(`#d=${MARKER_1_PAYLOAD}`),
      )
      expect(fromZero.bookings.map((b) => b.id)).toEqual([
        'bk-legacy-1',
        'bk-legacy-2',
      ])
      expect(fromOne.emergencyContacts[0].id).toBe('ec-legacy-1')
    })
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
        // 無圧縮フォールバックは v1 形式なので id もそのまま戻る
        expect(decoded).toEqual(withoutEvidence(state))
      } finally {
        globalThis.CompressionStream = savedCompression
        globalThis.DecompressionStream = savedDecompression
      }
    })

    it('非圧縮(v1 形式)では travelDocs が落ちるが、予約は全部残る', async () => {
      // v1 は発行済みURLを読むための固定された形なので書き足していない(share.ts 参照)。
      // 手続きの一覧は空になるが、旅程そのもの(予約)は 1 件も失われない
      const savedCompression = globalThis.CompressionStream
      const savedDecompression = globalThis.DecompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.CompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.DecompressionStream
      try {
        const state: TripNotesState = {
          ...buildFullState(),
          travelDocs: [
            { id: 'td-1', kind: 'visa', title: 'ETIAS', status: 'done' },
          ],
        }
        const url = await encodeShareUrl(state, BASE_URL)
        const decoded = requireDecoded(await decodeShareState(extractHash(url)))
        expect(decoded).not.toHaveProperty('travelDocs')
        expect(decoded.bookings).toHaveLength(state.bookings.length)
      } finally {
        globalThis.CompressionStream = savedCompression
        globalThis.DecompressionStream = savedDecompression
      }
    })

    it('非圧縮(v1 形式)では placeAliases が落ちる', async () => {
      // v1 は発行済みURLを読むための固定された形なので書き足していない(share.ts 参照)。
      // 落ちるのは警告を黙らせる設定だけで、旅程そのものは失われない
      const savedCompression = globalThis.CompressionStream
      const savedDecompression = globalThis.DecompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.CompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.DecompressionStream
      try {
        const state: TripNotesState = {
          ...buildFullState(),
          placeAliases: [{ id: 'pa-1', names: ['Faro', 'アルガルヴェ'] }],
        }
        const url = await encodeShareUrl(state, BASE_URL)
        const decoded = requireDecoded(await decodeShareState(extractHash(url)))
        expect(decoded).not.toHaveProperty('placeAliases')
        expect(decoded.bookings).toHaveLength(state.bookings.length)
      } finally {
        globalThis.CompressionStream = savedCompression
        globalThis.DecompressionStream = savedDecompression
      }
    })

    it('非圧縮(v1 形式)では countryInfos が落ちるが、予約は全部残る', async () => {
      // v1 は発行済みURLを読むための固定された形なので書き足していない(share.ts 参照)。
      // 国の一覧は空になるが、旅程そのもの(予約)は 1 件も失われない
      const savedCompression = globalThis.CompressionStream
      const savedDecompression = globalThis.DecompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.CompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.DecompressionStream
      try {
        const state: TripNotesState = {
          ...buildFullState(),
          countryInfos: [{ id: 'ci-1', name: 'マルタ', plugTypes: 'G' }],
        }
        const url = await encodeShareUrl(state, BASE_URL)
        const decoded = requireDecoded(await decodeShareState(extractHash(url)))
        expect(decoded).not.toHaveProperty('countryInfos')
        expect(decoded.bookings).toHaveLength(state.bookings.length)
      } finally {
        globalThis.CompressionStream = savedCompression
        globalThis.DecompressionStream = savedDecompression
      }
    })

    it('圧縮が使えないときは漢字を指定しても非圧縮の"0"になる', async () => {
      const savedCompression = globalThis.CompressionStream
      const savedDecompression = globalThis.DecompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.CompressionStream
      // @ts-expect-error テストのために意図的にグローバルを消す
      delete globalThis.DecompressionStream
      try {
        const url = await encodeShareUrl(buildFullState(), BASE_URL, {
          cjk: true,
        })
        expect(extractHash(url).startsWith('d=0')).toBe(true)
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
      // 通常のテスト環境では圧縮APIが使えるので '2' 始まりになっているはず
      expect(hash.startsWith('d=2')).toBe(true)

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
