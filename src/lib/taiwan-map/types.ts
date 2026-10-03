/**
 * かんちゅの台湾マップのドメイン型と表示ラベル。
 *
 * scripts/build-taiwan-map-data.ts（Node の型ストリッピングで直接実行）からも
 * import するため、DOM や Vite 固有の依存を持たない純 TS に保つ。enum や
 * パラメータプロパティのような「型を消すだけでは JS にならない構文」も使わない。
 *
 * 都市・カテゴリ・ラベルを as const の配列で持っているのは、
 * 1) 並び順（表示順・manifest の出力順）をここ 1 箇所で決める
 * 2) そこから union 型を導出して、JSON 側の typo を型とバリデータの両方で弾く
 * の 2 つを同じ定義で済ませるため。
 */

export const CITIES = [
  {
    id: 'taipei',
    name: '台北',
    nameZh: '臺北',
    center: { lat: 25.0478, lng: 121.5319 },
    zoom: 12,
  },
  {
    id: 'tainan',
    name: '台南',
    nameZh: '臺南',
    center: { lat: 22.9971, lng: 120.2026 },
    zoom: 13,
  },
  {
    id: 'kaohsiung',
    name: '高雄',
    nameZh: '高雄',
    center: { lat: 22.6273, lng: 120.3014 },
    zoom: 12,
  },
  {
    id: 'taichung',
    name: '台中',
    nameZh: '臺中',
    center: { lat: 24.1477, lng: 120.6736 },
    zoom: 12,
  },
  {
    // 4 都市以外（九份・花蓮など）はまとめてここ。都市単位で分けるほど
    // 件数が無い場所のために都市を増やすと、トップの「都市から探す」が
    // 1〜2 件のボタンで埋まって探しにくくなる。
    id: 'other',
    name: 'その他',
    nameZh: '其他',
    center: { lat: 23.7, lng: 120.96 },
    zoom: 7,
  },
] as const

export type CityId = (typeof CITIES)[number]['id']
export type CityDef = (typeof CITIES)[number]

export const CITY_IDS: ReadonlyArray<CityId> = CITIES.map((c) => c.id)

export function getCity(id: CityId): CityDef {
  // CITY_IDS から来た値しか渡らない前提なので必ず見つかる
  return CITIES.find((c) => c.id === id)!
}

export const SPOT_CATEGORIES = [
  { id: 'food', name: '食べる' },
  { id: 'drink', name: '飲む' },
  { id: 'shopping', name: '買う' },
  { id: 'culture', name: '見る・文化' },
  { id: 'music', name: '音楽' },
  { id: 'stay', name: '泊まる' },
  { id: 'outdoor', name: '街・屋外' },
  { id: 'other', name: 'その他' },
] as const

export type SpotCategory = (typeof SPOT_CATEGORIES)[number]['id']

export const SPOT_CATEGORY_IDS: ReadonlyArray<SpotCategory> =
  SPOT_CATEGORIES.map((c) => c.id)

export const VISIT_STATUSES = [
  { id: 'visited', name: '行った' },
  // 「気になる」を「おすすめ」と取り違えられないよう、ラベルに
  // 未訪問であることを必ず含める
  { id: 'want_to_go', name: '未訪問・気になる' },
] as const

export type VisitStatus = (typeof VISIT_STATUSES)[number]['id']

export const VISIT_STATUS_IDS: ReadonlyArray<VisitStatus> = VISIT_STATUSES.map(
  (s) => s.id,
)

/**
 * 星やランキングの代わりに付ける「かんちゅの気持ち」ラベル。
 * 点数にすると他人のレビューサイトと同じ土俵で比べられてしまうので、
 * 序列の無い 3 種類の記号にしている（どれが上ということはない）。
 */
export const SPOT_LABELS = [
  { id: 'favorite', mark: '♥', name: '特に好き' },
  { id: 'recommend', mark: '○', name: '人に勧めたい' },
  { id: 'interesting', mark: '◇', name: '面白かった' },
] as const

export type SpotLabel = (typeof SPOT_LABELS)[number]['id']

export const SPOT_LABEL_IDS: ReadonlyArray<SpotLabel> = SPOT_LABELS.map(
  (l) => l.id,
)

export type AreaId = string
export type SpotId = string

export type LatLng = { lat: number; lng: number }

export type TaiwanArea = {
  id: AreaId
  city: CityId
  name: string
  nameZh?: string
  summary: string
  note?: string
  center?: LatLng
}

export type TaiwanSpot = {
  id: SpotId
  name: string
  nameZh?: string
  city: CityId
  area?: AreaId
  location: LatLng
  categories: Array<SpotCategory>
  tags?: Array<string>
  status: VisitStatus
  labels?: Array<SpotLabel>
  /** カードに常に出す一言コメント。このマップの主役 */
  summary: string
  note?: string
  /** "YYYY-MM"（日まで覚えていれば "YYYY-MM-DD" も可） */
  visitedAt?: string
  /** 食べたもの・飲んだもの */
  tried?: Array<string>
  googleMapsUrl?: string
  officialUrl?: string
}

// ---------------------------------------------------------------------------
// 生成物（public/data/taiwan/*.json）の形
// ---------------------------------------------------------------------------

/**
 * トップページ用の目次。トップはこれ 1 本だけを読む。
 * 件数 0 の都市・カテゴリは載せない（押しても何も出ないボタンを作らないため）。
 */
export type TaiwanManifest = {
  cities: Array<{ id: CityId; name: string; count: number }>
  categories: Array<{ id: SpotCategory; count: number }>
}

/**
 * 都市を指定せずに絞り込んだとき「どの都市の JSON を読めばいいか」を
 * 決めるための軽量インデックス。summary / note / tried のような長文は
 * 入れない（件数が増えても全都市ぶんの本文を読まずに済ませるのが目的）。
 */
export type SpotIndexEntry = {
  id: SpotId
  name: string
  nameZh?: string
  city: CityId
  area?: AreaId
  lat: number
  lng: number
  categories: Array<SpotCategory>
  status: VisitStatus
  labels?: Array<SpotLabel>
}

export type CityData = {
  city: CityId
  areas: Array<TaiwanArea>
  spots: Array<TaiwanSpot>
}
