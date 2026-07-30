import { describe, expect, it } from 'vitest'
import { cityCatalog, getCity } from './cities'
import {
  dayCostOf,
  estimateOptions,
  greatCircleKm,
  landRouteExists,
  recommendedOption,
} from './travel'
import type { Landmass } from './types'

function city(id: string) {
  const c = getCity(id)
  if (!c) throw new Error(`unknown city: ${id}`)
  return c
}

describe('greatCircleKm', () => {
  it('ローマ→フィレンツェは 230km 前後', () => {
    const km = greatCircleKm(city('rome'), city('florence'))
    expect(km).toBeGreaterThan(200)
    expect(km).toBeLessThan(280)
  })

  it('パリ→ローマは 1100km 前後', () => {
    const km = greatCircleKm(city('paris'), city('rome'))
    expect(km).toBeGreaterThan(1000)
    expect(km).toBeLessThan(1200)
  })
})

describe('dayCostOf', () => {
  it('短い移動でも最低 0.25 日は食う', () => {
    expect(dayCostOf(60)).toBe(0.25)
  })
  it('半日級の移動は 0.5', () => {
    expect(dayCostOf(330)).toBe(0.5)
  })
  it('長い移動は 1 日で頭打ち', () => {
    expect(dayCostOf(2000)).toBe(1)
  })
})

describe('estimateOptions', () => {
  it('近距離(ローマ→フィレンツェ)は鉄道が推奨で飛行機は出ない', () => {
    const options = estimateOptions(city('rome'), city('florence'))
    expect(options.some((o) => o.mode === 'train')).toBe(true)
    expect(options.some((o) => o.mode === 'flight')).toBe(false)
    expect(recommendedOption(options).mode).toBe('train')
  })

  it('中長距離(パリ→ウィーン)は飛行機と夜行列車が候補に入る', () => {
    const options = estimateOptions(city('paris'), city('vienna'))
    expect(options.some((o) => o.mode === 'flight')).toBe(true)
    expect(options.some((o) => o.mode === 'nightTrain')).toBe(true)
  })

  it('遠距離(リスボン→ヘルシンキ)は飛行機のみ', () => {
    const options = estimateOptions(city('lisbon'), city('helsinki'))
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((o) => o.mode === 'flight')).toBe(true)
  })

  it('夜行列車は日中を食わず泊を 1 消費する', () => {
    const options = estimateOptions(city('paris'), city('vienna'))
    const night = options.find((o) => o.mode === 'nightTrain')
    expect(night).toBeDefined()
    expect(night?.dayCost).toBe(0)
    expect(night?.nightCost).toBe(1)
  })

  it('飛行機の door-to-door は搭乗時間より大幅に長い(空港オーバーヘッド)', () => {
    const options = estimateOptions(city('paris'), city('rome'))
    const flight = options.find((o) => o.mode === 'flight')
    expect(flight).toBeDefined()
    expect(flight!.doorToDoorMinutes - flight!.inVehicleMinutes).toBe(210)
  })

  it('候補は door-to-door 昇順に並ぶ', () => {
    const options = estimateOptions(city('paris'), city('vienna'))
    const sorted = [...options].sort(
      (a, b) => a.doorToDoorMinutes - b.doorToDoorMinutes,
    )
    expect(options).toEqual(sorted)
  })
})

describe('landRouteExists', () => {
  it('同じ陸塊なら陸路が成立する', () => {
    expect(landRouteExists(city('paris'), city('rome'))).toBe(true)
    expect(landRouteExists(city('london'), city('edinburgh'))).toBe(true)
  })

  it('大陸 ↔ グレートブリテン島は海峡トンネルで成立する', () => {
    expect(landRouteExists(city('paris'), city('london'))).toBe(true)
    expect(landRouteExists(city('london'), city('brussels'))).toBe(true)
  })

  it('島を跨ぐ組み合わせは成立しない', () => {
    expect(landRouteExists(city('dublin'), city('london'))).toBe(false)
    expect(landRouteExists(city('athens'), city('santorini'))).toBe(false)
    expect(landRouteExists(city('rome'), city('malta'))).toBe(false)
    expect(landRouteExists(city('malta'), city('santorini'))).toBe(false)
  })
})

describe('海を越える区間の候補', () => {
  it('アテネ→サントリーニは近距離でも飛行機のみ', () => {
    const km = greatCircleKm(city('athens'), city('santorini'))
    expect(km).toBeLessThan(300)
    const options = estimateOptions(city('athens'), city('santorini'))
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((o) => o.mode === 'flight')).toBe(true)
  })

  it('ローマ→マルタは飛行機のみ', () => {
    const options = estimateOptions(city('rome'), city('malta'))
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((o) => o.mode === 'flight')).toBe(true)
  })

  it('ダブリン→ロンドンは飛行機のみ', () => {
    const options = estimateOptions(city('dublin'), city('london'))
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((o) => o.mode === 'flight')).toBe(true)
  })

  it('パリ→ロンドンは海峡トンネルがあるので鉄道が残る', () => {
    const options = estimateOptions(city('paris'), city('london'))
    expect(options.some((o) => o.mode === 'train')).toBe(true)
  })

  it('ボルドー→パリは大陸内なので鉄道が出る', () => {
    const options = estimateOptions(city('bordeaux'), city('paris'))
    expect(options.some((o) => o.mode === 'train')).toBe(true)
    expect(recommendedOption(options).mode).toBe('train')
  })

  it('海越えの夜行列車は候補に出ない', () => {
    for (const pair of [
      ['rome', 'malta'],
      ['dublin', 'madrid'],
      ['santorini', 'rome'],
    ] as const) {
      const km = greatCircleKm(city(pair[0]), city(pair[1]))
      // 陸続きなら夜行が出る距離帯であることを確認したうえで、出ないことを見る
      expect(km, `${pair[0]}→${pair[1]} の距離`).toBeGreaterThanOrEqual(400)
      expect(km, `${pair[0]}→${pair[1]} の距離`).toBeLessThanOrEqual(1500)
      const options = estimateOptions(city(pair[0]), city(pair[1]))
      expect(
        options.some((o) => o.mode === 'nightTrain'),
        `${pair[0]}→${pair[1]}`,
      ).toBe(false)
    }
  })
})

describe('都市カタログの landmass', () => {
  it('全都市が既知の landmass を持つ', () => {
    const known: Array<Landmass> = [
      'continental',
      'britain',
      'ireland',
      'malta',
      'santorini',
    ]
    for (const c of cityCatalog) {
      expect(known, `${c.id} の landmass`).toContain(c.landmass)
    }
  })

  it('島の都市だけが continental 以外になる', () => {
    const islands = cityCatalog
      .filter((c) => c.landmass !== 'continental')
      .map((c) => [c.id, c.landmass])
    expect(islands).toEqual([
      ['london', 'britain'],
      ['edinburgh', 'britain'],
      ['dublin', 'ireland'],
      ['santorini', 'santorini'],
      ['malta', 'malta'],
    ])
  })
})
