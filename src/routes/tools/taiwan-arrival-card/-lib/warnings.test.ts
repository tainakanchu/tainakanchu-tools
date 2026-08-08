import { describe, expect, it } from 'vitest'
import { createEmptyTraveler, createEmptyTrip } from './storage'
import { collectWarnings } from './warnings'
import type { ArrivalCardState, Traveler, TripInfo } from './types'

/** 警告が 1 つも出ない、すべて埋まった状態 */
function completeTrip(): TripInfo {
  return {
    ...createEmptyTrip(),
    dateOfEntry: '2026-03-15',
    entryMode: 'AIR',
    entryFlightCode: 'BR : EVA Air',
    entryFlightNumber: '190',
    exitDate: '2026-03-20',
    exitMode: 'AIR',
    exitFlightCode: 'JX : STARLUX Airlines',
    exitFlightNumber: '801',
    accommodation: 'Hotel Name',
    addressOrHotel: 'Grand Hyatt Taipei',
  }
}

function completeTraveler(overrides: Partial<Traveler> = {}): Traveler {
  return {
    ...createEmptyTraveler(),
    englishName: 'YAMADA TARO',
    passportNumber: 'TR1234567',
    passportExpiry: '2030-01-31',
    sex: 'Male',
    dateOfBirth: '1990-05-04',
    cityOfBirth: 'TOKYO',
    mobileNumber: '9012345678',
    occupation: '職員/CLERK/EMPLOYEE/STAFF',
    email: 'taro@example.com',
    ...overrides,
  }
}

function warn(
  trip: Partial<TripInfo> = {},
  traveler: Partial<Traveler> = {},
): Array<string> {
  const state: ArrivalCardState = {
    trip: { ...completeTrip(), ...trip },
    travelers: [completeTraveler(traveler)],
    pastTrips: [],
  }
  return collectWarnings(state).map((warning) => warning.message)
}

describe('collectWarnings', () => {
  it('すべて埋まっていれば警告は出ない', () => {
    expect(warn()).toEqual([])
  })

  it('旅程の警告には travelerIndex が付かない', () => {
    const warnings = collectWarnings({
      trip: { ...completeTrip(), dateOfEntry: '' },
      travelers: [completeTraveler()],
      pastTrips: [],
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0].travelerIndex).toBeNull()
  })

  it('旅行者の警告には何人目かが付く', () => {
    const warnings = collectWarnings({
      trip: completeTrip(),
      travelers: [completeTraveler(), completeTraveler({ englishName: '' })],
      pastTrips: [],
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0].travelerIndex).toBe(1)
  })
})

/*
  空白だけの入力は、人間の目には空欄なのに length > 0 は真になる。
  素通りさせると空白 1 文字が氏名やパスポート番号として書き出される。
*/
describe('空白だけの入力は未入力として扱う', () => {
  it('氏名が空白だけなら未入力', () => {
    expect(warn({}, { englishName: '   ' })).toContain('氏名が未入力です')
  })

  it('パスポート番号が全角スペースだけなら未入力', () => {
    expect(warn({}, { passportNumber: '　' })).toContain(
      'パスポート番号が未入力です',
    )
  })

  it('ホテル名が空白だけなら未入力', () => {
    expect(warn({ addressOrHotel: '  ' })).toContain('ホテル名が未入力です')
  })

  it('便番号が空白だけなら未入力', () => {
    expect(warn({ entryFlightNumber: ' ' })).toContain(
      '入国便の便番号が未入力です',
    )
  })
})

/*
  実在しない日付は date input が空欄として描くので、この層で言わないと
  誰も気付かないまま「日付が空の Excel」ができあがる。
*/
describe('実在しない日付', () => {
  it('入国日が実在しなければ、未入力とは違うメッセージで知らせる', () => {
    const messages = warn({ dateOfEntry: '2026-02-30' })
    expect(messages).toContain(
      "入国日 '2026-02-30' は実在しない日付です。入力し直してください",
    )
    expect(messages).not.toContain('入国日が未入力です')
  })

  it('生年月日・パスポート有効期限も同じように見る', () => {
    const messages = warn(
      {},
      { dateOfBirth: '1990-02-31', passportExpiry: '2030-13-01' },
    )
    expect(messages.some((m) => m.includes("生年月日 '1990-02-31'"))).toBe(true)
    expect(
      messages.some((m) => m.includes("パスポート有効期限 '2030-13-01'")),
    ).toBe(true)
  })

  it('日付が壊れているときは前後関係の警告を重ねない', () => {
    // 「実在しない」と「前後が逆」を両方出しても、直す手順は 1 つしかない
    const messages = warn({ dateOfEntry: '2026-02-30' })
    expect(messages).not.toContain('出国予定日が入国日より前になっています')
  })

  it('両方が実在する日付なら前後関係を見る', () => {
    expect(
      warn({ dateOfEntry: '2026-03-20', exitDate: '2026-03-15' }),
    ).toContain('出国予定日が入国日より前になっています')
  })
})

