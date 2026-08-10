import { describe, expect, it } from 'vitest'
import {
  BACKFILL_FIELDS,
  COUNTRY_INFO_FILL_FIELDS,
  findBackfillGaps,
} from './backfillPrompt'
import { parseImportedJson } from './aiImport'
import {
  AIRLINE_TIMING_FILL_RULE,
  LATIN_NAME_FILL_RULE,
  buildImportPrompt,
} from './aiPrompt'
import { makeStamp } from './datetime'
import { planCountryInfoImport, planImport } from './importMerge'
import type { Booking, CountryInfo, TripNotesState } from './types'

/** 締切もラテン文字表記も入っていない、古いプロンプトで取り込まれた想定の移動 */
function flight(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'flight-1',
    kind: 'flight',
    title: 'AF276 HND→CDG',
    start: makeStamp('2026-09-12', '14:20', 'Asia/Tokyo'),
    end: makeStamp('2026-09-12', '19:45', 'Europe/Paris'),
    from: { name: '羽田空港' },
    to: { name: 'シャルル・ド・ゴール空港' },
    status: 'confirmed',
    payment: 'paid',
    confirmationNumber: 'ABC123',
    ...overrides,
  }
}

/** 穴が 1 つも無い移動。便の時刻 3 項目も場所のラテン文字表記も埋まっている */
function filledFlight(overrides: Partial<Booking> = {}): Booking {
  return flight({
    onlineCheckInOpensMinutesBefore: 1440,
    checkInClosesMinutesBefore: 60,
    bagDropClosesMinutesBefore: 75,
    from: { name: '羽田空港', latinName: 'Tokyo Haneda' },
    to: { name: 'シャルル・ド・ゴール空港', latinName: 'Paris CDG' },
    ...overrides,
  })
}

/** 宿。締切の欄は無関係で、場所のラテン文字表記だけが穴になりうる */
function lodging(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'lodging-1',
    kind: 'lodging',
    title: 'Hotel Le Marais',
    start: makeStamp('2026-09-12', '15:00', 'Europe/Paris'),
    end: makeStamp('2026-09-15', '11:00', 'Europe/Paris'),
    place: { name: 'パリ', latinName: 'Paris' },
    status: 'confirmed',
    payment: 'paid',
    ...overrides,
  }
}

/** 欄がまったく埋まっていない国。国名だけは人間が入れている前提 */
function country(overrides: Partial<CountryInfo> = {}): CountryInfo {
  return { id: 'country-1', name: 'マルタ', ...overrides }
}

/** 一般知識で埋める 5 欄がすべて入っている国 */
function filledCountry(overrides: Partial<CountryInfo> = {}): CountryInfo {
  return country({
    plugTypes: 'G',
    voltage: '230V 50Hz',
    tipping: '基本は不要。高級店やホテルでは 5〜10% を置くこともある',
    emergencyPolice: '112',
    emergencyAmbulance: '112',
    ...overrides,
  })
}

/**
 * countryInfos は任意フィールドなので、渡されなければキーごと省く
 * (「1 件も登録していない」と「空配列を持っている」を作り分けられるようにする)。
 */
function state(
  bookings: Array<Booking>,
  countryInfos?: Array<CountryInfo>,
): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'ヨーロッパ周遊',
    startDate: '2026-09-10',
    endDate: '2026-09-20',
    pinnedTz: 'Europe/Paris',
    bookings,
    emergencyContacts: [],
    ...(countryInfos === undefined ? {} : { countryInfos }),
  }
}

/** プロンプトが AI に渡している予約 1 件ぶん */
interface PromptPayload {
  kind: string
  title: string
  start: { date: string; time: string | null; tz: string }
  from?: { name: string }
  to?: { name: string }
  place?: { name: string }
  missing: Array<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is Array<unknown> {
  return Array.isArray(value)
}

function asString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error(`文字列ではありません: ${String(value)}`)
  }
  return value
}

function asPlace(value: unknown): { name: string } | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new Error('場所がオブジェクトではありません')
  return { name: asString(value.name) }
}

