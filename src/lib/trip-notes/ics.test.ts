import { describe, expect, it } from 'vitest'
import { makeAllDayStamp, makeStamp } from './datetime'
import { buildTripIcs, icsFileName } from './ics'
import type { Booking, TravelDoc, TripNotesState } from './types'

const PARIS = 'Europe/Paris'
const TOKYO = 'Asia/Tokyo'

/** DTSTAMP の元。書き出した時刻に依存するのはこの 1 か所だけ */
const NOW = Date.UTC(2026, 8, 1, 12, 34, 56)

function makeState(overrides: Partial<TripNotesState> = {}): TripNotesState {
  return {
    schemaVersion: 1,
    tripTitle: 'ヨーロッパ',
    startDate: '2026-09-23',
    endDate: '2026-09-30',
    pinnedTz: null,
    bookings: [],
    emergencyContacts: [],
    ...overrides,
  }
}

type BookingInit = Partial<Booking> &
  Pick<Booking, 'id' | 'kind' | 'title' | 'start'>

function booking(init: BookingInit): Booking {
  return { end: null, status: 'confirmed', payment: 'unpaid', ...init }
}

function makeDoc(overrides: Partial<TravelDoc> = {}): TravelDoc {
  return {
    id: 'td-1',
    kind: 'visa',
    title: 'シェンゲンビザ',
    status: 'todo',
    ...overrides,
  }
}

/** 現地時刻の Stamp */
const at = makeStamp
/** 終日の Stamp */
const allDay = makeAllDayStamp

/** 折られた行(継続行)を繋ぎ直した論理行の一覧 */
function lines(ics: string): Array<string> {
  return ics
    .replace(/\r\n /g, '')
    .split('\r\n')
    .filter((line) => line !== '')
}

/** 折られたままの物理行。行長の検証に使う */
function rawLines(ics: string): Array<string> {
  return ics.split('\r\n').filter((line) => line !== '')
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length
}

/** 指定した名前のプロパティ行(パラメータ付きも拾う) */
function propertyLines(ics: string, name: string): Array<string> {
  return lines(ics).filter(
    (line) => line.startsWith(`${name}:`) || line.startsWith(`${name};`),
  )
}

function firstProperty(ics: string, name: string): string {
  const found = propertyLines(ics, name)
  if (found.length === 0) throw new Error(`${name} が出力されていない`)
  return found[0]
}

describe('buildTripIcs / カレンダーの外枠', () => {
  it('VCALENDAR の必須フィールドを持つ', () => {
    const ics = buildTripIcs(makeState(), NOW)
    const out = lines(ics)
    expect(out[0]).toBe('BEGIN:VCALENDAR')
    expect(out).toContain('VERSION:2.0')
    expect(out).toContain('PRODID:-//tainakanchu tools//旅のしおり//JA')
    expect(out).toContain('CALSCALE:GREGORIAN')
    expect(out.at(-1)).toBe('END:VCALENDAR')
  })

  it('行末は CRLF で、最後の行のあとにも付く', () => {
    const ics = buildTripIcs(makeState(), NOW)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    // LF 単独の改行が混ざっていない
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('旅行のタイトルを X-WR-CALNAME に入れる(取り込み先カレンダー名の初期値)', () => {
    const ics = buildTripIcs(makeState({ tripTitle: 'マルタ 2026' }), NOW)
    expect(lines(ics)).toContain('X-WR-CALNAME:マルタ 2026')
  })

  it('タイトルが空なら X-WR-CALNAME ごと出さない', () => {
    const ics = buildTripIcs(makeState({ tripTitle: '   ' }), NOW)
    expect(propertyLines(ics, 'X-WR-CALNAME')).toEqual([])
  })

  it('招待メッセージと誤解されないよう METHOD は付けない', () => {
    const ics = buildTripIcs(makeState(), NOW)
    expect(propertyLines(ics, 'METHOD')).toEqual([])
  })
})

describe('buildTripIcs / TEXT 値のエスケープ', () => {
  it('カンマ・セミコロン・バックスラッシュ・改行をエスケープする', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'activity',
            title: 'カフェ, バー; 予約\\済み',
            start: at('2026-09-23', '10:00', PARIS),
            note: '1行目\n2行目',
          }),
        ],
      }),
      NOW,
    )

    expect(firstProperty(ics, 'SUMMARY')).toBe(
      'SUMMARY:🎫 カフェ\\, バー\\; 予約\\\\済み',
    )
    expect(firstProperty(ics, 'DESCRIPTION')).toBe('DESCRIPTION:1行目\\n2行目')
  })

  it('CRLF の改行も 1 つの \\n になる', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'activity',
            title: '予定',
            start: at('2026-09-23', '10:00', PARIS),
            note: '1行目\r\n2行目',
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'DESCRIPTION')).toBe('DESCRIPTION:1行目\\n2行目')
  })
})

