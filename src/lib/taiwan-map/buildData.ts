/**
 * 正本データ（src/data/taiwan/*.json）から配信用 JSON を組み立てる純関数。
 * ファイル I/O は scripts/build-taiwan-map-data.ts 側に置き、ここはテストできる
 * 変換だけにしている。
 *
 * 出力は入力が同じなら毎回バイト単位で同じになるようにする（生成日時や
 * バージョン番号を入れない、並び順を CITIES / SPOT_CATEGORIES と
 * ファイル内の順序で固定する）。中身が変わっていないのに JSON が変わると、
 * CDN やサービスワーカーのキャッシュが無駄に入れ替わるため。
 */

import { CITIES, SPOT_CATEGORIES } from './types.ts'
import type { TaiwanDataSource } from './schema.ts'
import type {
  CityData,
  SpotIndexEntry,
  TaiwanManifest,
  TaiwanSpot,
} from './types.ts'

export type BuiltTaiwanMapData = {
  manifest: TaiwanManifest
  spotIndex: Array<SpotIndexEntry>
  /** CITIES の順。スポット 0 件の都市も含める（URL 直打ちで 404 にしないため） */
  cities: Array<CityData>
}

export function toSpotIndexEntry(spot: TaiwanSpot): SpotIndexEntry {
  // 省略可能な項目は、値があるときだけキーを作る（undefined のキーを
  // JSON に残さない & キー順を固定する）
  const entry: SpotIndexEntry = {
    id: spot.id,
    name: spot.name,
    ...(spot.nameZh !== undefined && { nameZh: spot.nameZh }),
    city: spot.city,
    ...(spot.area !== undefined && { area: spot.area }),
    lat: spot.location.lat,
    lng: spot.location.lng,
    categories: spot.categories,
    status: spot.status,
    ...(spot.labels !== undefined &&
      spot.labels.length > 0 && { labels: spot.labels }),
  }
  return entry
}

export function buildTaiwanMapData(
  source: TaiwanDataSource,
): BuiltTaiwanMapData {
  const cities: Array<CityData> = CITIES.map((city) => ({
    city: city.id,
    areas: source.areas.filter((area) => area.city === city.id),
    spots: source.cityFiles[city.id] ?? [],
  }))

  const allSpots = cities.flatMap((c) => c.spots)

  const manifest: TaiwanManifest = {
    cities: cities
      .filter((c) => c.spots.length > 0)
      .map((c) => ({
        id: c.city,
        name: CITIES.find((def) => def.id === c.city)!.name,
        count: c.spots.length,
      })),
    categories: SPOT_CATEGORIES.map((cat) => ({
      id: cat.id,
      count: allSpots.filter((s) => s.categories.includes(cat.id)).length,
    })).filter((c) => c.count > 0),
  }

  return {
    manifest,
    spotIndex: allSpots.map(toSpotIndexEntry),
    cities,
  }
}

/** 生成物の JSON 文字列化。末尾改行つき・インデントなし（配信サイズ優先） */
export function serializeGenerated(data: unknown): string {
  return `${JSON.stringify(data)}\n`
}