function asPayload(value: unknown): PromptPayload {
  if (!isRecord(value)) throw new Error('予約がオブジェクトではありません')
  const start = value.start
  if (!isRecord(start)) throw new Error('start がオブジェクトではありません')
  const missingRaw = value.missing
  if (!isUnknownArray(missingRaw))
    throw new Error('missing が配列ではありません')

  const payload: PromptPayload = {
    kind: asString(value.kind),
    title: asString(value.title),
    start: {
      date: asString(start.date),
      time: start.time === null ? null : asString(start.time),
      tz: asString(start.tz),
    },
    missing: missingRaw.map(asString),
  }
  const from = asPlace(value.from)
  if (from !== undefined) payload.from = from
  const to = asPlace(value.to)
  if (to !== undefined) payload.to = to
  const place = asPlace(value.place)
  if (place !== undefined) payload.place = place
  return payload
}

/** プロンプトが AI に渡している国 1 件ぶん */
interface PromptCountryPayload {
  name: string
  latinName?: string
  missing: Array<string>
}

function asCountryPayload(value: unknown): PromptCountryPayload {
  if (!isRecord(value)) throw new Error('国がオブジェクトではありません')
  const missingRaw = value.missing
  if (!isUnknownArray(missingRaw))
    throw new Error('missing が配列ではありません')

  const payload: PromptCountryPayload = {
    name: asString(value.name),
    missing: missingRaw.map(asString),
  }
  if (value.latinName !== undefined) {
    payload.latinName = asString(value.latinName)
  }
  return payload
}

/**
 * 見出しに続く ```json フェンスを配列として読む。
 * 予約と国でフェンスが 2 つ並ぶので、どちらを読むかを見出しで指定する。
 */
function jsonAfterHeading(prompt: string, heading: string): Array<unknown> {
  const index = prompt.indexOf(heading)
  if (index < 0) throw new Error(`見出しがありません: ${heading}`)
  const match = /```json\n([\s\S]*?)```/.exec(prompt.slice(index))
  if (match === null) throw new Error('プロンプトに json フェンスがありません')
  const parsed = JSON.parse(match[1]) as unknown
  if (!isUnknownArray(parsed)) throw new Error('JSON 配列ではありません')
  return parsed
}

/**
 * プロンプト中の ```json フェンスから、AI に渡している予約データを取り出す。
 * 生成された本文をそのまま読むので、プロンプトに何が載っているかを
 * 文字列の contains ではなく構造として確かめられる。
 */
function payloadFromPrompt(prompt: string): Array<PromptPayload> {
  return jsonAfterHeading(prompt, '### 予約の空き欄').map(asPayload)
}

function countryPayloadFromPrompt(prompt: string): Array<PromptCountryPayload> {
  return jsonAfterHeading(prompt, '### 国・地域の空き欄').map(asCountryPayload)
}

