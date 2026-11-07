/**
 * グリッドでタップした出演の詳細。画面の下端に出す。
 * 縦の flex の中に置くので、出ている間はグリッドのほうが縮み、最下段まで
 * スクロールで届く(固定配置で上に重ねると、重なった分の行に届かなくなる)。
 * タップでお気に入りが切り替わるので、何が起きたかと「戻す」手段をここで見せる。
 */

import { actTimeText } from '../../../../lib/timetable/derive'
import { formatDateLabel } from '../../../../lib/timetable/time'
import { FavButton, FriendTags } from './FavButton'
import type {
  TimetableAct,
  TimetableDoc,
} from '../../../../lib/timetable/types'

interface ActDetailProps {
  doc: TimetableDoc
  act: TimetableAct
  fav: boolean
  friendNames: ReadonlyArray<string>
  onToggle: () => void
  onClose: () => void
}

export function ActDetail({
  doc,
  act,
  fav,
  friendNames,
  onToggle,
  onClose,
}: ActDetailProps) {
  const venue = doc.venues.find((v) => v.id === act.venueId)
  const day = doc.days.find((d) => d.id === act.dayId)
  return (
    <div
      className="max-h-[45dvh] shrink-0 overflow-y-auto border-t-2 border-gray-900 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-gray-900"
      role="region"
      aria-label="選んだ出演"
    >
      <div className="mx-auto flex max-w-3xl items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-700" aria-live="polite">
            {fav ? 'お気に入りに入れました' : 'お気に入りではありません'}
          </p>
          <p className="text-base font-bold leading-snug">{act.title}</p>
          <p className="text-sm tabular-nums text-gray-800">
            {day ? formatDateLabel(day.date) : ''} {actTimeText(act)}{' '}
            {venue?.name}
          </p>
          {act.subtitle && (
            <p className="text-sm text-gray-700">{act.subtitle}</p>
          )}
          {act.note && <p className="text-sm text-amber-800">{act.note}</p>}
          {act.url && (
            <a
              href={act.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-cyan-800 underline"
            >
              出演者のページ
            </a>
          )}
          <FriendTags names={friendNames} />
        </div>
        <FavButton pressed={fav} label={act.title} onToggle={onToggle} />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-md border border-gray-300 px-2 text-sm"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
