import { describe, expect, it } from 'vitest'
import {
  mergeBooking,
  mergeCountryInfo,
  planCountryInfoImport,
  planImport,
} from './importMerge'
import type { Booking, CountryInfo } from './types'

/** 既存の予約(手入力・すでに確認済み想定)の既定値 */
function existingBooking(
  id: string,
  overrides: Partial<Booking> = {},
): Booking {
  return {
    id,
    kind: 'lodging',
    title: '手入力の宿',
    start: { zdt: '2026-06-12T15:00:00+02:00[Europe/Paris]', allDay: false },
    end: { zdt: '2026-06-14T10:00:00+02:00[Europe/Paris]', allDay: false },
    status: 'confirmed',
    payment: 'paid',
    confirmationNumber: 'ABC123',
    note: '朝食付き',
    ...overrides,
  }
}

/** AI 取り込み側の既定値。aiImport.ts の既定値(idea/unpaid)を模す */
function incomingBooking(
  id: string,
  overrides: Partial<Booking> = {},
): Booking {
  return {
    id,
    kind: 'lodging',
    title: '手入力の宿',
    start: { zdt: '2026-06-12T15:00:00+02:00[Europe/Paris]', allDay: false },
    end: null,
    status: 'idea',
    payment: 'unpaid',
    ...overrides,
  }
}

describe('planImport / マッチ条件', () => {
  it('ルール1: 確認番号を正規化した結果が一致すればマッチする(区切り文字・大小文字の違いを無視)', () => {
    const existing = [existingBooking('e1', { confirmationNumber: 'abc-123 ' })]
    const incoming = [incomingBooking('tmp', { confirmationNumber: 'ABC123' })]
    const plan = planImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBe('e1')
    expect(plan.updatedCount).toBe(1)
    expect(plan.addedCount).toBe(0)
  })

  it('ルール1: kind が異なると確認番号が一致してもマッチしない', () => {
    const existing = [
      existingBooking('e1', { kind: 'lodging', confirmationNumber: 'ABC123' }),
    ]
    const incoming = [
      incomingBooking('tmp', { kind: 'flight', confirmationNumber: 'ABC123' }),
    ]
    const plan = planImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBeNull()
    expect(plan.addedCount).toBe(1)
  })

  it('ルール1: 記号だけで正規化すると空文字になる確認番号は、一致していてもマッチしない', () => {
    // 空文字同士が一致してしまうと、無意味な値を持つ別々の予約を誤ってマッチさせる。
    // タイトルをあえて変えて、ルール2(開始日+タイトル)側では拾われないようにする
    const existing = [
      existingBooking('e1', {
        confirmationNumber: '---',
        title: 'まったく違うタイトルの宿',
      }),
    ]
    const incoming = [incomingBooking('tmp', { confirmationNumber: '===' })]
    const plan = planImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBeNull()
  })

  it('ルール2: 確認番号が無くても、開始日とタイトルの正規化が一致すればマッチする', () => {
    const existing = [
      existingBooking('e1', {
        confirmationNumber: undefined,
        title: 'Hotel Le Marais',
      }),
    ]
    const incoming = [
      incomingBooking('tmp', {
        confirmationNumber: undefined,
        title: '  hotel   le marais ',
      }),
    ]
    const plan = planImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBe('e1')
  })

  it('ルール2: 開始日(現地日付)が違うとタイトルが一致してもマッチしない', () => {
    const existing = [
      existingBooking('e1', {
        confirmationNumber: undefined,
        start: {
          zdt: '2026-06-13T15:00:00+02:00[Europe/Paris]',
          allDay: false,
        },
      }),
    ]
    const incoming = [incomingBooking('tmp', { confirmationNumber: undefined })]
    const plan = planImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBeNull()
  })

  it('ルール2: タイトルが違うと開始日が一致してもマッチしない', () => {
    const existing = [
      existingBooking('e1', {
        confirmationNumber: undefined,
        title: '別のタイトルの宿',
      }),
    ]
    const incoming = [incomingBooking('tmp', { confirmationNumber: undefined })]
    const plan = planImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBeNull()
  })

  it('ルール3: 宿泊予約はタイトルが違っても、開始日と場所名の正規化が一致すればマッチする', () => {
    const existing = [
      existingBooking('e1', {
        confirmationNumber: undefined,
        title: '現地の呼び方の宿',
        place: { name: 'Grand Hotel Central' },
      }),
    ]
    const incoming = [
      incomingBooking('tmp', {
        confirmationNumber: undefined,
        title: '別名で読み取られた宿',
        place: { name: '  grand   hotel  central ' },
      }),
    ]
    const plan = planImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBe('e1')
  })

  it('ルール3: 宿泊以外は場所名が一致してもマッチしない(タイトル・開始日も違う場合)', () => {
    const existing = [
      existingBooking('e1', {
        kind: 'activity',
        confirmationNumber: undefined,
        title: 'ルーヴル美術館(現地表記)',
        place: { name: 'Louvre' },
      }),
    ]
    const incoming = [
      incomingBooking('tmp', {
        kind: 'activity',
        confirmationNumber: undefined,
        title: '美術館見学',
        place: { name: 'louvre' },
      }),
    ]
    const plan = planImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBeNull()
  })

  it('どの条件にも一致しなければ新規追加になる', () => {
    const existing = [existingBooking('e1')]
    const incoming = [
      incomingBooking('tmp', {
        kind: 'flight',
        title: 'まったく別の予約',
        confirmationNumber: undefined,
        start: {
          zdt: '2026-07-01T09:00:00+02:00[Europe/Paris]',
          allDay: false,
        },
      }),
    ]
    const plan = planImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBeNull()
    expect(plan.addedCount).toBe(1)
    expect(plan.updatedCount).toBe(0)
  })

  it('status が cancelled の既存予約はマッチ対象から除外される', () => {
    // キャンセル済みの宿を取り込みで黙って復活させると、旅先で実害のある事故になる
    const existing = [
      existingBooking('e1', {
        status: 'cancelled',
        confirmationNumber: 'ABC123',
      }),
    ]
    const incoming = [incomingBooking('tmp', { confirmationNumber: 'ABC123' })]
    const plan = planImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBeNull()
    expect(plan.addedCount).toBe(1)
  })

  it('1つの既存予約は1件の取り込みにしかマッチしない(二重マッチしない)', () => {
    const existing = [existingBooking('e1', { confirmationNumber: 'ABC123' })]
    const incoming = [
      incomingBooking('tmp1', { confirmationNumber: 'ABC123' }),
      incomingBooking('tmp2', { confirmationNumber: 'ABC123' }),
    ]
    const plan = planImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBe('e1')
    expect(plan.entries[1].replacesId).toBeNull()
    expect(plan.updatedCount).toBe(1)
    expect(plan.addedCount).toBe(1)
  })
})

