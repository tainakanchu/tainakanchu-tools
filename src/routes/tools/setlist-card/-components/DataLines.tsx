import { useId, useState } from 'react'
import { FORMAT_LABELS } from '../-lib/types'
import type { ParseResult, Setlist } from '../-lib/types'

/**
 * 読み込んだもの（ファイル名、差し替え、プレイリスト）を 1 行で。
 */
export function SourceLine({
  result,
  fileName,
  selectedIndex,
  loading,
  error,
  onPick,
  onSelectPlaylist,
}: {
  result: ParseResult | null
  fileName: string | null
  selectedIndex: number
  loading: boolean
  error: string | null
  onPick: () => void
  onSelectPlaylist: (index: number) => void
}) {
  const playlists = result?.playlists ?? []
  return (
    <div className="space-y-1">
      <div className="flex min-h-11 items-center gap-2">
        <span
          className="min-w-0 flex-1 truncate"
          title={result ? FORMAT_LABELS[result.format] : undefined}
        >
          {loading
            ? '読み込み中…'
            : fileName
              ? fileName
              : result
                ? FORMAT_LABELS[result.format]
                : 'サンプル'}
        </span>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={onPick}
          title="rekordbox（.xml / .txt / .m3u8）、Traktor（.nml）、Serato（.csv）の履歴やプレイリスト"
        >
          {fileName ? '差し替え' : '履歴を読み込む'}
        </button>
      </div>
      {playlists.length > 1 ? (
        <select
          className="input"
          aria-label={`プレイリスト（${playlists.length} 件）`}
          value={selectedIndex}
          onChange={(event) => onSelectPlaylist(Number(event.target.value))}
        >
          {playlists.map((playlist, index) => (
            <option key={playlist.id} value={index}>
              {[...playlist.path, playlist.name].join(' / ')}（
              {playlist.setlist.tracks.length} 曲）
            </option>
          ))}
        </select>
      ) : null}
      {error ? (
        <p role="alert" className="slc-note pb-2" data-tone="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

type MetaKey = 'title' | 'djName' | 'date' | 'venue'

const FIELDS: ReadonlyArray<{
  key: MetaKey
  label: string
  placeholder: string
}> = [
  { key: 'title', label: 'イベント名', placeholder: 'NIGHT DRIVE vol.12' },
  { key: 'djName', label: 'DJ', placeholder: 'DJ KANCHU' },
  { key: 'date', label: '日付', placeholder: '2026.11.03' },
  { key: 'venue', label: '会場', placeholder: 'SHIBUYA SOUND LAB' },
]

/** 見出し（イベント名・DJ・日付・会場）。ふだんは 1 行、押すと 4 つの欄 */
export function MetaLine({
  setlist,
  onChange,
}: {
  setlist: Setlist
  onChange: (key: MetaKey, value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const summary = FIELDS.map((f) => setlist[f.key])
    .filter(Boolean)
    .join('、')
  return (
    <div>
      <button
        type="button"
        className="slc-disclosure"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={summary ? '' : 'text-(--muted)'}>
          {summary || '見出しなし'}
        </span>
        <span className="shrink-0 text-(--muted)">見出しを編集</span>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="grid grid-cols-2 gap-x-3 gap-y-2 pb-4"
      >
        {FIELDS.map((field) => (
          <label
            key={field.key}
            className={`space-y-1 ${field.key === 'title' || field.key === 'venue' ? 'col-span-2' : ''}`}
          >
            <span className="slc-label block">{field.label}</span>
            <input
              type="text"
              className="input"
              value={setlist[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
