import { describe, expect, it } from 'vitest'
import { parseArrivalJson, planArrivalImport } from './aiImport'
import { resolveFlightCode } from './options'
import { createEmptyTraveler, createEmptyTrip } from './storage'
import type { ArrivalCardState } from './types'

/** AI が返す想定の、素直な JSON 1 件 */
const FULL_JSON = {
  dateOfEntry: '2026-03-15',
  entryAirlineCode: 'BR',
  entryFlightNumber: '190',
  exitDate: '2026-03-20',
  exitAirlineCode: 'JX',
  exitFlightNumber: '801',
  hotelName: 'Grand Hyatt Taipei',
  hotelAddress: 'No. 2, Songshou Rd., Xinyi Dist., Taipei City',
  travelers: [
    {
      englishName: 'YAMADA TARO',
      dateOfBirth: '1990-05-04',
      passportNumber: 'TR1234567',
      passportExpiry: '2030-01-31',
      sex: 'Male',
    },
  ],
}

function state(overrides: Partial<ArrivalCardState> = {}): ArrivalCardState {
  return {
    trip: createEmptyTrip(),
    travelers: [createEmptyTraveler()],
    pastTrips: [],
    ...overrides,
  }
}

describe('parseArrivalJson', () => {
  it('素の JSON を読み取る', () => {
    const { extracted, issues } = parseArrivalJson(JSON.stringify(FULL_JSON))
    expect(issues).toEqual([])
    expect(extracted.dateOfEntry).toBe('2026-03-15')
    expect(extracted.entryAirlineCode).toBe('BR')
    expect(extracted.entryFlightNumber).toBe('190')
    expect(extracted.hotelName).toBe('Grand Hyatt Taipei')
    expect(extracted.travelers).toHaveLength(1)
    expect(extracted.travelers?.[0].englishName).toBe('YAMADA TARO')
  })

  it('```json フェンスで囲まれていても読み取る', () => {
    const text = `\`\`\`json\n${JSON.stringify(FULL_JSON, null, 2)}\n\`\`\``
    const { extracted, issues } = parseArrivalJson(text)
    expect(issues).toEqual([])
    expect(extracted.dateOfEntry).toBe('2026-03-15')
  })

  it('前後に散文が付いていても読み取る', () => {
    const text = [
      'はい、予約書類から以下の情報を抽出しました。',
      '',
      '```json',
      JSON.stringify(FULL_JSON),
      '```',
      '',
      'ご確認ください。不明な項目は null にしてあります。',
    ].join('\n')
    const { extracted } = parseArrivalJson(text)
    expect(extracted.entryFlightNumber).toBe('190')
    expect(extracted.travelers).toHaveLength(1)
  })

  it('フェンスが無く散文に埋もれていても切り出す', () => {
    const text = `抽出結果です: ${JSON.stringify(FULL_JSON)} 以上です。`
    const { extracted } = parseArrivalJson(text)
    expect(extracted.dateOfEntry).toBe('2026-03-15')
  })

  it('末尾カンマがあっても読み取る', () => {
    const text = `{
      "dateOfEntry": "2026-03-15",
      "entryAirlineCode": "BR",
      "entryFlightNumber": "190",
      "travelers": [
        { "englishName": "YAMADA TARO", "sex": "Male", },
      ],
    }`
    const { extracted } = parseArrivalJson(text)
    expect(extracted.dateOfEntry).toBe('2026-03-15')
    expect(extracted.travelers?.[0].englishName).toBe('YAMADA TARO')
  })

  it('ChatGPT の引用マーカーが混ざっていても値から取り除く', () => {
    const text = JSON.stringify({
      ...FULL_JSON,
      hotelName: 'Grand Hyatt Taipei :contentReference[oaicite:3]{index=3}',
      travelers: [
        {
          ...FULL_JSON.travelers[0],
          englishName: 'YAMADA TARO:contentReference[oaicite:1]{index=1}',
        },
      ],
    })
    const { extracted } = parseArrivalJson(text)
    expect(extracted.hotelName).toBe('Grand Hyatt Taipei')
    expect(extracted.travelers?.[0].englishName).toBe('YAMADA TARO')
  })

  it('travelers の一部が壊れていても、残りは取り込んで issues に残す', () => {
    const text = JSON.stringify({
      ...FULL_JSON,
      travelers: [
        FULL_JSON.travelers[0],
        'YAMADA HANAKO',
        { englishName: 'SUZUKI ICHIRO', dateOfBirth: '1985/07/07' },
      ],
    })
    const { extracted, issues } = parseArrivalJson(text)
    expect(extracted.travelers?.map((t) => t.englishName)).toEqual([
      'YAMADA TARO',
      'SUZUKI ICHIRO',
    ])
    // 文字列だった 2 件目
    expect(
      issues.some(
        (issue) => issue.index === 1 && issue.message.includes('オブジェクト'),
      ),
    ).toBe(true)
    // 日付形式が違う 3 件目。人ごと落とさず、その欄だけ null にする
    expect(
      issues.some(
        (issue) => issue.index === 2 && issue.message.includes('dateOfBirth'),
      ),
    ).toBe(true)
    expect(extracted.travelers?.[1].dateOfBirth).toBeNull()
  })

  it('全項目 null のオブジェクトでも例外を投げない', () => {
    const { extracted, issues } = parseArrivalJson(
      JSON.stringify({
        dateOfEntry: null,
        entryAirlineCode: null,
        travelers: null,
      }),
    )
    expect(issues).toEqual([])
    expect(extracted.dateOfEntry).toBeNull()
    expect(extracted.travelers).toBeNull()
  })

  it('JSON として読めなければ issue を残して空の抽出結果を返す', () => {
    const { extracted, issues } =
      parseArrivalJson('すみません、読み取れませんでした')
    expect(extracted.dateOfEntry).toBeNull()
    expect(issues[0].message).toContain('JSON として読み取れませんでした')
  })

  it('入力が空なら「入力が空です」', () => {
    const { issues } = parseArrivalJson('   ')
    expect(issues).toEqual([{ index: null, message: '入力が空です' }])
  })

  it("便番号に 'BR190' が来たら数字だけを取り出し、issue に残す", () => {
    const { extracted, issues } = parseArrivalJson(
      JSON.stringify({ entryFlightNumber: 'BR190' }),
    )
    expect(extracted.entryFlightNumber).toBe('190')
    expect(issues.some((issue) => issue.message.includes("'190'"))).toBe(true)
  })

  it('日付が YYYY-MM-DD でなければ取り込まず issue に残す', () => {
    const { extracted, issues } = parseArrivalJson(
      JSON.stringify({ dateOfEntry: '2026/03/15' }),
    )
    expect(extracted.dateOfEntry).toBeNull()
    expect(issues[0].message).toContain('dateOfEntry')
  })

  /*
    形は 'YYYY-MM-DD' だが実在しない日付。ここで通すと date input は空欄を
    描き、未入力チェックは「文字列が空か」しか見ないので警告も出ず、
    xlsx への変換だけが失敗して「日付が空・警告なし」の Excel ができる。
  */
  it('実在しない日付は取り込まず issue に残す', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-04-31']) {
      const { extracted, issues } = parseArrivalJson(
        JSON.stringify({ dateOfEntry: bad }),
      )
      expect(extracted.dateOfEntry, `${bad} は落とすこと`).toBeNull()
      expect(issues.some((issue) => issue.raw === bad)).toBe(true)
    }
  })

  it('旅行者の生年月日が実在しなくても、その人の他の欄は取り込む', () => {
    const { extracted, issues } = parseArrivalJson(
      JSON.stringify({
        travelers: [
          {
            englishName: 'YAMADA TARO',
            dateOfBirth: '1990-02-31',
            passportNumber: 'TR1234567',
          },
        ],
      }),
    )
    expect(extracted.travelers?.[0].englishName).toBe('YAMADA TARO')
    expect(extracted.travelers?.[0].passportNumber).toBe('TR1234567')
    expect(extracted.travelers?.[0].dateOfBirth).toBeNull()
    expect(
      issues.some(
        (issue) => issue.index === 0 && issue.message.includes('dateOfBirth'),
      ),
    ).toBe(true)
  })

  it('制御文字を取り除き、取り除いたことを issue に残す', () => {
    // PDF の予約票からコピーした値に紛れ込む垂直タブ。残すと書き出した
    // xlsx が ill-formed になり、Excel でも TWAC でも開けなくなる
    const { extracted, issues } = parseArrivalJson(
      JSON.stringify({
        hotelName: 'Grand\u000B Hyatt Taipei\u000C',
        travelers: [{ englishName: 'YAMADA\u0000 TARO' }],
      }),
    )
    expect(extracted.hotelName).toBe('Grand Hyatt Taipei')
    expect(extracted.travelers?.[0].englishName).toBe('YAMADA TARO')
    expect(
      issues.filter((issue) => issue.message.includes('制御文字')),
    ).toHaveLength(2)
  })

  it('sex は M / F のような略記も受ける', () => {
    const { extracted } = parseArrivalJson(
      JSON.stringify({ travelers: [{ englishName: 'A B', sex: 'f' }] }),
    )
    expect(extracted.travelers?.[0].sex).toBe('Female')
  })

  it('配列で 1 件だけ返ってきたら中身を使い、issue に残す', () => {
    const { extracted, issues } = parseArrivalJson(JSON.stringify([FULL_JSON]))
    expect(extracted.dateOfEntry).toBe('2026-03-15')
    expect(issues.some((issue) => issue.message.includes('配列'))).toBe(true)
  })
})

