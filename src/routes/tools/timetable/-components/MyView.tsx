/**
 * マイタイムテーブル。お気に入りだけを日ごとの時系列で並べ、
 * 出演と出演の間に「空き時間・会場移動・重なり」を挟んで見せる。
 */

import { venueColor } from '../../../../lib/timetable/colors'
import { Txt } from '@/components/Txt'
import { actTimeText, buildMyTimeline } from '../../../../lib/timetable/derive'
import { formatDateLabel, formatDuration } from '../../../../lib/timetable/time'
import { FavButton, FriendTags } from './FavButton'
import type { MyGap } from '../../../../lib/timetable/derive'
import type { FriendPick, TimetableDoc } from '../../../../lib/timetable/types'

interface MyViewProps {
  doc: TimetableDoc
  favorites: ReadonlySet<string>
  friends: ReadonlyArray<FriendPick>
  onToggle: (actId: string) => void
  onGoGrid: () => void
}

function GapRow({ gap }: { gap: MyGap }) {
  const from = gap.fromVenue ? <Txt text={gap.fromVenue.name} /> : '前の会場'
  const to = gap.toVenue ? <Txt text={gap.toVenue.name} /> : '次の会場'
  const assumed = gap.endAssumed
    ? '(前の出演の終了時刻が不明なので30分で計算)'
    : ''
  if (gap.kind === 'overlap') {
    return (
      <p className="border-l-4 border-rose-600 bg-rose-50 px-2 py-1 text-sm font-semibold text-rose-800">
        時間が {formatDuration(-gap.freeMinutes)} 重なっています{assumed}
      </p>
    )
  }
  if (gap.kind === 'tight') {
    return (
      <p className="border-l-4 border-amber-500 bg-amber-50 px-2 py-1 text-sm text-amber-950">
        <span className="font-semibold">間に合わない可能性</span>: 空き{' '}
        {formatDuration(gap.freeMinutes)}、
        {gap.travelMinutes === null ? (
          <>
            別会場({from} から {to}、移動時間は未登録)
          </>
        ) : (
          <>
            {from} から {to} へ移動 {formatDuration(gap.travelMinutes)}
          </>
        )}
        {assumed}
      </p>
    )
  }
  if (gap.kind === 'move') {
    return (
      <p className="px-2 py-1 text-sm text-gray-700">
        空き {formatDuration(gap.freeMinutes)}。
        {gap.travelMinutes === null ? (
          <>
            会場移動あり({from} から {to})
          </>
        ) : (
          <>
            {from} から {to} へ移動 {formatDuration(gap.travelMinutes)}
          </>
        )}
        {assumed}
      </p>
    )
  }
  return (
    <p className="px-2 py-1 text-sm text-gray-600">
      空き {formatDuration(gap.freeMinutes)}(同じ会場){assumed}
    </p>
  )
}

export function MyView({
  doc,
  favorites,
  friends,
  onToggle,
  onGoGrid,
}: MyViewProps) {
  const days = buildMyTimeline(doc, favorites)
  const venueIndex = new Map(doc.venues.map((venue, i) => [venue.id, i]))

  if (days.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-700">
        <p>お気に入りはまだありません。</p>
        <p className="mt-1">
          グリッドで見たい出演をタップすると、ここに時間順で並びます。
        </p>
        <button
          type="button"
          onClick={onGoGrid}
          className="mt-3 text-cyan-800 underline"
        >
          グリッドを開く
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 py-3">
      {days.map(({ day, items }) => {
        const overlaps = items.filter(
          (i) => i.gapBefore?.kind === 'overlap',
        ).length
        const tights = items.filter((i) => i.gapBefore?.kind === 'tight').length
        return (
          <section key={day.id} aria-label={formatDateLabel(day.date)}>
            <h3 className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-gray-900 px-1 pb-0.5 text-base font-bold text-gray-900">
              {formatDateLabel(day.date)}
              {day.label && (
                <span className="text-sm font-normal">
                  <Txt text={day.label} />
                </span>
              )}
              <span className="text-sm font-normal text-gray-700">
                {items.length} 組
              </span>
              {overlaps > 0 && (
                <span className="text-sm font-semibold text-rose-700">
                  重なり {overlaps}
                </span>
              )}
              {tights > 0 && (
                <span className="text-sm font-semibold text-amber-800">
                  移動が厳しい {tights}
                </span>
              )}
            </h3>
            <ol>
              {items.map(({ act, venue, gapBefore }) => {
                const color = venueColor(venueIndex.get(act.venueId) ?? 0)
                const names = friends
                  .filter((f) => f.actIds.includes(act.id))
                  .map((f) => f.name)
                return (
                  <li key={act.id}>
                    {gapBefore && <GapRow gap={gapBefore} />}
                    <div className="flex items-start gap-2 border-b border-gray-200 py-1.5 pl-1">
                      <span className="w-[5.5rem] shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                        {actTimeText(act)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900">
                          <Txt text={act.title} />
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
                          <span
                            className="rounded-sm px-1 font-semibold"
                            style={{
                              background: color.fill,
                              color: color.text,
                            }}
                          >
                            {venue ? <Txt text={venue.name} /> : '会場不明'}
                          </span>
                          {act.subtitle && (
                            <span className="text-gray-700">
                              <Txt text={act.subtitle} />
                            </span>
                          )}
                        </p>
                        {act.note && (
                          <p className="text-xs text-amber-800">
                            <Txt text={act.note} />
                          </p>
                        )}
                        <FriendTags names={names} />
                      </div>
                      <FavButton
                        pressed
                        label={act.title}
                        onToggle={() => onToggle(act.id)}
                      />
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
