import { useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw, Trash2 } from 'lucide-react'
import {
  formatBytes,
  formatDuration,
} from '../../../../lib/meeting-recorder/session'
import {
  cardClass,
  noteClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import { ExportPanel } from './ExportPanel'
import type { SessionSummary, StorageInfo } from '../-lib/sessions'

type Props = {
  sessions: Array<SessionSummary> | null
  storage: StorageInfo | null
  /** 録音を止めた直後のセッションは書き出し欄を開いておく */
  openId: string | null
  onOpenChange: (id: string | null) => void
  onRefresh: () => void
  onDelete: (id: string) => void
}

const STATE_BADGES: Record<
  SessionSummary['state'],
  { label: string; className: string }
> = {
  complete: {
    label: '保存済み',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  interrupted: {
    label: '中断（復元可能）',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  active: {
    label: '録音中',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  broken: {
    label: '情報なし',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
}

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function SessionsSection({
  sessions,
  storage,
  openId,
  onOpenChange,
  onRefresh,
  onDelete,
}: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={sectionTitleClass}>
          <span className="text-cyan-600">3.</span> 録音一覧 / 書き出し
        </h2>
        <button type="button" className={subtleButtonClass} onClick={onRefresh}>
          <RefreshCw size={14} aria-hidden />
          更新
        </button>
      </div>
      <p className={`${noteClass} mt-1`}>
        録音はこのブラウザの中（OPFS）にだけ保存され、どこにも送信されません。
        ブラウザが落ちても途中までの録音は残り、「中断（復元可能）」として書き出せます。
        {storage && (
          <span className="block text-xs text-gray-500">
            使用中 {formatBytes(storage.usage)} / 上限 約{' '}
            {formatBytes(storage.quota)}
          </span>
        )}
      </p>

      {sessions === null ? (
        <p className="mt-4 text-sm text-gray-500">読み込み中…</p>
      ) : sessions.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">まだ録音はありません。</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {sessions.map((session) => {
            const badge = STATE_BADGES[session.state]
            const open = openId === session.id
            const canExport =
              session.meta !== null &&
              session.state !== 'active' &&
              session.durationSeconds > 0
            return (
              <li
                key={session.id}
                className="rounded-xl border border-gray-200 p-3"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900">
                      {session.meta
                        ? dateFormatter.format(new Date(session.meta.createdAt))
                        : session.id}
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-gray-500">
                      {formatDuration(session.durationSeconds)} ・{' '}
                      {formatBytes(session.bytes)}
                      {session.meta &&
                        ` ・ ${session.meta.sampleRate / 1000} kHz`}
                      {session.meta?.sourceLabel &&
                        ` ・ ${session.meta.sourceLabel}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {canExport && (
                      <button
                        type="button"
                        className={subtleButtonClass}
                        aria-expanded={open}
                        onClick={() => onOpenChange(open ? null : session.id)}
                      >
                        書き出し
                        {open ? (
                          <ChevronUp size={14} aria-hidden />
                        ) : (
                          <ChevronDown size={14} aria-hidden />
                        )}
                      </button>
                    )}
                    {session.state !== 'active' &&
                      (confirmId === session.id ? (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                            onClick={() => {
                              setConfirmId(null)
                              onDelete(session.id)
                            }}
                          >
                            削除する
                          </button>
                          <button
                            type="button"
                            className={subtleButtonClass}
                            onClick={() => setConfirmId(null)}
                          >
                            やめる
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={subtleButtonClass}
                          aria-label="この録音を削除"
                          onClick={() => setConfirmId(session.id)}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      ))}
                  </div>
                </div>
                {open && canExport && session.meta && (
                  <div className="mt-3">
                    <ExportPanel
                      meta={session.meta}
                      durationSeconds={session.durationSeconds}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
