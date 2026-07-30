import type { City } from './types'

/**
 * ヨーロッパ主要都市カタログ。
 * 座標は移動時間の概算(大圏距離)に使う。
 */
export const cityCatalog: Array<City> = [
  // フランス
  { id: 'paris', name: 'パリ', country: 'フランス', lat: 48.8566, lng: 2.3522 },
  { id: 'nice', name: 'ニース', country: 'フランス', lat: 43.7102, lng: 7.262 },
  { id: 'lyon', name: 'リヨン', country: 'フランス', lat: 45.764, lng: 4.8357 },
  {
    id: 'marseille',
    name: 'マルセイユ',
    country: 'フランス',
    lat: 43.2965,
    lng: 5.3698,
  },
  {
    id: 'strasbourg',
    name: 'ストラスブール',
    country: 'フランス',
    lat: 48.5734,
    lng: 7.7521,
  },
  // イギリス・アイルランド
  {
    id: 'london',
    name: 'ロンドン',
    country: 'イギリス',
    lat: 51.5074,
    lng: -0.1278,
  },
  {
    id: 'edinburgh',
    name: 'エディンバラ',
    country: 'イギリス',
    lat: 55.9533,
    lng: -3.1883,
  },
  {
    id: 'dublin',
    name: 'ダブリン',
    country: 'アイルランド',
    lat: 53.3498,
    lng: -6.2603,
  },
  // イタリア
  { id: 'rome', name: 'ローマ', country: 'イタリア', lat: 41.9028, lng: 12.4964 },
  {
    id: 'florence',
    name: 'フィレンツェ',
    country: 'イタリア',
    lat: 43.7696,
    lng: 11.2558,
  },
  {
    id: 'venice',
    name: 'ヴェネツィア',
    country: 'イタリア',
    lat: 45.4408,
    lng: 12.3155,
  },
  { id: 'milan', name: 'ミラノ', country: 'イタリア', lat: 45.4642, lng: 9.19 },
  { id: 'naples', name: 'ナポリ', country: 'イタリア', lat: 40.8518, lng: 14.2681 },
  // スペイン・ポルトガル
  {
    id: 'barcelona',
    name: 'バルセロナ',
    country: 'スペイン',
    lat: 41.3874,
    lng: 2.1686,
  },
  {
    id: 'madrid',
    name: 'マドリード',
    country: 'スペイン',
    lat: 40.4168,
    lng: -3.7038,
  },
  {
    id: 'seville',
    name: 'セビリア',
    country: 'スペイン',
    lat: 37.3891,
    lng: -5.9845,
  },
  {
    id: 'granada',
    name: 'グラナダ',
    country: 'スペイン',
    lat: 37.1773,
    lng: -3.5986,
  },
  {
    id: 'lisbon',
    name: 'リスボン',
    country: 'ポルトガル',
    lat: 38.7223,
    lng: -9.1393,
  },
  { id: 'porto', name: 'ポルト', country: 'ポルトガル', lat: 41.1579, lng: -8.6291 },
  // ベネルクス
  {
    id: 'amsterdam',
    name: 'アムステルダム',
    country: 'オランダ',
    lat: 52.3676,
    lng: 4.9041,
  },
  {
    id: 'brussels',
    name: 'ブリュッセル',
    country: 'ベルギー',
    lat: 50.8503,
    lng: 4.3517,
  },
  {
    id: 'bruges',
    name: 'ブルージュ',
    country: 'ベルギー',
    lat: 51.2093,
    lng: 3.2247,
  },
  // ドイツ
  { id: 'berlin', name: 'ベルリン', country: 'ドイツ', lat: 52.52, lng: 13.405 },
  {
    id: 'munich',
    name: 'ミュンヘン',
    country: 'ドイツ',
    lat: 48.1351,
    lng: 11.582,
  },
  {
    id: 'frankfurt',
    name: 'フランクフルト',
    country: 'ドイツ',
    lat: 50.1109,
    lng: 8.6821,
  },
  { id: 'cologne', name: 'ケルン', country: 'ドイツ', lat: 50.9375, lng: 6.9603 },
  // 中欧
  {
    id: 'vienna',
    name: 'ウィーン',
    country: 'オーストリア',
    lat: 48.2082,
    lng: 16.3738,
  },
  {
    id: 'salzburg',
    name: 'ザルツブルク',
    country: 'オーストリア',
    lat: 47.8095,
    lng: 13.055,
  },
  {
    id: 'hallstatt',
    name: 'ハルシュタット',
    country: 'オーストリア',
    lat: 47.5622,
    lng: 13.6493,
  },
  { id: 'prague', name: 'プラハ', country: 'チェコ', lat: 50.0755, lng: 14.4378 },
  {
    id: 'budapest',
    name: 'ブダペスト',
    country: 'ハンガリー',
    lat: 47.4979,
    lng: 19.0402,
  },
  {
    id: 'krakow',
    name: 'クラクフ',
    country: 'ポーランド',
    lat: 50.0647,
    lng: 19.945,
  },
  // スイス
  {
    id: 'zurich',
    name: 'チューリッヒ',
    country: 'スイス',
    lat: 47.3769,
    lng: 8.5417,
  },
  {
    id: 'geneva',
    name: 'ジュネーブ',
    country: 'スイス',
    lat: 46.2044,
    lng: 6.1432,
  },
  {
    id: 'interlaken',
    name: 'インターラーケン',
    country: 'スイス',
    lat: 46.6863,
    lng: 7.8632,
  },
  {
    id: 'lucerne',
    name: 'ルツェルン',
    country: 'スイス',
    lat: 47.0502,
    lng: 8.3093,
  },
  // 北欧
  {
    id: 'copenhagen',
    name: 'コペンハーゲン',
    country: 'デンマーク',
    lat: 55.6761,
    lng: 12.5683,
  },
  {
    id: 'stockholm',
    name: 'ストックホルム',
    country: 'スウェーデン',
    lat: 59.3293,
    lng: 18.0686,
  },
  { id: 'oslo', name: 'オスロ', country: 'ノルウェー', lat: 59.9139, lng: 10.7522 },
  {
    id: 'helsinki',
    name: 'ヘルシンキ',
    country: 'フィンランド',
    lat: 60.1699,
    lng: 24.9384,
  },
  // 南東欧・その他
  { id: 'athens', name: 'アテネ', country: 'ギリシャ', lat: 37.9838, lng: 23.7275 },
  {
    id: 'santorini',
    name: 'サントリーニ',
    country: 'ギリシャ',
    lat: 36.3932,
    lng: 25.4615,
  },
  {
    id: 'dubrovnik',
    name: 'ドゥブロヴニク',
    country: 'クロアチア',
    lat: 42.6507,
    lng: 18.0944,
  },
  {
    id: 'ljubljana',
    name: 'リュブリャナ',
    country: 'スロベニア',
    lat: 46.0569,
    lng: 14.5058,
  },
]

const cityMap = new Map(cityCatalog.map((city) => [city.id, city]))

export function getCity(cityId: string): City | undefined {
  return cityMap.get(cityId)
}

export function cityName(cityId: string): string {
  return cityMap.get(cityId)?.name ?? cityId
}