describe('mergeBooking / マージ規則', () => {
  it('id は既存のものを保つ', () => {
    const existing = existingBooking('existing-id')
    const incoming = incomingBooking('incoming-id')
    expect(mergeBooking(existing, incoming).id).toBe('existing-id')
  })

  it('end が取り込み側で null なら既存の end を維持する', () => {
    const existing = existingBooking('e1')
    const incoming = incomingBooking('tmp', { end: null })
    const merged = mergeBooking(existing, incoming)
    expect(merged.end).toEqual(existing.end)
  })

  it('end が取り込み側にあれば採用する', () => {
    const existing = existingBooking('e1')
    const newEnd = {
      zdt: '2026-06-15T11:00:00+02:00[Europe/Paris]',
      allDay: false,
    }
    const incoming = incomingBooking('tmp', { end: newEnd })
    expect(mergeBooking(existing, incoming).end).toEqual(newEnd)
  })

  it('status/payment が既定値(idea/unpaid)のときは既存を維持する', () => {
    // AI が読み取れなかっただけなのに、利用者が自分で確定させた予約が
    // 検討中に巻き戻ると事故になる
    const existing = existingBooking('e1', {
      status: 'confirmed',
      payment: 'paid',
    })
    const incoming = incomingBooking('tmp', {
      status: 'idea',
      payment: 'unpaid',
    })
    const merged = mergeBooking(existing, incoming)
    expect(merged.status).toBe('confirmed')
    expect(merged.payment).toBe('paid')
  })

  it('status/payment が既定値でなければ取り込み側を採用する', () => {
    const existing = existingBooking('e1', {
      status: 'idea',
      payment: 'unpaid',
    })
    const incoming = incomingBooking('tmp', {
      status: 'held',
      payment: 'deposit',
    })
    const merged = mergeBooking(existing, incoming)
    expect(merged.status).toBe('held')
    expect(merged.payment).toBe('deposit')
  })

  it('冒頭の例のとおり: 取り込み側が空の項目は既存の値を維持し、値がある項目は取り込み側を採用する', () => {
    // 既存 = {確認番号: ABC123, 料金: なし, メモ: "朝食付き"}
    // 取り込み = {確認番号: なし, 料金: 120EUR, メモ: なし}
    // → 結果 = {確認番号: ABC123, 料金: 120EUR, メモ: "朝食付き"}
    const existing = existingBooking('e1', {
      confirmationNumber: 'ABC123',
      price: undefined,
      note: '朝食付き',
    })
    const incoming = incomingBooking('tmp', {
      confirmationNumber: undefined,
      price: { amount: 120, currency: 'EUR' },
      note: undefined,
    })
    const merged = mergeBooking(existing, incoming)
    expect(merged.confirmationNumber).toBe('ABC123')
    expect(merged.price).toEqual({ amount: 120, currency: 'EUR' })
    expect(merged.note).toBe('朝食付き')
  })

  it('unverified は上書きしたフィールドの未確認状態だけを引き継ぐ(単純な和集合にしない)', () => {
    // 既存側は note がまだ未確認のまま残っている状態を作る
    const existing = existingBooking('e1', {
      unverified: ['note'],
      confirmationNumber: 'ABC123',
      note: '朝食付き',
    })
    // 取り込み側は title/start/confirmationNumber を新しい値で上書きしてきて、
    // それらは AI 由来なので unverified に入っている。note には値が無い
    const incoming = incomingBooking('tmp', {
      title: '新しいタイトル',
      confirmationNumber: 'XYZ999',
      note: undefined,
      unverified: ['kind', 'title', 'start', 'confirmationNumber'],
    })
    const merged = mergeBooking(existing, incoming)

    // 上書きされたフィールドは取り込み側の未確認状態を引き継ぐ
    expect(merged.unverified).toContain('confirmationNumber')
    expect(merged.unverified).toContain('title')
    // note は既存から引き継いだフィールドなので、既存の未確認状態(未確認)を維持する
    expect(merged.unverified).toContain('note')
    // status/payment は既定値だったので既存を維持し、既存の unverified には
    // 含まれていなかったので merged にも含まれない
    expect(merged.unverified).not.toContain('status')
    expect(merged.unverified).not.toContain('payment')
  })

  it('既に確認済みの既存フィールドは、取り込みで上書きされなければ未確認に戻らない', () => {
    const existing = existingBooking('e1', { note: '確認済みのメモ' }) // unverified なし
    const incoming = incomingBooking('tmp', { note: undefined })
    const merged = mergeBooking(existing, incoming)
    expect(merged.note).toBe('確認済みのメモ')
    expect(merged.unverified ?? []).not.toContain('note')
  })

  it('開放・締切は取り込み側にあれば採用する', () => {
    // 開放も締切も「出発の何分前か」の相対値なので、start を上書きする再取り込みでも
    // 意味がずれない。他の任意フィールドと同じ「値があれば採用」規則でよい
    const existing = existingBooking('e1')
    const incoming = incomingBooking('tmp', {
      onlineCheckInOpensMinutesBefore: 2880,
      checkInClosesMinutesBefore: 45,
      bagDropClosesMinutesBefore: 60,
    })
    const merged = mergeBooking(existing, incoming)
    expect(merged.onlineCheckInOpensMinutesBefore).toBe(2880)
    expect(merged.checkInClosesMinutesBefore).toBe(45)
    expect(merged.bagDropClosesMinutesBefore).toBe(60)
  })

  it('開放・締切は取り込み側に無ければ既存の値を維持する', () => {
    const existing = existingBooking('e1', {
      onlineCheckInOpensMinutesBefore: 2880,
      checkInClosesMinutesBefore: 45,
      bagDropClosesMinutesBefore: 60,
    })
    const incoming = incomingBooking('tmp', {
      onlineCheckInOpensMinutesBefore: undefined,
      checkInClosesMinutesBefore: undefined,
      bagDropClosesMinutesBefore: undefined,
    })
    const merged = mergeBooking(existing, incoming)
    expect(merged.onlineCheckInOpensMinutesBefore).toBe(2880)
    expect(merged.checkInClosesMinutesBefore).toBe(45)
    expect(merged.bagDropClosesMinutesBefore).toBe(60)
  })

  it('開放の未確認状態は、値を採用した側から引き継ぐ', () => {
    // 締切と同じ扱い。取り込み側で上書きしたなら取り込み側の未確認状態を、
    // 既存を維持したなら既存の未確認状態を引き継ぐ
    const existing = existingBooking('e1', {
      onlineCheckInOpensMinutesBefore: 1440,
      unverified: ['onlineCheckInOpensMinutesBefore'],
    })

    const overwritten = mergeBooking(
      existing,
      incomingBooking('tmp', {
        onlineCheckInOpensMinutesBefore: 2880,
        unverified: ['onlineCheckInOpensMinutesBefore'],
      }),
    )
    expect(overwritten.onlineCheckInOpensMinutesBefore).toBe(2880)
    expect(overwritten.unverified).toContain('onlineCheckInOpensMinutesBefore')

    // 既存側が確認済みなら、取り込み側で上書きされない限り未確認に戻らない
    const verified = existingBooking('e2', {
      onlineCheckInOpensMinutesBefore: 1440,
    })
    const untouched = mergeBooking(
      verified,
      incomingBooking('tmp', {
        onlineCheckInOpensMinutesBefore: undefined,
        unverified: ['onlineCheckInOpensMinutesBefore'],
      }),
    )
    expect(untouched.onlineCheckInOpensMinutesBefore).toBe(1440)
    expect(untouched.unverified ?? []).not.toContain(
      'onlineCheckInOpensMinutesBefore',
    )
  })

  it('場所は Place ごと差し替えず、フィールド単位でマージする', () => {
    // 穴埋めのパッチは name と latinName しか返さない。オブジェクトごと
    // 差し替えていると、既存の住所や座標が黙って消える
    const existing = existingBooking('e1', {
      place: {
        name: 'パリ',
        localName: 'Paris',
        address: '1 Rue de Rivoli, Paris',
        lat: 48.8566,
        lng: 2.3522,
      },
    })
    const incoming = incomingBooking('tmp', {
      place: { name: 'パリ', latinName: 'Paris' },
    })
    const merged = mergeBooking(existing, incoming)
    expect(merged.place).toEqual({
      name: 'パリ',
      localName: 'Paris',
      latinName: 'Paris',
      address: '1 Rue de Rivoli, Paris',
      lat: 48.8566,
      lng: 2.3522,
    })
  })

  it('場所は取り込み側に値がある欄だけ上書きする(from / to も同じ)', () => {
    const existing = existingBooking('e1', {
      kind: 'flight',
      from: {
        name: '羽田空港',
        latinName: '古い表記',
        address: '東京都大田区',
      },
      to: { name: 'CDG', lat: 49.0097, lng: 2.5479 },
    })
    const incoming = incomingBooking('tmp', {
      kind: 'flight',
      from: { name: '羽田空港', latinName: 'Tokyo Haneda' },
      to: { name: 'CDG', latinName: 'Paris' },
    })
    const merged = mergeBooking(existing, incoming)
    expect(merged.from).toEqual({
      name: '羽田空港',
      latinName: 'Tokyo Haneda',
      address: '東京都大田区',
    })
    expect(merged.to).toEqual({
      name: 'CDG',
      latinName: 'Paris',
      lat: 49.0097,
      lng: 2.5479,
    })
  })

  it('取り込み側に場所が無ければ既存の場所をそのまま維持する', () => {
    const existing = existingBooking('e1', {
      place: { name: 'パリ', address: '1 Rue de Rivoli, Paris' },
    })
    const incoming = incomingBooking('tmp', { place: undefined })
    const merged = mergeBooking(existing, incoming)
    expect(merged.place).toEqual({
      name: 'パリ',
      address: '1 Rue de Rivoli, Paris',
    })
  })

  it('場所の未確認は、取り込み側がその欄を持っていたかで決まる', () => {
    // unverified は from / to / place の単位でしか持てない。中身のどれか1つでも
    // AI 由来の値が混ざったなら、その欄は未確認とみなす
    const existing = existingBooking('e1', {
      place: { name: 'パリ', address: '1 Rue de Rivoli, Paris' },
    })
    const incoming = incomingBooking('tmp', {
      place: { name: 'パリ', latinName: 'Paris' },
      unverified: ['place'],
    })
    expect(mergeBooking(existing, incoming).unverified).toContain('place')

    // 取り込み側が場所を持たなければ、既存の確認済み状態が保たれる
    const untouched = mergeBooking(
      existing,
      incomingBooking('tmp', { place: undefined, unverified: ['place'] }),
    )
    expect(untouched.unverified ?? []).not.toContain('place')
  })

  it('evidence はキーごとにマージし、取り込み側を優先する', () => {
    const existing = existingBooking('e1', {
      evidence: { start: '既存の根拠', note: '既存のメモ根拠' },
    })
    const incoming = incomingBooking('tmp', {
      evidence: {
        start: '新しい根拠',
        confirmationNumber: '新しい確認番号の根拠',
      },
    })
    const merged = mergeBooking(existing, incoming)
    expect(merged.evidence).toEqual({
      start: '新しい根拠',
      note: '既存のメモ根拠',
      confirmationNumber: '新しい確認番号の根拠',
    })
  })
})

