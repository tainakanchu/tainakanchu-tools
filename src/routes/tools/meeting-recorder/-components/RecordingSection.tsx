import { useEffect, useState } from 'react'
import {
  formatBytes,
  formatDuration,
} from '../../../../lib/meeting-recorder/session'
import { Note } from '../../../../components/ui'
import {
  noteClass,
  primaryButtonClass,
  sectionClass,
  sectionTitleClass,
  subtleButtonClass,
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
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>2. 録音中</h2>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-xs text-ink-muted">経過時間</p>
          <p className="text-4xl font-bold tabular-nums" aria-live="off">
            {formatDuration(elapsed)}
          </p>
        </div>
        <div className="text-sm">
          <p>
            保存済み:{' '}
            <span className="tabular-nums">
              {formatDuration(savedSeconds)}（{formatBytes(savedBytes)}）
            </span>
          </p>
          {remaining !== null && (
            <p className="text-xs text-ink-muted">
              ブラウザの空き容量: 約 {formatBytes(remaining)}
              {storage?.persisted ? '' : '（永続化なし）'}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-3 bg-wash p-4">
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
        <Note tone="warn" role="alert" className="mt-4">
          画面共有が終了したため、相手の音声は無音で録音されています（マイクの録音は続いています）。
          「共有し直す」で相手の音声を戻せます。
        </Note>
      )}
      {micEnded && (
        <Note tone="warn" role="alert" className="mt-4">
          マイクが切断されました。下でマイクを選び直すと録音に戻ります。
        </Note>
      )}
      {error && (
        <Note tone="error" role="alert" className="mt-4">
          {error}
        </Note>
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

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          className={primaryButtonClass}
          onClick={onStop}
          disabled={stopping}
        >
          {stopping ? '保存しています…' : '停止して保存'}
        </button>
        <button
          type="button"
          className={subtleButtonClass}
          onClick={onReshare}
          disabled={stopping}
        >
          共有し直す
        </button>
      </div>
    </section>
  )
}