describe('buildTripIcs / 75 オクテットでの行折り', () => {
  const longTitle = 'あ'.repeat(60)

  function longIcs(): string {
    return buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'activity',
            title: longTitle,
            start: at('2026-09-23', '10:00', PARIS),
          }),
        ],
      }),
      NOW,
    )
  }

  it('どの物理行も 75 オクテット以下になる(文字数ではなくバイト数)', () => {
    // 日本語は 1 文字 3 オクテット。文字数で折っていると 180 オクテット超の行が残る
    for (const line of rawLines(longIcs())) {
      expect(utf8Length(line)).toBeLessThanOrEqual(75)
    }
  })

  it('継続行は空白 1 つで始まり、繋ぎ直すと元の値に戻る', () => {
    const ics = longIcs()
    const physical = rawLines(ics)
    const continuations = physical.filter((line) => line.startsWith(' '))
    expect(continuations.length).toBeGreaterThan(0)
    expect(firstProperty(ics, 'SUMMARY')).toBe(`SUMMARY:🎫 ${longTitle}`)
  })

  it('サロゲートペア(絵文字)が折り位置で割れない', () => {
    // 継続行の直前にちょうど絵文字が来るような長さのタイトルを何通りか試し、
    // 繋ぎ直したときに元の文字列に戻ることを確かめる
    for (let count = 20; count <= 26; count++) {
      const title = `${'あ'.repeat(count)}🚄🚄🚄`
      const ics = buildTripIcs(
        makeState({
          bookings: [
            booking({
              id: 'b1',
              kind: 'activity',
              title,
              start: at('2026-09-23', '10:00', PARIS),
            }),
          ],
        }),
        NOW,
      )
      expect(firstProperty(ics, 'SUMMARY')).toBe(`SUMMARY:🎫 ${title}`)
      for (const line of rawLines(ics)) {
        expect(utf8Length(line)).toBeLessThanOrEqual(75)
      }
    }
  })
})