describe('resolveFlightCode', () => {
  it("'BR' をリスト値に解決する", () => {
    expect(resolveFlightCode('BR')).toBe('BR : EVA Air')
  })

  it('小文字や前後の空白も受ける', () => {
    expect(resolveFlightCode(' br ')).toBe('BR : EVA Air')
  })

  it('リストに無いコードは null', () => {
    expect(resolveFlightCode('ZZ')).toBeNull()
  })
})

describe('planArrivalImport', () => {
  it('抽出できた旅程の欄だけを埋める', () => {
    const { extracted } = parseArrivalJson(JSON.stringify(FULL_JSON))
    const plan = planArrivalImport(state(), extracted)
    expect(plan.next.trip.dateOfEntry).toBe('2026-03-15')
    expect(plan.next.trip.entryFlightCode).toBe('BR : EVA Air')
    expect(plan.next.trip.entryFlightNumber).toBe('190')
    expect(plan.next.trip.exitFlightCode).toBe('JX : STARLUX Airlines')
    // 既定の滞在先は Hotel Name なので、住所ではなくホテル名が入る
    expect(plan.next.trip.addressOrHotel).toBe('Grand Hyatt Taipei')
    expect(plan.tripChanges.length).toBeGreaterThan(0)
  })

  it('未知の航空会社コードは issue にして未設定のまま残す', () => {
    const { extracted } = parseArrivalJson(
      JSON.stringify({ entryAirlineCode: 'ZZ', entryFlightNumber: '1' }),
    )
    const plan = planArrivalImport(state(), extracted)
    expect(plan.next.trip.entryFlightCode).toBe('')
    expect(plan.next.trip.entryFlightNumber).toBe('1')
    expect(plan.issues.some((issue) => issue.message.includes("'ZZ'"))).toBe(
      true,
    )
  })

  it('滞在先が住所のときは住所を入れる', () => {
    const { extracted } = parseArrivalJson(JSON.stringify(FULL_JSON))
    const base = state()
    base.trip.accommodation = 'Residential Address'
    const plan = planArrivalImport(base, extracted)
    expect(plan.next.trip.addressOrHotel).toBe(
      'No. 2, Songshou Rd., Xinyi Dist., Taipei City',
    )
    // 入りきらなかったほうは捨てたことを伝える
    expect(
      plan.issues.some((issue) => issue.message.includes('Grand Hyatt Taipei')),
    ).toBe(true)
  })

  it('乗り継ぎのみ(Transfer)なら滞在先を触らない', () => {
    const { extracted } = parseArrivalJson(JSON.stringify(FULL_JSON))
    const base = state()
    base.trip.accommodation = 'Transfer'
    const plan = planArrivalImport(base, extracted)
    expect(plan.next.trip.addressOrHotel).toBe('')
  })

  it('氏名が一致する既存の旅行者には、空欄だけを補完する', () => {
    const existing = {
      ...createEmptyTraveler(),
      englishName: 'yamada  taro',
      passportNumber: 'ALREADY-ENTERED',
    }
    const { extracted } = parseArrivalJson(JSON.stringify(FULL_JSON))
    const plan = planArrivalImport(state({ travelers: [existing] }), extracted)
    expect(plan.next.travelers).toHaveLength(1)
    // 既存の入力は上書きしない
    expect(plan.next.travelers[0].passportNumber).toBe('ALREADY-ENTERED')
    // 空欄だったものは埋まる
    expect(plan.next.travelers[0].dateOfBirth).toBe('1990-05-04')
    expect(plan.next.travelers[0].sex).toBe('Male')
    expect(plan.travelerChanges[0].isNew).toBe(false)
  })

  it('氏名が一致しなければ新しい旅行者として追加する', () => {
    const { extracted } = parseArrivalJson(JSON.stringify(FULL_JSON))
    const existing = { ...createEmptyTraveler(), englishName: 'SUZUKI ICHIRO' }
    const plan = planArrivalImport(state({ travelers: [existing] }), extracted)
    expect(plan.next.travelers).toHaveLength(2)
    expect(plan.next.travelers[1].englishName).toBe('YAMADA TARO')
    expect(plan.travelerChanges[0].isNew).toBe(true)
  })

  /*
    初期表示の 1 行(空のまま)がある状態で取り込むと、以前は名前が一致せず
    append され、[空行, YAMADA TARO] になっていた。空行にも国籍などの既定値は
    入っているので、Excel の 2 行目に「氏名もパスポート番号も無いのに
    国籍だけ入った行」が書き出され、TWAC 側で弾かれる。
  */
  it('初期状態の空行があれば、増やさずにそこへ埋める', () => {
    const { extracted } = parseArrivalJson(JSON.stringify(FULL_JSON))
    const plan = planArrivalImport(state(), extracted)

    expect(plan.next.travelers).toHaveLength(1)
    expect(plan.next.travelers[0].englishName).toBe('YAMADA TARO')
    expect(plan.next.travelers[0].passportNumber).toBe('TR1234567')
    // 空行を埋めた場合も、利用者から見れば新しい人が現れる
    expect(plan.travelerChanges).toHaveLength(1)
    expect(plan.travelerChanges[0].isNew).toBe(true)
  })

  it('空行が複数あれば上から順に埋める', () => {
    const { extracted } = parseArrivalJson(
      JSON.stringify({
        travelers: [
          { englishName: 'YAMADA TARO' },
          { englishName: 'YAMADA HANAKO' },
        ],
      }),
    )
    const plan = planArrivalImport(
      state({ travelers: [createEmptyTraveler(), createEmptyTraveler()] }),
      extracted,
    )
    expect(plan.next.travelers).toHaveLength(2)
    expect(plan.next.travelers.map((t) => t.englishName)).toEqual([
      'YAMADA TARO',
      'YAMADA HANAKO',
    ])
  })

  it('空行を埋めたぶんは 16 名の枠を余計に使わない', () => {
    // 空行 1 つ + 実名 15 人 = 16 行。ここに 1 人取り込んでも空行が埋まるだけ
    const travelers = [
      createEmptyTraveler(),
      ...Array.from({ length: 15 }, (_, index) => ({
        ...createEmptyTraveler(),
        englishName: `PERSON ${index}`,
      })),
    ]
    const { extracted } = parseArrivalJson(JSON.stringify(FULL_JSON))
    const plan = planArrivalImport(state({ travelers }), extracted)
    expect(plan.next.travelers).toHaveLength(16)
    expect(plan.next.travelers[0].englishName).toBe('YAMADA TARO')
    expect(plan.issues.some((issue) => issue.message.includes('16 名'))).toBe(
      false,
    )
  })

  it('入力済みの人しかいなければ、空行を探さずに追加する', () => {
    const { extracted } = parseArrivalJson(JSON.stringify(FULL_JSON))
    const existing = { ...createEmptyTraveler(), englishName: 'SUZUKI ICHIRO' }
    const plan = planArrivalImport(state({ travelers: [existing] }), extracted)
    expect(plan.next.travelers.map((t) => t.englishName)).toEqual([
      'SUZUKI ICHIRO',
      'YAMADA TARO',
    ])
  })

  it('16 名を超える追加は issue にして止める', () => {
    const travelers = Array.from({ length: 16 }, (_, index) => ({
      ...createEmptyTraveler(),
      englishName: `PERSON ${index}`,
    }))
    const { extracted } = parseArrivalJson(JSON.stringify(FULL_JSON))
    const plan = planArrivalImport(state({ travelers }), extracted)
    expect(plan.next.travelers).toHaveLength(16)
    expect(plan.issues.some((issue) => issue.message.includes('16 名'))).toBe(
      true,
    )
  })

  it('抽出結果が空なら何も変わらない', () => {
    const { extracted } = parseArrivalJson('{}')
    const base = state()
    const plan = planArrivalImport(base, extracted)
    expect(plan.tripChanges).toEqual([])
    expect(plan.travelerChanges).toEqual([])
    expect(plan.next.trip).toEqual(base.trip)
  })
})
