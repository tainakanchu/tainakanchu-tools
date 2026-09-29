/**
 * src/data/taiwan/*.json の手書きバリデータ。
 *
 * zod などを入れずに手で書いているのは、検証したい規則の多くが
 * 「ファイルをまたいだ整合性」（id の重複、spot.area がその都市のエリアか、
 * ファイル名と spot.city の一致など）で、スキーマライブラリの得意分野の外に
 * あるから。型の形だけのために依存を 1 つ増やすほどの量でもない。
 *
 * エラーは「データとして壊れている」もの（ビルドを止める）、警告は
 * 「壊れてはいないが書き忘れっぽい」もの（ビルドは止めない）に分ける。
 * 訪問時期の書き忘れまでエラーにすると、コメントだけ先に足したいときに
 * いちいち日付を思い出すまで公開できなくなるため。
 */

import {
  CITY_IDS,
  SPOT_CATEGORY_IDS,
  SPOT_LABEL_IDS,
  VISIT_STATUS_IDS,
} from './types.ts'
import type { CityId, TaiwanArea, TaiwanSpot } from './types.ts'

export type ValidationIssue = {
  /** 例: "taipei.json[2].location.lat" */
  path: string
  message: string
}

export type ValidationResult = {
  errors: Array<ValidationIssue>
  warnings: Array<ValidationIssue>
}

export type RawTaiwanData = {
  /** areas.json の中身（未検証） */
  areas: unknown
  /** ファイル名から拡張子を除いたもの → 中身（未検証）。例: { taipei: [...] } */
  cityFiles: Record<string, unknown>
}

/** 検証済みデータ。validateTaiwanData でエラー 0 件のときだけこの形とみなせる */
export type TaiwanDataSource = {
  areas: Array<TaiwanArea>
  cityFiles: Partial<Record<CityId, Array<TaiwanSpot>>>
}

/**
 * 台湾本島＋離島（金門・馬祖は含めない）をざっくり囲む範囲。
 * 緯度経度の取り違え（lat/lng の入れ替え）や符号ミスを拾うのが目的なので、
 * 厳密な国境である必要はない。
 */
export const TAIWAN_BBOX = {
  minLat: 21.5,
  maxLat: 26.5,
  minLng: 118,
  maxLng: 122.5,
} as const

/** URL に載る id なので、エンコード不要な kebab-case に限る */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VISITED_AT = /^\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/
const HTTP_URL = /^https?:\/\/\S+$/

const REQUIRED_SPOT_FIELDS = [
  'id',
  'name',
  'city',
  'location',
  'categories',
  'status',
  'summary',
] as const

