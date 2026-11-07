/**
 * 画面に出す導出値(並び・重なり・移動・いま何をやっているか)。
 * すべて TimetableDoc とお気に入りの集合から毎回計算し、保存はしない。
 */

import { normalizeKey } from './id'
import {
  daysBetween,
  formatHmShort,
  parseHm,
  toEpochMs,
  wallClock,
} from './time'
import type {
  TimetableAct,
  TimetableDay,
  TimetableDoc,
  TimetableVenue,
} from './types'

/** 終了時刻が書かれていないアクトを、重なり判定などで何分とみなすか */
export const ASSUMED_LENGTH = 30

/**
 * 移動時間が登録されていない別会場への移動で、空きがこれ未満なら「厳しい」とみなす。
 * サーキットフェスの会場間は徒歩 5〜10 分が多く、入場待ちも考えると 10 分は欲しい
 */
export const UNKNOWN_TRAVEL_TIGHT = 10

export interface ActSpan {
  start: number
  end: number
  /** false なら end は ASSUMED_LENGTH で補った値 */
  endKnown: boolean
}

export function actSpan(act: TimetableAct): ActSpan {
  const start = parseHm(act.start) ?? 0
  const end = act.end === undefined ? null : parseHm(act.end)
  if (end === null || end < start) {
    return { start, end: start + ASSUMED_LENGTH, endKnown: false }
  }
  return { start, end, endKnown: true }
}

export function actTimeText(act: TimetableAct): string {
  const span = actSpan(act)
  return span.endKnown
    ? `${formatHmShort(span.start)}〜${formatHmShort(span.end)}`
    : `${formatHmShort(span.start)}〜`
}

export function compareActs(a: TimetableAct, b: TimetableAct): number {
  const sa = actSpan(a)
  const sb = actSpan(b)
  return (
    sa.start - sb.start || sa.end - sb.end || a.title.localeCompare(b.title)
  )
}

export function actsOfDay(
  doc: TimetableDoc,
  dayId: string,
): Array<TimetableAct> {
  return doc.acts.filter((act) => act.dayId === dayId).toSorted(compareActs)
}

/** その日の最初の開始と最後の終了(分)。アクトが無ければ null */
export function dayRange(
  doc: TimetableDoc,
  dayId: string,
): { start: number; end: number } | null {
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  for (const act of doc.acts) {
    if (act.dayId !== dayId) continue
    const span = actSpan(act)
    start = Math.min(start, span.start)
    end = Math.max(end, span.end)
  }
  return Number.isFinite(start) ? { start, end } : null
}

/** 会場間の移動時間。同じ会場なら 0、登録が無ければ null */
export function travelMinutes(
  doc: TimetableDoc,
  fromVenueId: string,
  toVenueId: string,
): number | null {
  if (fromVenueId === toVenueId) return 0
  for (const entry of doc.travel ?? []) {
    if (
      (entry.from === fromVenueId && entry.to === toVenueId) ||
      (entry.from === toVenueId && entry.to === fromVenueId)
    ) {
      return entry.minutes
    }
  }
  return null
}

/** 出演名・補足の部分一致。全角半角・大文字小文字・空白の違いは無視する */
export function matchesQuery(act: TimetableAct, query: string): boolean {
  const q = normalizeKey(query)
  if (q.length === 0) return true
  return (
    normalizeKey(act.title).includes(q) ||
    (act.subtitle !== undefined && normalizeKey(act.subtitle).includes(q))
  )
}

// --- マイタイムテーブル ---

export type GapKind =
  /** 時間が重なっている */
  | 'overlap'
  /** 別会場への移動が必要で、空き時間が移動時間より短い */
  | 'tight'
  /** 別会場への移動が必要(間に合う、または移動時間が不明) */
  | 'move'
  /** 同じ会場で続けて見る */
  | 'stay'

export interface MyGap {
  kind: GapKind
  /** 前の出演の終わりから次の開始まで(分)。重なっていれば負 */
  freeMinutes: number
  /** 移動時間。同じ会場なら 0、不明なら null */
  travelMinutes: number | null
  /** 前の出演の終了時刻が推定値か */
  endAssumed: boolean
  fromVenue: TimetableVenue | undefined
  toVenue: TimetableVenue | undefined
}

export interface MyItem {
  act: TimetableAct
  venue: TimetableVenue | undefined
  /** 直前のお気に入りとの間。その日の最初のアクトでは null */
  gapBefore: MyGap | null
}

export interface MyDay {
  day: TimetableDay
  items: Array<MyItem>
}

/**
 * お気に入りを日ごとに時系列で並べ、前後の間を調べる。
 *
 * 間は「直前の 1 件」とだけ比べる。3 件が同時刻に重なっていれば 2 回の
 * overlap として出る。どれを諦めるかは利用者が決めることで、
 * ここで優先順位を推測しない。
 */
