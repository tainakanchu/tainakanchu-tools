import { useEffect, useRef, useState } from 'react'
import { FileUp, ShieldCheck, Sparkles } from 'lucide-react'
import {
  fieldClass,
  labelClass,
  sectionClass,
  sectionNoteClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import { FORMAT_LABELS } from '../-lib/types'
import type { ParseResult } from '../-lib/types'

type Props = {
  result: ParseResult | null
  fileName: string | null
  selectedIndex: number
  loading: boolean
  error: string | null
  onFile: (file: File) => void
  onSample: () => void
  onSelectPlaylist: (index: number) => void
}

export function SourceSection({
  result,
  fileName,
  selectedIndex,
  loading,
  error,
  onFile,
  onSample,
  onSelectPlaylist,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // ドロップ領域を外したファイルがブラウザで開かれてしまうのを防ぐ
  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const pick = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onFile(file)
  }

  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-400">1.</span> 再生履歴を読み込む
      </h2>
      <p className={`${sectionNoteClass} mt-2`}>
        rekordbox の
        XML（コレクションの書き出し）・プレイリストのテキスト書き出し
        (.txt)、Traktor の History (.nml)、Serato の History (.csv)
        に対応しています。形式はファイルの中身から自動で判定します。
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            pick(event.dataTransfer.files)
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-center text-sm transition ${
            dragOver
              ? 'border-cyan-400 bg-cyan-500/10 text-cyan-100'
              : 'border-white/20 text-gray-300 hover:border-cyan-400/60 hover:bg-white/5'
          }`}
        >
          <FileUp size={22} className="text-cyan-300" aria-hidden />
          <span className="font-medium">
            {loading
              ? '読み込み中…'
              : 'ファイルをドロップ、またはクリックして選択'}
          </span>
          <span className="text-xs text-gray-500">
            .xml / .txt / .nml / .csv
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".xml,.txt,.nml,.csv,text/plain,text/csv,application/xml,text/xml"
            className="sr-only"
            onChange={(event) => {
              pick(event.target.files)
              // 同じファイルを選び直しても change が飛ぶように
              event.target.value = ''
            }}
          />
        </label>
        <button
          type="button"
          className={`${subtleButtonClass} sm:h-full sm:flex-col sm:px-5`}
          onClick={onSample}
        >
          <Sparkles size={18} className="text-cyan-300" aria-hidden />
          サンプルで試す
        </button>
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-emerald-200/80">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
        ファイルも画像もブラウザの中だけで処理します。どこにもアップロードされません。
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-400">
            {fileName ? `${fileName} — ` : ''}
            {FORMAT_LABELS[result.format]} として読み込みました
          </p>
          {result.playlists.length > 1 ? (
            <label className="block space-y-1">
              <span className={labelClass}>
                プレイリスト（{result.playlists.length} 件）
              </span>
              <select
                className={fieldClass}
                value={selectedIndex}
                onChange={(event) =>
                  onSelectPlaylist(Number(event.target.value))
                }
              >
                {result.playlists.map((playlist, index) => (
                  <option key={playlist.id} value={index}>
                    {[...playlist.path, playlist.name].join(' / ')}（
                    {playlist.setlist.tracks.length} 曲）
                  </option>
                ))}
              </select>
              <span className="block text-xs text-gray-500">
                HISTORY フォルダの中で日付がいちばん新しいものを選んでいます。
                選び直すと曲リストは読み込み直されます。
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
