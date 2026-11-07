/**
 * 共有・書き出し・友達の選択の管理。
 *
 * 共有URLはサーバに保存しない(share.ts)。「自分のお気に入り付きで共有」を
 * 選ぶと、受け取った側で「友達の選択」として重ねられる。
 */

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { langOf } from '@/lib/cjk/lang'
import { buildFavoritesIcs, safeFileName } from '../../../../lib/timetable/ics'
import { buildShareUrl } from '../../../../lib/timetable/share'
import { shareImageFileName } from '../../../../lib/timetable/shareImage'
import { renderMyTimetableImage } from '../-lib/shareImage'
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

type QrState =
  | { phase: 'pending' }
  | { phase: 'ready'; dataUrl: string }
  | { phase: 'tooLong' }

/**
 * 共有 URL の QR コード。会場で相手のスマホにかざしてもらう用途なので、
 * 誤り訂正は L(URL が 2,000 文字を超えても載るように)、余白は白で 4 モジュール。
 * 容量を超えたら QR を諦めて URL のコピーに誘導する。
 */
function useShareQr(url: string): QrState {
  const [state, setState] = useState<QrState>({ phase: 'pending' })
  useEffect(() => {
    let cancelled = false
    // 表示は 264px。高精細の画面でもぼけないよう倍の大きさで作る
    // URL は ASCII だけ(フラグメントは base64url)なのでバイトモードで載る
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'L',
      margin: 4,
      width: 528,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (!cancelled) setState({ phase: 'ready', dataUrl })
      })
      .catch(() => {
        if (!cancelled) setState({ phase: 'tooLong' })
      })
    return () => {
      cancelled = true
    }
  }, [url])
  return state
}

function ShareQr({ url }: { url: string }) {
  const qr = useShareQr(url)
  const [enlarged, setEnlarged] = useState(false)

  useEffect(() => {
    if (!enlarged) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEnlarged(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enlarged])

  if (qr.phase === 'tooLong') {
    return (
      <p className="mt-2 text-xs text-amber-800">
        URL が長すぎて QR コードにできません。URL をコピーして送ってください。
      </p>
    )
  }
  if (qr.phase === 'pending') return null
  return (
    <div className="mt-3">
      <img
        src={qr.dataUrl}
        alt="共有 URL の QR コード"
        width={264}
        height={264}
        className="h-[264px] w-[264px] bg-white"
      />
      <button
        type="button"
        className={`${btn} mt-2`}
        onClick={() => setEnlarged(true)}
      >
        QR を大きく表示
      </button>
      {enlarged && (
        <button
          type="button"
          aria-label="QR コードを閉じる"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-4"
          onClick={() => setEnlarged(false)}
        >
          <img
            src={qr.dataUrl}
            alt="共有 URL の QR コード"
            className="aspect-square w-[min(92vw,80vh)]"
          />
          <span className="text-sm text-gray-700">タップで閉じる</span>
        </button>
      )}
    </div>
  )
}

type ImageState =
  | { phase: 'empty' }
  | { phase: 'rendering' }
  | { phase: 'ready'; file: File; url: string }
  | { phase: 'error' }

/**
 * マイタイムテーブルの画像。パネルを開いた時点で作っておく
 * (ボタンを押してから作ると、描画を待つ間に操作の有効期限が切れて
 * iOS の共有シートが開けないことがあるため)
 */
function useMyImage(
  doc: TimetableDoc,
  favorites: ReadonlySet<string>,
): ImageState {
  const [state, setState] = useState<ImageState>({ phase: 'empty' })
  useEffect(() => {
    if (favorites.size === 0) {
      setState({ phase: 'empty' })
      return
    }
    let cancelled = false
    let url: string | undefined
    setState({ phase: 'rendering' })
    renderMyTimetableImage(doc, favorites)
      .then((blob) => {
        if (cancelled) return
        if (blob === null) {
          setState({ phase: 'empty' })
          return
        }
        const file = new File([blob], shareImageFileName(doc.title), {
          type: 'image/png',
        })
        url = URL.createObjectURL(file)
        setState({ phase: 'ready', file, url })
      })
      .catch(() => {
        if (!cancelled) setState({ phase: 'error' })
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [doc, favorites])
  return state
}

function download(file: File, url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.append(a)
  a.click()
  a.remove()
}

/** ファイルの共有に対応した端末か(古い Safari・デスクトップの Firefox などは無い) */
function canShareFile(file: File): boolean {
  return 'canShare' in navigator && navigator.canShare({ files: [file] })
}

function ImageShare({
  doc,
  favorites,
}: {
  doc: TimetableDoc
  favorites: ReadonlySet<string>
}) {
  const image = useMyImage(doc, favorites)
  const [status, setStatus] = useState('')

  const handleShare = async () => {
    if (image.phase !== 'ready') return
    const { file, url } = image
    setStatus('')
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title: doc.title })
        return
      } catch (error) {
        // 共有シートを閉じただけ
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus('共有できなかったので、画像をダウンロードしました。')
      }
    }
    download(file, url)
  }

  return (
    <div>
      <h3 className={sectionTitle}>画像で共有</h3>
      <p className="mt-1 text-sm text-gray-700">
        マイタイムテーブル(お気に入り)を PNG
        画像にします。下のプレビューを長押しして保存することもできます。
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={image.phase !== 'ready'}
          onClick={handleShare}
        >
          画像で共有
        </button>
        {image.phase === 'ready' && (
          <button
            type="button"
            className={btn}
            onClick={() => download(image.file, image.url)}
          >
            PNG をダウンロード
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-600" role="status">
        {image.phase === 'empty' && 'マイに追加すると画像にできます。'}
        {image.phase === 'rendering' && '画像を作っています…'}
        {image.phase === 'error' && '画像を作れませんでした。'}
        {status}
      </p>
      {image.phase === 'ready' && (
        <img
          src={image.url}
          alt={`${doc.title} のマイタイムテーブル`}
          className="mt-2 w-full max-w-sm border border-gray-300"
        />
      )}
    </div>
  )
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
        <ShareQr url={share.url} />
      </div>

      <ImageShare doc={doc} favorites={favorites} />

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
                  lang={langOf(friend.name)}
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
