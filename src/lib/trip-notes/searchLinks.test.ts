import { describe, expect, it } from 'vitest'
import { makeStamp } from './datetime'
import { bookingSearchLinks, lodgingSearchLinks } from './searchLinks'
import type { Booking } from './types'

const PARIS = 'Europe/Paris'

const at = makeStamp

type BookingInit = Partial<Booking> &
  Pick<Booking, 'id' | 'kind' | 'title' | 'start'>

function booking(init: BookingInit): Booking {
  return { end: null, status: 'idea', payment: 'unpaid', ...init }
}

function labels(links: Array<{ label: string }>): Array<string> {
  return links.map((link) => link.label)
}

/** 指定したリンクの URL パスをデコードして返す(Rome2Rio は地名をパスに載せる) */
function pathOf(
  links: Array<{ label: string; url: string }>,
  label: string,
): string {
  const link = links.find((item) => item.label === label)
  if (link === undefined) throw new Error('リンクが生成されなかった')
  return decodeURIComponent(new URL(link.url).pathname)
}

describe('lodgingSearchLinks', () => {
  it('Booking.com と Google ホテルへのリンクを返す', () => {
    const links = lodgingSearchLinks('パリ', '2026-06-12', '2026-06-15')
    expect(labels(links)).toEqual(['Booking.com', 'Google ホテル'])
  })

  it('Booking.com の URL に地名・チェックイン・チェックアウトが入る', () => {
    const links = lodgingSearchLinks('パリ', '2026-06-12', '2026-06-15')
    const bookingCom = links.find((link) => link.label === 'Booking.com')
    if (bookingCom === undefined) throw new Error('リンクが生成されなかった')
    const url = new URL(bookingCom.url)
    expect(url.origin + url.pathname).toBe(
      'https://www.booking.com/searchresults.ja.html',
    )
    expect(url.searchParams.get('ss')).toBe('パリ')
    expect(url.searchParams.get('checkin')).toBe('2026-06-12')
    expect(url.searchParams.get('checkout')).toBe('2026-06-15')
  })

  it('Google ホテルの URL は地名だけを持ち、日付は入れない', () => {
    const links = lodgingSearchLinks('パリ', '2026-06-12', '2026-06-15')
    const google = links.find((link) => link.label === 'Google ホテル')
    if (google === undefined) throw new Error('リンクが生成されなかった')
    const url = new URL(google.url)
    expect(url.origin + url.pathname).toBe(
      'https://www.google.com/travel/search',
    )
    expect(url.searchParams.get('q')).toBe('パリ')
    expect(url.searchParams.get('hl')).toBe('ja')
    // 日付をプリセットする公開 URL 仕様が無いので checkin/checkout は含まない
    expect(url.searchParams.has('checkin')).toBe(false)
  })

  it('日本語・スペース・& を含む地名も正しく URL エンコードされる', () => {
    const links = lodgingSearchLinks(
      'サン・ジョセフ & Co',
      '2026-06-12',
      '2026-06-15',
    )
    const bookingCom = links.find((link) => link.label === 'Booking.com')
    if (bookingCom === undefined) throw new Error('リンクが生成されなかった')
    // URLSearchParams で組み立てているので、生の "&" が区切り文字と混ざらない
    const url = new URL(bookingCom.url)
    expect(url.searchParams.get('ss')).toBe('サン・ジョセフ & Co')
    expect(bookingCom.url).not.toContain(' ')
  })

  it('地名が空文字(空白のみ含む)なら空配列を返す', () => {
    expect(lodgingSearchLinks('', '2026-06-12', '2026-06-15')).toEqual([])
    expect(lodgingSearchLinks('   ', '2026-06-12', '2026-06-15')).toEqual([])
  })
})

