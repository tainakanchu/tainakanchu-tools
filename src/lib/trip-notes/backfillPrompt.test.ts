import { describe, expect, it } from 'vitest'
import {
  BACKFILL_FIELDS,
  buildBackfillPrompt,
  findBackfillGaps,
} from './backfillPrompt'
import { parseImportedJson } from './aiImport'
import {
  DEADLINE_FILL_RULE,
  LATIN_NAME_FILL_RULE,
  buildImportPrompt,
} from './aiPrompt'
import { makeStamp } from './datetime'
import { planImport } from './importMerge'
import type { Booking, TripNotesState } from './types'

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

function state(bookings: Array<Booking>): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'ヨーロッパ周遊',
    startDate: '2026-09-10',
    endDate: '2026-09-20',
    pinnedTz: 'Europe/Paris',
    bookings,
    emergencyContacts: [],
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

/**
 * プロンプト中の ```json フェンスから、AI に渡している予約データを取り出す。
 * 生成された本文をそのまま読むので、プロンプトに何が載っているかを
 * 文字列の contains ではなく構造として確かめられる。
 */
function payloadFromPrompt(prompt: string): Array<PromptPayload> {
  const match = /```json\n([\s\S]*?)```/.exec(prompt)
  if (match === null) throw new Error('プロンプトに json フェンスがありません')
  const parsed = JSON.parse(match[1]) as unknown
  if (!isUnknownArray(parsed)) throw new Error('JSON 配列ではありません')
  return parsed.map(asPayload)
}

describe('findBackfillGaps: 対象の絞り込み', () => {
  it('埋めるべき穴が 1 つも無ければ対象が空になる', () => {
    const filled = flight({
      checkInClosesMinutesBefore: 60,
      bagDropClosesMinutesBefore: 75,
      from: { name: '羽田空港', latinName: 'Tokyo Haneda' },
      to: { name: 'シャルル・ド・ゴール空港', latinName: 'Paris CDG' },
    })
    const gaps = findBackfillGaps(state([filled, lodging()]))
    expect(gaps.targets).toEqual([])
    expect(gaps.bookingCount).toBe(0)
    expect(gaps.countsByField).toEqual([])
  })

  it('締切が両方とも入っている移動は、締切の対象にならない', () => {
    const filled = flight({
      checkInClosesMinutesBefore: 60,
      bagDropClosesMinutesBefore: 75,
    })
    const gaps = findBackfillGaps(state([filled]))
    const ids = gaps.targets[0].fields.map((field) => field.id)
    expect(ids).not.toContain('deadlines')
    // ラテン文字表記のほうはまだ空なので、そちらだけが残る
    expect(ids).toContain('placeLatinName')
  })

  it('締切が片方だけ入っている移動は、欠けているほうだけが対象になる', () => {
    const half = flight({ checkInClosesMinutesBefore: 60 })
    const gaps = findBackfillGaps(state([half]))
    expect(gaps.targets[0].missingKeys).toContain('bagDropClosesMinutesBefore')
    expect(gaps.targets[0].missingKeys).not.toContain(
      'checkInClosesMinutesBefore',
    )
  })

  it('移動系でない予約には締切の穴を作らない', () => {
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
      expect(target.fields.map((field) => field.id)).not.toContain('deadlines')
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
    // 締切が空なのは移動の 1 件だけ、ラテン文字表記が空なのは 2 件
    expect(byId.get('deadlines')).toBe(1)
    expect(byId.get('placeLatinName')).toBe(2)
    expect(gaps.bookingCount).toBe(2)
  })

  it('対象になりうる項目は BACKFILL_FIELDS への登録だけで決まる', () => {
    // 「一般知識で埋められる項目」だけをここに登録する、という約束の見張り。
    // 座席や運賃クラスのように原本にしか無い項目が紛れ込んでいないことを確かめる
    expect(BACKFILL_FIELDS.map((field) => field.id)).toEqual([
      'deadlines',
      'placeLatinName',
    ])
  })
})

