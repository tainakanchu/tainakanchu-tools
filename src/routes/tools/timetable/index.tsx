import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'
import { remapActIds } from '../../../lib/timetable/favorites'
import { decodeShareHash, hasShareHash } from '../../../lib/timetable/share'
import {
  loadFavorites,
  loadFriends,
  loadLibrary,
  newLocalId,
  removeTimetableData,
  saveFavorites,
  saveFriends,
  saveLibrary,
} from '../../../lib/timetable/storage'
import { IncomingShare } from './-components/IncomingShare'
import { LibraryView } from './-components/LibraryView'
import { TimetableView, VIEWS } from './-components/TimetableView'
import type { FavoriteUse } from './-components/IncomingShare'
import type { ViewId } from './-components/TimetableView'
import type { SharedTimetable } from '../../../lib/timetable/share'
import type { SavedTimetable } from '../../../lib/timetable/storage'
import type { TimetableDoc } from '../../../lib/timetable/types'

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('timetable')!

interface TimetableSearch {
  /** 開いているタイムテーブル(端末ローカルの id) */
  t?: string
  v?: ViewId
  d?: string
}

function viewParam(value: unknown): { v?: ViewId } {
  const found = VIEWS.find((view) => view.id === value)
  return found === undefined ? {} : { v: found.id }
}

/** 共有で受け取ったお気に入りを、自分のものか友達の選択として保存する */
function applyFavorites(
  entryId: string,
  ids: Array<string>,
  use: FavoriteUse,
  friendName: string,
) {
  if (use === 'own') {
    return saveFavorites(entryId, [
      ...new Set([...loadFavorites(entryId), ...ids]),
    ])
  } else {
    return saveFriends(entryId, [
      ...loadFriends(entryId),
      { id: newLocalId('f'), name: friendName, actIds: ids },
    ])
  }
}

export const Route = createFileRoute('/tools/timetable/')({
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): TimetableSearch => ({
    ...(typeof search.t === 'string' ? { t: search.t } : {}),
    ...viewParam(search.v),
    ...(typeof search.d === 'string' ? { d: search.d } : {}),
  }),
  component: ThemedTimetablePage,
})

/**
 * 配色はサイト全体の ThemeProvider(__root.tsx)が <html> に付け、ページの地も
 * そちらで塗る。ここでは中身の既定の文字色だけを決める(ライトの既定は黒なので、
 * 以前のスコープと同じ gray-900 に揃える)
 */
function ThemedTimetablePage() {
  return (
    <div className="text-gray-900 dark:text-gray-100">
      <TimetablePage />
    </div>
  )
}

function clearHash() {
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  )
}