/** 既存の国情報(利用者が国名だけ入れて、残りが空の状態を既定にする) */
function existingCountry(
  id: string,
  overrides: Partial<CountryInfo> = {},
): CountryInfo {
  return { id, name: 'マルタ', ...overrides }
}

/** AI の穴埋めパッチ側の国情報。id は取り込み時に採番し直された値を模す */
function incomingCountry(
  id: string,
  overrides: Partial<CountryInfo> = {},
): CountryInfo {
  return { id, name: 'マルタ', ...overrides }
}

describe('mergeCountryInfo / マージ規則', () => {
  it('空の欄だけが埋まる', () => {
    const existing = existingCountry('c1', { plugTypes: 'G' })
    const incoming = incomingCountry('tmp', {
      voltage: '230V 50Hz',
      emergencyPolice: '112',
    })
    const merged = mergeCountryInfo(existing, incoming)
    expect(merged.plugTypes).toBe('G')
    expect(merged.voltage).toBe('230V 50Hz')
    expect(merged.emergencyPolice).toBe('112')
  })

  it('取り込み側に値があれば既存を上書きする', () => {
    const existing = existingCountry('c1', { plugTypes: 'C' })
    const incoming = incomingCountry('tmp', { plugTypes: 'G' })
    expect(mergeCountryInfo(existing, incoming).plugTypes).toBe('G')
  })

  it('既存の値は取り込み側の空文字や空白では潰れない', () => {
    // AI は空欄のつもりで '' を返してくることがある。それで既存の記入が消えると、
    // 埋めるための操作で情報が減ることになる
    const existing = existingCountry('c1', {
      plugTypes: 'G',
      voltage: '230V 50Hz',
      note: '水道水は飲用可',
    })
    const incoming = incomingCountry('tmp', {
      plugTypes: '',
      voltage: '   ',
      note: undefined,
    })
    const merged = mergeCountryInfo(existing, incoming)
    expect(merged.plugTypes).toBe('G')
    expect(merged.voltage).toBe('230V 50Hz')
    expect(merged.note).toBe('水道水は飲用可')
  })

  it('name と id は既存のものを保つ', () => {
    // 利用者が自分の言葉で書いた見出しを、AI の返した表記で黙って書き換えない
    const existing = existingCountry('c1', { name: 'マルタ' })
    const incoming = incomingCountry('tmp', {
      name: 'マルタ共和国',
      plugTypes: 'G',
    })
    const merged = mergeCountryInfo(existing, incoming)
    expect(merged.id).toBe('c1')
    expect(merged.name).toBe('マルタ')
    expect(merged.plugTypes).toBe('G')
  })

  it('latinName も他の欄と同じ規則で扱う(空なら埋め、あれば維持しない)', () => {
    const empty = mergeCountryInfo(
      existingCountry('c1'),
      incomingCountry('tmp', { latinName: 'Malta' }),
    )
    expect(empty.latinName).toBe('Malta')

    const kept = mergeCountryInfo(
      existingCountry('c1', { latinName: 'Malta' }),
      incomingCountry('tmp', { latinName: '' }),
    )
    expect(kept.latinName).toBe('Malta')
  })
})