describe('bookingSearchLinks / lodging', () => {
  it('place.name を地名として使い、start/end の現地日付をチェックイン/アウトにする', () => {
    const b = booking({
      id: 'hotel',
      kind: 'lodging',
      title: 'ホテル探す',
      start: at('2026-06-12', '15:00', PARIS),
      end: at('2026-06-15', '11:00', PARIS),
      place: { name: 'パリ' },
    })
    const links = bookingSearchLinks(b)
    const bookingCom = links.find((link) => link.label === 'Booking.com')
    if (bookingCom === undefined) throw new Error('リンクが生成されなかった')
    const url = new URL(bookingCom.url)
    expect(url.searchParams.get('ss')).toBe('パリ')
    expect(url.searchParams.get('checkin')).toBe('2026-06-12')
    expect(url.searchParams.get('checkout')).toBe('2026-06-15')
  })

  it('place が無ければ title を地名として使う', () => {
    const b = booking({
      id: 'hotel',
      kind: 'lodging',
      title: 'サントリーニのヴィラ',
      start: at('2026-06-12', '15:00', PARIS),
    })
    const links = bookingSearchLinks(b)
    const bookingCom = links.find((link) => link.label === 'Booking.com')
    if (bookingCom === undefined) throw new Error('リンクが生成されなかった')
    expect(new URL(bookingCom.url).searchParams.get('ss')).toBe(
      'サントリーニのヴィラ',
    )
  })

  it('end が無ければチェックアウトは start の翌日(現地日付)', () => {
    const b = booking({
      id: 'hotel',
      kind: 'lodging',
      title: 'ホテル',
      start: at('2026-06-12', '15:00', PARIS),
      place: { name: 'パリ' },
    })
    const links = bookingSearchLinks(b)
    const bookingCom = links.find((link) => link.label === 'Booking.com')
    if (bookingCom === undefined) throw new Error('リンクが生成されなかった')
    expect(new URL(bookingCom.url).searchParams.get('checkout')).toBe(
      '2026-06-13',
    )
  })

  it('日付は予約自身のタイムゾーンの現地日付で取る', () => {
    // パリ 6/12 23:00 は東京では 6/13 の未明。日本時間に引きずられず
    // 予約自身(パリ)の現地日付が使われることを確認する
    const b = booking({
      id: 'hotel',
      kind: 'lodging',
      title: 'ホテル',
      start: at('2026-06-12', '23:00', PARIS),
      place: { name: 'パリ' },
    })
    const links = bookingSearchLinks(b)
    const bookingCom = links.find((link) => link.label === 'Booking.com')
    if (bookingCom === undefined) throw new Error('リンクが生成されなかった')
    expect(new URL(bookingCom.url).searchParams.get('checkin')).toBe(
      '2026-06-12',
    )
  })

  it('地名も title も空なら空配列を返す', () => {
    const b = booking({
      id: 'hotel',
      kind: 'lodging',
      title: '   ',
      start: at('2026-06-12', '15:00', PARIS),
      place: { name: '' },
    })
    expect(bookingSearchLinks(b)).toEqual([])
  })
})

describe('bookingSearchLinks / flight', () => {
  function flight(from: string, to: string): Booking {
    return booking({
      id: 'flight',
      kind: 'flight',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: from },
      to: { name: to },
    })
  }

  it('IATA コードらしい地名なら Google フライトと Skyscanner の両方を返す', () => {
    const links = bookingSearchLinks(flight('CDG', 'FCO'))
    expect(labels(links)).toEqual(['Google フライト', 'Skyscanner'])
  })

  it('Google フライトの q には区間と日付が入る', () => {
    const links = bookingSearchLinks(flight('パリ', 'ローマ'))
    const google = links.find((link) => link.label === 'Google フライト')
    if (google === undefined) throw new Error('リンクが生成されなかった')
    const url = new URL(google.url)
    expect(url.searchParams.get('q')).toBe(
      'Flights from パリ to ローマ on 2026-06-16',
    )
    expect(url.searchParams.get('hl')).toBe('ja')
    expect(url.searchParams.get('curr')).toBe('JPY')
  })

  it('IATA コードでない自由入力の地名では Skyscanner を出さない', () => {
    const links = bookingSearchLinks(flight('パリ', 'ローマ'))
    expect(labels(links)).toEqual(['Google フライト'])
    expect(links.some((link) => link.label === 'Skyscanner')).toBe(false)
  })

  it('片方だけ IATA コードらしくても Skyscanner は出ない', () => {
    const links = bookingSearchLinks(flight('CDG', 'ローマ'))
    expect(links.some((link) => link.label === 'Skyscanner')).toBe(false)
  })

  it('Skyscanner の URL は YYMMDD 形式の日付と小文字コードを使う', () => {
    const links = bookingSearchLinks(flight('CDG', 'FCO'))
    const sky = links.find((link) => link.label === 'Skyscanner')
    if (sky === undefined) throw new Error('リンクが生成されなかった')
    expect(sky.url).toBe(
      'https://www.skyscanner.jp/transport/flights/cdg/fco/260616/',
    )
  })

  it('from / to のどちらかが無ければ空配列を返す', () => {
    const b = booking({
      id: 'flight',
      kind: 'flight',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      to: { name: 'ローマ' },
    })
    expect(bookingSearchLinks(b)).toEqual([])
  })
})

