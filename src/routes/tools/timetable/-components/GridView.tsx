/**
 * 会場を列・時間を縦軸にしたグリッド。この道具の主役。
 *
 * 1 つのスクロール領域の中で、会場名の行を上に、時刻の列を左に sticky にする。
 * スマホでは会場が画面に収まらないので横スクロールになるが、
 * どの列が何の会場か・いま何時の段かは常に見えている。
 *
 * お気に入りは会場色の「塗り」と ★、友達の選択は「破線の枠」と名前の頭文字で示す。
 * 色だけに頼らず、形でも区別できるようにしている。
 */

import { useEffect, useMemo, useRef } from 'react'
import { venueColor } from '../../../../lib/timetable/colors'
import {
  actSpan,
  actTimeText,
  dayRange,
  matchesQuery,
  minutesIntoDay,
} from '../../../../lib/timetable/derive'
import { formatHmShort } from '../../../../lib/timetable/time'
import { initialOf } from '../-lib/ui'
import type {
  FriendPick,
  TimetableAct,
  TimetableDoc,
} from '../../../../lib/timetable/types'

const PX_PER_MIN = 2
const AXIS_WIDTH = 44

interface GridViewProps {
  doc: TimetableDoc
  dayId: string
  favorites: ReadonlySet<string>
  friends: ReadonlyArray<FriendPick>
  query: string
  nowMs: number
  selectedId: string | null
  onTapAct: (act: TimetableAct) => void
}

