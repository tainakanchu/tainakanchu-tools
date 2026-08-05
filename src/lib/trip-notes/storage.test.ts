import { afterEach, describe, expect, it } from 'vitest'
import { makeStamp } from './datetime'
import {
  FIELD_KEYS,
  createInitialState,
  loadFromStorage,
  parseTripNotesState,
  requestPersistentStorage,
} from './storage'
import type {
  Booking,
  CountryInfo,
  EmergencyContact,
  TravelDoc,
  TripNotesState,
  Wish,
} from './types'

/** 宿泊 1 件、任意フィールド全部入りの現実的な booking */
function fullBooking(): Booking {
  return {
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
  }
}

function fullEmergencyContacts(): Array<EmergencyContact> {
  return [
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
  ]
}

/** 任意フィールド全部入りの手続き。壊れた値を混ぜるテストの土台にも使う */
function fullTravelDoc(): TravelDoc {
  return {
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
  }
}

/** 任意フィールド全部入りの国情報。壊れた値を混ぜるテストの土台にも使う */
function fullCountryInfo(): CountryInfo {
  return {
    id: 'ci-1',
    name: 'マルタ',
    latinName: 'Malta',
    plugTypes: 'G',
    voltage: '230V 50Hz',
    tipping: '不要。高級店では10%',
    emergencyPolice: '112',
    emergencyAmbulance: '112',
    note: '左側通行',
  }
}

/** 任意フィールド全部入りのやりたいこと */
function fullWish(): Wish {
  return {
    id: 'w-1',
    title: 'ポワラーヌのパンを買う',
    area: 'パリ',
    done: true,
    note: '日曜は休み',
    url: 'https://example.test/poilane',
  }
}

function fullState(): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'ヨーロッパ周遊',
    startDate: '2026-09-10',
    endDate: '2026-09-20',
    pinnedTz: 'Europe/Paris',
    bookings: [fullBooking()],
    emergencyContacts: fullEmergencyContacts(),
  }
}

