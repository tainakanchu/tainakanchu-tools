/**
 * 1 つのタイムテーブルの画面。表示の切り替え(グリッド・会場別・マイ・いま)、
 * 日付タブ、検索、お気に入りと友達の選択の保存を受け持つ。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Txt } from '@/components/Txt'
import { ThemeSwitch } from '@/components/theme/ThemeSwitch'
import { liveDay } from '../../../../lib/timetable/derive'
import { remapActIds } from '../../../../lib/timetable/favorites'
import {
  loadFavorites,
  loadFriends,
  saveFavorites,
  saveFriends,
} from '../../../../lib/timetable/storage'
import { formatDateLabel } from '../../../../lib/timetable/time'
import { btn, field, useNowMs } from '../-lib/ui'
import { ActDetail } from './ActDetail'
import { ConfirmDialog } from './ConfirmDialog'
import { GridView } from './GridView'
import { ImportPanel } from './ImportPanel'
import { MyView } from './MyView'
import { NowView } from './NowView'
import { SharePanel } from './SharePanel'
import { VenueListView } from './VenueListView'
import type { SavedTimetable } from '../../../../lib/timetable/storage'
import type {
  FriendPick,
  TimetableAct,
  TimetableDoc,
} from '../../../../lib/timetable/types'

export const VIEWS = [
  { id: 'grid', label: 'グリッド' },
  { id: 'list', label: '会場別' },
  { id: 'mine', label: 'マイ' },
  { id: 'now', label: 'いま・つぎ' },
] as const

export type ViewId = (typeof VIEWS)[number]['id']

interface TimetableViewProps {
  entry: SavedTimetable
  view: ViewId
  dayId: string | undefined
  onChangeView: (view: ViewId) => void
  onChangeDay: (dayId: string) => void
  onUpdateDoc: (doc: TimetableDoc) => void
  onDelete: () => void
  onBack: () => void
}

function tabClass(active: boolean): string {
  return `flex-1 border-b-[3px] px-2 py-1.5 text-sm whitespace-nowrap sm:flex-none sm:px-4 ${
    active
      ? 'border-cyan-700 font-bold text-gray-900 dark:border-cyan-400 dark:text-gray-100'
      : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
  }`
}

type Panel = 'none' | 'share' | 'edit'

export function TimetableView({
  entry,
  view,
  dayId,
  onChangeView,
  onChangeDay,
  onUpdateDoc,
  onDelete,
  onBack,
}: TimetableViewProps) {
  const { doc } = entry
  const nowMs = useNowMs()
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(loadFavorites(entry.id)),
  )
  const [friends, setFriends] = useState<Array<FriendPick>>(() =>
    loadFriends(entry.id),
  )
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('none')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notice, setNotice] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)

  // 別のタイムテーブルに切り替わったら読み直す
  useEffect(() => {
    setFavorites(new Set(loadFavorites(entry.id)))
    setFriends(loadFriends(entry.id))
    setSelectedId(null)
    setPanel('none')
    setNotice('')
  }, [entry.id])

  const live = liveDay(doc, nowMs)
  const activeDayId =
    dayId !== undefined && doc.days.some((d) => d.id === dayId)
      ? dayId
      : (live?.day.id ?? (doc.days.length > 0 ? doc.days[0].id : ''))

  const visibleFriends = useMemo(
    () => friends.filter((f) => f.hidden !== true),
    [friends],
  )

  const commitFavorites = (next: Set<string>) => {
    setFavorites(next)
    setSaveFailed(!saveFavorites(entry.id, [...next]))
  }

  const toggle = (actId: string) => {
    const next = new Set(favorites)
    if (next.has(actId)) next.delete(actId)
    else next.add(actId)
    commitFavorites(next)
  }

  // 枠のタップは詳細を開くだけ(お気に入りは枠の ☆ と詳細の ☆ で切り替える)。
  // 開いている出演をもう一度タップしたら閉じる
  const handleTapAct = (act: TimetableAct) => {
    setSelectedId((current) => (current === act.id ? null : act.id))
  }

  const handleFriendsChange = (next: Array<FriendPick>) => {
    setFriends(next)
    saveFriends(entry.id, next)
  }

  const handleUpdate = (next: TimetableDoc) => {
    const remapped = remapActIds(doc, next, [...favorites])
    commitFavorites(new Set(remapped.ids))
    handleFriendsChange(
      friends.map((f) => ({
        ...f,
        actIds: remapActIds(doc, next, f.actIds).ids,
      })),
    )
    onUpdateDoc(next)
    setPanel('none')
    setNotice(
      remapped.lost.length > 0
        ? `更新しました。お気に入りのうち ${remapped.lost.join('、')} は見つからなかったので外れました。`
        : '更新しました。',
    )
  }

  const selected =
    selectedId === null ? undefined : doc.acts.find((a) => a.id === selectedId)
  const showDayTabs = view === 'grid' || view === 'list'

  const viewContent = (
    <>
      {view === 'list' && (
        <VenueListView
          doc={doc}
          dayId={activeDayId}
          favorites={favorites}
          friends={visibleFriends}
          query={query}
          onToggle={toggle}
        />
      )}
      {view === 'mine' && (
        <MyView
          doc={doc}
          favorites={favorites}
          friends={visibleFriends}
          onToggle={toggle}
          onGoGrid={() => onChangeView('grid')}
        />
      )}
      {view === 'now' && (
        <NowView doc={doc} favorites={favorites} nowMs={nowMs} />
      )}
    </>
  )

  // 画面全体(サイトのヘッダー = 中身 4rem + 下罫線 1px を除いた高さ)を縦の flex にする。
  // ツールバーが折り返して高くなっても、グリッドは残りの高さに収まる(固定値で引かない)。
  // 詳細シートもフローの中に置くので、グリッドの最下段がシートに隠れない
  return (
    <div className="flex h-[calc(100dvh-4rem-1px)] flex-col text-gray-900 dark:text-gray-100">
      <div className="shrink-0 border-b border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 pt-2">
          <button
            type="button"
            className={btn}
            onClick={onBack}
            aria-label="一覧に戻る"
          >
            一覧
          </button>
          <h1
            className="min-w-0 flex-1 truncate text-base font-bold"
            title={doc.title}
          >
            <Txt text={doc.title} />
          </h1>
          <button
            type="button"
            className={btn}
            aria-pressed={panel === 'share'}
            onClick={() => setPanel(panel === 'share' ? 'none' : 'share')}
          >
            共有
          </button>
          <MoreMenu
            onEdit={() => setPanel('edit')}
            onDelete={() => setConfirmDelete(true)}
          />
        </div>
        <div
          className="mx-auto flex max-w-6xl px-3 pt-2"
          role="group"
          aria-label="表示"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => {
                setPanel('none')
                onChangeView(v.id)
              }}
              className={tabClass(view === v.id && panel === 'none')}
            >
              {v.label}
              {v.id === 'mine' && favorites.size > 0 && (
                <span className="ml-1 text-xs tabular-nums">
                  {favorites.size}
                </span>
              )}
            </button>
          ))}
        </div>
        {showDayTabs && panel === 'none' && (
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 border-t border-gray-200 px-3 py-1.5 dark:border-gray-800">
            {doc.days.length > 1 && (
              <div
                className="flex flex-wrap gap-1"
                role="group"
                aria-label="日付"
              >
                {doc.days.map((day) => (
                  <button
                    key={day.id}
                    type="button"
                    aria-pressed={day.id === activeDayId}
                    onClick={() => onChangeDay(day.id)}
                    className={`rounded-md px-2 py-1 text-sm whitespace-nowrap tabular-nums ${
                      day.id === activeDayId
                        ? 'bg-gray-900 font-bold text-white dark:bg-gray-100 dark:text-gray-900'
                        : 'border border-gray-300 text-gray-800 dark:border-gray-600 dark:text-gray-200'
                    }`}
                  >
                    {formatDateLabel(day.date)}
                    {live?.day.id === day.id && (
                      <span className="ml-1 text-xs">今日</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {doc.days.length === 1 && (
              <span className="text-sm font-semibold">
                {formatDateLabel(doc.days[0].date)}
              </span>
            )}
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="出演者を検索"
              aria-label="出演者を検索"
              className={`${field} min-w-0 flex-1 basis-32 py-1`}
            />
          </div>
        )}
        {view === 'grid' && panel === 'none' && favorites.size === 0 && (
          <p className="mx-auto max-w-6xl px-3 pb-1 text-xs text-gray-700 dark:text-gray-300">
            出演の右上の ☆
            でお気に入り(★・塗り)、出演をタップすると詳細が出ます。破線の枠は友達の選択です。
          </p>
        )}
      </div>

      {saveFailed && (
        <p className="shrink-0 border-l-4 border-rose-600 bg-rose-50 px-3 py-1 text-sm text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
          お気に入りを端末に保存できませんでした。プライベートブラウズを使っている場合は通常のタブで開いてください。
        </p>
      )}
      {notice && (
        <p
          className="flex shrink-0 items-start gap-2 border-l-4 border-cyan-700 bg-cyan-50 px-3 py-1 text-sm dark:border-cyan-500 dark:bg-cyan-950/60"
          role="status"
        >
          <span className="flex-1">{notice}</span>
          <button
            type="button"
            className="text-xs text-gray-700 underline dark:text-gray-300"
            onClick={() => setNotice('')}
          >
            閉じる
          </button>
        </p>
      )}

      {panel !== 'none' ? (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-3 pb-10 pt-3">
            {panel === 'share' ? (
              <SharePanel
                doc={doc}
                favorites={favorites}
                friends={friends}
                dayId={activeDayId}
                onFriendsChange={handleFriendsChange}
                onClose={() => setPanel('none')}
              />
            ) : (
              <ImportPanel
                current={doc}
                onImport={handleUpdate}
                onCancel={() => setPanel('none')}
              />
            )}
          </div>
        </main>
      ) : view === 'grid' ? (
        <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
          <GridView
            doc={doc}
            dayId={activeDayId}
            favorites={favorites}
            friends={visibleFriends}
            query={query}
            nowMs={nowMs}
            selectedId={selectedId}
            onTapAct={handleTapAct}
            onToggleFav={toggle}
          />
        </main>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-3 pb-10">{viewContent}</div>
        </main>
      )}

      {selected && view === 'grid' && panel === 'none' && (
        <ActDetail
          doc={doc}
          act={selected}
          fav={favorites.has(selected.id)}
          friendNames={friends
            .filter((f) => f.hidden !== true && f.actIds.includes(selected.id))
            .map((f) => f.name)}
          onToggle={() => toggle(selected.id)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="タイムテーブルを削除しますか"
          message={
            <>
              「<Txt text={doc.title} />
              」と、そのお気に入り・友達の選択をこの端末から消します。元に戻せません。
            </>
          }
          confirmLabel="削除する"
          onConfirm={() => {
            setConfirmDelete(false)
            onDelete()
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

/** 「その他」メニュー。外側のクリックと Esc で閉じる */
function MoreMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target) !== true
      ) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item = 'block w-full px-3 py-2 text-left'
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={btn}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
      >
        その他
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-52 border border-gray-300 bg-white py-1 text-sm dark:border-gray-700 dark:bg-gray-900">
          <button
            type="button"
            className={`${item} hover:bg-gray-100 dark:hover:bg-gray-800`}
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
          >
            AI で追記・修正
          </button>
          <button
            type="button"
            className={`${item} text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/60`}
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            このタイムテーブルを削除
          </button>
          <div className="mt-1 border-t border-gray-200 px-3 pb-1 pt-2 dark:border-gray-700">
            <p className="text-xs text-gray-700 dark:text-gray-300">配色</p>
            <ThemeSwitch className="mt-1" />
          </div>
        </div>
      )}
    </div>
  )
}
