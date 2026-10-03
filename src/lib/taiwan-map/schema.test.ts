import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateTaiwanData } from './schema.ts'
import type { RawTaiwanData } from './schema.ts'

const area = {
  id: 'dadaocheng',
  city: 'taipei',
  name: '大稻埕',
  summary: '問屋街',
}

function spot(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'some-shop',
    name: 'ある店',
    city: 'taipei',
    area: 'dadaocheng',
    location: { lat: 25.05, lng: 121.51 },
    categories: ['food'],
    status: 'visited',
    summary: 'おいしい',
    visitedAt: '2026-08',
    ...overrides,
  }
}

function data(
  spots: Array<unknown>,
  extra: Partial<RawTaiwanData> = {},
): RawTaiwanData {
  return {
    areas: [area],
    cityFiles: { taipei: spots, tainan: [] },
    ...extra,
  }
}

/** エラーのパスとメッセージをまとめて 1 本の文字列にして部分一致で調べる */
function errorText(input: RawTaiwanData): string {
  return validateTaiwanData(input)
    .errors.map((e) => `${e.path}: ${e.message}`)
    .join('\n')
}

describe('validateTaiwanData', () => {
  it('正しいデータはエラーも警告も無い', () => {
    expect(validateTaiwanData(data([spot()]))).toEqual({
      errors: [],
      warnings: [],
    })
  })

  it('空の都市ファイル（[]）は許す', () => {
    expect(validateTaiwanData(data([])).errors).toEqual([])
  })

  it('必須項目の欠落をパスつきで報告する', () => {
    const { errors } = validateTaiwanData(data([{ id: 'x', city: 'taipei' }]))
    const paths = errors.map((e) => e.path)
    for (const field of [
      'name',
      'location',
      'categories',
      'status',
      'summary',
    ]) {
      expect(paths).toContain(`taipei.json[0](x).${field}`)
    }
  })

  it('空文字の summary はエラー', () => {
    expect(errorText(data([spot({ summary: '  ' })]))).toContain('.summary')
  })

  it('ファイルをまたいだ id の重複を検出する', () => {
    const text = errorText({
      areas: [area],
      cityFiles: {
        taipei: [spot()],
        tainan: [
          spot({
            city: 'tainan',
            area: undefined,
            location: { lat: 23, lng: 120.2 },
          }),
        ],
      },
    })
    expect(text).toContain('tainan.json[0](some-shop).id')
    expect(text).toContain('taipei.json[0]')
  })

  it('kebab-case でない id はエラー', () => {
    expect(errorText(data([spot({ id: 'Some_Shop' })]))).toContain('kebab-case')
  })

  it('緯度経度の型・範囲・台湾の外をエラーにする', () => {
    expect(
      errorText(data([spot({ location: { lat: '25', lng: 121 } })])),
    ).toContain('location.lat')
    expect(
      errorText(data([spot({ location: { lat: 25, lng: 999 } })])),
    ).toContain('location.lng')
    // lat/lng の入れ替えミス
    expect(
      errorText(data([spot({ location: { lat: 121.5, lng: 25 } })])),
    ).toContain('location')
    expect(
      errorText(data([spot({ location: { lat: 35.68, lng: 139.76 } })])),
    ).toContain('台湾の範囲外')
  })

  it('未知の都市・ファイルと違う都市をエラーにする', () => {
    expect(errorText(data([spot({ city: 'tokyo' })]))).toContain('未知の都市')
    expect(
      errorText(data([spot({ city: 'tainan', area: undefined })])),
    ).toContain('tainan.json へ移して')
    expect(errorText({ areas: [], cityFiles: { osaka: [] } })).toContain(
      'osaka.json',
    )
  })

  it('未知のエリア・他都市のエリアをエラーにする', () => {
    expect(errorText(data([spot({ area: 'ximen' })]))).toContain(
      'areas.json に無い',
    )
    const text = errorText({
      areas: [area],
      cityFiles: {
        taipei: [],
        tainan: [spot({ city: 'tainan', location: { lat: 23, lng: 120.2 } })],
      },
    })
    expect(text).toContain('taipei のエリアです')
  })

  it('未知のカテゴリ・ラベル・ステータスと空カテゴリをエラーにする', () => {
    expect(errorText(data([spot({ categories: ['sushi'] })]))).toContain(
      'categories[0]',
    )
    expect(errorText(data([spot({ categories: [] })]))).toContain('1 つ以上')
    expect(errorText(data([spot({ labels: ['best'] })]))).toContain('labels[0]')
    expect(errorText(data([spot({ status: 'went' })]))).toContain('.status')
  })

  it('want_to_go に visitedAt があるとエラー', () => {
    expect(
      errorText(data([spot({ status: 'want_to_go', visitedAt: '2026-08' })])),
    ).toContain('want_to_go')
  })

  it('want_to_go に labels / tried があるとエラー（空配列は許す）', () => {
    const base = { status: 'want_to_go', visitedAt: undefined }
    expect(
      errorText(data([spot({ ...base, labels: ['favorite'] })])),
    ).toContain('.labels')
    expect(errorText(data([spot({ ...base, tried: ['豆花'] })]))).toContain(
      '.tried',
    )
    expect(errorText(data([spot({ ...base, labels: [], tried: [] })]))).toBe('')
  })

  it('未知のキーは typo の可能性として警告する（エラーにはしない）', () => {
    const result = validateTaiwanData({
      areas: [{ ...area, centre: { lat: 25, lng: 121 } }],
      cityFiles: { taipei: [spot({ visited_at: '2026-08' })] },
    })
    expect(result.errors).toEqual([])
    expect(result.warnings.map((w) => w.path)).toEqual([
      'areas.json[0].centre',
      'taipei.json[0](some-shop).visited_at',
    ])
  })

  it('visitedAt は YYYY-MM か YYYY-MM-DD のみ', () => {
    expect(errorText(data([spot({ visitedAt: '2026-08-15' })]))).toBe('')
    expect(errorText(data([spot({ visitedAt: '2026/08' })]))).toContain(
      'visitedAt',
    )
    expect(errorText(data([spot({ visitedAt: '2026-13' })]))).toContain(
      'visitedAt',
    )
  })

  it('URL は http(s) のみ', () => {
    expect(
      errorText(data([spot({ officialUrl: 'javascript:alert(1)' })])),
    ).toContain('officialUrl')
  })

  it('エリアの重複・不正な都市もエラー', () => {
    const text = errorText({
      areas: [area, area, { ...area, id: 'x', city: 'osaka' }],
      cityFiles: {},
    })
    expect(text).toContain('エリア id が重複')
    expect(text).toContain('areas.json[2].city')
  })

  it('visited で visitedAt 未記入は警告（エラーではない）', () => {
    const result = validateTaiwanData(data([spot({ visitedAt: undefined })]))
    expect(result.errors).toEqual([])
    expect(result.warnings.map((w) => w.path)).toEqual([
      'taipei.json[0](some-shop).visitedAt',
    ])
  })

  it('want_to_go は visitedAt 未記入でも警告しない', () => {
    const result = validateTaiwanData(
      data([spot({ status: 'want_to_go', visitedAt: undefined })]),
    )
    expect(result.warnings).toEqual([])
  })

  it('同じ googleMapsUrl の使い回しは警告', () => {
    const url = 'https://www.google.com/maps/search/?api=1&query=x'
    const result = validateTaiwanData(
      data([
        spot({ googleMapsUrl: url }),
        spot({ id: 'other-shop', googleMapsUrl: url }),
      ]),
    )
    expect(result.errors).toEqual([])
    expect(result.warnings[0]?.path).toBe(
      'taipei.json[1](other-shop).googleMapsUrl',
    )
  })
})

describe('src/data/taiwan の正本データ', () => {
  // ビルド生成物（public/data/taiwan）ではなく正本を直接読むので、
  // pnpm test は taiwan:build-data を先に走らせなくても通る
  const dir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../data/taiwan',
  )
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(path.join(dir, file), 'utf8'))

  it('バリデーションエラーが無い', () => {
    const cityFiles: Record<string, unknown> = {}
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.json') && file !== 'areas.json') {
        cityFiles[file.replace(/\.json$/, '')] = read(file)
      }
    }
    expect(
      validateTaiwanData({ areas: read('areas.json'), cityFiles }).errors,
    ).toEqual([])
  })
})