describe('bookingSearchLinks / train・bus・ferry・car', () => {
  it.each(['train', 'bus', 'ferry', 'car'] as const)(
    'kind: %s は Rome2Rio と Google マップの経路検索を返す',
    (kind) => {
      const b = booking({
        id: 'transit',
        kind,
        title: '移動',
        start: at('2026-06-16', '10:00', PARIS),
        from: { name: 'パリ' },
        to: { name: 'アムステルダム' },
      })
      const links = bookingSearchLinks(b)
      expect(labels(links)).toEqual(['Rome2Rio', 'Google マップ(経路)'])
    },
  )

  it('Rome2Rio の URL は from/to をパスとしてエンコードする', () => {
    const b = booking({
      id: 'transit',
      kind: 'train',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: 'サン・ジョセフ' },
      to: { name: 'St. Moritz' },
    })
    const links = bookingSearchLinks(b)
    const rome2rio = links.find((link) => link.label === 'Rome2Rio')
    if (rome2rio === undefined) throw new Error('リンクが生成されなかった')
    const url = new URL(rome2rio.url)
    expect(url.origin + url.pathname).toBe(
      `https://www.rome2rio.com/map/${encodeURIComponent('サン・ジョセフ')}/${encodeURIComponent('St. Moritz')}`,
    )
  })

  it('Rome2Rio の URL に出発日(departureDate)が付く', () => {
    const b = booking({
      id: 'transit',
      kind: 'train',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: 'パリ' },
      to: { name: 'アムステルダム' },
    })
    const links = bookingSearchLinks(b)
    const rome2rio = links.find((link) => link.label === 'Rome2Rio')
    if (rome2rio === undefined) throw new Error('リンクが生成されなかった')
    const url = new URL(rome2rio.url)
    expect(url.searchParams.get('departureDate')).toBe('2026-06-16')
    // 宿の比較パネルの表示切り替えであって区間探しとは無関係なので付けない
    expect(url.searchParams.has('accom_comparison')).toBe(false)
  })

  it('出発日は予約自身のタイムゾーンの現地日付で取る(表示タイムゾーンに引きずられない)', () => {
    // パリ 6/16 23:00 は東京では 6/17 の未明。日本時間に引きずられず
    // 予約自身(パリ)の現地日付が使われることを確認する
    const b = booking({
      id: 'transit',
      kind: 'train',
      title: '移動',
      start: at('2026-06-16', '23:00', PARIS),
      from: { name: 'パリ' },
      to: { name: 'アムステルダム' },
    })
    const links = bookingSearchLinks(b)
    const rome2rio = links.find((link) => link.label === 'Rome2Rio')
    if (rome2rio === undefined) throw new Error('リンクが生成されなかった')
    expect(new URL(rome2rio.url).searchParams.get('departureDate')).toBe(
      '2026-06-16',
    )
  })

  it('開始時刻が壊れている予約では日付なしの Rome2Rio リンクを返す', () => {
    const b = booking({
      id: 'transit',
      kind: 'train',
      title: '移動',
      start: { zdt: 'こわれた時刻', allDay: false },
      from: { name: 'パリ' },
      to: { name: 'アムステルダム' },
    })
    const links = bookingSearchLinks(b)
    const rome2rio = links.find((link) => link.label === 'Rome2Rio')
    if (rome2rio === undefined) throw new Error('リンクが生成されなかった')
    expect(rome2rio.url).toBe(
      `https://www.rome2rio.com/map/${encodeURIComponent('パリ')}/${encodeURIComponent('アムステルダム')}`,
    )
    expect(new URL(rome2rio.url).searchParams.has('departureDate')).toBe(false)
  })

  it('Google マップの URL は origin/destination/travelmode=transit を持つ', () => {
    const b = booking({
      id: 'transit',
      kind: 'bus',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: 'パリ' },
      to: { name: 'アムステルダム' },
    })
    const links = bookingSearchLinks(b)
    const maps = links.find((link) => link.label === 'Google マップ(経路)')
    if (maps === undefined) throw new Error('リンクが生成されなかった')
    const url = new URL(maps.url)
    expect(url.searchParams.get('api')).toBe('1')
    expect(url.searchParams.get('origin')).toBe('パリ')
    expect(url.searchParams.get('destination')).toBe('アムステルダム')
    expect(url.searchParams.get('travelmode')).toBe('transit')
  })

  it('from / to のどちらかが無ければ空配列を返す', () => {
    const b = booking({
      id: 'transit',
      kind: 'car',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: 'パリ' },
    })
    expect(bookingSearchLinks(b)).toEqual([])
  })
})

