import { useState } from 'react'
import {
  formatBytes,
  formatDuration,
} from '../../../../lib/meeting-recorder/session'
import { Badge } from '../../../../components/ui'
import {
  dangerButtonClass,
  noteClass,
  sectionClass,
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
  { label: string; tone: 'outline' | 'solid' | 'dashed' | 'muted' }
> = {
  complete: { label: '保存済み', tone: 'outline' },
  interrupted: { label: '中断（復元可能）', tone: 'dashed' },
  active: { label: '録音中', tone: 'solid' },
  broken: { label: '情報なし', tone: 'muted' },
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
    <section className={sectionClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={sectionTitleClass}>3. 録音一覧と書き出し</h2>
        <button type="button" className={subtleButtonClass} onClick={onRefresh}>
          更新
        </button>
      </div>
      <p className={`${noteClass} mt-1`}>
        録音はこのブラウザの中（OPFS）にだけ保存され、どこにも送信されません。
        ブラウザが落ちても途中までの録音は残り、「中断（復元可能）」として書き出せます。
        {storage && (
          <span className="block text-xs text-ink-muted">
            使用中 {formatBytes(storage.usage)}（上限 約{' '}
            {formatBytes(storage.quota)}）
          </span>
        )}
      </p>

      {sessions === null ? (
        <p className="mt-4 text-sm text-ink-muted">読み込み中…</p>
      ) : sessions.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">まだ録音はありません。</p>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {sessions.map((session) => {
            const badge = STATE_BADGES[session.state]
            const open = openId === session.id
            const canExport =
              session.meta !== null &&
              session.state !== 'active' &&
              session.durationSeconds > 0
            return (
              <li key={session.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      {session.meta
                        ? dateFormatter.format(new Date(session.meta.createdAt))
                        : session.id}
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </p>
                    <p className="mt-0.5 text-xs break-words text-ink-muted tabular-nums">
                      {formatDuration(session.durationSeconds)}（
                      {formatBytes(session.bytes)}
                      {session.meta
                        ? `、${session.meta.sampleRate / 1000} kHz`
                        : ''}
                      ）
                      {session.meta?.sourceLabel
                        ? `。${session.meta.sourceLabel} から録音`
                        : ''}
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
                        {open ? '書き出しを閉じる' : '書き出し'}
                      </button>
                    )}
                    {session.state !== 'active' &&
                      (confirmId === session.id ? (
                        <>
                          <button
                            type="button"
                            className={dangerButtonClass}
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
                          削除
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