describe('buildTripIcs / 時刻付きイベントは UTC で出す', () => {
  function flightIcs(date: string, time: string, tz: string): string {
    return buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: 'パリ発',
            start: at(date, time, tz),
          }),
        ],
      }),
      NOW,
    )
  }

  it('夏時間のパリ 20:15 は 18:15Z になる', () => {
    expect(
      firstProperty(flightIcs('2026-09-23', '20:15', PARIS), 'DTSTART'),
    ).toBe('DTSTART:20260923T181500Z')
  })

  it('冬時間(標準時)のパリ 20:15 は 19:15Z になる', () => {
    // 同じ壁時計時刻でも夏時間の有無でオフセットが 1 時間変わる。
    // VTIMEZONE を書かずに UTC で出しているので、この差は Temporal が吸収する
    expect(
      firstProperty(flightIcs('2026-01-15', '20:15', PARIS), 'DTSTART'),
    ).toBe('DTSTART:20260115T191500Z')
  })

  it('東京 09:00 は同じ日の 00:00Z になる', () => {
    expect(
      firstProperty(flightIcs('2026-09-24', '09:00', TOKYO), 'DTSTART'),
    ).toBe('DTSTART:20260924T000000Z')
  })

  it('DTEND も UTC で出し、TZID や VTIMEZONE は 1 つも書かない', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: 'パリ → 東京',
            start: at('2026-09-23', '20:15', PARIS),
            end: at('2026-09-24', '15:45', TOKYO),
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'DTSTART')).toBe('DTSTART:20260923T181500Z')
    expect(firstProperty(ics, 'DTEND')).toBe('DTEND:20260924T064500Z')
    expect(ics).not.toContain('TZID')
    expect(ics).not.toContain('VTIMEZONE')
  })

  it('end が無ければ DTEND を出さない', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'activity',
            title: '美術館',
            start: at('2026-09-23', '10:00', PARIS),
          }),
        ],
      }),
      NOW,
    )
    expect(propertyLines(ics, 'DTEND')).toEqual([])
  })

  it('end が start 以前という壊れたデータでは DTEND を落とす', () => {
    // DTEND は DTSTART より後でなければならない。イベントごと弾かれるより
    // 終わりを落として残すほうがよい
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'train',
            title: '逆転した予約',
            start: at('2026-09-23', '10:00', PARIS),
            end: at('2026-09-23', '08:00', PARIS),
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'DTSTART')).toBe('DTSTART:20260923T080000Z')
    expect(propertyLines(ics, 'DTEND')).toEqual([])
  })

  it('開始が壊れた Stamp の予約はイベントごと出さない', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'broken',
            kind: 'train',
            title: 'こわれた予約',
            start: { zdt: 'こわれた時刻', allDay: false },
          }),
        ],
      }),
      NOW,
    )
    expect(propertyLines(ics, 'UID')).toEqual([])
  })
})

describe('buildTripIcs / 終日は VALUE=DATE で出す', () => {
  it('宿の DTEND はチェックアウト日を含む帯になる', () => {
    // DTEND は排他なので、チェックアウト日(9/26)を帯に含めるには 9/27 を指す。
    // チェックアウトの朝までその宿に居るので、その日にも宿の名前が出ていてほしい
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'hotel',
            kind: 'lodging',
            title: 'パリのホテル',
            start: allDay('2026-09-23', PARIS),
            end: allDay('2026-09-26', PARIS),
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20260923')
    expect(firstProperty(ics, 'DTEND')).toBe('DTEND;VALUE=DATE:20260927')
  })

  it('終日の予定は現地の暦の日付そのものを出す(UTC に落とさない)', () => {
    // 東京の終日 9/23 を UTC の瞬間に落とすと 9/22 15:00Z になり、
    // 時差の向きによっては前日として表示されてしまう
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'free',
            kind: 'activity',
            title: '終日フリー',
            start: allDay('2026-09-23', TOKYO),
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20260923')
    expect(firstProperty(ics, 'DTEND')).toBe('DTEND;VALUE=DATE:20260924')
  })

  it('終わりが無い終日の予定は 1 日ぶんの帯になる', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'hotel',
            kind: 'lodging',
            title: '宿',
            start: allDay('2026-09-23', PARIS),
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'DTEND')).toBe('DTEND;VALUE=DATE:20260924')
  })

  it('時刻付きの宿はそのまま時刻付きで出す(チェックイン〜チェックアウトの 1 件)', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'hotel',
            kind: 'lodging',
            title: 'パリのホテル',
            start: at('2026-09-23', '15:00', PARIS),
            end: at('2026-09-26', '11:00', PARIS),
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'DTSTART')).toBe('DTSTART:20260923T130000Z')
    expect(firstProperty(ics, 'DTEND')).toBe('DTEND:20260926T090000Z')
  })

  it('終わりだけ終日の予約は、その日の終わり(翌日 00:00)まで伸ばす', () => {
    // 終日 Stamp が指すのは現地 00:00。そのまま DTEND にすると
    // チェックアウト日の未明で切れて、最後の 1 日が消える
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'hotel',
            kind: 'lodging',
            title: '宿',
            start: at('2026-09-23', '15:00', PARIS),
            end: allDay('2026-09-26', PARIS),
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'DTEND')).toBe('DTEND:20260926T220000Z')
  })
})

