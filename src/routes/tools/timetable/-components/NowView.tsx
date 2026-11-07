/**
 * いま・つぎ。当日の「いま何をやっているか」と「次に見たいのはいつか」だけを出す。
 * 時刻はイベントのタイムゾーン基準(海外フェスを日本から見ても現地の時刻)。
 */

import { venueColor } from '../../../../lib/timetable/colors'
import { Txt } from '@/components/Txt'
import {
  actSpan,
  actTimeText,
  computeNow,
  travelMinutes,
  upcomingFavorites,
} from '../../../../lib/timetable/derive'
import {
  formatDateLabel,
  formatDuration,
  formatHmShort,
} from '../../../../lib/timetable/time'
import type { TimetableDoc } from '../../../../lib/timetable/types'

interface NowViewProps {
  doc: TimetableDoc
  favorites: ReadonlySet<string>
  nowMs: number
}

function minutesUntil(targetMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((targetMs - nowMs) / 60_000))
}

export function NowView({ doc, favorites, nowMs }: NowViewProps) {
  const state = computeNow(doc, nowMs)
  const upcoming = upcomingFavorites(doc, favorites, nowMs).slice(0, 4)
  const venueIndex = new Map(doc.venues.map((venue, i) => [venue.id, i]))
  const venueName = new Map(doc.venues.map((venue) => [venue.id, venue.name]))

  const favSection = (
    <section aria-labelledby="tt-next-fav" className="mt-4">
      <h3
        id="tt-next-fav"
        className="border-b-2 border-gray-900 text-base font-bold"
      >
        次のお気に入り
      </h3>
      {upcoming.length === 0 ? (
        <p className="py-2 text-sm text-gray-700">
          {favorites.size === 0
            ? 'お気に入りがまだありません。グリッドで見たい出演をタップしてください。'
            : 'この先のお気に入りはありません。'}
        </p>
      ) : (
        <ol className="divide-y divide-gray-200">
          {upcoming.map((item, i) => {
            const color = venueColor(venueIndex.get(item.act.venueId) ?? 0)
            const prev = i > 0 ? upcoming[i - 1].act : null
            const travel =
              prev === null || prev.venueId === item.act.venueId
                ? null
                : travelMinutes(doc, prev.venueId, item.act.venueId)
            return (
              <li key={item.act.id} className="flex items-start gap-3 py-2">
                <div className="w-[7.5rem] shrink-0 text-right whitespace-nowrap tabular-nums">
                  {item.inProgress ? (
                    <p className="text-sm font-bold text-rose-700">
                      進行中
                      <span className="block text-xs font-normal text-gray-700">
                        残り{' '}
                        {formatDuration(minutesUntil(item.endsAtMs, nowMs))}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm font-bold tabular-nums text-gray-900">
                      あと{' '}
                      {formatDuration(minutesUntil(item.startsAtMs, nowMs))}
                    </p>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">
                    <Txt text={item.act.title} />
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-700">
                    <span
                      className="rounded-sm px-1 font-semibold"
                      style={{ background: color.fill, color: color.text }}
                    >
                      <Txt text={venueName.get(item.act.venueId)} />
                    </span>
                    <span className="tabular-nums">
                      {formatDateLabel(item.day.date)} {actTimeText(item.act)}
                    </span>
                    {travel !== null && (
                      <span>前の会場から移動 {formatDuration(travel)}</span>
                    )}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )

  if (state.phase === 'empty') {
    return (
      <p className="py-8 text-center text-sm text-gray-700">
        出演がありません。
      </p>
    )
  }

  if (state.phase === 'before') {
    const wait = minutesUntil(state.startsAtMs, nowMs)
    return (
      <div className="py-3">
        <p className="text-sm text-gray-700">開催前です。</p>
        <p className="mt-1 text-lg font-bold text-gray-900">
          {formatDateLabel(state.day.date)}{' '}
          {formatHmShort(actSpan(state.firstAct).start)} 開始まで あと{' '}
          {formatDuration(wait)}
        </p>
        <p className="text-sm text-gray-700">
          最初の出演: <Txt text={state.firstAct.title} />(
          <Txt text={venueName.get(state.firstAct.venueId)} />)
        </p>
        <p className="mt-1 text-xs text-gray-600">
          時刻は {doc.timezone}{' '}
          の現地時刻です。当日になると各会場のいまの出演が出ます。
        </p>
        {favSection}
      </div>
    )
  }

  if (state.phase === 'after') {
    return (
      <div className="py-8 text-center text-sm text-gray-700">
        <p>このイベントは終了しました。</p>
        <p className="mt-1">最終日: {formatDateLabel(state.lastDay.date)}</p>
      </div>
    )
  }

  return (
    <div className="py-3">
      <p className="text-sm text-gray-700">
        {formatDateLabel(state.day.date)} 現在 {formatHmShort(state.minutes)}
      </p>
      <table className="mt-1 w-full text-left text-sm">
        <thead>
          <tr className="border-b-2 border-gray-900 text-xs text-gray-700">
            <th scope="col" className="py-1 pr-2 font-semibold">
              会場
            </th>
            <th scope="col" className="py-1 pr-2 font-semibold">
              いま
            </th>
            <th scope="col" className="py-1 font-semibold">
              つぎ
            </th>
          </tr>
        </thead>
        <tbody>
          {/* その日の出演を終えた会場は下に寄せ、1 行で「本日は終了」とだけ出す */}
          {state.playing
            .toSorted(
              (a, b) =>
                Number(a.current === null && a.next === null) -
                Number(b.current === null && b.next === null),
            )
            .map(({ venue, current, next }) => {
              const color = venueColor(venueIndex.get(venue.id) ?? 0)
              const finished = current === null && next === null
              return (
                <tr
                  key={venue.id}
                  className="border-b border-gray-200 align-top"
                >
                  <th scope="row" className="w-[34%] py-1.5 pr-2 font-normal">
                    <span
                      className="inline-block rounded-sm px-1 text-xs font-bold"
                      style={{ background: color.fill, color: color.text }}
                    >
                      <Txt text={venue.name} />
                    </span>
                  </th>
                  {finished ? (
                    <td colSpan={2} className="py-1.5 text-gray-600">
                      本日は終了
                    </td>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2">
                        {current ? (
                          <>
                            <span
                              className={
                                favorites.has(current.id)
                                  ? 'font-bold'
                                  : 'font-medium'
                              }
                            >
                              {favorites.has(current.id) && '★ '}
                              <Txt text={current.title} />
                            </span>
                            <span className="block text-xs whitespace-nowrap tabular-nums text-gray-700">
                              残り{' '}
                              {formatDuration(
                                actSpan(current).end - state.minutes,
                              )}
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-600">転換・休み</span>
                        )}
                      </td>
                      <td className="py-1.5">
                        {next ? (
                          <>
                            <span
                              className={
                                favorites.has(next.id) ? 'font-bold' : ''
                              }
                            >
                              {favorites.has(next.id) && '★ '}
                              <Txt text={next.title} />
                            </span>
                            <span className="block text-xs tabular-nums text-gray-700">
                              <span className="whitespace-nowrap">
                                {formatHmShort(actSpan(next).start)} から
                              </span>{' '}
                              <span className="whitespace-nowrap">
                                あと{' '}
                                {formatDuration(
                                  actSpan(next).start - state.minutes,
                                )}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-600">この後なし</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
        </tbody>
      </table>
      {favSection}
    </div>
  )
}