export function GridView({
  doc,
  dayId,
  favorites,
  friends,
  query,
  nowMs,
  selectedId,
  onTapAct,
}: GridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const day = doc.days.find((d) => d.id === dayId)
  const range = dayRange(doc, dayId)
  const gridStart = range === null ? 0 : Math.floor(range.start / 60) * 60
  const gridEnd = range === null ? 0 : Math.ceil(range.end / 60) * 60
  const height = (gridEnd - gridStart) * PX_PER_MIN

  const nowMin =
    day === undefined ? null : minutesIntoDay(day, nowMs, doc.timezone)
  const nowVisible = nowMin !== null && nowMin >= gridStart && nowMin <= gridEnd
  const nowTop = nowVisible ? (nowMin - gridStart) * PX_PER_MIN : 0

  const actsByVenue = useMemo(() => {
    const map = new Map<string, Array<TimetableAct>>()
    for (const act of doc.acts) {
      if (act.dayId !== dayId) continue
      const list = map.get(act.venueId) ?? []
      list.push(act)
      map.set(act.venueId, list)
    }
    return map
  }, [doc, dayId])

  // その日に出演の無い会場の列は出さない(会場ごとに開催日が違うフェスがある)
  const venues = doc.venues
    .map((venue, index) => ({ venue, color: venueColor(index) }))
    .filter(({ venue }) => actsByVenue.has(venue.id))

  const friendsByAct = useMemo(() => {
    const map = new Map<string, Array<FriendPick>>()
    for (const friend of friends) {
      for (const id of friend.actIds) {
        const list = map.get(id) ?? []
        list.push(friend)
        map.set(id, list)
      }
    }
    return map
  }, [friends])

  // 日を切り替えたら、当日ならいまの位置へ、そうでなければ先頭へ
  useEffect(() => {
    const el = scrollRef.current
    if (el === null) return
    el.scrollTop = nowVisible ? Math.max(0, nowTop - 120) : 0
    // 現在時刻の毎分の更新では動かさない(見ている位置を勝手に変えない)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId])

  if (range === null) {
    return (
      <p className="py-8 text-center text-sm text-gray-600">
        この日の出演はありません。
      </p>
    )
  }

  const hours: Array<number> = []
  for (let m = gridStart; m <= gridEnd; m += 60) hours.push(m)
  const hasQuery = query.trim().length > 0

  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 flex-1 overflow-auto overscroll-contain border-y border-gray-300 bg-white"
      tabIndex={-1}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${AXIS_WIDTH}px repeat(${venues.length}, minmax(108px, 1fr))`,
          minWidth: AXIS_WIDTH + venues.length * 108,
        }}
      >
        {/* 会場名の行 */}
        <div className="sticky left-0 top-0 z-30 border-b border-gray-300 bg-white" />
        {venues.map(({ venue, color }) => (
          <div
            key={venue.id}
            className="sticky top-0 z-20 border-b border-l border-gray-300 px-1 py-1 text-left text-xs font-bold leading-tight"
            style={{ background: color.fill, color: color.text }}
            title={venue.note ? `${venue.name}(${venue.note})` : venue.name}
          >
            {/* 横スクロールで列が時刻軸の下に潜っても、会場名は軸のすぐ右に残る */}
            <span
              className="sticky inline-block max-w-full truncate align-top"
              style={{ left: AXIS_WIDTH + 4 }}
            >
              {venue.name}
            </span>
          </div>
        ))}

        {/* 時刻の列 */}
        <div
          className="sticky left-0 z-10 border-r border-gray-300 bg-white"
          style={{ height }}
          aria-hidden="true"
        >
          {hours.map((m) => (
            <span
              key={m}
              className={`absolute right-1 text-[11px] tabular-nums text-gray-600 ${m === gridStart ? '' : '-translate-y-1/2'}`}
              style={{ top: (m - gridStart) * PX_PER_MIN }}
            >
              {formatHmShort(m)}
            </span>
          ))}
          {nowVisible && (
            <span
              className="absolute right-0 z-10 -translate-y-1/2 rounded-sm bg-rose-600 px-0.5 text-[10px] font-bold tabular-nums text-white"
              style={{ top: nowTop }}
            >
              {formatHmShort(nowMin)}
            </span>
          )}
        </div>

        {venues.map(({ venue, color }) => (
          <div
            key={venue.id}
            className="relative border-l border-gray-200"
            style={{
              height,
              backgroundImage: `repeating-linear-gradient(to bottom, #d1d5db 0 1px, transparent 1px ${30 * PX_PER_MIN}px), repeating-linear-gradient(to bottom, #9ca3af 0 1px, transparent 1px ${60 * PX_PER_MIN}px)`,
            }}
          >
            {(actsByVenue.get(venue.id) ?? []).map((act) => {
              const span = actSpan(act)
              const top = (span.start - gridStart) * PX_PER_MIN
              const h = Math.max((span.end - span.start) * PX_PER_MIN - 2, 18)
              const fav = favorites.has(act.id)
              const picks = friendsByAct.get(act.id) ?? []
              const dimmed = hasQuery && !matchesQuery(act, query)
              const past = nowMin !== null && span.end <= nowMin
              const compact = h < 40
              return (
                <button
                  key={act.id}
                  type="button"
                  aria-pressed={fav}
                  aria-label={`${act.title}、${venue.name}、${actTimeText(act)}${picks.length > 0 ? `、${picks.map((p) => p.name).join('・')}も選択` : ''}`}
                  onClick={() => onTapAct(act)}
                  className={`absolute left-0.5 right-0.5 overflow-hidden rounded-sm px-1 text-left text-[12px] leading-tight focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-600 ${compact ? 'py-0' : 'py-0.5'} ${dimmed ? 'opacity-25' : ''} ${selectedId === act.id ? 'ring-2 ring-gray-900 ring-offset-1' : ''}`}
                  style={{
                    top: top + 1,
                    height: h,
                    // 終わった出演は背景だけ灰色にして、文字は読める濃さ(4.5:1 以上)を保つ
                    background: fav
                      ? color.fill
                      : past
                        ? '#f3f4f6'
                        : color.tint,
                    color: fav ? color.text : past ? '#4b5563' : '#111827',
                    borderLeft: fav
                      ? undefined
                      : `4px solid ${past ? '#9ca3af' : color.fill}`,
                    outline:
                      picks.length > 0 && selectedId !== act.id
                        ? '2px dashed #111827'
                        : undefined,
                    outlineOffset: picks.length > 0 ? -2 : undefined,
                  }}
                >
                  <span
                    className={`block ${fav ? 'font-bold' : 'font-medium'} ${compact ? 'truncate' : 'line-clamp-3'}`}
                  >
                    {fav && <span aria-hidden="true">★ </span>}
                    {act.kind === 'signing' && <span>[サイン] </span>}
                    {act.kind === 'dj' && !/dj/i.test(act.title) && (
                      <span>[DJ] </span>
                    )}
                    {act.title}
                  </span>
                  {!compact && h >= 52 && (
                    <span className="block text-[10px] tabular-nums opacity-80">
                      {actTimeText(act)}
                    </span>
                  )}
                  {picks.length > 0 && (
                    <span
                      className="absolute bottom-0.5 right-0.5 flex gap-0.5"
                      aria-hidden="true"
                    >
                      {picks.slice(0, 3).map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-gray-900 bg-white px-0.5 text-[9px] font-bold text-gray-900"
                        >
                          {initialOf(p.name)}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
            {nowVisible && (
              <div
                className="pointer-events-none absolute inset-x-0 z-[5] h-px bg-rose-600"
                style={{ top: nowTop }}
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