const REQUIRED_AREA_FIELDS = ['id', 'city', 'name', 'summary'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function includes<T extends string>(
  list: ReadonlyArray<T>,
  value: unknown,
): value is T {
  return (
    typeof value === 'string' && (list as ReadonlyArray<string>).includes(value)
  )
}

export function validateTaiwanData(input: RawTaiwanData): ValidationResult {
  const errors: Array<ValidationIssue> = []
  const warnings: Array<ValidationIssue> = []
  const error = (path: string, message: string) =>
    errors.push({ path, message })
  const warn = (path: string, message: string) =>
    warnings.push({ path, message })

  // ---- areas.json ---------------------------------------------------------
  /** area id → 所属都市。spot.area の検証に使う */
  const areaCity = new Map<string, string>()

  if (!Array.isArray(input.areas)) {
    error('areas.json', '配列である必要があります')
  } else {
    input.areas.forEach((area: unknown, i) => {
      const path = `areas.json[${i}]`
      if (!isRecord(area)) {
        error(path, 'オブジェクトである必要があります')
        return
      }
      for (const field of REQUIRED_AREA_FIELDS) {
        if (!isNonEmptyString(area[field])) {
          error(`${path}.${field}`, '必須項目です（空文字不可）')
        }
      }
      if (isNonEmptyString(area.id)) {
        if (!KEBAB_CASE.test(area.id)) {
          error(`${path}.id`, `id は kebab-case にしてください: "${area.id}"`)
        }
        if (areaCity.has(area.id)) {
          error(`${path}.id`, `エリア id が重複しています: "${area.id}"`)
        }
      }
      if (area.city !== undefined && !includes(CITY_IDS, area.city)) {
        error(`${path}.city`, `未知の都市です: ${JSON.stringify(area.city)}`)
      }
      if (area.center !== undefined) {
        validateLatLng(area.center, `${path}.center`, error)
      }
      if (isNonEmptyString(area.id) && !areaCity.has(area.id)) {
        areaCity.set(area.id, String(area.city))
      }
    })
  }

  // ---- <city>.json --------------------------------------------------------
  /** spot id → 最初に出てきた場所。重複エラーに両方の位置を出すため */
  const seenSpotIds = new Map<string, string>()
  /** googleMapsUrl → 最初に出てきた spot のパス */
  const seenMapsUrls = new Map<string, string>()

  for (const [fileCity, spots] of Object.entries(input.cityFiles)) {
    const file = `${fileCity}.json`
    if (!includes(CITY_IDS, fileCity)) {
      error(file, `未知の都市ファイルです（${CITY_IDS.join(' / ')} のみ）`)
      continue
    }
    if (!Array.isArray(spots)) {
      error(file, '配列である必要があります（空でも [] を置く）')
      continue
    }

    spots.forEach((spot: unknown, i) => {
      const path = `${file}[${i}]`
      if (!isRecord(spot)) {
        error(path, 'オブジェクトである必要があります')
        return
      }
      const label = isNonEmptyString(spot.id) ? `${path}(${spot.id})` : path

      for (const field of REQUIRED_SPOT_FIELDS) {
        if (spot[field] === undefined || spot[field] === null) {
          error(`${label}.${field}`, '必須項目です')
        }
      }
      for (const field of ['id', 'name', 'summary'] as const) {
        if (spot[field] !== undefined && !isNonEmptyString(spot[field])) {
          error(`${label}.${field}`, '空でない文字列である必要があります')
        }
      }

      if (isNonEmptyString(spot.id)) {
        if (!KEBAB_CASE.test(spot.id)) {
          error(`${label}.id`, `id は kebab-case にしてください: "${spot.id}"`)
        }
        const first = seenSpotIds.get(spot.id)
        if (first !== undefined) {
          error(
            `${label}.id`,
            `スポット id が重複しています（${first} と同じ）`,
          )
        } else {
          seenSpotIds.set(spot.id, path)
        }
      }

      if (spot.city !== undefined) {
        if (!includes(CITY_IDS, spot.city)) {
          error(`${label}.city`, `未知の都市です: ${JSON.stringify(spot.city)}`)
        } else if (spot.city !== fileCity) {
          error(
            `${label}.city`,
            `"${spot.city}" のスポットが ${file} に入っています（${spot.city}.json へ移してください）`,
          )
        }
      }

      if (spot.area !== undefined) {
        const areaId = spot.area
        const owner =
          typeof areaId === 'string' ? areaCity.get(areaId) : undefined
        if (typeof areaId !== 'string' || owner === undefined) {
          error(
            `${label}.area`,
            `areas.json に無いエリアです: ${JSON.stringify(spot.area)}`,
          )
        } else if (owner !== spot.city) {
          error(
            `${label}.area`,
            `エリア "${areaId}" は ${owner} のエリアです（spot.city は ${String(spot.city)}）`,
          )
        }
      }

      if (spot.location !== undefined) {
        validateLatLng(spot.location, `${label}.location`, error)
      }

      if (spot.categories !== undefined) {
        if (!Array.isArray(spot.categories)) {
          error(`${label}.categories`, '配列である必要があります')
        } else if (spot.categories.length === 0) {
          error(`${label}.categories`, 'カテゴリを 1 つ以上指定してください')
        } else {
          spot.categories.forEach((c: unknown, j) => {
            if (!includes(SPOT_CATEGORY_IDS, c)) {
              error(
                `${label}.categories[${j}]`,
                `未知のカテゴリです: ${JSON.stringify(c)}`,
              )
            }
          })
        }
      }

      if (spot.labels !== undefined) {
        if (!Array.isArray(spot.labels)) {
          error(`${label}.labels`, '配列である必要があります')
        } else {
          spot.labels.forEach((l: unknown, j) => {
            if (!includes(SPOT_LABEL_IDS, l)) {
              error(
                `${label}.labels[${j}]`,
                `未知のラベルです: ${JSON.stringify(l)}`,
              )
            }
          })
        }
      }

      if (
        spot.status !== undefined &&
        !includes(VISIT_STATUS_IDS, spot.status)
      ) {
        error(
          `${label}.status`,
          `未知のステータスです: ${JSON.stringify(spot.status)}`,
        )
      }

      if (spot.visitedAt !== undefined) {
        if (spot.status === 'want_to_go') {
          // 行っていない場所に訪問日があると、カードに「訪問：…」が出て
          // 行ったことがあるように読めてしまう
          error(
            `${label}.visitedAt`,
            'want_to_go のスポットに visitedAt は書けません',
          )
        } else if (
          typeof spot.visitedAt !== 'string' ||
          !VISITED_AT.test(spot.visitedAt)
        ) {
          error(
            `${label}.visitedAt`,
            `"YYYY-MM" または "YYYY-MM-DD" で書いてください: ${JSON.stringify(spot.visitedAt)}`,
          )
        }
      } else if (spot.status === 'visited') {
        warn(
          `${label}.visitedAt`,
          '訪問済みですが visitedAt（YYYY-MM）が未記入です',
        )
      }

      for (const field of ['tags', 'tried'] as const) {
        const value = spot[field]
        if (value === undefined) continue
        if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
          error(`${label}.${field}`, '空でない文字列の配列である必要があります')
        }
      }

      for (const field of ['nameZh', 'note'] as const) {
        if (spot[field] !== undefined && typeof spot[field] !== 'string') {
          error(`${label}.${field}`, '文字列である必要があります')
        }
      }

      for (const field of ['googleMapsUrl', 'officialUrl'] as const) {
        const value = spot[field]
        if (value === undefined) continue
        if (typeof value !== 'string' || !HTTP_URL.test(value)) {
          error(
            `${label}.${field}`,
            'http(s):// で始まる URL である必要があります',
          )
        }
      }

      if (typeof spot.googleMapsUrl === 'string') {
        const first = seenMapsUrls.get(spot.googleMapsUrl)
        if (first !== undefined) {
          // 別の店に同じリンクを貼り間違えたケースを拾う。支店違いなどで
          // 本当に同じになることもあり得るので警告止まり
          warn(`${label}.googleMapsUrl`, `${first} と同じ Google Maps URL です`)
        } else {
          seenMapsUrls.set(spot.googleMapsUrl, label)
        }
      }
    })
  }

  return { errors, warnings }
}