describe('findBackfillGaps: 対象の絞り込み', () => {
  it('埋めるべき穴が 1 つも無ければ対象が空になる', () => {
    const gaps = findBackfillGaps(state([filledFlight(), lodging()]))
    expect(gaps.targets).toEqual([])
    expect(gaps.bookingCount).toBe(0)
    expect(gaps.countsByField).toEqual([])
  })

  it('便の時刻 3 項目が全部入っている移動は、その項目の対象にならない', () => {
    const filled = flight({
      onlineCheckInOpensMinutesBefore: 1440,
      checkInClosesMinutesBefore: 60,
      bagDropClosesMinutesBefore: 75,
    })
    const gaps = findBackfillGaps(state([filled]))
    const ids = gaps.targets[0].fields.map((field) => field.id)
    expect(ids).not.toContain('airlineTimings')
    // ラテン文字表記のほうはまだ空なので、そちらだけが残る
    expect(ids).toContain('placeLatinName')
  })

  it('便の時刻が一部だけ入っている移動は、欠けているものだけが対象になる', () => {
    const half = flight({
      onlineCheckInOpensMinutesBefore: 1440,
      checkInClosesMinutesBefore: 60,
    })
    const gaps = findBackfillGaps(state([half]))
    expect(gaps.targets[0].missingKeys).toContain('bagDropClosesMinutesBefore')
    expect(gaps.targets[0].missingKeys).not.toContain(
      'checkInClosesMinutesBefore',
    )
    expect(gaps.targets[0].missingKeys).not.toContain(
      'onlineCheckInOpensMinutesBefore',
    )
  })

  it('オンラインチェックインの開放時刻だけが空なら、それだけが穴になる', () => {
    const half = flight({
      checkInClosesMinutesBefore: 60,
      bagDropClosesMinutesBefore: 75,
      from: { name: '羽田空港', latinName: 'Tokyo Haneda' },
      to: { name: 'シャルル・ド・ゴール空港', latinName: 'Paris CDG' },
    })
    const gaps = findBackfillGaps(state([half]))
    expect(gaps.targets[0].missingKeys).toEqual([
      'onlineCheckInOpensMinutesBefore',
    ])
  })

  it('移動系でない予約には便の時刻の穴を作らない', () => {
    // 宿もアクティビティも搭乗手続きを持たない。ここを穴として数えると、
    // 永遠に埋まらない件数が画面に出続ける
    const gaps = findBackfillGaps(
      state([
        lodging(),
        lodging({
          id: 'activity-1',
          kind: 'activity',
          title: 'ルーヴル美術館',
          place: { name: 'ルーヴル美術館' },
        }),
      ]),
    )
    for (const target of gaps.targets) {
      expect(target.fields.map((field) => field.id)).not.toContain(
        'airlineTimings',
      )
      expect(target.missingKeys).not.toContain(
        'onlineCheckInOpensMinutesBefore',
      )
      expect(target.missingKeys).not.toContain('checkInClosesMinutesBefore')
      expect(target.missingKeys).not.toContain('bagDropClosesMinutesBefore')
    }
  })

  it('キャンセル済みの予約は対象に入らない', () => {
    const gaps = findBackfillGaps(
      state([flight({ id: 'cancelled-1', status: 'cancelled' })]),
    )
    expect(gaps.targets).toEqual([])
  })

  it('項目ごとの件数を、穴のある項目についてだけ返す', () => {
    const gaps = findBackfillGaps(
      state([
        flight(),
        lodging({ id: 'lodging-2', place: { name: 'リヨン' } }),
      ]),
    )
    const byId = new Map(
      gaps.countsByField.map((count) => [count.field.id, count.bookingCount]),
    )
    // 便の時刻が空なのは移動の 1 件だけ、ラテン文字表記が空なのは 2 件
    expect(byId.get('airlineTimings')).toBe(1)
    expect(byId.get('placeLatinName')).toBe(2)
    expect(gaps.bookingCount).toBe(2)
  })

  it('対象になりうる項目は BACKFILL_FIELDS への登録だけで決まる', () => {
    // 「一般知識で埋められる項目」だけをここに登録する、という約束の見張り。
    // 座席や運賃クラスのように原本にしか無い項目が紛れ込んでいないことを確かめる
    expect(BACKFILL_FIELDS.map((field) => field.id)).toEqual([
      'airlineTimings',
      'placeLatinName',
    ])
  })
})

describe('findBackfillGaps: 国の穴', () => {
  it('欄が空の国が countries に入る', () => {
    const gaps = findBackfillGaps(state([], [country()]))
    expect(gaps.countries).toHaveLength(1)
    expect(gaps.countries[0].country.name).toBe('マルタ')
    expect(gaps.countries[0].missingKeys).toEqual(
      COUNTRY_INFO_FILL_FIELDS.map((field) => field.key),
    )
    expect(gaps.countryCount).toBe(1)
  })

  it('欄が全部埋まっていれば countries に入らない', () => {
    const gaps = findBackfillGaps(state([], [filledCountry()]))
    expect(gaps.countries).toEqual([])
    // 「埋まっている」と「1 件も登録が無い」を取り違えないよう、件数は別に返る
    expect(gaps.countryCount).toBe(1)
  })

  it('空白だけの文字列も空とみなす', () => {
    // 利用者が値を消したあと、フィールドごと消えずに空文字が残ることがある。
    // undefined しか見ないと、画面では空なのに穴として数えられない欄ができる
    const gaps = findBackfillGaps(
      state([], [filledCountry({ plugTypes: '   ', emergencyPolice: '' })]),
    )
    expect(gaps.countries[0].missingKeys).toEqual([
      'plugTypes',
      'emergencyPolice',
    ])
  })

  it('埋まっている欄は missing に載らない', () => {
    const gaps = findBackfillGaps(
      state([], [country({ plugTypes: 'G', voltage: '230V 50Hz' })]),
    )
    expect(gaps.countries[0].missingKeys).toEqual([
      'tipping',
      'emergencyPolice',
      'emergencyAmbulance',
    ])
  })

  it('1 件も登録されていなければ countries は空で countryCount は 0', () => {
    // これは「穴が無い」ではなく「まだ何も教えてもらっていない」状態。
    // 訪問国は推定しないので、ここから国を作り出すことはしない
    const gaps = findBackfillGaps(state([flight()]))
    expect(gaps.countries).toEqual([])
    expect(gaps.countryCount).toBe(0)
  })

  it('埋めさせる欄に latinName と note を含めない', () => {
    // latinName は埋め方の規則が場所のラテン文字表記と違い、note は自由記述で
    // 埋めるべき正解が存在しない(ファイル冒頭の判断)
    const keys = COUNTRY_INFO_FILL_FIELDS.map((field) => field.key)
    expect(keys).toEqual([
      'plugTypes',
      'voltage',
      'tipping',
      'emergencyPolice',
      'emergencyAmbulance',
    ])
    const gaps = findBackfillGaps(state([], [country()]))
    expect(gaps.countries[0].missingKeys).not.toContain('latinName')
    expect(gaps.countries[0].missingKeys).not.toContain('note')
  })
})