describe('buildTripIcs / SUMMARY・LOCATION・DESCRIPTION', () => {
  it('種別の絵文字をタイトルの前に付ける', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: 'AF275',
            start: at('2026-09-23', '20:15', PARIS),
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'SUMMARY')).toBe('SUMMARY:✈️ AF275')
  })

  it('移動の LOCATION は出発地。住所があれば併記する', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'train',
            title: 'タリス',
            start: at('2026-09-23', '10:00', PARIS),
            from: { name: 'パリ北駅', address: '18 Rue de Dunkerque' },
            to: { name: 'アムステルダム中央駅' },
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'LOCATION')).toBe(
      'LOCATION:パリ北駅 18 Rue de Dunkerque',
    )
  })

  it('宿泊・アクティビティの LOCATION は place', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'lodging',
            title: 'ホテル',
            start: at('2026-09-23', '15:00', PARIS),
            place: { name: 'Hôtel de Paris', address: '1 Rue X' },
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'LOCATION')).toBe(
      'LOCATION:Hôtel de Paris 1 Rue X',
    )
  })

  it('DESCRIPTION に確認番号・予約先・区間・メモを並べる', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: 'AF275',
            start: at('2026-09-23', '20:15', PARIS),
            confirmationNumber: 'ABC123',
            provider: 'Air France',
            from: { name: 'パリ' },
            to: { name: '東京' },
            note: '座席は 32A',
          }),
        ],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'DESCRIPTION')).toBe(
      'DESCRIPTION:確認番号: ABC123\\n予約先: Air France\\nパリ → 東京\\n座席は 32A',
    )
  })

  it('evidence は DESCRIPTION に載せない', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: 'AF275',
            start: at('2026-09-23', '20:15', PARIS),
            unverified: ['start'],
            evidence: { start: '予約確認メールからの長い引用' },
          }),
        ],
      }),
      NOW,
    )
    expect(ics).not.toContain('予約確認メールからの長い引用')
  })

  it('出すものが何も無ければ LOCATION・DESCRIPTION の行ごと出さない', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'activity',
            title: '予定',
            start: at('2026-09-23', '10:00', PARIS),
          }),
        ],
      }),
      NOW,
    )
    expect(propertyLines(ics, 'LOCATION')).toEqual([])
    expect(propertyLines(ics, 'DESCRIPTION')).toEqual([])
  })
})

