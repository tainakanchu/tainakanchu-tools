/**
 * 共有・書き出し・友達の選択の管理。
 *
 * 共有URLはサーバに保存しない(share.ts)。「自分のお気に入り付きで共有」を
 * 選ぶと、受け取った側で「友達の選択」として重ねられる。
 */

import { useMemo, useState } from 'react'
import { buildFavoritesIcs, safeFileName } from '../../../../lib/timetable/ics'
import { buildShareUrl } from '../../../../lib/timetable/share'
import {
  btn,
  btnDanger,
  btnPrimary,
  copyText,
  downloadText,
  field,
  sectionTitle,
} from '../-lib/ui'
import type { FriendPick, TimetableDoc } from '../../../../lib/timetable/types'

const NAME_KEY = 'tainakanchu-tools:timetable:v1:myname'

function loadName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    // 名前が残らないだけ
  }
}

interface SharePanelProps {
  doc: TimetableDoc
  favorites: ReadonlySet<string>
  friends: ReadonlyArray<FriendPick>
  onFriendsChange: (friends: Array<FriendPick>) => void
  onClose: () => void
}

export function SharePanel({
  doc,
  favorites,
  friends,
  onFriendsChange,
  onClose,
}: SharePanelProps) {
  const [withFavs, setWithFavs] = useState(favorites.size > 0)
  const [name, setName] = useState(loadName)
  const [status, setStatus] = useState('')

  const share = useMemo(
    () =>
      buildShareUrl(
        doc,
        `${window.location.origin}${window.location.pathname}`,
        withFavs
          ? {
              ...(name.trim() ? { name: name.trim() } : {}),
              actIds: [...favorites],
            }
          : undefined,
      ),
    [doc, favorites, withFavs, name],
  )

  const handleCopy = async () => {
    saveName(name.trim())
    setStatus(
      (await copyText(share.url))
        ? 'URL をコピーしました。'
        : 'コピーできませんでした。下の欄から選択してコピーしてください。',
    )
  }

  const handleNativeShare = async () => {
    saveName(name.trim())
    try {
      await navigator.share({ title: doc.title, url: share.url })
    } catch {
      // キャンセルも例外になる。何もしない
    }
  }

  const updateFriend = (id: string, patch: Partial<FriendPick>) =>
    onFriendsChange(friends.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  return (
    <section
      className="space-y-5 border-b border-gray-300 pb-4"
      aria-labelledby="tt-share-title"
    >
      <div className="flex items-baseline justify-between">
        <h2 id="tt-share-title" className="text-lg font-bold text-gray-900">
          共有と書き出し
        </h2>
        <button type="button" className={btn} onClick={onClose}>
          閉じる
        </button>
      </div>

      <div>
        <h3 className={sectionTitle}>URL で共有</h3>
        <p className="mt-1 text-sm text-gray-700">
          タイムテーブル全体を URL
          に入れて渡します。サーバには保存されません。開いた人は自分の一覧に保存できます。
        </p>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withFavs}
            onChange={(event) => setWithFavs(event.target.checked)}
            disabled={favorites.size === 0}
            className="h-4 w-4"
          />
          自分のお気に入り付きで共有({favorites.size} 組)
        </label>
        {withFavs && (
          <label className="mt-2 block text-sm">
            相手の画面に出す名前
            <input
              className={`${field} mt-1 max-w-xs`}
              value={name}
              maxLength={20}
              placeholder="例: たなか"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={handleCopy}>
            URL をコピー
          </button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button type="button" className={btn} onClick={handleNativeShare}>
              ほかのアプリで送る
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-600" role="status">
          {status} URL の長さ {share.url.length.toLocaleString()} 文字
        </p>
        <textarea
          readOnly
          value={share.url}
          aria-label="共有 URL"
          className={`${field} mt-1 h-16 font-mono text-[11px]`}
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>

      <div>
        <h3 className={sectionTitle}>書き出し</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            disabled={favorites.size === 0}
            onClick={() =>
              downloadText(
                safeFileName(doc.title, 'ics'),
                buildFavoritesIcs(doc, favorites, Date.now()),
                'text/calendar',
              )
            }
          >
            お気に入りをカレンダー(.ics)に
          </button>
          <button
            type="button"
            className={btn}
            onClick={() =>
              downloadText(
                safeFileName(doc.title, 'json'),
                JSON.stringify(doc, null, 2),
                'application/json',
              )
            }
          >
            JSON をダウンロード
          </button>
        </div>
        {favorites.size === 0 && (
          <p className="mt-1 text-xs text-gray-600">
            .ics はお気に入りを選ぶと書き出せます。
          </p>
        )}
      </div>

      <div>
        <h3 className={sectionTitle}>友達の選択</h3>
        {friends.length === 0 ? (
          <p className="mt-1 text-sm text-gray-700">
            友達から「お気に入り付き」の共有 URL
            をもらって開くと、ここに追加され、グリッドに破線の枠で重なります。
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-gray-200">
            {friends.map((friend) => (
              <li
                key={friend.id}
                className="flex flex-wrap items-center gap-2 py-1.5"
              >
                <input
                  className={`${field} w-32`}
                  value={friend.name}
                  maxLength={20}
                  aria-label="友達の名前"
                  onChange={(event) =>
                    updateFriend(friend.id, { name: event.target.value })
                  }
                />
                <span className="text-sm text-gray-700">
                  {friend.actIds.length} 組
                </span>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={friend.hidden !== true}
                    onChange={(event) =>
                      updateFriend(friend.id, { hidden: !event.target.checked })
                    }
                  />
                  表示
                </label>
                <button
                  type="button"
                  className={btnDanger}
                  onClick={() =>
                    onFriendsChange(friends.filter((f) => f.id !== friend.id))
                  }
                >
                  外す
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