describe('buildImportPrompt: 統合プロンプトと穴の載せ分け', () => {
  it('穴が 1 つも無くてもプロンプトは返り、空き欄節は載らない', () => {
    const prompt = buildImportPrompt(state([filledFlight()]))
    expect(prompt).toContain('あなたは旅行の予約データを JSON に整える')
    expect(prompt).not.toContain('## 登録済みで空いている欄')
  })

  it('予約も国も空でもプロンプトは返る(書類抽出用)', () => {
    const prompt = buildImportPrompt(state([]))
    expect(prompt).toContain('出力スキーマ')
    expect(prompt).not.toContain('## 登録済みで空いている欄')
  })

  it('空き欄 payload に確認番号を含めない', () => {
    // 突き合わせは kind + 開始日 + タイトルで足りるので、確認番号は gap に送らない
    const prompt = buildImportPrompt(state([flight()]))
    const payload = payloadFromPrompt(prompt)
    expect(JSON.stringify(payload)).not.toContain('ABC123')
  })

  it('空き欄 payload に料金・メモを含めない', () => {
    const prompt = buildImportPrompt(
      state([
        flight({
          price: { amount: 98000, currency: 'JPY' },
          note: '座席 12A / 受託手荷物 1 個',
        }),
      ]),
    )
    const payload = payloadFromPrompt(prompt)
    expect(JSON.stringify(payload)).not.toContain('98000')
    expect(JSON.stringify(payload)).not.toContain('12A')
  })

  it('識別に使う kind / title / start だけを識別情報として渡す', () => {
    const payload = payloadFromPrompt(buildImportPrompt(state([flight()]))!)
    expect(payload).toHaveLength(1)
    expect(payload[0].kind).toBe('flight')
    expect(payload[0].title).toBe('AF276 HND→CDG')
    expect(payload[0].start).toEqual({
      date: '2026-09-12',
      time: '14:20',
      tz: 'Asia/Tokyo',
    })
    // 場所は手掛かりとして名前だけ渡す(締切の規定を引くのに空港名が要る)
    expect(payload[0].from).toEqual({ name: '羽田空港' })
    expect(payload[0].to).toEqual({ name: 'シャルル・ド・ゴール空港' })
  })

  it('穴のある予約だけを載せ、埋まっている予約は載せない', () => {
    const filled = lodging({
      id: 'lodging-filled',
      title: '埋まっている宿',
      place: { name: 'パリ', latinName: 'Paris' },
    })
    const payload = payloadFromPrompt(
      buildImportPrompt(state([flight(), filled]))!,
    )
    expect(payload).toHaveLength(1)
    expect(payload[0].title).toBe('AF276 HND→CDG')
  })

  it('missing に、その予約で欠けているキーだけが並ぶ', () => {
    const payload = payloadFromPrompt(
      buildImportPrompt(
        state([flight({ from: { name: '羽田空港', latinName: 'Tokyo' } })]),
      )!,
    )
    expect(payload[0].missing).toEqual([
      'onlineCheckInOpensMinutesBefore',
      'checkInClosesMinutesBefore',
      'bagDropClosesMinutesBefore',
      'to.latinName',
    ])
  })

  it('終日の予約は time を null で渡す', () => {
    const allDay = flight({
      start: { zdt: '2026-09-12T00:00:00+09:00[Asia/Tokyo]', allDay: true },
    })
    const payload = payloadFromPrompt(buildImportPrompt(state([allDay]))!)
    expect(payload[0].start.time).toBeNull()
  })

  it('識別情報を書き換えてはいけないことを強く伝える', () => {
    const prompt = buildImportPrompt(state([flight()]))
    expect(prompt).toContain('1 文字も変えず')
    expect(prompt).toContain('新しい予約として二重に増えます')
  })

  it('埋め方の規則は promptRules の定数と同一文面', () => {
    const withGaps = buildImportPrompt(state([flight()]))
    const withoutGaps = buildImportPrompt(state([]))
    for (const rule of [AIRLINE_TIMING_FILL_RULE, LATIN_NAME_FILL_RULE]) {
      expect(withGaps).toContain(rule)
      expect(withoutGaps).toContain(rule)
    }
  })

  it('統合プロンプトは常に便の時刻・ラテン文字の規則を載せる', () => {
    // 以前の穴埋め専用プロンプトは「穴のある規則だけ」だったが、
    // 一本化後は書類抽出も同じプロンプトなので常に載せる
    const prompt = buildImportPrompt(
      state([lodging({ place: { name: 'パリ' } })]),
    )
    expect(prompt).toContain('空港ごと・航空会社ごとに違います')
    expect(prompt).toContain('都市名を優先してください')
  })

  it('開放時刻のスキーマと規則が載る', () => {
    const prompt = buildImportPrompt(state([flight()]))
    expect(prompt).toContain('onlineCheckInOpensMinutesBefore')
    expect(prompt).toContain('出発の 24 時間前に開くなら 1440')
  })
})

