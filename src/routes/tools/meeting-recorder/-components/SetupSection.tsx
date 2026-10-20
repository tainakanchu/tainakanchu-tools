import { CircleDot, MonitorUp, RefreshCw, X } from 'lucide-react'
import { SAMPLE_RATES } from '../../../../lib/meeting-recorder/session'
import {
  cardClass,
  errorClass,
  fieldClass,
  labelClass,
  noteClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import { LevelMeter } from './LevelMeter'
import { MicSettings } from './MicSettings'
import type { RecordingSampleRate } from '../../../../lib/meeting-recorder/session'
import type { MicOptions } from '../-lib/capture'

export type SetupPhase = 'idle' | 'preparing' | 'ready' | 'starting'

type Props = {
  phase: SetupPhase
  sampleRate: RecordingSampleRate
  onSampleRateChange: (rate: RecordingSampleRate) => void
  micOptions: MicOptions
  micDevices: Array<{ deviceId: string; label: string }>
  onMicOptionsChange: (next: MicOptions) => void
  micAnalyser: AnalyserNode | null
  systemAnalyser: AnalyserNode | null
  sourceLabel: string | null
  error: string | null
  onShare: () => void
  onReshare: () => void
  onCancel: () => void
  onStart: () => void
}

const SAMPLE_RATE_NOTES: Record<RecordingSampleRate, string> = {
  16000: '文字起こし向け（軽い）',
  24000: '少し聞きやすく',
  48000: '音楽も含めて高音質',
}

export function SetupSection({
  phase,
  sampleRate,
  onSampleRateChange,
  micOptions,
  micDevices,
  onMicOptionsChange,
  micAnalyser,
  systemAnalyser,
  sourceLabel,
  error,
  onShare,
  onReshare,
  onCancel,
  onStart,
}: Props) {
  const prepared = phase === 'ready' || phase === 'starting'
  const busy = phase === 'preparing' || phase === 'starting'

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-600">1.</span> 準備
      </h2>
      <p className={`${noteClass} mt-1`}>
        マイクと録音の質を選んでから、会議のタブ（または画面）を共有します。
        共有後に両方のメーターが動くことを確かめてから録音を始めてください。
      </p>

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <MicSettings
          options={micOptions}
          devices={micDevices}
          disabled={busy}
          onChange={onMicOptionsChange}
        />
        <label className="block space-y-1">
          <span className={labelClass}>サンプリング周波数</span>
          <select
            className={fieldClass}
            value={sampleRate}
            disabled={prepared || busy}
            onChange={(event) =>
              onSampleRateChange(
                SAMPLE_RATES.find((r) => r === Number(event.target.value)) ??
                  sampleRate,
              )
            }
          >
            {SAMPLE_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate / 1000} kHz — {SAMPLE_RATE_NOTES[rate]}
              </option>
            ))}
          </select>
          <span className="block text-xs text-gray-500">
            {prepared
              ? '変更するには「共有をやめる」で準備をやり直してください。'
              : `ブラウザ内の保存量は 1 時間あたり約 ${Math.round((sampleRate * 4 * 3600) / 1024 / 1024)} MB です。`}
          </span>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {prepared ? (
          <>
            <button
              type="button"
              className={primaryButtonClass}
              onClick={onStart}
              disabled={busy}
            >
              <CircleDot size={16} aria-hidden />
              {phase === 'starting' ? '開始しています…' : '録音開始'}
            </button>
            <button
              type="button"
              className={subtleButtonClass}
              onClick={onReshare}
              disabled={busy}
            >
              <RefreshCw size={16} aria-hidden />
              共有し直す
            </button>
            <button
              type="button"
              className={subtleButtonClass}
              onClick={onCancel}
              disabled={busy}
            >
              <X size={16} aria-hidden />
              共有をやめる
            </button>
          </>
        ) : (
          <button
            type="button"
            className={primaryButtonClass}
            onClick={onShare}
            disabled={busy}
          >
            <MonitorUp size={16} aria-hidden />
            {phase === 'preparing'
              ? '共有を待っています…'
              : '会議タブ/画面を共有'}
          </button>
        )}
        <span className="text-xs text-gray-500">
          録音する場合は参加者の同意を得てください。
        </span>
      </div>

      {error && (
        <p role="alert" className={`${errorClass} mt-4`}>
          {error}
        </p>
      )}

      {prepared && (
        <div className="mt-5 space-y-3 rounded-xl bg-gray-50 p-4">
          {sourceLabel && (
            <p className="truncate text-xs text-gray-500">
              共有中: {sourceLabel}
            </p>
          )}
          <LevelMeter
            label="マイク（L）"
            analyser={micAnalyser}
            silentHint="マイクに向かって話してみてください"
          />
          <LevelMeter
            label="相手（R）"
            analyser={systemAnalyser}
            silentHint="会議の音が出ているか確認してください"
          />
        </div>
      )}

      <details className="mt-5 text-sm text-gray-600">
        <summary className="cursor-pointer font-medium text-gray-700">
          相手の音声を取り込むには
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Google
            Meet・Zoom（ブラウザ版）・Teams（ブラウザ版）などは、共有ダイアログで
            <strong>会議のタブ</strong>を選び「<strong>タブの音声も共有</strong>
            」をオンにします。
          </li>
          <li>
            Windows でデスクトップアプリの会議を録るときは
            <strong>画面全体</strong>を選び 「
            <strong>システム音声を共有</strong>」をオンにします。
          </li>
          <li>
            Mac ではブラウザの外（ネイティブアプリ）の音声は取得できません。
            会議はブラウザ版で参加してタブを共有してください。
          </li>
          <li>
            相手の音はイヤホンでいつも通り聞こえます。このページからは音を鳴らしません。
          </li>
        </ul>
      </details>
    </section>
  )
}