describe('buildTripIcs / VALARM は入力された分数だけから作る', () => {
  it('搭乗手続き・受託手荷物の分数からアラームを作る', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: 'AF275',
            start: at('2026-09-23', '20:15', PARIS),
            checkInClosesMinutesBefore: 45,
            bagDropClosesMinutesBefore: 60,
          }),
        ],
      }),
      NOW,
    )
    const out = lines(ics)
    expect(out.filter((line) => line === 'BEGIN:VALARM')).toHaveLength(2)
    expect(out).toContain('TRIGGER:-PT45M')
    expect(out).toContain('TRIGGER:-PT60M')
    expect(out).toContain('DESCRIPTION:搭乗手続きの締切')
    expect(out).toContain('DESCRIPTION:受託手荷物を預ける締切')
    expect(out).toContain('ACTION:DISPLAY')
  })

  it('オンラインチェックインの開始からもアラームを作る', () => {
    // 締切ではないが、価値があるのは「開いた瞬間に席を取る」の 1 点なので、
    // その瞬間を拾う通知こそがこの項目の使い道になる
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: 'AF275',
            start: at('2026-09-23', '20:15', PARIS),
            onlineCheckInOpensMinutesBefore: 1440,
          }),
        ],
      }),
      NOW,
    )
    const out = lines(ics)
    expect(out.filter((line) => line === 'BEGIN:VALARM')).toHaveLength(1)
    expect(out).toContain('TRIGGER:-PT1440M')
    expect(out).toContain('DESCRIPTION:オンラインチェックイン開始')
  })

  it('開始と締切が揃っていれば 3 つとも作る', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: 'AF275',
            start: at('2026-09-23', '20:15', PARIS),
            onlineCheckInOpensMinutesBefore: 2880,
            checkInClosesMinutesBefore: 45,
            bagDropClosesMinutesBefore: 60,
          }),
        ],
      }),
      NOW,
    )
    const out = lines(ics)
    expect(out.filter((line) => line === 'BEGIN:VALARM')).toHaveLength(3)
    // 並びは時系列(開始 → 手荷物 → 搭乗手続き)
    expect(out.filter((line) => line.startsWith('TRIGGER:'))).toEqual([
      'TRIGGER:-PT2880M',
      'TRIGGER:-PT60M',
      'TRIGGER:-PT45M',
    ])
  })

  it('片方だけ入っていればその 1 つだけ作る', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: 'AF275',
            start: at('2026-09-23', '20:15', PARIS),
            checkInClosesMinutesBefore: 45,
          }),
        ],
      }),
      NOW,
    )
    const out = lines(ics)
    expect(out.filter((line) => line === 'BEGIN:VALARM')).toHaveLength(1)
    expect(out).toContain('TRIGGER:-PT45M')
  })

  it('締切が入っていない予約にはアラームを付けない(既定のアラームも付けない)', () => {
    // 通知の設定は利用者が自分の生活に合わせて決めているもので、
    // 取り込んだ旅程が勝手に鳴りはじめると消す作業が予定の数だけ発生する
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: 'AF275',
            start: at('2026-09-23', '20:15', PARIS),
          }),
          booking({
            id: 'b2',
            kind: 'lodging',
            title: 'ホテル',
            start: at('2026-09-23', '15:00', PARIS),
          }),
        ],
      }),
      NOW,
    )
    expect(ics).not.toContain('BEGIN:VALARM')
  })

  it('終日の予約にはアラームを付けない(0 時起点の嘘の時刻に鳴るため)', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: '時刻未定の便',
            start: allDay('2026-09-23', PARIS),
            checkInClosesMinutesBefore: 60,
          }),
        ],
      }),
      NOW,
    )
    expect(ics).not.toContain('BEGIN:VALARM')
  })

  it('終日の予約ではオンラインチェックインの開始もアラームにしない', () => {
    // 出発時刻が分かっていない以上、その 24 時間前も置きようがない。
    // 終日 Stamp の現地 00:00 から数えると、前々日の 00:00 に鳴る
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: '時刻未定の便',
            start: allDay('2026-09-23', PARIS),
            onlineCheckInOpensMinutesBefore: 1440,
          }),
        ],
      }),
      NOW,
    )
    expect(ics).not.toContain('BEGIN:VALARM')
  })

  it('0 や負の分数はアラームにしない', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'b1',
            kind: 'flight',
            title: 'AF275',
            start: at('2026-09-23', '20:15', PARIS),
            checkInClosesMinutesBefore: 0,
            bagDropClosesMinutesBefore: -30,
          }),
        ],
      }),
      NOW,
    )
    expect(ics).not.toContain('BEGIN:VALARM')
  })
})

describe('buildTripIcs / 出さないもの', () => {
  it('キャンセル済みの予約は含まれない', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'alive',
            kind: 'flight',
            title: '生きている予約',
            start: at('2026-09-23', '20:15', PARIS),
          }),
          booking({
            id: 'dead',
            kind: 'flight',
            title: 'やめた予約',
            start: at('2026-09-24', '20:15', PARIS),
            status: 'cancelled',
          }),
        ],
      }),
      NOW,
    )
    expect(propertyLines(ics, 'UID')).toEqual(['UID:alive@tainakanchu-tools'])
    expect(ics).not.toContain('やめた予約')
  })

  it('検討中・仮押さえの予約は含まれる', () => {
    const ics = buildTripIcs(
      makeState({
        bookings: [
          booking({
            id: 'idea',
            kind: 'lodging',
            title: '候補の宿',
            start: at('2026-09-23', '15:00', PARIS),
            status: 'idea',
          }),
        ],
      }),
      NOW,
    )
    expect(propertyLines(ics, 'UID')).toEqual(['UID:idea@tainakanchu-tools'])
  })
})

