import { describe, expect, it } from 'vitest'
import { cityCatalog, getCity } from './cities'
import {
  dbTimetableUrl,
  googleFlightsUrl,
  googleMapsTransitUrl,
  kayakUrl,
  rome2rioUrl,
  skyscannerUrl,
} from './travelLinks'
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

describe('googleFlightsUrl', () => {
  it('IATA コードと移動日をプリセットした検索 URL を返す', () => {
    expect(googleFlightsUrl(city('paris'), city('rome'), '2026-06-16')).toBe(
      'https://www.google.com/travel/flights?q=Flights%20from%20CDG%20to%20FCO%20on%202026-06-16&hl=ja&curr=JPY',
    )
  })

  it('q パラメータに区間と日付が入る', () => {
    const url = googleFlightsUrl(
      city('london'),
      city('barcelona'),
      '2026-06-01',
    )
    if (!url) throw new Error('URL が生成されなかった')
    const parsed = new URL(url)
    expect(parsed.searchParams.get('q')).toBe(
      'Flights from LHR to BCN on 2026-06-01',
    )
    expect(parsed.searchParams.get('hl')).toBe('ja')
    expect(parsed.searchParams.get('curr')).toBe('JPY')
  })

  it('空港がない都市が含まれると null を返す', () => {
    expect(
      googleFlightsUrl(city('bruges'), city('rome'), '2026-06-16'),
    ).toBeNull()
    expect(
      googleFlightsUrl(city('paris'), city('hallstatt'), '2026-06-16'),
    ).toBeNull()
  })

  it('日付が不正なら null を返す', () => {
    expect(googleFlightsUrl(city('paris'), city('rome'), '')).toBeNull()
    expect(
      googleFlightsUrl(city('paris'), city('rome'), '2026-6-16'),
    ).toBeNull()
  })
})

describe('kayakUrl', () => {
  it('IATA コードと移動日をプリセットした片道検索 URL を返す', () => {
    expect(kayakUrl(city('paris'), city('rome'), '2026-06-16')).toBe(
      'https://www.kayak.co.jp/flights/CDG-FCO/2026-06-16',
    )
  })

  it('IATA コードは大文字で入る', () => {
    expect(kayakUrl(city('london'), city('barcelona'), '2026-06-01')).toBe(
      'https://www.kayak.co.jp/flights/LHR-BCN/2026-06-01',
    )
  })

  it('空港がない都市が含まれると null を返す', () => {
    expect(kayakUrl(city('bruges'), city('rome'), '2026-06-16')).toBeNull()
    expect(
      kayakUrl(city('interlaken'), city('lucerne'), '2026-06-16'),
    ).toBeNull()
  })

  it('日付が不正なら null を返す', () => {
    expect(kayakUrl(city('paris'), city('rome'), '')).toBeNull()
    expect(kayakUrl(city('paris'), city('rome'), '2026-6-16')).toBeNull()
  })
})