function TimetablePage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [library, setLibrary] = useState<Array<SavedTimetable>>(() =>
    typeof window === 'undefined' ? [] : loadLibrary(),
  )
  const [shared, setShared] = useState<SharedTimetable | null>(null)
  const [shareBroken, setShareBroken] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const saveFeedback = saveFailed && (
    <p className="shrink-0 border-l-4 border-rose-600 bg-rose-50 px-3 py-1 text-sm text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
      端末に保存できませんでした。プライベートブラウズを使っている場合は通常のタブで開いてください。
    </p>
  )

  // 共有URLで開かれたら、まず中身を見せる。保存するかは利用者が選ぶ
  useEffect(() => {
    const read = () => {
      const hash = window.location.hash
      if (!hasShareHash(hash)) return
      const decoded = decodeShareHash(hash)
      if (decoded === null) {
        setShareBroken(true)
        clearHash()
        return
      }
      setShareBroken(false)
      setShared(decoded)
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  const commitLibrary = (next: Array<SavedTimetable>) => {
    const saved = saveLibrary(next)
    setSaveFailed(!saved)
    if (saved) setLibrary(next)
    return saved
  }

  const open = (id: string, view: ViewId = 'grid') =>
    void navigate({ search: { t: id, v: view } })

  const addDoc = (doc: TimetableDoc): string | null => {
    const id = newLocalId()
    return commitLibrary([
      { id, doc, savedAt: new Date().toISOString() },
      ...library,
    ])
      ? id
      : null
  }

  const finishShare = () => {
    setShared(null)
    clearHash()
  }

  if (shared !== null) {
    return (
      <>
        {saveFeedback}
        <IncomingShare
          shared={shared}
          library={library}
          onSaveNew={({ use, friendName }) => {
            const id = newLocalId()
            if (
              shared.favorites &&
              !applyFavorites(id, shared.favorites.actIds, use, friendName)
            ) {
              setSaveFailed(true)
              return
            }
            if (
              !commitLibrary([
                { id, doc: shared.doc, savedAt: new Date().toISOString() },
                ...library,
              ])
            )
              return
            finishShare()
            open(id)
          }}
          onMergeInto={(entryId, { use, friendName }) => {
            const entry = library.find((e) => e.id === entryId)
            if (entry === undefined) return
            if (shared.favorites) {
              const { ids } = remapActIds(
                shared.doc,
                entry.doc,
                shared.favorites.actIds,
              )
              if (!applyFavorites(entryId, ids, use, friendName)) {
                setSaveFailed(true)
                return
              }
            } else {
              const { ids } = remapActIds(
                entry.doc,
                shared.doc,
                loadFavorites(entryId),
              )
              const favoritesSaved = saveFavorites(entryId, ids)
              const friendsSaved = saveFriends(
                entryId,
                loadFriends(entryId).map((f) => ({
                  ...f,
                  actIds: remapActIds(entry.doc, shared.doc, f.actIds).ids,
                })),
              )
              if (!favoritesSaved || !friendsSaved) {
                setSaveFailed(true)
                return
              }
              if (
                !commitLibrary(
                  library.map((e) =>
                    e.id === entryId
                      ? {
                          ...e,
                          doc: shared.doc,
                          savedAt: new Date().toISOString(),
                        }
                      : e,
                  ),
                )
              )
                return
            }
            setSaveFailed(false)
            finishShare()
            open(entryId)
          }}
          onDismiss={finishShare}
        />
      </>
    )
  }

  const entry =
    search.t === undefined ? undefined : library.find((e) => e.id === search.t)

  if (entry !== undefined) {
    return (
      <>
        {saveFeedback}
        <TimetableView
          entry={entry}
          view={search.v ?? 'grid'}
          dayId={search.d}
          onChangeView={(v) =>
            void navigate({ search: { ...search, v }, replace: true })
          }
          onChangeDay={(d) =>
            void navigate({ search: { ...search, d }, replace: true })
          }
          onUpdateDoc={(doc) =>
            commitLibrary(
              library.map((e) =>
                e.id === entry.id
                  ? { ...e, doc, savedAt: new Date().toISOString() }
                  : e,
              ),
            )
          }
          onDelete={() => {
            if (!commitLibrary(library.filter((e) => e.id !== entry.id))) return
            removeTimetableData(entry.id)
            void navigate({ search: {} })
          }}
          onBack={() => void navigate({ search: {} })}
        />
      </>
    )
  }

  return (
    <>
      {saveFeedback}
      {shareBroken && (
        <p className="mx-auto mt-3 max-w-3xl border-l-4 border-rose-600 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
          共有 URL を読み取れませんでした。URL
          が途中で切れていないか確かめ、送ってくれた人にもう一度コピーしてもらってください。
        </p>
      )}
      {search.t !== undefined && (
        <p className="mx-auto mt-3 max-w-3xl border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/50">
          指定されたタイムテーブルはこの端末に保存されていません。一覧から選んでください。
        </p>
      )}
      <LibraryView
        library={library}
        onOpen={(id) => open(id)}
        onImport={(doc) => {
          const id = addDoc(doc)
          if (id !== null) open(id)
        }}
        onDelete={(id) => {
          if (commitLibrary(library.filter((e) => e.id !== id)))
            removeTimetableData(id)
        }}
      />
    </>
  )
}