describe('buildImportPrompt: 予約と国の出し分け', () => {
  it('予約の穴が 0 でも、国の穴があれば空き欄節に国が載る', () => {
    const prompt = buildImportPrompt(state([filledFlight()], [country()]))
    expect(countryPayloadFromPrompt(prompt)).toEqual([
      {
        name: 'マルタ',
        missing: COUNTRY_INFO_FILL_FIELDS.map((field) => field.key),
      },
    ])
  })

  it('国の穴が 0 でも、予約の穴があれば予約の空き欄が載る', () => {
    const prompt = buildImportPrompt(state([flight()], [filledCountry()]))
    expect(prompt).toContain('### 予約の空き欄')
    expect(prompt).not.toContain('### 国・地域の空き欄')
  })

  it('両方とも穴が無ければ空き欄節は載らない(プロンプト自体は返る)', () => {
    const prompt = buildImportPrompt(state([filledFlight()], [filledCountry()]))
    expect(prompt).toContain('出力スキーマ')
    expect(prompt).not.toContain('## 登録済みで空いている欄')
  })

  it('国の穴があるとき CountryInfoPatch を載せ、出力型に混ぜる', () => {
    const prompt = buildImportPrompt(state([filledFlight()], [country()]))
    expect(prompt).toContain('interface CountryInfoPatch')
    expect(prompt).toContain(
      'type Output = Array<ExtractedBooking | CountryInfoPatch>',
    )
    expect(prompt).toContain('### 国・地域の空き欄')
    expect(prompt).not.toContain('### 予約の空き欄')
  })

  it('予約だけのときは CountryInfoPatch を載せない', () => {
    const prompt = buildImportPrompt(state([flight()]))
    expect(prompt).not.toContain('CountryInfoPatch')
    expect(prompt).toContain('type Output = Array<ExtractedBooking>')
  })

  it('両方あるときは判別規則を本文に書く', () => {
    const prompt = buildImportPrompt(state([flight()], [country()]))
    expect(prompt).toContain(
      'type Output = Array<ExtractedBooking | CountryInfoPatch>',
    )
    expect(prompt).toContain('1 つの配列に混ぜて返してかまいません')
    expect(prompt).toContain('予約には `kind` と `start` があり')
    expect(prompt).toContain('国のパッチにはそのどちらも無く `name` があります')
  })

  it('国の name も「1 文字も変えるな」の約束の対象だと書く', () => {
    const prompt = buildImportPrompt(state([], [country()]))
    expect(prompt).toContain('name は 1 文字も変えず')
  })

  it('国のペイロードは latinName があれば送り、無ければ省く', () => {
    const withLatin = buildImportPrompt(
      state([], [country({ latinName: 'Malta' })]),
    )
    expect(countryPayloadFromPrompt(withLatin)[0].latinName).toBe('Malta')

    const withoutLatin = buildImportPrompt(state([], [country()]))
    expect(countryPayloadFromPrompt(withoutLatin)[0].latinName).toBeUndefined()
  })

  it('国の規則に、緊急通報の分け方とチップの幅の書き方が入る', () => {
    const prompt = buildImportPrompt(state([], [country()]))
    expect(prompt).toContain('緊急通報番号は警察と救急・消防を分けて')
    expect(prompt).toContain('幅があること自体を書いてください')
  })

  it('国の穴があるとき規則 10 に国の基本情報が載る', () => {
    const prompt = buildImportPrompt(state([], [country()]))
    expect(prompt).toContain('10. **国の基本情報')
    const both = buildImportPrompt(state([flight()], [country()]))
    expect(both).toContain('10. **国の基本情報')
  })
})

