/**
 * タイムテーブルを URL 1 本で共有する層。
 *
 * 旅のしおり(trip-notes/share.ts)と同じ考え方:
 * - サーバには何も保存しない。全状態を URL のフラグメント(#tt=...)に詰める。
 *   フラグメントは HTTP リクエストに乗らないので、誰が何を見に行くかが
 *   サーバのログに残らない。
 * - フィールド名が payload の大半を占めないよう 1 文字の短縮キーにしてから
 *   deflate-raw で圧縮し、base64url にする。
 * - kind のような列挙値は短縮しない。同じ文字列の繰り返しは deflate がよく縮めるうえ、
 *   数値にすると将来の並び替えで既存URLの意味が静かに変わる。
 * - id は「受け取った側が同じ規則で作り直せる」ものは載せない。
 *   出演の id は中身のハッシュ(id.ts)なので、作り直せば同じ値になる。
 *   作り直して一致しないもの(AI が付けた id・衝突回避の -2)だけを載せる。
 *   お気に入りは同じ payload 内の出演の添字で持つ(id より短い)。
 *
 * ## payload のフォーマット
 *
 * 先頭 1 文字がマーカー。
 *
 *   '1' = 短縮キー v1 + deflate-raw(fflate) + base64url  ← 既定
 *
 * 形式を変えるときはマーカーを増やし、**発行済みの '1' のデコード経路は消さない**。
 * 共有URLは回収できないので、読めなくなると受け取った人のデータが失われる。
 * 未知のマーカーや壊れた入力は例外を投げず null を返す。
 *
 * CompressionStream ではなく fflate を使うのは、同期で書けて
 * テスト環境と Safari の古い版の差を気にしなくてよいから(依存は既にある)。
 */

import { deflateSync, inflateSync } from 'fflate'
import { hashId, stableActId } from './id'
import { normalizeTimetable } from './normalize'
import { DEFAULT_TIMEZONE } from './types'
import type { ActKind, TimetableDoc } from './types'

export const SHARE_PARAM = 'tt'
const MARKER_V1 = '1'

interface ShortDay {
  a: string
  i?: string
  l?: string
}

interface ShortVenue {
  n: string
  i?: string
  g?: string
  o?: string
  m?: string
}

interface ShortAct {
  /** 日付の添字 */
  d: number
  /** 会場の添字 */
  v: number
  s: string
  e?: string
  t: string
  b?: string
  k?: ActKind
  n?: string
  l?: string
  i?: string
}

interface ShortFavorites {
  /** 共有した人の名前 */
  n?: string
  /** 出演の添字 */
  a: Array<number>
}

interface ShortDocV1 {
  t: string
  z?: string
  u?: string
  d: Array<ShortDay>
  v: Array<ShortVenue>
  a: Array<ShortAct>
  /** [from 添字, to 添字, 分] */
  r?: Array<[number, number, number]>
  f?: ShortFavorites
}

export interface SharedFavorites {
  name?: string
  actIds: Array<string>
}

export interface SharedTimetable {
  doc: TimetableDoc
  favorites?: SharedFavorites
}

function toShort(
  doc: TimetableDoc,
  favorites: SharedFavorites | undefined,
): ShortDocV1 {
  const dayIndex = new Map(doc.days.map((day, i) => [day.id, i]))
  const venueIndex = new Map(doc.venues.map((venue, i) => [venue.id, i]))
  const dayDate = new Map(doc.days.map((day) => [day.id, day.date]))
  const venueName = new Map(doc.venues.map((venue) => [venue.id, venue.name]))
  const actIndex = new Map(doc.acts.map((act, i) => [act.id, i]))

  const favIdx =
    favorites === undefined
      ? undefined
      : favorites.actIds
          .map((id) => actIndex.get(id))
          .filter((i): i is number => i !== undefined)
          .toSorted((x, y) => x - y)

  return {
    t: doc.title,
    ...(doc.timezone !== DEFAULT_TIMEZONE ? { z: doc.timezone } : {}),
    ...(doc.sourceUrl ? { u: doc.sourceUrl } : {}),
    d: doc.days.map((day) => ({
      a: day.date,
      ...(day.id !== day.date ? { i: day.id } : {}),
      ...(day.label ? { l: day.label } : {}),
    })),
    v: doc.venues.map((venue) => ({
      n: venue.name,
      ...(venue.id !== hashId('v', [venue.name]) ? { i: venue.id } : {}),
      ...(venue.group ? { g: venue.group } : {}),
      ...(venue.note ? { o: venue.note } : {}),
      ...(venue.mapUrl ? { m: venue.mapUrl } : {}),
    })),
    a: doc.acts.map((act) => {
      const generated = stableActId(
        dayDate.get(act.dayId) ?? '',
        venueName.get(act.venueId) ?? '',
        act.start,
        act.title,
      )
      return {
        d: dayIndex.get(act.dayId) ?? 0,
        v: venueIndex.get(act.venueId) ?? 0,
        s: act.start,
        ...(act.end ? { e: act.end } : {}),
        t: act.title,
        ...(act.subtitle ? { b: act.subtitle } : {}),
        ...(act.kind ? { k: act.kind } : {}),
        ...(act.note ? { n: act.note } : {}),
        ...(act.url ? { l: act.url } : {}),
        ...(act.id !== generated ? { i: act.id } : {}),
      }
    }),
    ...(doc.travel && doc.travel.length > 0
      ? {
          r: doc.travel.map((t): [number, number, number] => [
            venueIndex.get(t.from) ?? 0,
            venueIndex.get(t.to) ?? 0,
            t.minutes,
          ]),
        }
      : {}),
    ...(favIdx !== undefined
      ? {
          f: {
            ...(favorites?.name ? { n: favorites.name } : {}),
            a: favIdx,
          },
        }
      : {}),
  }
}

