import { describe, expect, it } from 'vitest'
import { cityCatalog, getCity } from './cities'
import { googleMapsTransitUrl, rome2rioUrl, skyscannerUrl } from './travelLinks'
import type { City } from './types'

function city(id: string): City {
  const found = getCity(id)
  if (!found) throw new Error(`unknown city: ${id}`)
  return found
}

describe('skyscannerUrl', () => {
  it('IATA コードと YYMMDD をプリセットした片道検索 URL を返す', () => {
    expect(skyscannerUrl(city('paris'), city('rome'), '2026-06-16')).toBe(
      'https://www.skyscanner.jp/transport/flights/cdg/fco/260616/',
    )
  })

  it('IATA コードは小文字化される', () => {
    const url = skyscannerUrl(city('london'), city('barcelona'), '2026-06-01')
    expect(url).toBe(
      'https://www.skyscanner.jp/transport/flights/lhr/bcn/260601/',
    )
  })

  it('年跨ぎの日付も YYMMDD に変換できる', () => {
    expect(skyscannerUrl(city('vienna'), city('athens'), '2027-01-03')).toBe(
      'https://www.skyscanner.jp/transport/flights/vie/ath/270103/',
    )
  })

  it('空港がない都市が含まれると null を返す', () => {
    expect(skyscannerUrl(city('bruges'), city('rome'), '2026-06-16')).toBeNull()
    expect(
      skyscannerUrl(city('paris'), city('hallstatt'), '2026-06-16'),
    ).toBeNull()
    expect(
      skyscannerUrl(city('interlaken'), city('lucerne'), '2026-06-16'),
    ).toBeNull()
  })

  it('日付が不正なら null を返す', () => {
    expect(skyscannerUrl(city('paris'), city('rome'), '')).toBeNull()
    expect(skyscannerUrl(city('paris'), city('rome'), '2026-6-16')).toBeNull()
  })
})

describe('rome2rioUrl', () => {
  it('英語名の区間ページ URL を返す', () => {
    expect(rome2rioUrl(city('paris'), city('rome'))).toBe(
      'https://www.rome2rio.com/map/Paris/Rome',
    )
  })

  it('空港がない都市でもリンクできる', () => {
    expect(rome2rioUrl(city('bruges'), city('amsterdam'))).toBe(
      'https://www.rome2rio.com/map/Bruges/Amsterdam',
    )
  })

  it('英語名に空白などが含まれてもエンコードされる', () => {
    const from: City = {
      id: 'x',
      name: 'サンモリッツ',
      enName: 'St. Moritz',
      country: 'スイス',
      iata: null,
      lat: 46.4908,
      lng: 9.8355,
    }
    expect(rome2rioUrl(from, city('zurich'))).toBe(
      'https://www.rome2rio.com/map/St.%20Moritz/Zurich',
    )
  })
})

describe('googleMapsTransitUrl', () => {
  it('公共交通機関モードの経路検索 URL を返す', () => {
    expect(googleMapsTransitUrl(city('paris'), city('rome'))).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=Paris&destination=Rome&travelmode=transit',
    )
  })

  it('パラメータが URL エンコードされる', () => {
    const to: City = {
      id: 'y',
      name: 'サンモリッツ',
      enName: 'St. Moritz',
      country: 'スイス',
      iata: null,
      lat: 46.4908,
      lng: 9.8355,
    }
    const url = new URL(googleMapsTransitUrl(city('zurich'), to))
    expect(url.searchParams.get('origin')).toBe('Zurich')
    expect(url.searchParams.get('destination')).toBe('St. Moritz')
    expect(url.searchParams.get('travelmode')).toBe('transit')
  })
})

describe('都市カタログの外部リンク用フィールド', () => {
  it('全都市が英語名を持つ', () => {
    for (const c of cityCatalog) {
      expect(c.enName, `${c.id} の enName`).toMatch(/^[A-Za-z]/)
      expect(c.enName.trim(), `${c.id} の enName`).toBe(c.enName)
    }
  })

  it('iata は null か英大文字3文字', () => {
    for (const c of cityCatalog) {
      if (c.iata === null) continue
      expect(c.iata, `${c.id} の iata`).toMatch(/^[A-Z]{3}$/)
    }
  })

  it('iata は都市間で重複しない', () => {
    const codes = cityCatalog
      .map((c) => c.iata)
      .filter((code): code is string => code !== null)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('カタログの全区間で Rome2Rio / Google マップのリンクが作れる', () => {
    for (const c of cityCatalog) {
      expect(() => new URL(rome2rioUrl(c, city('paris')))).not.toThrow()
      expect(
        () => new URL(googleMapsTransitUrl(c, city('paris'))),
      ).not.toThrow()
    }
  })
})