function validateLatLng(
  value: unknown,
  path: string,
  error: (path: string, message: string) => void,
): void {
  if (!isRecord(value)) {
    error(path, '{ lat, lng } である必要があります')
    return
  }
  const { lat, lng } = value
  if (
    typeof lat !== 'number' ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90
  ) {
    error(`${path}.lat`, `緯度が不正です: ${JSON.stringify(lat)}`)
    return
  }
  if (
    typeof lng !== 'number' ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    error(`${path}.lng`, `経度が不正です: ${JSON.stringify(lng)}`)
    return
  }
  if (
    lat < TAIWAN_BBOX.minLat ||
    lat > TAIWAN_BBOX.maxLat ||
    lng < TAIWAN_BBOX.minLng ||
    lng > TAIWAN_BBOX.maxLng
  ) {
    error(
      path,
      `台湾の範囲外です（lat ${lat}, lng ${lng}）。緯度と経度を入れ替えていないか確認してください`,
    )
  }
}

/** エラー 0 件を確認したあとで、型付きのデータとして扱うための変換 */
export function asTaiwanDataSource(input: RawTaiwanData): TaiwanDataSource {
  return {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- validateTaiwanData がエラー 0 件を返したデータにだけ使う前提の検証済みキャスト
    areas: input.areas as Array<TaiwanArea>,
    // Record<string, unknown> は型上そのまま代入できてしまうが、中身が
    // TaiwanSpot の配列であることを保証しているのは上と同じく検証済みという前提
    cityFiles: input.cityFiles,
  }
}