describe('bookingSearchLinks / Rome2Rio に渡す地名だけ都市名に寄せる', () => {
  function transit(from: string, to: string): Booking {
    return booking({
      id: 'transit',
      kind: 'train',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: from },
      to: { name: to },
    })
  }

  it('施設名・ターミナル番号を落とした都市名をパスに載せる', () => {
    // Rome2Rio は都市間の移動手段を比べるサービスなので、
    // 「香港国際空港 T2」のままでは地点として解決できない見込みが高い
    const links = bookingSearchLinks(
      transit('香港国際空港 T2', '台湾桃園国際空港 T2'),
    )
    expect(pathOf(links, 'Rome2Rio')).toBe('/map/香港/台湾桃園')
  })

  it('もともと都市名の入力は変えない', () => {
    const links = bookingSearchLinks(transit('Milan', 'Interlaken'))
    expect(pathOf(links, 'Rome2Rio')).toBe('/map/Milan/Interlaken')
  })

  it('落とすと短くなりすぎる地名は元の文字列のまま渡す', () => {
    // 空文字や 1 文字を渡すくらいなら、施設名のままのほうがまだ見込みがある
    const links = bookingSearchLinks(transit('駅', '香港'))
    expect(pathOf(links, 'Rome2Rio')).toBe('/map/駅/香港')
  })

  it('Google マップ(経路)には施設名をそのまま渡す', () => {
    // Google は施設名を解決できるうえ、空港のターミナルまで指定できたほうが
    // 出てくる経路が正確になる。都市名に寄せるのは Rome2Rio だけ
    const links = bookingSearchLinks(
      transit('香港国際空港 T2', '台湾桃園国際空港 T2'),
    )
    const maps = links.find((link) => link.label === 'Google マップ(経路)')
    if (maps === undefined) throw new Error('リンクが生成されなかった')
    const url = new URL(maps.url)
    expect(url.searchParams.get('origin')).toBe('香港国際空港 T2')
    expect(url.searchParams.get('destination')).toBe('台湾桃園国際空港 T2')
  })

  it('宿・フライト・検索のリンクは施設名のまま(適用は Rome2Rio だけ)', () => {
    const flight = booking({
      id: 'flight',
      kind: 'flight',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: '香港国際空港 T2' },
      to: { name: '台湾桃園国際空港 T2' },
    })
    const google = bookingSearchLinks(flight).find(
      (link) => link.label === 'Google フライト',
    )
    if (google === undefined) throw new Error('リンクが生成されなかった')
    expect(new URL(google.url).searchParams.get('q')).toBe(
      'Flights from 香港国際空港 T2 to 台湾桃園国際空港 T2 on 2026-06-16',
    )

    const lodging = lodgingSearchLinks(
      '香港国際空港 T2',
      '2026-06-12',
      '2026-06-15',
    )
    const bookingCom = lodging.find((link) => link.label === 'Booking.com')
    if (bookingCom === undefined) throw new Error('リンクが生成されなかった')
    expect(new URL(bookingCom.url).searchParams.get('ss')).toBe(
      '香港国際空港 T2',
    )
  })
})

