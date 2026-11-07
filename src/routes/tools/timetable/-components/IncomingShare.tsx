/**
 * 共有URLで開かれたときの画面。勝手に保存せず、何が入っているかを見せてから選ばせる。
 *
 * お気に入り付きの共有なら、相手の選択を「友達の選択」として
 * - 新しく保存するタイムテーブルに付ける
 * - 既に保存してある同じイベント(タイトル一致)に重ねる
 * のどちらかにできる。自分の別の端末から送った場合に備え、
 * 「自分のお気に入りとして取り込む」も選べる。
 */

import { useState } from 'react'
import { formatDateLabel } from '../../../../lib/timetable/time'
import { normalizeKey } from '../../../../lib/timetable/id'
import { btn, btnPrimary, field } from '../-lib/ui'
import type { SharedTimetable } from '../../../../lib/timetable/share'
import type { SavedTimetable } from '../../../../lib/timetable/storage'

export type FavoriteUse = 'friend' | 'own'

interface IncomingShareProps {
  shared: SharedTimetable
  library: ReadonlyArray<SavedTimetable>
  onSaveNew: (opts: { use: FavoriteUse; friendName: string }) => void
  onMergeInto: (
    entryId: string,
    opts: { use: FavoriteUse; friendName: string },
  ) => void
  onDismiss: () => void
}

export function IncomingShare({
  shared,
  library,
  onSaveNew,
  onMergeInto,
  onDismiss,
}: IncomingShareProps) {
  const { doc, favorites } = shared
  const [friendName, setFriendName] = useState(favorites?.name ?? '')
  const [use, setUse] = useState<FavoriteUse>('friend')
  const sameTitle = library.filter(
    (entry) => normalizeKey(entry.doc.title) === normalizeKey(doc.title),
  )
  const opts = { use, friendName: friendName.trim() || '友達' }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-4 text-gray-900">
      <h1 className="text-xl font-bold">{doc.title}</h1>
      <p className="mt-1 text-sm text-gray-700">
        このタイムテーブルが共有されました。保存すると自分の一覧に入り、お気に入りを付けられます。
      </p>
      <table className="mt-2 text-sm">
        <tbody>
          {doc.days.map((day) => (
            <tr key={day.id} className="border-t border-gray-200">
              <th
                scope="row"
                className="py-1 pr-4 text-left font-normal text-gray-700"
              >
                {formatDateLabel(day.date)}
                {day.label ? ` ${day.label}` : ''}
              </th>
              <td className="py-1 tabular-nums">
                {doc.acts.filter((a) => a.dayId === day.id).length} 組
              </td>
            </tr>
          ))}
          <tr className="border-t border-gray-200">
            <th
              scope="row"
              className="py-1 pr-4 text-left font-normal text-gray-700"
            >
              会場
            </th>
            <td className="py-1">{doc.venues.map((v) => v.name).join('、')}</td>
          </tr>
        </tbody>
      </table>

      {favorites && (
        <fieldset className="mt-4 border-t border-gray-300 pt-3">
          <legend className="text-base font-bold">
            {favorites.name ? `${favorites.name} さん` : '送った人'}のお気に入り{' '}
            {favorites.actIds.length} 組付き
          </legend>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="tt-fav-use"
              className="mt-0.5 h-4 w-4"
              checked={use === 'friend'}
              onChange={() => setUse('friend')}
            />
            <span>
              友達の選択として重ねる(自分のお気に入りとは別に、破線の枠で表示)
            </span>
          </label>
          {use === 'friend' && (
            <label className="ml-6 mt-1 block text-sm">
              表示する名前
              <input
                className={`${field} mt-1 max-w-xs`}
                value={friendName}
                maxLength={20}
                placeholder="友達"
                onChange={(event) => setFriendName(event.target.value)}
              />
            </label>
          )}
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="tt-fav-use"
              className="mt-0.5 h-4 w-4"
              checked={use === 'own'}
              onChange={() => setUse('own')}
            />
            <span>
              自分のお気に入りとして取り込む(自分の別の端末から送ったとき)
            </span>
          </label>
        </fieldset>
      )}

      <div className="mt-5 space-y-2">
        {sameTitle.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`${btnPrimary} w-full sm:w-auto`}
            onClick={() => onMergeInto(entry.id, opts)}
          >
            {favorites
              ? `保存済みの「${entry.doc.title}」に重ねる`
              : `保存済みの「${entry.doc.title}」を共有された内容で更新`}
          </button>
        ))}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={sameTitle.length > 0 ? btn : btnPrimary}
            onClick={() => onSaveNew(opts)}
          >
            {sameTitle.length > 0
              ? '別のタイムテーブルとして保存'
              : 'このタイムテーブルを保存'}
          </button>
          <button type="button" className={btn} onClick={onDismiss}>
            保存しない
          </button>
        </div>
        {sameTitle.length > 0 && (
          <p className="text-xs text-gray-600">
            同じタイトルのタイムテーブルが保存されています。
            {favorites
              ? '重ねると、相手の選択だけが追加され、自分のお気に入りはそのまま残ります。'
              : '更新すると、出演の内容が共有された版になり、お気に入りは同じ出演に引き継がれます。'}
          </p>
        )}
      </div>
    </main>
  )
}