describe('dbTimetableUrl', () => {
  it('区間と移動日をプリセットした DB 国際版の URL を返す', () => {
    expect(dbTimetableUrl(city('paris'), city('vienna'), '2026-06-16')).toBe(
      'https://int.bahn.de/en#?SO=Paris&ZO=Vienna&HD=2026-06-16T09:00:00&HZA=D',
    )
  })

  it('DB が正しく解決しない都市は駅名で上書きしてある', () => {
    // Milan / Seville はそのままの英語名だとスイスの住所などに解決されてしまう
    expect(dbTimetableUrl(city('milan'), city('seville'), '2026-06-16')).toBe(
      'https://int.bahn.de/en#?SO=Milano%20Centrale&ZO=Sevilla%20Santa%20Justa&HD=2026-06-16T09:00:00&HZA=D',
    )
  })

  it('夜行向けに開始時刻を指定できる', () => {
    expect(
      dbTimetableUrl(city('paris'), city('vienna'), '2026-06-16', '18:00'),
    ).toBe(
      'https://int.bahn.de/en#?SO=Paris&ZO=Vienna&HD=2026-06-16T18:00:00&HZA=D',
    )
  })

  it('HD のコロンはエンコードしない(エンコードすると DB 側が無視するため)', () => {
    const url = dbTimetableUrl(city('berlin'), city('prague'), '2026-06-16')
    expect(url).toContain('HD=2026-06-16T09:00:00')
    expect(url).not.toContain('%3A')
  })

  it('ハッシュは "#?" で始まり、キーは大文字', () => {
    const url = dbTimetableUrl(city('zurich'), city('milan'), '2026-06-16')
    if (!url) throw new Error('URL が生成されなかった')
    const hash = url.slice(url.indexOf('#'))
    expect(hash.startsWith('#?')).toBe(true)
    for (const part of hash.slice(2).split('&')) {
      expect(part.split('=')[0]).toMatch(/^[A-Z]+$/)
    }
  })

  it('鉄道駅が確認できていない都市が含まれると null を返す', () => {
    expect(
      dbTimetableUrl(city('paris'), city('malta'), '2026-06-16'),
    ).toBeNull()
    expect(
      dbTimetableUrl(city('dubrovnik'), city('vienna'), '2026-06-16'),
    ).toBeNull()
    expect(
      dbTimetableUrl(city('santorini'), city('athens'), '2026-06-16'),
    ).toBeNull()
  })

  it('空港がない都市でも鉄道リンクは作れる', () => {
    expect(
      dbTimetableUrl(city('bruges'), city('amsterdam'), '2026-06-16'),
    ).toBe(
      'https://int.bahn.de/en#?SO=Bruges&ZO=Amsterdam&HD=2026-06-16T09:00:00&HZA=D',
    )
    expect(
      dbTimetableUrl(city('interlaken'), city('lucerne'), '2026-06-16'),
    ).not.toBeNull()
  })

  it('日付が不正なら null を返す', () => {
    expect(dbTimetableUrl(city('paris'), city('vienna'), '')).toBeNull()
    expect(
      dbTimetableUrl(city('paris'), city('vienna'), '2026-6-16'),
    ).toBeNull()
  })

  it('時刻が不正なら null を返す', () => {
    expect(
      dbTimetableUrl(city('paris'), city('vienna'), '2026-06-16', '9:00'),
    ).toBeNull()
    expect(
      dbTimetableUrl(city('paris'), city('vienna'), '2026-06-16', '24:00'),
    ).toBeNull()
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
      dbStation: null,
      lat: 46.4908,
      lng: 9.8355,
      landmass: 'continental',
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
      dbStation: null,
      lat: 46.4908,
      lng: 9.8355,
      landmass: 'continental',
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

  it('dbStation は null か前後に空白のない文字列', () => {
    for (const c of cityCatalog) {
      if (c.dbStation === null) continue
      expect(c.dbStation.trim(), `${c.id} の dbStation`).toBe(c.dbStation)
      expect(c.dbStation.length, `${c.id} の dbStation`).toBeGreaterThan(0)
    }
  })

  it('鉄道が通らない離島は dbStation を持たない', () => {
    for (const c of cityCatalog) {
      if (c.landmass === 'malta' || c.landmass === 'santorini') {
        expect(c.dbStation, `${c.id} の dbStation`).toBeNull()
      }
    }
  })

  it('iata は都市間で重複しない', () => {
    const codes = cityCatalog
      .map((c) => c.iata)
      .filter((code): code is string => code !== null)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('id は都市間で重複しない', () => {
    const ids = cityCatalog.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('追加した都市(ボルドー / マルタ)も enName・iata・landmass を持つ', () => {
    expect(city('bordeaux')).toMatchObject({
      name: 'ボルドー',
      enName: 'Bordeaux',
      country: 'フランス',
      iata: 'BOD',
      landmass: 'continental',
    })
    expect(city('malta')).toMatchObject({
      name: 'マルタ',
      enName: 'Malta',
      country: 'マルタ',
      iata: 'MLA',
      landmass: 'malta',
    })
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