describe('bookingSearchLinks / activity・other', () => {
  it.each(['activity', 'other'] as const)(
    'kind: %s はタイトルと場所名で Google 検索リンクを返す',
    (kind) => {
      const b = booking({
        id: 'activity',
        kind,
        title: 'ルーブル美術館',
        start: at('2026-06-16', '10:00', PARIS),
        place: { name: 'パリ' },
      })
      const links = bookingSearchLinks(b)
      expect(labels(links)).toEqual(['Google 検索'])
      const url = new URL(links[0].url)
      expect(url.searchParams.get('q')).toBe('ルーブル美術館 パリ')
      expect(url.searchParams.get('hl')).toBe('ja')
    },
  )

  it('場所が無くてもタイトルだけで検索リンクを作る', () => {
    const b = booking({
      id: 'activity',
      kind: 'activity',
      title: '現地ツアー予約',
      start: at('2026-06-16', '10:00', PARIS),
    })
    const links = bookingSearchLinks(b)
    expect(links).toHaveLength(1)
    expect(new URL(links[0].url).searchParams.get('q')).toBe('現地ツアー予約')
  })

  it('タイトルも場所も空なら空配列を返す', () => {
    const b = booking({
      id: 'activity',
      kind: 'other',
      title: '   ',
      start: at('2026-06-16', '10:00', PARIS),
      place: { name: '' },
    })
    expect(bookingSearchLinks(b)).toEqual([])
  })
})

