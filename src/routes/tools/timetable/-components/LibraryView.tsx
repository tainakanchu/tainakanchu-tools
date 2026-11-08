import { useState } from 'react'
import { Txt } from '@/components/Txt'
import { formatDateLabel } from '../../../../lib/timetable/time'
import { btn, btnDanger, btnPrimary } from '../-lib/ui'
import { ConfirmDialog } from './ConfirmDialog'
import { ImportPanel } from './ImportPanel'
import type { SavedTimetable } from '../../../../lib/timetable/storage'
import type { TimetableDoc } from '../../../../lib/timetable/types'

interface LibraryViewProps {
  library: ReadonlyArray<SavedTimetable>
  onOpen: (id: string) => void
  onImport: (doc: TimetableDoc) => void
  onDelete: (id: string) => void
}

/** 「11/7(土)と11/8(日)、10 会場で 120 組」のような一文 */
function summary(doc: TimetableDoc): string {
  const dates = doc.days.map((day) => formatDateLabel(day.date))
  const when =
    dates.length <= 2
      ? dates.join('と')
      : `${dates[0]}から${dates[dates.length - 1]}まで`
  return `${when}、${doc.venues.length} 会場で ${doc.acts.length} 組`
}

export function LibraryView({
  library,
  onOpen,
  onImport,
  onDelete,
}: LibraryViewProps) {
  const [importing, setImporting] = useState(library.length === 0)
  const [deleting, setDeleting] = useState<SavedTimetable | null>(null)

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-4 text-gray-900 dark:text-gray-100">
      <h1 className="text-xl font-bold">マイタイムテーブル</h1>
      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
        フェスやイベントの公式タイムテーブルを自分の AI
        に読ませて取り込み、見たい出演だけの自分用タイムテーブルを作ります。データはこの端末の中だけに保存されます。
      </p>

      <section className="mt-5" aria-labelledby="tt-lib-title">
        <div className="flex items-center justify-between border-b-2 border-gray-900 dark:border-gray-300 pb-1">
          <h2 id="tt-lib-title" className="text-base font-bold">
            保存したタイムテーブル
          </h2>
          {!importing && (
            <button
              type="button"
              className={btnPrimary}
              onClick={() => setImporting(true)}
            >
              新しく取り込む
            </button>
          )}
        </div>
        {library.length === 0 ? (
          <p className="py-3 text-sm text-gray-700 dark:text-gray-300">
            まだありません。下の手順で公式タイムテーブルを取り込むか、「サンプルを読み込む」で試せます。
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {library.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 py-2">
                <button
                  type="button"
                  onClick={() => onOpen(entry.id)}
                  className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-cyan-600 dark:focus-visible:outline-cyan-400"
                >
                  <span className="block truncate font-bold text-cyan-900 dark:text-cyan-200 underline-offset-2 hover:underline">
                    <Txt text={entry.doc.title} />
                  </span>
                  <span className="block text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    {summary(entry.doc)}
                  </span>
                </button>
                <button
                  type="button"
                  className={btnDanger}
                  onClick={() => setDeleting(entry)}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {importing && (
        <div className="mt-6">
          <ImportPanel
            onImport={(doc) => {
              setImporting(false)
              onImport(doc)
            }}
            onCancel={
              library.length > 0 ? () => setImporting(false) : undefined
            }
          />
        </div>
      )}

      {!importing && (
        <p className="mt-6 text-sm">
          <button
            type="button"
            className={btn}
            onClick={() => setImporting(true)}
          >
            JSON の貼り付け・ファイルから取り込む
          </button>
        </p>
      )}

      {deleting && (
        <ConfirmDialog
          title="タイムテーブルを削除しますか"
          message={
            <>
              「<Txt text={deleting.doc.title} />
              」と、そのお気に入り・友達の選択をこの端末から消します。元に戻せません。
            </>
          }
          confirmLabel="削除する"
          onConfirm={() => {
            onDelete(deleting.id)
            setDeleting(null)
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </main>
  )
}
