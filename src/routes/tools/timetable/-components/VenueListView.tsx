import { venueColor } from '../../../../lib/timetable/colors'
import {
  actTimeText,
  actsOfDay,
  matchesQuery,
} from '../../../../lib/timetable/derive'
import { FavButton, FriendTags } from './FavButton'
import type { FriendPick, TimetableDoc } from '../../../../lib/timetable/types'

interface VenueListViewProps {
  doc: TimetableDoc
  dayId: string
  favorites: ReadonlySet<string>
  friends: ReadonlyArray<FriendPick>
  query: string
  onToggle: (actId: string) => void
}

const KIND_LABEL: Record<string, string> = {
  dj: 'DJ',
  talk: 'トーク',
  signing: 'サイン会',
  other: 'その他',
}

/** 会場ごとの一覧。グリッドより文字が大きく、補足(subtitle・note)まで読める */
export function VenueListView({
  doc,
  dayId,
  favorites,
  friends,
  query,
  onToggle,
}: VenueListViewProps) {
  const acts = actsOfDay(doc, dayId).filter((act) => matchesQuery(act, query))
  const sections = doc.venues
    .map((venue, index) => ({
      venue,
      color: venueColor(index),
      acts: acts.filter((act) => act.venueId === venue.id),
    }))
    .filter((section) => section.acts.length > 0)

  if (sections.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-600">
        {query.trim().length > 0
          ? `「${query}」に当てはまる出演はこの日にありません。別の日も確かめてください。`
          : 'この日の出演はありません。'}
      </p>
    )
  }

  return (
    <div className="space-y-4 py-3">
      {sections.map(({ venue, color, acts: list }) => (
        <section key={venue.id} aria-label={venue.name}>
          <h3
            className="sticky top-0 z-10 px-2 py-1 text-sm font-bold"
            style={{ background: color.fill, color: color.text }}
          >
            {venue.name}
            {venue.group && (
              <span className="ml-2 font-normal">{venue.group}</span>
            )}
          </h3>
          {(venue.note || venue.mapUrl) && (
            <p className="px-2 pt-1 text-xs text-gray-600">
              {venue.note}
              {venue.mapUrl && (
                <a
                  href={venue.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-cyan-800 underline"
                >
                  地図
                </a>
              )}
            </p>
          )}
          <ul className="divide-y divide-gray-200">
            {list.map((act) => {
              const fav = favorites.has(act.id)
              const names = friends
                .filter((f) => f.actIds.includes(act.id))
                .map((f) => f.name)
              return (
                <li
                  key={act.id}
                  className={`flex items-start gap-2 px-2 py-1.5 ${fav ? 'bg-amber-50' : ''}`}
                >
                  <span className="w-[5.5rem] shrink-0 pt-0.5 text-sm tabular-nums text-gray-700">
                    {actTimeText(act)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${fav ? 'font-bold' : 'font-medium'} text-gray-900`}
                    >
                      {act.kind && act.kind !== 'live' && (
                        <span className="mr-1 text-xs text-gray-600">
                          [{KIND_LABEL[act.kind]}]
                        </span>
                      )}
                      {act.title}
                    </p>
                    {act.subtitle && (
                      <p className="text-xs text-gray-700">{act.subtitle}</p>
                    )}
                    {act.note && (
                      <p className="text-xs text-amber-800">{act.note}</p>
                    )}
                    <FriendTags names={names} />
                  </div>
                  <FavButton
                    pressed={fav}
                    label={act.title}
                    onToggle={() => onToggle(act.id)}
                  />
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