describe('bookingSearchLinks / 外部サイトに渡す地名は latinName を最優先する', () => {
  // 渡す先が人間ではなく検索エンジンなので、name(日本人利用者なら日本語)より
  // ラテン文字表記を優先する。types.ts の Place / searchLinks.ts の placeName を参照
  it('Rome2Rio の URL には name(日本語)ではなく latinName が入る', () => {
    const b = booking({
      id: 'transit',
      kind: 'train',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: '香港国際空港 T2', latinName: 'Hong Kong' },
      to: { name: '台湾桃園国際空港 T2', latinName: 'Taipei' },
    })
    const links = bookingSearchLinks(b)
    expect(pathOf(links, 'Rome2Rio')).toBe('/map/Hong Kong/Taipei')
  })

  it('Google マップの経路にも latinName が入る', () => {
    const b = booking({
      id: 'transit',
      kind: 'bus',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: 'パリ', latinName: 'Paris' },
      to: { name: 'アムステルダム', latinName: 'Amsterdam' },
    })
    const links = bookingSearchLinks(b)
    const maps = links.find((link) => link.label === 'Google マップ(経路)')
    if (maps === undefined) throw new Error('リンクが生成されなかった')
    const url = new URL(maps.url)
    expect(url.searchParams.get('origin')).toBe('Paris')
    expect(url.searchParams.get('destination')).toBe('Amsterdam')
  })

  it('flight でも latinName が使われ、IATA コードなら Skyscanner も出る', () => {
    const b = booking({
      id: 'flight',
      kind: 'flight',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: '羽田空港', latinName: 'HND' },
      to: { name: 'シャルル・ド・ゴール空港', latinName: 'CDG' },
    })
    const links = bookingSearchLinks(b)
    expect(labels(links)).toEqual(['Google フライト', 'Skyscanner'])
    const google = links.find((link) => link.label === 'Google フライト')
    if (google === undefined) throw new Error('リンクが生成されなかった')
    expect(new URL(google.url).searchParams.get('q')).toBe(
      'Flights from HND to CDG on 2026-06-16',
    )
  })

  it('宿泊の地名にも latinName が使われる', () => {
    const b = booking({
      id: 'hotel',
      kind: 'lodging',
      title: 'ホテル',
      start: at('2026-06-12', '15:00', PARIS),
      end: at('2026-06-15', '11:00', PARIS),
      place: { name: 'パリのホテル', latinName: 'Paris' },
    })
    const links = bookingSearchLinks(b)
    const bookingCom = links.find((link) => link.label === 'Booking.com')
    if (bookingCom === undefined) throw new Error('リンクが生成されなかった')
    expect(new URL(bookingCom.url).searchParams.get('ss')).toBe('Paris')
  })

  it('latinName が無ければ従来どおり name を使う', () => {
    const b = booking({
      id: 'transit',
      kind: 'train',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: 'パリ' },
      to: { name: 'アムステルダム' },
    })
    const links = bookingSearchLinks(b)
    expect(pathOf(links, 'Rome2Rio')).toBe('/map/パリ/アムステルダム')
  })

  it('latinName が空白だけなら name にフォールバックする', () => {
    const b = booking({
      id: 'transit',
      kind: 'train',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: 'パリ', latinName: '   ' },
      to: { name: 'アムステルダム', latinName: '' },
    })
    const links = bookingSearchLinks(b)
    const maps = links.find((link) => link.label === 'Google マップ(経路)')
    if (maps === undefined) throw new Error('リンクが生成されなかった')
    const url = new URL(maps.url)
    expect(url.searchParams.get('origin')).toBe('パリ')
    expect(url.searchParams.get('destination')).toBe('アムステルダム')
  })

  it('name が空なら localName を使う従来の逃げ道も残っている', () => {
    const b = booking({
      id: 'transit',
      kind: 'train',
      title: '移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: '', localName: 'Παρίσι' },
      to: { name: '', localName: 'Άμστερνταμ' },
    })
    const links = bookingSearchLinks(b)
    const maps = links.find((link) => link.label === 'Google マップ(経路)')
    if (maps === undefined) throw new Error('リンクが生成されなかった')
    const url = new URL(maps.url)
    expect(url.searchParams.get('origin')).toBe('Παρίσι')
    expect(url.searchParams.get('destination')).toBe('Άμστερνταμ')
  })
})

describe('bookingSearchLinks / other は from・to の有無で経路検索と Google 検索を切り替える', () => {
  // itinerary.ts の isMoveBooking() が説明する通り、AI 取り込みは手段未定の移動を
  // kind: 'other' に分類する。from/to が揃っているなら、それは種別が未確定な
  // だけの移動なので、鉄道・バス等と同じ経路検索が一番効く。
  it('from / to が揃っていれば Rome2Rio と Google マップの経路検索を返す', () => {
    const b = booking({
      id: 'other-move',
      kind: 'other',
      title: '手段未定の移動',
      start: at('2026-06-16', '10:00', PARIS),
      from: { name: 'パリ' },
      to: { name: 'アムステルダム' },
    })
    const links = bookingSearchLinks(b)
    expect(labels(links)).toEqual(['Rome2Rio', 'Google マップ(経路)'])
  })

  it('from / to のどちらかが欠けていれば Google 検索にフォールバックする', () => {
    const b = booking({
      id: 'other-place',
      kind: 'other',
      title: '現地集合の予定',
      start: at('2026-06-16', '10:00', PARIS),
      place: { name: 'パリ' },
    })
    const links = bookingSearchLinks(b)
    expect(labels(links)).toEqual(['Google 検索'])
    expect(new URL(links[0].url).searchParams.get('q')).toBe(
      '現地集合の予定 パリ',
    )
  })
})
