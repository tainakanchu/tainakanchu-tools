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

/**
 * Google フライトの片道検索。
 * 日付をプリセットできるのは空路の検索サイトだけなので、Skyscanner と同じガードをかける。
 */
export function googleFlightsUrl(
  from: City,
  to: City,
  dateISO: string,
): string | null {
  if (!from.iata || !to.iata) return null
  if (!isValidISODate(dateISO)) return null
  const origin = from.iata.toUpperCase()
  const destination = to.iata.toUpperCase()
  const q = encodeURIComponent(
    `Flights from ${origin} to ${destination} on ${dateISO}`,
  )
  return `https://www.google.com/travel/flights?q=${q}&hl=ja&curr=JPY`
}

/** Kayak(日本語版)の片道フライト検索 */
export function kayakUrl(from: City, to: City, dateISO: string): string | null {
  if (!from.iata || !to.iata) return null
  if (!isValidISODate(dateISO)) return null
  const origin = from.iata.toUpperCase()
  const destination = to.iata.toUpperCase()
  return `https://www.kayak.co.jp/flights/${origin}-${destination}/${dateISO}`
}

/**
 * DB(ドイツ鉄道)国際版トップの接続検索フォームを、区間・移動日つきで開く。
 *
 * DB は公式には URL パラメータを案内していないが、トップページが
 * `#?KEY=VALUE` 形式のハッシュを読んで検索フォームを初期化する。
 * ヘッドレスブラウザでの実測(2026-07)で確認した仕様:
 *
 * - `SO` / `ZO`(出発地 / 目的地)は **駅名の文字列**。DB 側のあいまい検索で
 *   実際の駅に解決される(例: `SO=Munich` → 「MUNICH (MÜNCHEN)」)。
 *   `SOID` / `SOEI`(HAFAS の駅 ID)を渡しても**無視される**ため使わない。
 * - `HD` は `YYYY-MM-DDTHH:mm:ss`。コロンは非エンコードのまま渡す必要がある。
 * - `HZA=D` は「その時刻以降の出発」を指定する。
 * - キーは**大文字必須**(小文字だと丸ごと無視される)。
 * - ハッシュ先頭の `?` も必須(`#SO=...` だと効かない)。
 *
 * 開いた先は「出発地・目的地・日付が入った状態の検索フォーム」で、
 * 検索ボタンを押すのは利用者。結果ページ (/buchung/fahrplan/suche) 側の
 * ディープリンクは同じパラメータを渡しても効かないことを確認済み。
 *
 * 鉄道駅が確認できていない都市(dbStation が null)や日付が不正な場合は null。
 */
export function dbTimetableUrl(
  from: City,
  to: City,
  dateISO: string,
  /** 「この時刻以降の出発」。夜行列車の区間だけ夕方にずらす想定 */
  timeHHMM = '09:00',
): string | null {
  if (!from.dbStation || !to.dbStation) return null
  if (!isValidISODate(dateISO)) return null
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeHHMM)) return null
  // HD のコロンはエンコードすると効かないので、キーごとに手で組み立てる。
  const hash = [
    `SO=${encodeURIComponent(from.dbStation)}`,
    `ZO=${encodeURIComponent(to.dbStation)}`,
    `HD=${dateISO}T${timeHHMM}:00`,
    'HZA=D',
  ].join('&')
  return `https://int.bahn.de/en#?${hash}`
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
