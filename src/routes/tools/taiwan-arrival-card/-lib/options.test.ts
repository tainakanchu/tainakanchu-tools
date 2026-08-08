/**
 * options.ts が、公式テンプレートの工作表2 の写しとして正しいかを検証する。
 *
 * ■ なぜこのテストが要るのか
 *   options.ts は 700 行を超える手作業の写しで、国籍だけで 258 件ある。
 *   1 件抜けても TypeScript は何も言わないし、画面も動く。抜けた選択肢を
 *   使う人だけが、TWAC のアップロードで弾かれてはじめて気付く
 *   (実際、最初の実装では occupation・nationality・regionCode の 5 件が
 *   写し漏れていた)。目視で見つけられる規模ではないので、テンプレートを
 *   読み直して突き合わせる。
 *
 * ■ なぜ順序まで見るのか
 *   並びが公式と同じであれば、利用者は公式サイトの画面と見比べながら選べる。
 *   それに、順序を無視した集合比較では「2 件抜けて 2 件増えた」を検出できても
 *   「並びが崩れた」は通ってしまい、写し直したときの事故を拾い損ねる。
 *
 * ■ 範囲の根拠
 *   下の RANGES は sheet1.xml のデータ入力規則(dataValidation)と
 *   workbook.xml の定義名が指している範囲そのもの。ここを勝手に広げてはいけない
 *   (広げれば「テンプレートには載っているが公式が選択肢として使っていない値」が
 *   混ざる)。テンプレートが更新されて範囲が変わったときは、まず
 *   sheet1.xml / workbook.xml を読み直してからここを直すこと。
 */

import { describe, expect, it } from 'vitest'
import {
  ACCOMMODATION_OPTIONS,
  CITY_COUNTY_OPTIONS,
  FLIGHT_CODE_OPTIONS,
  MODE_OF_TRAVEL_OPTIONS,
  NATIONALITY_OPTIONS,
  OCCUPATION_OPTIONS,
  PURPOSE_OPTIONS,
  REGION_CODE_OPTIONS,
  SEX_OPTIONS,
  VISA_TYPE_CHINA,
  VISA_TYPE_OTHER,
  VISA_TYPE_TAIWAN,
} from './options'
import {
  SHEET1_PATH,
  SHEET2_PATH,
  columnRange,
  entryText,
  sheetCells,
  templateEntries,
} from './templateFixture'

const entries = templateEntries()
const sheet2 = sheetCells(entries, SHEET2_PATH)

/** [options.ts の配列, 工作表2 の列, 開始行, 終了行, 範囲の出どころ] */
const RANGES: Array<
  [ReadonlyArray<string>, string, number, number, string, string]
> = [
  [
    VISA_TYPE_OTHER,
    'B',
    2,
    4,
    'VISA_TYPE_OTHER',
    'workbook.xml の定義名 OtherVisa',
  ],
  [
    VISA_TYPE_TAIWAN,
    'B',
    5,
    6,
    'VISA_TYPE_TAIWAN',
    'workbook.xml の定義名 TaiwanVisa',
  ],
  [
    VISA_TYPE_CHINA,
    'B',
    7,
    7,
    'VISA_TYPE_CHINA',
    'workbook.xml の定義名 ChinaVisa',
  ],
  [SEX_OPTIONS, 'B', 12, 13, 'SEX_OPTIONS', 'G2:G17 の dataValidation'],
  [
    ACCOMMODATION_OPTIONS,
    'B',
    17,
    19,
    'ACCOMMODATION_OPTIONS',
    'AG2:AG17 の dataValidation',
  ],
  [
    PURPOSE_OPTIONS,
    'E',
    2,
    11,
    'PURPOSE_OPTIONS',
    'AC2:AC17 の dataValidation',
  ],
  [
    OCCUPATION_OPTIONS,
    'H',
    2,
    43,
    'OCCUPATION_OPTIONS',
    'Q2:Q17 の dataValidation',
  ],
  [
    NATIONALITY_OPTIONS,
    'N',
    2,
    259,
    'NATIONALITY_OPTIONS',
    'I2:J17 L2:L17 の dataValidation',
  ],
  [
    REGION_CODE_OPTIONS,
    'R',
    2,
    222,
    'REGION_CODE_OPTIONS',
    'O2:O17 の dataValidation',
  ],
  [
    FLIGHT_CODE_OPTIONS,
    'S',
    2,
    109,
    'FLIGHT_CODE_OPTIONS',
    'U2:U17 Z2:Z17 の dataValidation',
  ],
  [
    MODE_OF_TRAVEL_OPTIONS,
    'T',
    2,
    3,
    'MODE_OF_TRAVEL_OPTIONS',
    'T2:T17 Y2:Y17 の dataValidation',
  ],
  [
    CITY_COUNTY_OPTIONS,
    'K',
    2,
    23,
    'CITY_COUNTY_OPTIONS',
    '工作表2 の City/County 列(sheet1 からは参照されていない)',
  ],
]

