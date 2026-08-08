import { unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createEmptyTraveler, createEmptyTrip } from './storage'
import { SHEET1_PATH, readTemplateBytes, sheetCells } from './templateFixture'
import { escapeXml, fillTemplate, stripXmlIllegalChars } from './xlsx'
import type { Traveler, TripInfo } from './types'

function template(): Uint8Array {
  return readTemplateBytes()
}

/** テンプレートを展開して、指定パスの中身を文字列で返す */
function entryText(bytes: Uint8Array, filePath: string): string {
  const entry = unzipSync(bytes)[filePath]
  expect(entry).toBeDefined()
  return new TextDecoder('utf-8').decode(entry)
}

function trip(): TripInfo {
  return {
    ...createEmptyTrip(),
    dateOfEntry: '2026-03-15',
    entryMode: 'AIR',
    entryFlightCode: 'BR : EVA Air',
    entryFlightNumber: '190',
    entryVesselNumber: 'SHOULD-NOT-APPEAR',
    exitDate: '2026-03-20',
    exitMode: 'AIR',
    exitFlightCode: 'JX : STARLUX Airlines',
    exitFlightNumber: '801',
    accommodation: 'Hotel Name',
    addressOrHotel: 'Grand Hyatt Taipei',
  }
}

function traveler(overrides: Partial<Traveler> = {}): Traveler {
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

describe('escapeXml', () => {
  it('XML で意味を持つ 5 文字を実体参照にする', () => {
    expect(escapeXml(`A & B <c> "d" 'e'`)).toBe(
      'A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;',
    )
  })

  it('XML が持てない制御文字を取り除く', () => {
    // PDF からコピーした住所に紛れ込む垂直タブ・改ページ・NUL など。
    // 実体参照にしても不正なので、残すと xlsx がまるごと開けなくなる
    expect(escapeXml('A\u0000B\u000BC\u000CD\u001FE')).toBe('ABCDE')
  })

  it('タブ・改行・復帰は残す(XML が許している 3 文字)', () => {
    expect(escapeXml('A\tB\nC\rD')).toBe('A\tB\nC\rD')
  })
})

describe('stripXmlIllegalChars', () => {
  it('C0 制御文字だけを落とし、通常の文字には触らない', () => {
    expect(stripXmlIllegalChars('台北 101\u000B')).toBe('台北 101')
    expect(stripXmlIllegalChars('YAMADA TARO')).toBe('YAMADA TARO')
  })
})

describe('fillTemplate', () => {
  it('指定したセルにインライン文字列として値が入る', () => {
    const out = fillTemplate(template(), trip(), [
      traveler(),
      traveler({ englishName: 'YAMADA HANAKO', sex: 'Female' }),
    ])
    const sheet = entryText(out, 'xl/worksheets/sheet1.xml')

    // 1 人目 = 2 行目
    expect(sheet).toContain(
      '<c r="C2" s="7" t="inlineStr"><is><t xml:space="preserve">YAMADA TARO</t></is></c>',
    )
    expect(sheet).toContain(
      '<c r="B2" s="11" t="inlineStr"><is><t xml:space="preserve">15/03/2026</t></is></c>',
    )
    expect(sheet).toContain(
      '<c r="E2" s="7" t="inlineStr"><is><t xml:space="preserve">TR1234567</t></is></c>',
    )
    // 2 人目 = 3 行目。旅程は全員に配られる
    expect(sheet).toContain(
      '<c r="C3" s="7" t="inlineStr"><is><t xml:space="preserve">YAMADA HANAKO</t></is></c>',
    )
    expect(sheet).toContain(
      '<c r="B3" s="11" t="inlineStr"><is><t xml:space="preserve">15/03/2026</t></is></c>',
    )
    expect(sheet).toContain(
      '<c r="AH3" s="7" t="inlineStr"><is><t xml:space="preserve">Grand Hyatt Taipei</t></is></c>',
    )
  })

  it('スタイル属性(s)を保持する', () => {
    const out = fillTemplate(template(), trip(), [traveler()])
    const sheet = entryText(out, 'xl/worksheets/sheet1.xml')
    // N 列だけ s="10"、B 列は s="11"、その他は s="7"(テンプレート由来)
    expect(sheet).toContain('<c r="B2" s="11" t="inlineStr">')
    expect(sheet).toContain('<c r="G2" s="7" t="inlineStr">')
  })

  it('A 列(Traveler No)は共有文字列のまま触らない', () => {
    const out = fillTemplate(template(), trip(), [traveler()])
    const sheet = entryText(out, 'xl/worksheets/sheet1.xml')
    expect(sheet).toContain('<c r="A2" s="5" t="s"><v>34</v></c>')
  })

  it('空欄のセルは置換せず、空セルのまま残る', () => {
    const out = fillTemplate(template(), trip(), [
      traveler({ chineseName: '', jobTitle: '' }),
    ])
    const sheet = entryText(out, 'xl/worksheets/sheet1.xml')
    // D = Chinese Name, R = JobTitle
    expect(sheet).toContain('<c r="D2" s="7"/>')
    expect(sheet).toContain('<c r="R2" s="7"/>')
  })

  it('旅行者のいない行(3 行目以降)はまったく手を付けない', () => {
    const out = fillTemplate(template(), trip(), [traveler()])
    const sheet = entryText(out, 'xl/worksheets/sheet1.xml')
    expect(sheet).toContain('<c r="C3" s="7"/>')
    expect(sheet).toContain('<c r="B17" s="11"/>')
  })

  it('AIR のときは船便番号を書かず、SEA のときは航空会社と便番号を書かない', () => {
    const air = entryText(
      fillTemplate(template(), trip(), [traveler()]),
      'xl/worksheets/sheet1.xml',
    )
    // W = Expect Entry Vessel Number
    expect(air).toContain('<c r="W2" s="7"/>')
    expect(air).toContain(
      '<c r="U2" s="7" t="inlineStr"><is><t xml:space="preserve">BR : EVA Air</t></is></c>',
    )

    const sea = entryText(
      fillTemplate(
        template(),
        {
          ...trip(),
          entryMode: 'SEA',
          entryVesselNumber: 'OCEAN-1',
          exitMode: 'SEA',
          exitVesselNumber: 'OCEAN-2',
        },
        [traveler()],
      ),
      'xl/worksheets/sheet1.xml',
    )
    expect(sea).toContain('<c r="U2" s="7"/>')
    expect(sea).toContain('<c r="V2" s="7"/>')
    expect(sea).toContain(
      '<c r="W2" s="7" t="inlineStr"><is><t xml:space="preserve">OCEAN-1</t></is></c>',
    )
    // AB = Intended Exit Vessel Number
    expect(sea).toContain(
      '<c r="AB2" s="7" t="inlineStr"><is><t xml:space="preserve">OCEAN-2</t></is></c>',
    )
    expect(sea).toContain('<c r="Z2" s="7"/>')
  })

  it('値は XML エスケープされる', () => {
    const out = fillTemplate(template(), trip(), [
      traveler({ jobTitle: 'R&D <lead>' }),
    ])
    const sheet = entryText(out, 'xl/worksheets/sheet1.xml')
    expect(sheet).toContain(
      '<c r="R2" s="7" t="inlineStr"><is><t xml:space="preserve">R&amp;D &lt;lead&gt;</t></is></c>',
    )
  })

  it('制御文字が混ざっていても、開ける xlsx になる', () => {
    // PDF からコピーした住所に垂直タブが紛れ込んだ状況。値からは消え、
    // 出来上がった sheet1.xml にも制御文字は 1 つも残らない
    const out = fillTemplate(
      template(),
      { ...trip(), addressOrHotel: 'No.\u000B 2, Songshou Rd.\u0000' },
      [traveler({ englishName: 'YAMADA TARO' })],
    )
    const sheet = entryText(out, 'xl/worksheets/sheet1.xml')
    expect(sheet).toContain(
      '<c r="AH2" s="7" t="inlineStr"><is><t xml:space="preserve">No. 2, Songshou Rd.</t></is></c>',
    )
    expect(sheet).toContain(
      '<c r="C2" s="7" t="inlineStr"><is><t xml:space="preserve">YAMADA TARO</t></is></c>',
    )
    // oxlint-disable-next-line no-control-regex -- XML が禁じている制御文字が残っていないことの確認そのもの
    const illegal = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/
    expect(illegal.test(sheet)).toBe(false)
  })

  describe('渡航目的と滞在先にぶら下がる欄の排他', () => {
    it('目的が探親でなければ親族の欄(AD/AE)を書かない', () => {
      // 探親を選んで親族名を入れたあと観光に戻す、という操作の再現。
      // 画面から欄は消えるが値は state に残っているので、ここで落とす
      const sheet = entryText(
        fillTemplate(
          template(),
          {
            ...trip(),
            purpose: '3.觀光 Sightseeing / Travel / Leisure',
            relativesName: 'STALE NAME',
            relativesMobile: '0900000000',
          },
          [traveler()],
        ),
        'xl/worksheets/sheet1.xml',
      )
      expect(sheet).toContain('<c r="AD2" s="7"/>')
      expect(sheet).toContain('<c r="AE2" s="7"/>')
      expect(sheet).not.toContain('STALE NAME')
    })

    it('目的が探親なら親族の欄を書く', () => {
      const sheet = entryText(
        fillTemplate(
          template(),
          {
            ...trip(),
            purpose: '5.探親 Visit Relative',
            relativesName: 'WANG',
            relativesMobile: '0912345678',
          },
          [traveler()],
        ),
        'xl/worksheets/sheet1.xml',
      )
      expect(sheet).toContain(
        '<c r="AD2" s="7" t="inlineStr"><is><t xml:space="preserve">WANG</t></is></c>',
      )
      expect(sheet).toContain(
        '<c r="AE2" s="7" t="inlineStr"><is><t xml:space="preserve">0912345678</t></is></c>',
      )
    })

    it('目的が其他でなければ理由(AF)を書かない', () => {
      const sheet = entryText(
        fillTemplate(
          template(),
          {
            ...trip(),
            purpose: '3.觀光 Sightseeing / Travel / Leisure',
            reason: 'STALE REASON',
          },
          [traveler()],
        ),
        'xl/worksheets/sheet1.xml',
      )
      expect(sheet).toContain('<c r="AF2" s="9"/>')
      expect(sheet).not.toContain('STALE REASON')
    })

    it('目的が其他なら理由を書く', () => {
      const sheet = entryText(
        fillTemplate(
          template(),
          { ...trip(), purpose: '10.其他 Others', reason: '取材のため' },
          [traveler()],
        ),
        'xl/worksheets/sheet1.xml',
      )
      expect(sheet).toContain(
        '<c r="AF2" s="9" t="inlineStr"><is><t xml:space="preserve">取材のため</t></is></c>',
      )
    })

    it('滞在先が Transfer なら住所・ホテル名(AH)を書かない', () => {
      const sheet = entryText(
        fillTemplate(
          template(),
          {
            ...trip(),
            accommodation: 'Transfer',
            addressOrHotel: 'STALE HOTEL',
          },
          [traveler()],
        ),
        'xl/worksheets/sheet1.xml',
      )
      expect(sheet).toContain('<c r="AH2" s="7"/>')
      expect(sheet).not.toContain('STALE HOTEL')
      // 種別そのもの(AG)は書く
      expect(sheet).toContain(
        '<c r="AG2" s="9" t="inlineStr"><is><t xml:space="preserve">Transfer</t></is></c>',
      )
    })
  })

  it('1 行目のヘッダーが期待する 34 列のままである', () => {
    /*
      テンプレートが差し替わって列の意味がずれたら、値は正しく書き込まれた
      ように見えて中身が入れ替わる(パスポート番号の欄に生年月日が入る等)。
      共有文字列を解決して、A〜AH のラベルを 1 つずつ確かめる。
      buildRowValues の列マッピングは、この 34 個の見出しが根拠になっている。
    */
    const expected = [
      ['A', 'Traveler No'],
      ['B', 'Date of Entry(DD/MM/YYYY)'],
      ['C', 'English Name'],
      ['D', 'Chinese Name'],
      ['E', 'PassportNumber'],
      ['F', 'Date of Passport Expiry(DD/MM/YYYY)'],
      ['G', 'Sex'],
      ['H', 'Date of Birth(DD/MM/YYYY)'],
      ['I', 'Nationality'],
      ['J', 'Country/ Place of Birth'],
      ['K', 'City/ State or Province'],
      ['L', 'Place of Residence'],
      ['M', 'Visa Type'],
      ['N', 'Visa Number'],
      ['O', 'Country/ Region Code'],
      ['P', 'Mobile Number'],
      ['Q', 'Occupation'],
      ['R', 'JobTitle'],
      ['S', 'Email Address'],
      ['T', 'Expect Entry Mode of Travel'],
      ['U', 'Expect Entry Flight Code'],
      ['V', 'Expect Entry Flight Number'],
      ['W', 'Expect Entry Vessel Number'],
      ['X', 'Intended Exit Date(DD/MM/YYYY)'],
      ['Y', 'Intended Exit Mode of Travel'],
      ['Z', 'Intended Exit Flight Code'],
      ['AA', 'Intended Exit Flight Number'],
      ['AB', 'Intended Exit Vessel Number'],
      ['AC', 'Purpose of Visit'],
      ['AD', 'Relatives Name'],
      ['AE', 'Relatives Mobile No.'],
      ['AF', 'Reason'],
      ['AG', 'Accommodation in Taiwan'],
      ['AH', 'Residential Address or Hotel Name in Taiwan'],
    ]
    const cells = sheetCells(unzipSync(template()), SHEET1_PATH)
    for (const [column, label] of expected) {
      expect(cells.get(`${column}1`), `${column}1 の見出し`).toBe(label)
    }
    // AI 列より右に見出しが増えていないこと(増えていたら列構成が変わっている)
    expect(cells.get('AI1')).toBeUndefined()
  })

  it('A 列の Traveler No は 16 行ぶん揃っている', () => {
    const cells = sheetCells(unzipSync(template()), SHEET1_PATH)
    for (let index = 0; index < 16; index += 1) {
      expect(cells.get(`A${index + 2}`)).toBe(`Traveler${index + 1}`)
    }
    // 17 名目の行は無い(MAX_TRAVELERS の根拠)
    expect(cells.get('A18')).toBeUndefined()
  })

  it('sheet2.xml / styles.xml / sharedStrings.xml はバイト単位で無変更', () => {
    const before = unzipSync(template())
    const after = unzipSync(fillTemplate(template(), trip(), [traveler()]))

    for (const filePath of [
      'xl/worksheets/sheet2.xml',
      'xl/styles.xml',
      'xl/sharedStrings.xml',
      'xl/workbook.xml',
      '[Content_Types].xml',
      'xl/printerSettings/printerSettings1.bin',
    ]) {
      expect(after[filePath]).toEqual(before[filePath])
    }
  })

  it('書き出した xlsx にも作成者名が残らない', () => {
    // テンプレート側で除去済みなので自動的にそうなるはずだが、
    // 「利用者の手元に渡るファイル」で確かめておく。ここが唯一の出口なので、
    // 将来テンプレートを差し替えたときの取りこぼしもここで止まる
    const out = unzipSync(fillTemplate(template(), trip(), [traveler()]))
    for (const [filePath, bytes] of Object.entries(out)) {
      const text = new TextDecoder('utf-8').decode(bytes)
      expect(text, `${filePath} に作成者名が残っている`).not.toContain('顏佑霖')
    }
    const core = new TextDecoder('utf-8').decode(out['docProps/core.xml'])
    expect(core).toContain('<dc:creator></dc:creator>')
    expect(core).toContain('<cp:lastModifiedBy></cp:lastModifiedBy>')
  })

  it('zip のエントリ構成は変わらない', () => {
    const before = Object.keys(unzipSync(template())).toSorted()
    const after = Object.keys(
      unzipSync(fillTemplate(template(), trip(), [traveler()])),
    ).toSorted()
    expect(after).toEqual(before)
  })

  it('dataValidation とシート保護は sheet1 に残る', () => {
    const sheet = entryText(
      fillTemplate(template(), trip(), [traveler()]),
      'xl/worksheets/sheet1.xml',
    )
    expect(sheet).toContain('<dataValidations count="1">')
    // 国籍によって Visa Type の選択肢を切り替える INDIRECT 式
    expect(sheet).toContain('INDIRECT(')
    expect(sheet).toContain('TaiwanVisa')
    // 拡張側(x14)のリスト検証。職業・目的・航空会社などがここにある
    expect(sheet).toContain('<x14:dataValidations count="9"')
    expect(sheet).toContain('<sheetProtection')
    expect(sheet).toContain('<conditionalFormatting sqref="N2:N17">')
  })

  it('引数のテンプレートのバイト列を壊さない', () => {
    const bytes = template()
    const copy = new Uint8Array(bytes)
    fillTemplate(bytes, trip(), [traveler()])
    expect(bytes).toEqual(copy)
  })

  it('16 名を超えると throw する', () => {
    const travelers = Array.from({ length: 17 }, () => traveler())
    expect(() => fillTemplate(template(), trip(), travelers)).toThrow(
      /最大 16 名/,
    )
  })

  it('テンプレートに sheet1.xml が無ければ throw する', () => {
    // 差し替わったテンプレートを渡されたときに、黙って値の入っていない
    // xlsx を返すのがいちばん危ない(気付くのは入国審査の窓口になる)
    const entries = unzipSync(template())
    const withoutSheet1: Record<string, Uint8Array> = {}
    for (const [filePath, bytes] of Object.entries(entries)) {
      if (filePath !== 'xl/worksheets/sheet1.xml') {
        withoutSheet1[filePath] = bytes
      }
    }
    expect(() =>
      fillTemplate(zipSync(withoutSheet1), trip(), [traveler()]),
    ).toThrow(/sheet1\.xml/)
  })

  it('対象のセルが見つからなければ throw する', () => {
    // C2 のセルだけを消した sheet1 を作る。列がずれたテンプレートを渡された
    // ときに、その人の氏名だけが静かに落ちることがあってはならない
    const entries = unzipSync(template())
    const sheet = new TextDecoder('utf-8').decode(
      entries['xl/worksheets/sheet1.xml'],
    )
    entries['xl/worksheets/sheet1.xml'] = new TextEncoder().encode(
      sheet.replace('<c r="C2" s="7"/>', ''),
    )
    expect(() => fillTemplate(zipSync(entries), trip(), [traveler()])).toThrow(
      /C2/,
    )
  })

  it('書き出した xlsx をもう一度読み込んでも、同じ結果になる(冪等)', () => {
    const once = fillTemplate(template(), trip(), [traveler()])
    const twice = fillTemplate(template(), trip(), [traveler()])
    expect(entryText(twice, 'xl/worksheets/sheet1.xml')).toBe(
      entryText(once, 'xl/worksheets/sheet1.xml'),
    )
  })
})