describe('buildTripIcs / 旅行前の手続き', () => {
  it('申請期限のある手続きを終日イベントにする', () => {
    const ics = buildTripIcs(
      makeState({
        travelDocs: [makeDoc({ dueDate: '2026-09-01', region: 'マルタ' })],
      }),
      NOW,
    )
    expect(firstProperty(ics, 'SUMMARY')).toBe(
      'SUMMARY:〆 シェンゲンビザの申請期限',
    )
    expect(firstProperty(ics, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20260901')
    // 期限日そのものを帯に含めるので、排他の DTEND は翌日
    expect(firstProperty(ics, 'DTEND')).toBe('DTEND;VALUE=DATE:20260902')
    expect(firstProperty(ics, 'UID')).toBe('UID:td-1@tainakanchu-tools')
    expect(firstProperty(ics, 'DESCRIPTION')).toBe('DESCRIPTION:対象: マルタ')
  })

  it('済んだ手続き(done)は含まれない', () => {
    const ics = buildTripIcs(
      makeState({
        travelDocs: [makeDoc({ status: 'done', dueDate: '2026-09-01' })],
      }),
      NOW,
    )
    expect(propertyLines(ics, 'UID')).toEqual([])
  })

  it('申請期限が無い手続きは含まれない', () => {
    const ics = buildTripIcs(
      makeState({ travelDocs: [makeDoc({ status: 'applied' })] }),
      NOW,
    )
    expect(propertyLines(ics, 'UID')).toEqual([])
  })

  it('申請期限が日付として壊れていれば含めない', () => {
    const ics = buildTripIcs(
      makeState({ travelDocs: [makeDoc({ dueDate: '2026-13-40' })] }),
      NOW,
    )
    expect(propertyLines(ics, 'UID')).toEqual([])
  })
})

describe('buildTripIcs / UID と DTSTAMP', () => {
  const state = makeState({
    bookings: [
      booking({
        id: 'bk-1',
        kind: 'flight',
        title: 'AF275',
        start: at('2026-09-23', '20:15', PARIS),
      }),
    ],
  })

  it('UID は予約 id から作られ、書き出すたびに変わらない', () => {
    const first = buildTripIcs(state, NOW)
    const second = buildTripIcs(state, NOW + 86_400_000)
    expect(propertyLines(first, 'UID')).toEqual(['UID:bk-1@tainakanchu-tools'])
    expect(propertyLines(second, 'UID')).toEqual(propertyLines(first, 'UID'))
  })

  it('DTSTAMP だけが書き出した時刻で変わる', () => {
    const first = buildTripIcs(state, NOW)
    const second = buildTripIcs(state, NOW + 86_400_000)
    expect(firstProperty(first, 'DTSTAMP')).toBe('DTSTAMP:20260901T123456Z')
    expect(firstProperty(second, 'DTSTAMP')).toBe('DTSTAMP:20260902T123456Z')
  })
})

describe('icsFileName', () => {
  it('旅行のタイトルを使う', () => {
    expect(icsFileName(makeState({ tripTitle: 'マルタ' }), '2026-09-01')).toBe(
      '旅のしおり-マルタ.ics',
    )
  })

  it('タイトルが空なら日付で代用する', () => {
    expect(icsFileName(makeState({ tripTitle: '  ' }), '2026-09-01')).toBe(
      '旅のしおり-2026-09-01.ics',
    )
  })

  it('ファイル名に使えない文字は落とす', () => {
    expect(
      icsFileName(makeState({ tripTitle: 'パリ/ローマ: 2026' }), '2026-09-01'),
    ).toBe('旅のしおり-パリローマ 2026.ics')
  })
})