describe('options.ts が工作表2 と一致している', () => {
  for (const [actual, column, from, to, name, source] of RANGES) {
    it(`${name}(${source})`, () => {
      const expected = columnRange(sheet2, column, from, to)
      // 件数を先に見る。ズレたときに「何件足りないのか」が最初に読める
      expect(actual.length, `${name} の件数`).toBe(expected.length)
      // 並び込みで完全一致
      expect([...actual]).toEqual(expected)
    })
  }

  it('範囲の外に選択肢の続きが残っていない', () => {
    // 終了行の 1 つ下が空であることを確かめる。テンプレートに選択肢が
    // 足されたのに RANGES を更新し忘れると、上の一致テストは通ってしまう
    const boundaries: Array<[string, number, string]> = [
      ['H', 44, 'OCCUPATION_OPTIONS'],
      ['N', 260, 'NATIONALITY_OPTIONS'],
      ['R', 223, 'REGION_CODE_OPTIONS'],
      ['S', 110, 'FLIGHT_CODE_OPTIONS'],
      ['E', 12, 'PURPOSE_OPTIONS'],
      ['K', 24, 'CITY_COUNTY_OPTIONS'],
    ]
    for (const [column, row, name] of boundaries) {
      expect(
        sheet2.get(`${column}${row}`),
        `${name} の範囲の直後(${column}${row})に値がある。テンプレートに選択肢が増えている`,
      ).toBeUndefined()
    }
  })

  it('dataValidation の参照範囲が RANGES と食い違っていない', () => {
    // 範囲の根拠そのものが変わっていないかを見る。ここが落ちたら
    // RANGES の行番号を直す前に、テンプレート側の意図を読み直すこと
    const sheet1 = entryText(entries, SHEET1_PATH)
    for (const reference of [
      '工作表2!$B$12:$B$13',
      '工作表2!$H$2:$H$43',
      '工作表2!$E$2:$E$11',
      '工作表2!$B$17:$B$19',
      '工作表2!$T$2:$T$3',
      '工作表2!$N$2:$N$259',
      '工作表2!$R$2:$R$222',
      '工作表2!$S$2:$S$109',
    ]) {
      expect(sheet1, `${reference} が sheet1 から参照されていない`).toContain(
        reference,
      )
    }
  })
})

describe('テンプレートの個人情報', () => {
  it('作成者のメタデータが空になっている', () => {
    // 公開リポジトリで第三者の氏名を配布し続けないため、取り込み時に
    // docProps/core.xml の作成者情報だけを除去してある
    // (public/assets/taiwan-arrival-card/README.md 参照)
    const core = entryText(entries, 'docProps/core.xml')
    expect(core).toContain('<dc:creator></dc:creator>')
    expect(core).toContain('<cp:lastModifiedBy></cp:lastModifiedBy>')
  })

  it('どのエントリにも作成者名が残っていない', () => {
    for (const [filePath, bytes] of Object.entries(entries)) {
      const text = new TextDecoder('utf-8').decode(bytes)
      expect(text, `${filePath} に作成者名が残っている`).not.toContain('顏佑霖')
    }
  })

  it('作成日時は原本のまま、更新日時は作成日時に揃えてある', () => {
    // 更新日時を残すと「いつダウンロードしたか」が分かってしまうので、
    // 作成日時に揃えている。作成日時のほうは原本の情報なので触らない
    const core = entryText(entries, 'docProps/core.xml')
    expect(core).toContain('>2024-11-28T07:05:03Z</dcterms:created>')
    expect(core).toContain('>2024-11-28T07:05:03Z</dcterms:modified>')
  })
})