/**
 * プロンプトが渡した識別情報をそのまま返し、欠けていた欄だけを足した
 * 予約のパッチを組み立てる。素直な AI が返すはずの最小のパッチ。
 */
function bookingPatches(prompt: string): Array<Record<string, unknown>> {
  return payloadFromPrompt(prompt).map((entry) => {
    const patch: Record<string, unknown> = {
      kind: entry.kind,
      title: entry.title,
      start: entry.start,
      evidence: { checkInClosesMinutesBefore: 'ANA 羽田 国際線の規定' },
    }
    if (entry.missing.includes('onlineCheckInOpensMinutesBefore')) {
      patch.onlineCheckInOpensMinutesBefore = 1440
    }
    if (entry.missing.includes('checkInClosesMinutesBefore')) {
      patch.checkInClosesMinutesBefore = 60
    }
    if (entry.missing.includes('bagDropClosesMinutesBefore')) {
      patch.bagDropClosesMinutesBefore = 75
    }
    for (const slot of ['from', 'to', 'place'] as const) {
      if (!entry.missing.includes(`${slot}.latinName`)) continue
      const place = entry[slot]
      if (place === undefined) continue
      patch[slot] = { name: place.name, latinName: 'Tokyo' }
    }
    return patch
  })
}

/** 国の穴について、missing に挙がった欄だけを埋めたパッチ */
function countryPatches(prompt: string): Array<Record<string, unknown>> {
  const answers: Record<string, string> = {
    plugTypes: 'G',
    voltage: '230V 50Hz',
    tipping: '基本は不要。高級店やホテルでは 5〜10% を置くこともある',
    emergencyPolice: '112',
    emergencyAmbulance: '112',
  }
  return countryPayloadFromPrompt(prompt).map((entry) => {
    const patch: Record<string, unknown> = {
      name: entry.name,
      evidence: { plugTypes: 'マルタで一般に使われているプラグ形状' },
    }
    for (const key of entry.missing) patch[key] = answers[key]
    return patch
  })
}

/** AI の返答を模して ```json フェンスで包む */
function fence(patches: Array<unknown>): string {
  return `\`\`\`json\n${JSON.stringify(patches)}\n\`\`\``
}

describe('buildImportPrompt → parseImportedJson → planImport の往復', () => {
  const respond = (prompt: string): string => fence(bookingPatches(prompt))

  it('既存の予約が増えずに更新される', () => {
    const existing = [flight(), lodging({ place: { name: 'パリ' } })]
    const prompt = buildImportPrompt(state(existing))!
    const result = parseImportedJson(respond(prompt), 'Asia/Tokyo')
    expect(result.bookings).toHaveLength(2)

    const plan = planImport(existing, result.bookings)
    expect(plan.updatedCount).toBe(2)
    expect(plan.addedCount).toBe(0)
    expect(plan.entries.map((entry) => entry.replacesId)).toEqual([
      'flight-1',
      'lodging-1',
    ])
  })

  it('欠けていた項目が埋まり、既存の項目は消えない', () => {
    const existing = [flight()]
    const prompt = buildImportPrompt(state(existing))!
    const result = parseImportedJson(respond(prompt), 'Asia/Tokyo')
    const merged = planImport(existing, result.bookings).entries[0].booking

    expect(merged.id).toBe('flight-1')
    expect(merged.onlineCheckInOpensMinutesBefore).toBe(1440)
    expect(merged.checkInClosesMinutesBefore).toBe(60)
    expect(merged.bagDropClosesMinutesBefore).toBe(75)
    expect(merged.from?.latinName).toBe('Tokyo')
    // パッチが返さなかった欄は、既存の値がそのまま残る
    expect(merged.confirmationNumber).toBe('ABC123')
    expect(merged.status).toBe('confirmed')
    expect(merged.payment).toBe('paid')
    expect(merged.end).not.toBeNull()
    expect(merged.title).toBe('AF276 HND→CDG')
  })

  it('穴埋めを取り込んだあとは、同じ穴が再び対象にならない', () => {
    const existing = [flight()]
    const prompt = buildImportPrompt(state(existing))!
    const result = parseImportedJson(respond(prompt), 'Asia/Tokyo')
    const merged = planImport(existing, result.bookings).entries.map(
      (entry) => entry.booking,
    )
    // 穴が埋まれば空き欄節は消え、プロンプト自体は書類抽出用に残る
    const after = buildImportPrompt(state(merged))
    expect(after).not.toContain('## 登録済みで空いている欄')
  })
})