export function buildMyTimeline(
  doc: TimetableDoc,
  favorites: ReadonlySet<string>,
): Array<MyDay> {
  const venueById = new Map(doc.venues.map((venue) => [venue.id, venue]))
  const result: Array<MyDay> = []
  for (const day of doc.days) {
    const acts = actsOfDay(doc, day.id).filter((act) => favorites.has(act.id))
    if (acts.length === 0) continue
    const items: Array<MyItem> = []
    let prev: TimetableAct | null = null
    for (const act of acts) {
      let gapBefore: MyGap | null = null
      if (prev !== null) {
        const prevSpan = actSpan(prev)
        const span = actSpan(act)
        const free = span.start - prevSpan.end
        const travel = travelMinutes(doc, prev.venueId, act.venueId)
        let kind: GapKind
        if (free < 0) kind = 'overlap'
        else if (prev.venueId === act.venueId) kind = 'stay'
        else if (travel !== null ? free < travel : free < UNKNOWN_TRAVEL_TIGHT)
          kind = 'tight'
        else kind = 'move'
        gapBefore = {
          kind,
          freeMinutes: free,
          travelMinutes: travel,
          endAssumed: !prevSpan.endKnown,
          fromVenue: venueById.get(prev.venueId),
          toVenue: venueById.get(act.venueId),
        }
      }
      items.push({ act, venue: venueById.get(act.venueId), gapBefore })
      prev = act
    }
    result.push({ day, items })
  }
  return result
}

// --- いま・つぎ ---

/** 開演の何分前から「その日」として扱うか(入場・リストバンド交換の時間帯) */
const DAY_LEAD_MINUTES = 180
/** 終演の何分後まで「その日」として扱うか */
const DAY_TAIL_MINUTES = 60

export interface NowPlaying {
  venue: TimetableVenue
  current: TimetableAct | null
  next: TimetableAct | null
}

export type NowState =
  | { phase: 'empty' }
  | {
      phase: 'before'
      day: TimetableDay
      firstAct: TimetableAct
      startsAtMs: number
    }
  | {
      phase: 'live'
      day: TimetableDay
      /** その日の 0:00 から何分目か(深夜は 24 時以降の値になる) */
      minutes: number
      playing: Array<NowPlaying>
    }
  | { phase: 'after'; lastDay: TimetableDay }

/** その日の 0:00 から見た「いま」の分。日付が違えば 1440 単位でずれる */
export function minutesIntoDay(
  day: TimetableDay,
  nowMs: number,
  timezone: string,
): number {
  const clock = wallClock(nowMs, timezone)
  return daysBetween(day.date, clock.date) * 1440 + clock.minutes
}

/** いま開催中の日。開演前・終演後の余白を含めて判定する */
export function liveDay(
  doc: TimetableDoc,
  nowMs: number,
): { day: TimetableDay; minutes: number } | null {
  for (const day of doc.days) {
    const range = dayRange(doc, day.id)
    if (range === null) continue
    const minutes = minutesIntoDay(day, nowMs, doc.timezone)
    if (
      minutes >= range.start - DAY_LEAD_MINUTES &&
      minutes <= range.end + DAY_TAIL_MINUTES
    ) {
      return { day, minutes }
    }
  }
  return null
}

export function computeNow(doc: TimetableDoc, nowMs: number): NowState {
  const days = doc.days.filter((day) => dayRange(doc, day.id) !== null)
  if (days.length === 0) return { phase: 'empty' }

  const live = liveDay(doc, nowMs)
  if (live !== null) {
    const acts = actsOfDay(doc, live.day.id)
    const playing: Array<NowPlaying> = []
    for (const venue of doc.venues) {
      const venueActs = acts.filter((act) => act.venueId === venue.id)
      if (venueActs.length === 0) continue
      const current =
        venueActs.find((act) => {
          const span = actSpan(act)
          return span.start <= live.minutes && live.minutes < span.end
        }) ?? null
      const next =
        venueActs.find((act) => actSpan(act).start > live.minutes) ?? null
      playing.push({ venue, current, next })
    }
    return { phase: 'live', day: live.day, minutes: live.minutes, playing }
  }

  for (const day of days) {
    const first = actsOfDay(doc, day.id)[0]
    const startsAtMs = toEpochMs(day.date, actSpan(first).start, doc.timezone)
    if (startsAtMs > nowMs) {
      return { phase: 'before', day, firstAct: first, startsAtMs }
    }
  }
  return { phase: 'after', lastDay: days[days.length - 1] }
}

export interface UpcomingFavorite {
  act: TimetableAct
  day: TimetableDay
  startsAtMs: number
  endsAtMs: number
  /** いま進行中か */
  inProgress: boolean
}

/** いまより後に終わるお気に入りを、開始の早い順に */
export function upcomingFavorites(
  doc: TimetableDoc,
  favorites: ReadonlySet<string>,
  nowMs: number,
): Array<UpcomingFavorite> {
  const dayById = new Map(doc.days.map((day) => [day.id, day]))
  const result: Array<UpcomingFavorite> = []
  for (const act of doc.acts) {
    if (!favorites.has(act.id)) continue
    const day = dayById.get(act.dayId)
    if (day === undefined) continue
    const span = actSpan(act)
    const startsAtMs = toEpochMs(day.date, span.start, doc.timezone)
    const endsAtMs = toEpochMs(day.date, span.end, doc.timezone)
    if (endsAtMs <= nowMs) continue
    result.push({
      act,
      day,
      startsAtMs,
      endsAtMs,
      inProgress: startsAtMs <= nowMs,
    })
  }
  return result.toSorted((a, b) => a.startsAtMs - b.startsAtMs)
}