/**
 * 短縮形式から、normalizeTimetable に渡す生の形に戻す。
 * 値の検証はここではせず normalizeTimetable に任せる(規則を 2 か所に書かない)。
 */
/** 添字で引く。範囲外なら undefined(壊れた URL で添字がずれている場合) */
function at<T>(list: ReadonlyArray<T>, index: number): T | undefined {
  return index >= 0 && index < list.length ? list[index] : undefined
}

function isShortDoc(value: unknown): value is ShortDocV1 {
  if (typeof value !== 'object' || value === null) return false
  return (
    'a' in value &&
    'd' in value &&
    'v' in value &&
    'a' in value &&
    Array.isArray(value.a) &&
    Array.isArray(value.d) &&
    Array.isArray(value.v) &&
    't' in value &&
    typeof value.t === 'string'
  )
}

function fromShort(short: ShortDocV1): SharedTimetable | null {
  const days = short.d.map((d) => ({
    id: d.i ?? d.a,
    date: d.a,
    ...(d.l !== undefined ? { label: d.l } : {}),
  }))
  const venues = short.v.map((v) => ({
    id: v.i ?? hashId('v', [v.n]),
    name: v.n,
    ...(v.g !== undefined ? { group: v.g } : {}),
    ...(v.o !== undefined ? { note: v.o } : {}),
    ...(v.m !== undefined ? { mapUrl: v.m } : {}),
  }))
  const acts = short.a.map((a) => ({
    ...(a.i !== undefined ? { id: a.i } : {}),
    dayId: at(days, a.d)?.id,
    venueId: at(venues, a.v)?.id,
    start: a.s,
    ...(a.e !== undefined ? { end: a.e } : {}),
    title: a.t,
    ...(a.b !== undefined ? { subtitle: a.b } : {}),
    ...(a.k !== undefined ? { kind: a.k } : {}),
    ...(a.n !== undefined ? { note: a.n } : {}),
    ...(a.l !== undefined ? { url: a.l } : {}),
  }))
  const raw = {
    version: 1,
    title: short.t,
    timezone: short.z ?? DEFAULT_TIMEZONE,
    ...(short.u !== undefined ? { sourceUrl: short.u } : {}),
    days,
    venues,
    acts,
    ...(short.r !== undefined
      ? {
          travel: short.r.map(([from, to, minutes]) => ({
            from: at(venues, from)?.id,
            to: at(venues, to)?.id,
            minutes,
          })),
        }
      : {}),
  }
  const { doc, issues } = normalizeTimetable(raw)
  // 発行時点で正しかったものしか載らないので、エラーが出るのは壊れた URL
  if (doc === null || issues.some((issue) => issue.level === 'error')) {
    return null
  }
  if (doc.acts.length !== short.a.length) return null

  let favorites: SharedFavorites | undefined
  if (short.f !== undefined) {
    const actIds = short.f.a
      .map((i) => at(doc.acts, i)?.id)
      .filter((id): id is string => id !== undefined)
    favorites = {
      ...(typeof short.f.n === 'string' && short.f.n.length > 0
        ? { name: short.f.n }
        : {}),
      actIds,
    }
  }
  return { doc, ...(favorites ? { favorites } : {}) }
}

// --- base64url ---

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// --- 公開 API ---

export interface ShareBuildResult {
  url: string
  /** フラグメントに載せた文字列の長さ */
  length: number
  /** 圧縮後のバイト数 */
  byteLength: number
}

export function buildSharePayload(
  doc: TimetableDoc,
  favorites?: SharedFavorites,
): { payload: string; byteLength: number } {
  const json = JSON.stringify(toShort(doc, favorites))
  const compressed = deflateSync(new TextEncoder().encode(json), { level: 9 })
  return {
    payload: `${MARKER_V1}${bytesToBase64Url(compressed)}`,
    byteLength: compressed.length,
  }
}

export function buildShareUrl(
  doc: TimetableDoc,
  baseUrl: string,
  favorites?: SharedFavorites,
): ShareBuildResult {
  const { payload, byteLength } = buildSharePayload(doc, favorites)
  const hashIndex = baseUrl.indexOf('#')
  const base = hashIndex === -1 ? baseUrl : baseUrl.slice(0, hashIndex)
  return {
    url: `${base}#${SHARE_PARAM}=${payload}`,
    length: payload.length,
    byteLength,
  }
}

/** フラグメント(先頭の # は有っても無くてもよい)から復元する。壊れていれば null */
export function decodeShareHash(hash: string): SharedTimetable | null {
  try {
    const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash
    const payload = new URLSearchParams(withoutHash).get(SHARE_PARAM)
    if (payload === null || payload.length < 2) return null
    const marker = payload[0]
    if (marker === MARKER_V1) {
      const bytes = inflateSync(base64UrlToBytes(payload.slice(1)))
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
      return isShortDoc(parsed) ? fromShort(parsed) : null
    }
    return null
  } catch {
    return null
  }
}

export function hasShareHash(hash: string): boolean {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash
  return new URLSearchParams(withoutHash).has(SHARE_PARAM)
}
