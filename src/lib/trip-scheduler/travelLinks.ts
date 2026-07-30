/**
 * 区間ごとの「実際に探す」外部リンク生成。
 *
 * API 連携はせず、区間・日付をプリセットした検索 URL を組み立てるだけの純関数群。
 * 実際の所要時間・運賃は各サイトの検索結果に従う(このツールの見積もりは目安)。
 */

import { isValidISODate } from './dates'
import type { City } from './types'

/** 'YYYY-MM-DD' → 'YYMMDD'(Skyscanner のパス形式) */
function toYYMMDD(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y.slice(2)}${m}${d}`
}

/**
 * Skyscanner の片道フライト検索。
 * どちらかの都市に IATA コードがない(空港がない)場合、または日付が不正な場合は null。
 */
export function skyscannerUrl(
  from: City,
  to: City,
  dateISO: string,
): string | null {
  if (!from.iata || !to.iata) return null
  if (!isValidISODate(dateISO)) return null
  const origin = from.iata.toLowerCase()
  const destination = to.iata.toLowerCase()
  return `https://www.skyscanner.jp/transport/flights/${origin}/${destination}/${toYYMMDD(dateISO)}/`
}

/** Rome2Rio の区間比較(鉄道・バス・飛行機をまとめて比較できる) */
export function rome2rioUrl(from: City, to: City): string {
  const origin = encodeURIComponent(from.enName)
  const destination = encodeURIComponent(to.enName)
  return `https://www.rome2rio.com/map/${origin}/${destination}`
}

/** Google マップの公共交通機関ルート検索 */
export function googleMapsTransitUrl(from: City, to: City): string {
  const params = new URLSearchParams({
    api: '1',
    origin: from.enName,
    destination: to.enName,
    travelmode: 'transit',
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