/*
  番号を持つビザ区分を選んだのに番号が空、という組み合わせは向こうで必ず
  弾かれる。番号を持たない区分では入力欄そのものを出していない。
*/
describe('ビザ番号の条件付き必須', () => {
  it('免簽證なら番号が空でも警告しない', () => {
    expect(
      warn({}, { visaType: '免簽證 Visa-Exempt(include TAC)', visaNumber: '' }),
    ).toEqual([])
  })

  it('持有簽證で番号が空なら警告する', () => {
    expect(
      warn({}, { visaType: '持有簽證(Holding a Visa)', visaNumber: '' }),
    ).toContain(
      'ビザの区分が「持有簽證(Holding a Visa)」のため、ビザ番号の入力が必要です',
    )
  })

  it('落地簽證で番号が空なら警告する', () => {
    const messages = warn(
      {},
      {
        visaType: '落地簽證Landing Visa/臨時入國Temporary Entry',
        visaNumber: '',
      },
    )
    expect(messages.some((m) => m.includes('ビザ番号の入力が必要です'))).toBe(
      true,
    )
  })

  it('番号が空白だけでも警告する', () => {
    const messages = warn(
      {},
      { visaType: '持有簽證(Holding a Visa)', visaNumber: '  ' },
    )
    expect(messages.some((m) => m.includes('ビザ番号の入力が必要です'))).toBe(
      true,
    )
  })

  it('番号が入っていれば警告しない', () => {
    expect(
      warn({}, { visaType: '持有簽證(Holding a Visa)', visaNumber: 'V123456' }),
    ).toEqual([])
  })

  it('台湾国籍の「具入國許可」も番号が要る', () => {
    const messages = warn(
      {},
      {
        nationality: 'ROC,REPUBLIC OF CHINA(TAIWAN)',
        visaType: '具入國許可 Permit',
        visaNumber: '',
      },
    )
    expect(messages.some((m) => m.includes('ビザ番号の入力が必要です'))).toBe(
      true,
    )
  })
})

describe('目的・滞在先にぶら下がる欄', () => {
  it('探親なら親族の氏名と電話が要る', () => {
    const messages = warn({ purpose: '5.探親 Visit Relative' })
    expect(messages).toContain('渡航目的が探親のため、親族の氏名が必要です')
    expect(messages).toContain('渡航目的が探親のため、親族の電話番号が必要です')
  })

  it('其他なら理由が要る', () => {
    expect(warn({ purpose: '10.其他 Others' })).toContain(
      '渡航目的が其他のため、理由の入力が必要です',
    )
  })

  it('Transfer なら滞在先が空でも警告しない', () => {
    expect(warn({ accommodation: 'Transfer', addressOrHotel: '' })).toEqual([])
  })

  it('職業が其他なら役職が要る', () => {
    expect(warn({}, { occupation: '其他/OTHER', jobTitle: '' })).toContain(
      '職業が「其他/OTHER」のため、役職・肩書きの入力が必要です',
    )
  })
})

describe('公式の選択肢に無い値', () => {
  it('国籍がリストに無ければ警告する', () => {
    expect(warn({}, { nationality: 'ZZZ,NOWHERE' })).toContain(
      "国籍 'ZZZ,NOWHERE' は公式の選択肢にありません",
    )
  })

  it('航空会社がリストに無ければ警告する', () => {
    expect(warn({ entryFlightCode: 'ZZ : Unknown Air' })).toContain(
      "入国便の航空会社 'ZZ : Unknown Air' は公式の選択肢にありません",
    )
  })

  it('SEA のときは航空会社を見ない', () => {
    expect(
      warn({
        entryMode: 'SEA',
        entryVesselNumber: 'OCEAN-1',
        exitMode: 'SEA',
        exitVesselNumber: 'OCEAN-2',
      }),
    ).toEqual([])
  })
})