describe('buildImportPrompt → parseImportedJson → planCountryInfoImport の往復', () => {
  const respond = (prompt: string): string => fence(countryPatches(prompt))

  it('登録済みの国が増えずに更新され、id が保たれる', () => {
    const existing = [country()]
    const prompt = buildImportPrompt(state([], existing))!
    const result = parseImportedJson(respond(prompt), 'Asia/Tokyo')
    expect(result.countryInfos).toHaveLength(1)
    // 国のパッチが予約に化けていないこと(判別が効いていることの確認)
    expect(result.bookings).toEqual([])

    const plan = planCountryInfoImport(existing, result.countryInfos)
    expect(plan.addedCount).toBe(0)
    expect(plan.updatedCount).toBe(1)
    expect(plan.entries[0].replacesId).toBe('country-1')

    const merged = plan.entries[0].country
    expect(merged.id).toBe('country-1')
    expect(merged.name).toBe('マルタ')
    expect(merged.plugTypes).toBe('G')
    expect(merged.voltage).toBe('230V 50Hz')
    // 同じ番号で共通の国でも、警察と救急の両方に書かせる
    expect(merged.emergencyPolice).toBe('112')
    expect(merged.emergencyAmbulance).toBe('112')
  })

  it('埋まっていた欄はパッチに載らず、既存の値が残る', () => {
    const existing = [country({ plugTypes: 'F' })]
    const prompt = buildImportPrompt(state([], existing))!
    const patches = countryPatches(prompt)
    expect(patches[0]).not.toHaveProperty('plugTypes')

    const result = parseImportedJson(fence(patches), 'Asia/Tokyo')
    const merged = planCountryInfoImport(existing, result.countryInfos)
      .entries[0].country
    expect(merged.plugTypes).toBe('F')
    expect(merged.voltage).toBe('230V 50Hz')
  })

  it('取り込んだあとは、同じ穴が再び対象にならない', () => {
    const existing = [country()]
    const prompt = buildImportPrompt(state([], existing))!
    const result = parseImportedJson(respond(prompt), 'Asia/Tokyo')
    const merged = planCountryInfoImport(
      existing,
      result.countryInfos,
    ).entries.map((entry) => entry.country)
    const after = buildImportPrompt(state([], merged))
    expect(after).not.toContain('## 登録済みで空いている欄')
  })

  it('予約のパッチと国のパッチが 1 つの配列に混ざっていても振り分けられる', () => {
    // プロンプトが「混ぜて返してよい」と書いている以上、混ざって返ってくる。
    // 判別規則(kind / start があるか、name があるか)がそのとおり効くことを固定する
    const existingBookings = [flight()]
    const existingCountries = [country()]
    const prompt = buildImportPrompt(
      state(existingBookings, existingCountries),
    )!
    const mixed = [...countryPatches(prompt), ...bookingPatches(prompt)]

    const result = parseImportedJson(fence(mixed), 'Asia/Tokyo')
    expect(result.bookings).toHaveLength(1)
    expect(result.countryInfos).toHaveLength(1)

    const bookingPlan = planImport(existingBookings, result.bookings)
    expect(bookingPlan.entries[0].replacesId).toBe('flight-1')
    expect(bookingPlan.entries[0].booking.onlineCheckInOpensMinutesBefore).toBe(
      1440,
    )

    const countryPlan = planCountryInfoImport(
      existingCountries,
      result.countryInfos,
    )
    expect(countryPlan.entries[0].replacesId).toBe('country-1')
    expect(countryPlan.entries[0].country.plugTypes).toBe('G')
  })
})