describe('parseTripNotesState', () => {
  it('正常な state がそのまま復元される(全フィールド入り)', () => {
    const state = fullState()
    expect(parseTripNotesState(state)).toEqual(state)
  })

  it('schemaVersion が 1 でなければ null', () => {
    expect(parseTripNotesState({ ...fullState(), schemaVersion: 2 })).toBeNull()
  })

  it('オブジェクトでなければ null', () => {
    expect(parseTripNotesState('not-an-object')).toBeNull()
    expect(parseTripNotesState(null)).toBeNull()
    expect(parseTripNotesState(42)).toBeNull()
  })

  it('startDate が不正なら null', () => {
    expect(
      parseTripNotesState({ ...fullState(), startDate: '2026-13-40' }),
    ).toBeNull()
  })

  it('必須フィールドが欠けている・不正な booking は黙って落ち、正常な booking は残る', () => {
    const valid = fullBooking()
    const state = {
      ...fullState(),
      bookings: [
        valid,
        { ...fullBooking(), id: undefined }, // id が無い
        { ...fullBooking(), kind: 'spaceship' }, // kind が未知
        { ...fullBooking(), status: 'urgent' }, // status が未知
        { ...fullBooking(), start: undefined }, // start が無い
      ],
    }
    const parsed = parseTripNotesState(state)
    expect(parsed?.bookings).toHaveLength(1)
    expect(parsed?.bookings[0]).toEqual(valid)
  })

  it('start.zdt が壊れた文字列の booking は落ちる', () => {
    const state = {
      ...fullState(),
      bookings: [
        fullBooking(),
        {
          ...fullBooking(),
          id: 'broken-1',
          start: { zdt: 'not-a-datetime', allDay: false },
        },
        {
          ...fullBooking(),
          id: 'broken-2',
          // タイムゾーン注釈([Europe/Paris] 等)が無い ISO 文字列は
          // Temporal.ZonedDateTime.from が例外を投げる
          start: { zdt: '2026-06-12T14:20:00', allDay: false },
        },
      ],
    }
    const parsed = parseTripNotesState(state)
    expect(parsed?.bookings).toHaveLength(1)
  })

  it('不正な IANA タイムゾーンを持つ booking はフォールバックせず丸ごと落ちる', () => {
    const state = {
      ...fullState(),
      bookings: [
        fullBooking(),
        {
          ...fullBooking(),
          id: 'mars-trip',
          start: { zdt: '2026-06-12T14:20:00[Mars/Olympus]', allDay: false },
        },
      ],
    }
    const parsed = parseTripNotesState(state)
    expect(parsed?.bookings).toHaveLength(1)
    expect(parsed?.bookings.some((b) => b.id === 'mars-trip')).toBe(false)
  })

  it('end.zdt が不正なら end が null になり booking 自体は残る', () => {
    const state = {
      ...fullState(),
      bookings: [
        { ...fullBooking(), end: { zdt: 'not-a-datetime', allDay: false } },
      ],
    }
    const parsed = parseTripNotesState(state)
    expect(parsed?.bookings).toHaveLength(1)
    expect(parsed?.bookings[0].end).toBeNull()
  })

  it('allDay が boolean でない booking は落ちる', () => {
    const state = {
      ...fullState(),
      bookings: [
        fullBooking(),
        {
          ...fullBooking(),
          id: 'bad-allday',
          start: { zdt: '2026-06-12T14:20:00[Europe/Paris]', allDay: 'yes' },
        },
      ],
    }
    const parsed = parseTripNotesState(state)
    expect(parsed?.bookings).toHaveLength(1)
  })

  it('任意フィールドの不正値はそのフィールドだけ落ちる', () => {
    const state = {
      ...fullState(),
      bookings: [
        {
          ...fullBooking(),
          price: { amount: '45000', currency: 'JPY' }, // amount が文字列
          place: { name: 'Hotel', lat: Number.NaN, lng: 2.3522 }, // lat が NaN
          freeCancelUntil: '2026-13-40', // 存在しない月日
        },
      ],
    }
    const booking = parseTripNotesState(state)?.bookings[0]
    expect(booking).toBeDefined()
    expect(booking?.price).toBeUndefined()
    expect(booking?.place?.name).toBe('Hotel')
    expect(booking?.place?.lat).toBeUndefined()
    expect(booking?.place?.lng).toBe(2.3522)
    expect(booking?.freeCancelUntil).toBeUndefined()
  })

  it('place.latinName は文字列なら残り、往復しても失われない', () => {
    // 日本語の地名しか持たない予約でも、この欄があれば外部リンクが機能する
    // (searchLinks.ts の placeName)。保存で落ちると機能ごと消える
    const place = { name: '香港国際空港 T2', latinName: 'Hong Kong' }
    const state = {
      ...fullState(),
      bookings: [{ ...fullBooking(), place }],
    }
    expect(parseTripNotesState(state)?.bookings[0].place).toEqual(place)
  })

  it('place.latinName が文字列でなければその欄だけ落ち、場所は残る', () => {
    const state = {
      ...fullState(),
      bookings: [
        {
          ...fullBooking(),
          place: { name: '香港国際空港 T2', latinName: 123 },
        },
      ],
    }
    const booking = parseTripNotesState(state)?.bookings[0]
    expect(booking?.place?.name).toBe('香港国際空港 T2')
    expect(booking?.place).not.toHaveProperty('latinName')
  })

  it('latinName を持たない保存済みデータは今までどおり読める', () => {
    // この欄を足す前の localStorage には latinName が無い。
    // 欄ごと生えないこと(undefined のキーが増えないこと)まで見る
    const state = {
      ...fullState(),
      bookings: [{ ...fullBooking(), place: { name: 'Hotel Le Marais' } }],
    }
    const booking = parseTripNotesState(state)?.bookings[0]
    expect(booking?.place).toEqual({ name: 'Hotel Le Marais' })
    expect(booking?.place).not.toHaveProperty('latinName')
  })

  it('unverified の未知キーは除去され、空になれば undefined になる', () => {
    const withKnownAndUnknown = {
      ...fullState(),
      bookings: [{ ...fullBooking(), unverified: ['title', 'not-a-field'] }],
    }
    expect(
      parseTripNotesState(withKnownAndUnknown)?.bookings[0].unverified,
    ).toEqual(['title'])

    const onlyUnknown = {
      ...fullState(),
      bookings: [{ ...fullBooking(), unverified: ['not-a-field'] }],
    }
    expect(
      parseTripNotesState(onlyUnknown)?.bookings[0].unverified,
    ).toBeUndefined()
  })

  it('evidence の不正エントリは除去される', () => {
    const state = {
      ...fullState(),
      bookings: [
        {
          ...fullBooking(),
          evidence: {
            title: 'メール本文の抜粋',
            'not-a-field': 'これは既知の FieldKey ではない',
            note: 42, // 値が文字列でない
          },
        },
      ],
    }
    const evidence = parseTripNotesState(state)?.bookings[0].evidence
    expect(evidence).toEqual({ title: 'メール本文の抜粋' })
  })

  it('pinnedTz が不正なら null になる', () => {
    const state = { ...fullState(), pinnedTz: 'Mars/Olympus' }
    expect(parseTripNotesState(state)?.pinnedTz).toBeNull()
  })

  it('emergencyContacts の不正要素は落ちる', () => {
    const state = {
      ...fullState(),
      emergencyContacts: [
        ...fullEmergencyContacts(),
        { id: 'bad-1', label: '欠落' }, // value が無い
        { label: '欠落', value: '000' }, // id が無い
      ],
    }
    const parsed = parseTripNotesState(state)
    expect(parsed?.emergencyContacts).toHaveLength(2)
  })

  it('placeAliases の正常な組は残り、不正要素だけが落ちる', () => {
    const state = {
      ...fullState(),
      placeAliases: [
        { id: 'pa-1', names: ['マルタ・ルア国際空港', 'マルタの知人宅'] },
        { id: 'pa-2', names: ['パリ'] }, // 2 つ揃っていない
        { id: 'pa-3', names: ['パリ', 'パリ市内', 'パリ近郊'] }, // 3 つある
        { id: 'pa-4', names: ['パリ', 4] }, // 文字列でない
        { names: ['パリ', 'パリ市内'] }, // id が無い
        { id: 'pa-5' }, // names が無い
      ],
    }
    expect(parseTripNotesState(state)?.placeAliases).toEqual([
      { id: 'pa-1', names: ['マルタ・ルア国際空港', 'マルタの知人宅'] },
    ])
  })

  it('placeAliases が空・不正・欠落ならフィールドごと付かない', () => {
    // 「一度も使っていない」ことを空配列で表現すると、JSON も共有URLも無駄に伸びる
    expect(
      parseTripNotesState({ ...fullState(), placeAliases: [] }),
    ).not.toHaveProperty('placeAliases')
    expect(
      parseTripNotesState({ ...fullState(), placeAliases: [{ id: 'pa-1' }] }),
    ).not.toHaveProperty('placeAliases')
    expect(
      parseTripNotesState({ ...fullState(), placeAliases: 'なにか' }),
    ).not.toHaveProperty('placeAliases')
    expect(parseTripNotesState(fullState())).not.toHaveProperty('placeAliases')
  })

  it('任意フィールド全部入りの travelDocs がそのまま復元される', () => {
    const state = { ...fullState(), travelDocs: [fullTravelDoc()] }
    expect(parseTripNotesState(state)).toEqual(state)
  })

  it('travelDocs の正常な要素は残り、必須が壊れた要素だけが落ちる', () => {
    const state = {
      ...fullState(),
      travelDocs: [
        fullTravelDoc(),
        { ...fullTravelDoc(), id: undefined }, // id が無い
        { ...fullTravelDoc(), kind: 'passport-photo' }, // kind が未知
        { ...fullTravelDoc(), status: 'maybe' }, // status が未知
        { ...fullTravelDoc(), title: 42 }, // title が文字列でない
        'ビザ', // そもそもオブジェクトでない
      ],
    }
    expect(parseTripNotesState(state)?.travelDocs).toEqual([fullTravelDoc()])
  })

  it('travelDocs の任意フィールドの不正値は、そのフィールドだけ落ちる', () => {
    // 手続き自体は残す。1 つの日付が壊れているだけで参照番号まで消えると、
    // 旅先で番号を見せられなくなるほうが困る
    const state = {
      ...fullState(),
      travelDocs: [
        {
          ...fullTravelDoc(),
          region: 42,
          dueDate: '2026-13-40', // 暦にない日付
          validFrom: 'いつか',
          validUntil: '2026/09/20', // 区切りが違う
          price: { amount: 'たかい', currency: 'EUR' },
          url: 12345,
        },
      ],
    }
    const parsed = parseTripNotesState(state)?.travelDocs?.[0]
    expect(parsed).toEqual({
      id: 'td-1',
      kind: 'visa',
      title: 'ETIAS',
      status: 'done',
      referenceNumber: 'ETIAS-2026-0001',
      note: '有効期間は 3 年',
    })
  })

  it('travelDocs が空・不正・欠落ならフィールドごと付かない', () => {
    expect(
      parseTripNotesState({ ...fullState(), travelDocs: [] }),
    ).not.toHaveProperty('travelDocs')
    expect(
      parseTripNotesState({ ...fullState(), travelDocs: [{ id: 'td-1' }] }),
    ).not.toHaveProperty('travelDocs')
    expect(
      parseTripNotesState({ ...fullState(), travelDocs: 'なにか' }),
    ).not.toHaveProperty('travelDocs')
    expect(parseTripNotesState(fullState())).not.toHaveProperty('travelDocs')
  })

  it('任意フィールド全部入りの countryInfos がそのまま復元される', () => {
    const state = { ...fullState(), countryInfos: [fullCountryInfo()] }
    expect(parseTripNotesState(state)).toEqual(state)
  })

  it('countryInfos の正常な要素は残り、必須が壊れた要素だけが落ちる', () => {
    const state = {
      ...fullState(),
      countryInfos: [
        fullCountryInfo(),
        { ...fullCountryInfo(), id: undefined }, // id が無い
        { ...fullCountryInfo(), name: undefined }, // name が無い
        { ...fullCountryInfo(), name: 42 }, // name が文字列でない
        'マルタ', // そもそもオブジェクトでない
      ],
    }
    expect(parseTripNotesState(state)?.countryInfos).toEqual([
      fullCountryInfo(),
    ])
  })

  it('name が空文字・空白だけの countryInfos は落ちる', () => {
    // name はこの国情報の唯一の識別子で、AI パッチの照合キーにもなる。
    // 空だと何にも結び付けられない行が一覧に並ぶだけになる
    const state = {
      ...fullState(),
      countryInfos: [
        fullCountryInfo(),
        { ...fullCountryInfo(), id: 'ci-blank', name: '' },
        { ...fullCountryInfo(), id: 'ci-spaces', name: '  ' },
      ],
    }
    expect(parseTripNotesState(state)?.countryInfos).toEqual([
      fullCountryInfo(),
    ])
  })

  it('countryInfos の任意フィールドの不正値は、そのフィールドだけ落ちる', () => {
    // プラグ形状が壊れているだけで緊急通報番号まで消えるほうが困る
    const state = {
      ...fullState(),
      countryInfos: [
        {
          ...fullCountryInfo(),
          plugTypes: 42,
          voltage: null,
          tipping: { amount: 10 },
          note: ['左側通行'],
        },
      ],
    }
    expect(parseTripNotesState(state)?.countryInfos?.[0]).toEqual({
      id: 'ci-1',
      name: 'マルタ',
      latinName: 'Malta',
      emergencyPolice: '112',
      emergencyAmbulance: '112',
    })
  })

  it('countryInfos が空・不正・欠落ならフィールドごと付かない', () => {
    expect(
      parseTripNotesState({ ...fullState(), countryInfos: [] }),
    ).not.toHaveProperty('countryInfos')
    expect(
      parseTripNotesState({ ...fullState(), countryInfos: [{ id: 'ci-1' }] }),
    ).not.toHaveProperty('countryInfos')
    expect(
      parseTripNotesState({ ...fullState(), countryInfos: 'なにか' }),
    ).not.toHaveProperty('countryInfos')
    expect(parseTripNotesState(fullState())).not.toHaveProperty('countryInfos')
  })

  it('任意フィールド全部入りの wishes がそのまま復元される', () => {
    const state = { ...fullState(), wishes: [fullWish()] }
    expect(parseTripNotesState(state)).toEqual(state)
  })

  it('wishes の正常な要素は残り、必須が壊れた要素だけが落ちる', () => {
    const state = {
      ...fullState(),
      wishes: [
        fullWish(),
        { ...fullWish(), id: undefined }, // id が無い
        { ...fullWish(), title: undefined }, // title が無い
        { ...fullWish(), title: '' }, // title が空
        { ...fullWish(), title: '   ' }, // title が空白だけ
        'パンを買う', // そもそもオブジェクトでない
      ],
    }
    expect(parseTripNotesState(state)?.wishes).toEqual([fullWish()])
  })

  it('wishes の done が真偽値でなければ false に寄せる', () => {
    // 壊れた値を「済んだこと」として復元すると、やっていないことが
    // 済んだ扱いで下に沈み、しかも本人が気付けない
    const state = {
      ...fullState(),
      wishes: [
        { id: 'w-a', title: '夜市を歩く', done: 'yes' },
        { id: 'w-b', title: '温泉に入る' },
      ],
    }
    expect(parseTripNotesState(state)?.wishes).toEqual([
      { id: 'w-a', title: '夜市を歩く', done: false },
      { id: 'w-b', title: '温泉に入る', done: false },
    ])
  })

  it('wishes の任意フィールドの不正値は、そのフィールドだけ落ちる', () => {
    const state = {
      ...fullState(),
      wishes: [{ ...fullWish(), area: 42, note: null, url: ['https://x'] }],
    }
    expect(parseTripNotesState(state)?.wishes?.[0]).toEqual({
      id: 'w-1',
      title: 'ポワラーヌのパンを買う',
      done: true,
    })
  })

  it('wishes が空・不正・欠落ならフィールドごと付かない', () => {
    expect(
      parseTripNotesState({ ...fullState(), wishes: [] }),
    ).not.toHaveProperty('wishes')
    expect(
      parseTripNotesState({ ...fullState(), wishes: [{ id: 'w-1' }] }),
    ).not.toHaveProperty('wishes')
    expect(
      parseTripNotesState({ ...fullState(), wishes: 'なにか' }),
    ).not.toHaveProperty('wishes')
    expect(parseTripNotesState(fullState())).not.toHaveProperty('wishes')
  })

  describe('締切(checkInClosesMinutesBefore / bagDropClosesMinutesBefore)', () => {
    it('妥当な締切(整数・1〜1440)は保持される', () => {
      const state = {
        ...fullState(),
        bookings: [
          {
            ...fullBooking(),
            checkInClosesMinutesBefore: 45,
            bagDropClosesMinutesBefore: 1440,
          },
        ],
      }
      const booking = parseTripNotesState(state)?.bookings[0]
      expect(booking?.checkInClosesMinutesBefore).toBe(45)
      expect(booking?.bagDropClosesMinutesBefore).toBe(1440)
    })

    // 0・負数・小数・上限超え・文字列・NaN はいずれも「怪しい値」として
    // そのフィールドだけ落とす(isDeadlineMinutesBefore 参照)。予約自体は残る
    it.each([
      ['0', 0],
      ['負の数', -10],
      ['小数', 45.5],
      ['1441(上限超え)', 1441],
      ['文字列', '45'],
      ['NaN', Number.NaN],
    ])(
      '%s の締切はそのフィールドだけ落ちて、予約自体は残る',
      (_label, value) => {
        const state = {
          ...fullState(),
          bookings: [
            {
              ...fullBooking(),
              checkInClosesMinutesBefore: value,
              bagDropClosesMinutesBefore: value,
            },
          ],
        }
        const parsed = parseTripNotesState(state)
        expect(parsed?.bookings).toHaveLength(1)
        const booking = parsed?.bookings[0]
        expect(booking?.checkInClosesMinutesBefore).toBeUndefined()
        expect(booking?.bagDropClosesMinutesBefore).toBeUndefined()
      },
    )

    it('1 と 1440(境界値)はどちらも保持される', () => {
      const state = {
        ...fullState(),
        bookings: [
          {
            ...fullBooking(),
            checkInClosesMinutesBefore: 1,
            bagDropClosesMinutesBefore: 1440,
          },
        ],
      }
      const booking = parseTripNotesState(state)?.bookings[0]
      expect(booking?.checkInClosesMinutesBefore).toBe(1)
      expect(booking?.bagDropClosesMinutesBefore).toBe(1440)
    })

    it('締切の上限は 1440 のままで、開放の上限(4320)に引きずられない', () => {
      // 開放時刻の上限を 72 時間に広げたときに、締切 2 種の上限まで
      // 道連れで広がっていないことを固定する回帰テスト。
      // 上限は「分と時間の取り違え」を弾くためのもので、その項目に
      // 現実に存在しうる最大値のすぐ上に無いと役に立たない
      const state = {
        ...fullState(),
        bookings: [
          {
            ...fullBooking(),
            checkInClosesMinutesBefore: 1441,
            bagDropClosesMinutesBefore: 4320,
          },
        ],
      }
      const parsed = parseTripNotesState(state)
      expect(parsed?.bookings).toHaveLength(1)
      expect(parsed?.bookings[0].checkInClosesMinutesBefore).toBeUndefined()
      expect(parsed?.bookings[0].bagDropClosesMinutesBefore).toBeUndefined()
    })
  })

  describe('オンラインチェックインの開放(onlineCheckInOpensMinutesBefore)', () => {
    it('4320(72 時間前)まで保持される', () => {
      // 24 / 48 / 72 時間前の開放が実在するので、締切と同じ上限では
      // 正しい値のほうが弾かれてしまう
      const state = {
        ...fullState(),
        bookings: [{ ...fullBooking(), onlineCheckInOpensMinutesBefore: 4320 }],
      }
      expect(
        parseTripNotesState(state)?.bookings[0].onlineCheckInOpensMinutesBefore,
      ).toBe(4320)
    })

    // 0・負数・小数・上限超え・文字列は「怪しい値」としてそのフィールドだけ落とす
    // (isCheckInOpensMinutesBefore 参照)。予約自体は残る
    it.each([
      ['0', 0],
      ['負の数', -1],
      ['小数', 45.5],
      ['4321(上限超え)', 4321],
      ['文字列', '4320'],
      ['NaN', Number.NaN],
    ])('%s の開放時刻はそのフィールドだけ落ちて、予約自体は残る', (_l, v) => {
      const state = {
        ...fullState(),
        bookings: [{ ...fullBooking(), onlineCheckInOpensMinutesBefore: v }],
      }
      const parsed = parseTripNotesState(state)
      expect(parsed?.bookings).toHaveLength(1)
      expect(
        parsed?.bookings[0].onlineCheckInOpensMinutesBefore,
      ).toBeUndefined()
    })

    it('開放と締切は同じ予約に同居できる', () => {
      // 「72 時間前から開いて 45 分前に閉まる」は同じ便の実際の姿
      const state = {
        ...fullState(),
        bookings: [
          {
            ...fullBooking(),
            onlineCheckInOpensMinutesBefore: 4320,
            checkInClosesMinutesBefore: 45,
            bagDropClosesMinutesBefore: 60,
          },
        ],
      }
      const booking = parseTripNotesState(state)?.bookings[0]
      expect(booking?.onlineCheckInOpensMinutesBefore).toBe(4320)
      expect(booking?.checkInClosesMinutesBefore).toBe(45)
      expect(booking?.bagDropClosesMinutesBefore).toBe(60)
    })
  })
})