describe('buildBackfillPrompt: 出し分けと中身', () => {
  it('穴が 1 つも無ければ null を返す', () => {
    const filled = flight({
      checkInClosesMinutesBefore: 60,
      bagDropClosesMinutesBefore: 75,
      from: { name: '羽田空港', latinName: 'Tokyo Haneda' },
      to: { name: 'シャルル・ド・ゴール空港', latinName: 'Paris CDG' },
    })
    expect(buildBackfillPrompt(state([filled]))).toBeNull()
  })

  it('予約が 1 件も無ければ null を返す', () => {
    expect(buildBackfillPrompt(state([]))).toBeNull()
  })

  it('確認番号をプロンプトに含めない', () => {
    // 突き合わせは kind + 開始日 + タイトルで足りるので、確認番号は送らない
    const prompt = buildBackfillPrompt(state([flight()]))
    expect(prompt).not.toBeNull()
    expect(prompt).not.toContain('ABC123')
    expect(prompt).not.toContain('confirmationNumber')
  })

  it('料金・メモのような、原本にしか無い項目を送らない', () => {
    const prompt = buildBackfillPrompt(
      state([
        flight({
          price: { amount: 98000, currency: 'JPY' },
          note: '座席 12A / 受託手荷物 1 個',
        }),
      ]),
    )
    expect(prompt).not.toContain('98000')
    expect(prompt).not.toContain('12A')
  })

  it('識別に使う kind / title / start だけを識別情報として渡す', () => {
    const payload = payloadFromPrompt(buildBackfillPrompt(state([flight()]))!)
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
      buildBackfillPrompt(state([flight(), filled]))!,
    )
    expect(payload).toHaveLength(1)
    expect(payload[0].title).toBe('AF276 HND→CDG')
  })

  it('missing に、その予約で欠けているキーだけが並ぶ', () => {
    const payload = payloadFromPrompt(
      buildBackfillPrompt(
        state([flight({ from: { name: '羽田空港', latinName: 'Tokyo' } })]),
      )!,
    )
    expect(payload[0].missing).toEqual([
      'checkInClosesMinutesBefore',
      'bagDropClosesMinutesBefore',
      'to.latinName',
    ])
  })

  it('終日の予約は time を null で渡す', () => {
    const allDay = flight({
      start: { zdt: '2026-09-12T00:00:00+09:00[Asia/Tokyo]', allDay: true },
    })
    const payload = payloadFromPrompt(buildBackfillPrompt(state([allDay]))!)
    expect(payload[0].start.time).toBeNull()
  })

  it('識別情報を書き換えてはいけないことを強く伝える', () => {
    const prompt = buildBackfillPrompt(state([flight()]))!
    expect(prompt).toContain('1 文字も変えずにそのまま')
    expect(prompt).toContain('新しい予約として二重に増えます')
  })

  it('埋め方の規則は抽出プロンプトと同じ文面を使う', () => {
    // 文面を書き写すと片方だけ直されて規則が割れるので、同じ定数から出ていることを
    // 見張る。両方のプロンプトが同じ文字列を丸ごと含んでいれば複製は起きていない
    const backfill = buildBackfillPrompt(state([flight()]))!
    const extraction = buildImportPrompt(state([]))
    for (const rule of [DEADLINE_FILL_RULE, LATIN_NAME_FILL_RULE]) {
      expect(backfill).toContain(rule)
      expect(extraction).toContain(rule)
    }
  })

  it('穴のある項目の規則だけを載せる', () => {
    // 締切が埋まっている宿だけの状態なら、締切の規則は出てこない
    const prompt = buildBackfillPrompt(
      state([lodging({ place: { name: 'パリ' } })]),
    )!
    expect(prompt).not.toContain('締切は空港ごと・航空会社ごとに違います')
    expect(prompt).toContain('都市名を優先してください')
  })
})

describe('buildBackfillPrompt → parseImportedJson → planImport の往復', () => {
  /**
   * プロンプトが渡した識別情報をそのまま返し、欠けていた欄だけを足した
   * AI の返答を組み立てる。素直な AI が返すはずの最小のパッチ。
   */
  function respond(prompt: string): string {
    const patches = payloadFromPrompt(prompt).map((entry) => {
      const patch: Record<string, unknown> = {
        kind: entry.kind,
        title: entry.title,
        start: entry.start,
        evidence: { checkInClosesMinutesBefore: 'ANA 羽田 国際線の規定' },
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
    return `\`\`\`json\n${JSON.stringify(patches)}\n\`\`\``
  }

  it('既存の予約が増えずに更新される', () => {
    const existing = [flight(), lodging({ place: { name: 'パリ' } })]
    const prompt = buildBackfillPrompt(state(existing))!
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
    const prompt = buildBackfillPrompt(state(existing))!
    const result = parseImportedJson(respond(prompt), 'Asia/Tokyo')
    const merged = planImport(existing, result.bookings).entries[0].booking

    expect(merged.id).toBe('flight-1')
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
    const prompt = buildBackfillPrompt(state(existing))!
    const result = parseImportedJson(respond(prompt), 'Asia/Tokyo')
    const merged = planImport(existing, result.bookings).entries.map(
      (entry) => entry.booking,
    )
    expect(buildBackfillPrompt(state(merged))).toBeNull()
  })
})
