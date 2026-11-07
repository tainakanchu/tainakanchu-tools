import { SAMPLE_RATES } from '../../../../lib/meeting-recorder/session'
import {
  noteClass,
  primaryButtonClass,
  sectionClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import { Field, Note, Select } from '../../../../components/ui'
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
  16000: '文字起こし向け、軽い',
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
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>1. 準備</h2>
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
        <Field
          label="サンプリング周波数"
          hint={
            prepared
              ? '変更するには「共有をやめる」で準備をやり直してください。'
              : `ブラウザ内の保存量は 1 時間あたり約 ${Math.round((sampleRate * 4 * 3600) / 1024 / 1024)} MB です。`
          }
        >
          <Select
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
                {rate / 1000} kHz（{SAMPLE_RATE_NOTES[rate]}）
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {prepared ? (
          <>
            <button
              type="button"
              className={primaryButtonClass}
              onClick={onStart}
              disabled={busy}
            >
              {phase === 'starting' ? '開始しています…' : '録音開始'}
            </button>
            <button
              type="button"
              className={subtleButtonClass}
              onClick={onReshare}
              disabled={busy}
            >
              共有し直す
            </button>
            <button
              type="button"
              className={subtleButtonClass}
              onClick={onCancel}
              disabled={busy}
            >
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
            {phase === 'preparing'
              ? '共有を待っています…'
              : '会議のタブか画面を共有'}
          </button>
        )}
        <span className="text-xs text-ink-muted">
          録音する場合は参加者の同意を得てください。
        </span>
      </div>

      {error && (
        <Note tone="error" role="alert" className="mt-4">
          {error}
        </Note>
      )}

      {prepared && (
        <div className="mt-5 space-y-3 bg-wash p-4">
          {sourceLabel && (
            <p className="truncate text-xs text-ink-muted">
              共有中のタブや画面: {sourceLabel}
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

      <details className="mt-5 text-sm">
        <summary className="cursor-pointer font-bold">
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