describe('FIELD_KEYS', () => {
  it('締切2種のキーが含まれる(unverified に載せられる)', () => {
    expect(FIELD_KEYS).toContain('checkInClosesMinutesBefore')
    expect(FIELD_KEYS).toContain('bagDropClosesMinutesBefore')
  })

  it('オンラインチェックインの開放のキーが含まれる(unverified に載せられる)', () => {
    // AI が予約メールから拾ってくる欄なので、目視確認の対象になれないと困る
    expect(FIELD_KEYS).toContain('onlineCheckInOpensMinutesBefore')
  })
})

describe('createInitialState', () => {
  it('3泊4日の初期状態を返す', () => {
    expect(createInitialState('2026-06-12')).toEqual({
      schemaVersion: 1,
      tripTitle: '',
      startDate: '2026-06-12',
      endDate: '2026-06-15',
      pinnedTz: null,
      bookings: [],
      emergencyContacts: [],
    })
  })
})

/**
 * 旧キーは trips.ts への移行元としてしか使われない読み取り専用の入口になったので、
 * 書き込み側(旧 saveToStorage)のテストは trips.test.ts の移行テストに引き継いだ。
 * ここに残すのは「壊れた入力・window が無い環境でも例外を投げない」ことだけ。
 */
describe('loadFromStorage', () => {
  afterEach(() => {
    // @ts-expect-error テスト用に差し込んだ window を必ず後片付けする
    delete globalThis.window
  })

  it('旧キーに保存された state を復元できる', () => {
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

    const state = fullState()
    store.set('trip-notes:v1', JSON.stringify(state))
    expect(loadFromStorage()).toEqual(state)
  })

  it('window が無い環境では loadFromStorage は例外を投げず null を返す', () => {
    expect(loadFromStorage()).toBeNull()
  })
})

describe('requestPersistentStorage', () => {
  it('navigator が無い環境では例外を投げず false を返す', async () => {
    const original = globalThis.navigator
    // @ts-expect-error テストのために意図的に navigator を消す
    delete globalThis.navigator
    try {
      await expect(requestPersistentStorage()).resolves.toBe(false)
    } finally {
      globalThis.navigator = original
    }
  })
})