describe('planCountryInfoImport / マッチ条件', () => {
  it('国名の正規化が一致すれば更新になる(全角/半角・空白・大小文字の揺れを吸収)', () => {
    const existing = [existingCountry('c1', { name: 'Malta' })]
    const incoming = [
      incomingCountry('tmp', { name: ' ｍａｌｔａ ', plugTypes: 'G' }),
    ]
    const plan = planCountryInfoImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBe('c1')
    expect(plan.entries[0].country.id).toBe('c1')
    expect(plan.entries[0].country.name).toBe('Malta')
    expect(plan.entries[0].country.plugTypes).toBe('G')
    expect(plan.updatedCount).toBe(1)
    expect(plan.addedCount).toBe(0)
  })

  it('半角カナや余分な空白で書かれた国名も同じ国とみなす', () => {
    const existing = [existingCountry('c1', { name: 'マルタ' })]
    const incoming = [incomingCountry('tmp', { name: ' ﾏﾙﾀ ' })]
    expect(
      planCountryInfoImport(existing, incoming).entries[0].replacesId,
    ).toBe('c1')
  })

  it('国名が一致しなければ新規追加になる(latinName が一致していても)', () => {
    // latinName は照合の手掛かりとして AI に渡すだけで、同一判定の根拠にはしない
    const existing = [
      existingCountry('c1', { name: 'マルタ', latinName: 'Malta' }),
    ]
    const incoming = [
      incomingCountry('tmp', { name: 'フランス', latinName: 'Malta' }),
    ]
    const plan = planCountryInfoImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBeNull()
    expect(plan.entries[0].country.name).toBe('フランス')
    expect(plan.addedCount).toBe(1)
    expect(plan.updatedCount).toBe(0)
  })

  it('1つの既存の国情報は1件の取り込みにしかマッチしない(二重マッチしない)', () => {
    const existing = [existingCountry('c1', { name: 'マルタ' })]
    const incoming = [
      incomingCountry('tmp1', { name: 'マルタ', plugTypes: 'G' }),
      incomingCountry('tmp2', { name: 'マルタ', voltage: '230V 50Hz' }),
    ]
    const plan = planCountryInfoImport(existing, incoming)
    expect(plan.entries[0].replacesId).toBe('c1')
    expect(plan.entries[1].replacesId).toBeNull()
    expect(plan.updatedCount).toBe(1)
    expect(plan.addedCount).toBe(1)
  })

  it('新規と更新が混ざっていても件数が正しく数えられ、順序と件数は取り込み側のまま', () => {
    const existing = [
      existingCountry('c1', { name: 'マルタ' }),
      existingCountry('c2', { name: 'フランス' }),
    ]
    const incoming = [
      incomingCountry('tmp1', { name: 'フランス', emergencyPolice: '17' }),
      incomingCountry('tmp2', { name: '台湾', emergencyPolice: '110' }),
      incomingCountry('tmp3', { name: 'マルタ', plugTypes: 'G' }),
    ]
    const plan = planCountryInfoImport(existing, incoming)
    expect(plan.entries.map((entry) => entry.replacesId)).toEqual([
      'c2',
      null,
      'c1',
    ])
    expect(plan.entries.map((entry) => entry.country.name)).toEqual([
      'フランス',
      '台湾',
      'マルタ',
    ])
    expect(plan.updatedCount).toBe(2)
    expect(plan.addedCount).toBe(1)
  })

  it('既存が空なら全件が新規になる', () => {
    const plan = planCountryInfoImport(
      [],
      [incomingCountry('tmp', { name: 'マルタ' })],
    )
    expect(plan.entries[0].replacesId).toBeNull()
    expect(plan.addedCount).toBe(1)
  })
})
