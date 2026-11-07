import { useEffect, useState } from 'react'
import { RefreshCw, Square } from 'lucide-react'
import {
  formatBytes,
  formatDuration,
} from '../../../../lib/meeting-recorder/session'
import {
  cardClass,
  dangerButtonClass,
  errorClass,
  noteClass,
  sectionTitleClass,
  subtleButtonClass,
  warningClass,
} from '../-lib/styles'
import { LevelMeter } from './LevelMeter'
import { MicSettings } from './MicSettings'
import type { MicOptions } from '../-lib/capture'
import type { StorageInfo } from '../-lib/sessions'

type Props = {
  startedAt: number
  savedSeconds: number
  savedBytes: number
  storage: StorageInfo | null
  stopping: boolean
  displayEnded: boolean
  micEnded: boolean
  error: string | null
  micOptions: MicOptions
  micDevices: Array<{ deviceId: string; label: string }>
  onMicOptionsChange: (next: MicOptions) => void
  micAnalyser: AnalyserNode | null
  systemAnalyser: AnalyserNode | null
  onReshare: () => void
  onStop: () => void
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function RecordingSection({
  startedAt,
  savedSeconds,
  savedBytes,
  storage,
  stopping,
  displayEnded,
  micEnded,
  error,
  micOptions,
  micDevices,
  onMicOptionsChange,
  micAnalyser,
  systemAnalyser,
  onReshare,
  onStop,
}: Props) {
  const now = useNow(250)
  const elapsed = (now - startedAt) / 1000
  const remaining = storage ? Math.max(0, storage.quota - storage.usage) : null

  return (
    <section className={`${cardClass} border-rose-200`}>
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-600">2.</span> 録音中
        <span className="ml-1 inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
      </h2>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-xs text-gray-500">経過時間</p>
          <p
            className="text-4xl font-bold tabular-nums text-gray-900"
            aria-live="off"
          >
            {formatDuration(elapsed)}
          </p>
        </div>
        <div className="text-sm text-gray-600">
          <p>
            保存済み:{' '}
            <span className="tabular-nums">
              {formatDuration(savedSeconds)}（{formatBytes(savedBytes)}）
            </span>
          </p>
          {remaining !== null && (
            <p className="text-xs text-gray-500">
              ブラウザの空き容量: 約 {formatBytes(remaining)}
              {storage?.persisted ? '' : '（永続化なし）'}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-3 rounded-xl bg-gray-50 p-4">
        <LevelMeter
          label="マイク（L）"
          analyser={micAnalyser}
          silentHint="ミュートになっていないか確認してください"
        />
        <LevelMeter
          label="相手（R）"
          analyser={systemAnalyser}
          silentHint="誰も話していなければ問題ありません"
        />
      </div>

      {displayEnded && (
        <p role="alert" className={`${warningClass} mt-4`}>
          画面共有が終了したため、相手の音声は無音で録音されています（マイクの録音は続いています）。
          「共有し直す」で相手の音声を戻せます。
        </p>
      )}
      {micEnded && (
        <p role="alert" className={`${warningClass} mt-4`}>
          マイクが切断されました。下でマイクを選び直すと録音に戻ります。
        </p>
      )}
      {error && (
        <p role="alert" className={`${errorClass} mt-4`}>
          {error}
        </p>
      )}

      <div className="mt-5">
        <MicSettings
          options={micOptions}
          devices={micDevices}
          disabled={stopping}
          onChange={onMicOptionsChange}
        />
        <p className={`${noteClass} mt-1 text-xs`}>
          録音中でもマイクを切り替えられます（録音は途切れません）。
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className={dangerButtonClass}
          onClick={onStop}
          disabled={stopping}
        >
          <Square size={16} aria-hidden />
          {stopping ? '保存しています…' : '停止して保存'}
        </button>
        <button
          type="button"
          className={subtleButtonClass}
          onClick={onReshare}
          disabled={stopping}
        >
          <RefreshCw size={16} aria-hidden />
          共有し直す
        </button>
      </div>
    </section>
  )
}
