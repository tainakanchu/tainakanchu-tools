import { useEffect, useRef, useState } from 'react'
import { Field, Note, Panel, Radio, Select } from '../../../../components/ui'
import {
  DEFAULT_EXPORT_FORMAT,
  DEFAULT_EXPORT_MODE,
  EXPORT_FORMATS,
  EXPORT_MODES,
  bitrateOptions,
  defaultBitrate,
  estimateOutputBytes,
  exportTargets,
  normalizeBitrate,
  outputChannels,
} from '../../../../lib/meeting-recorder/export-options'
import {
  fileBaseName,
  formatBytes,
} from '../../../../lib/meeting-recorder/session'
import {
  chooseDestinations,
  downloadTempOutputs,
  probeCodecSupport,
  startExport,
} from '../-lib/export-client'
import { clearExportTemp } from '../-lib/sessions'
import {
  labelClass,
  primaryButtonClass,
  subtleButtonClass,
} from '../-lib/styles'
import type {
  ExportFormat,
  ExportMode,
} from '../../../../lib/meeting-recorder/export-options'
import type { SessionMeta } from '../../../../lib/meeting-recorder/session'
import type { ExportJob, ExportResult } from '../-lib/export-client'

type Props = {
  meta: SessionMeta
  durationSeconds: number
}

export function ExportPanel({ meta, durationSeconds }: Props) {
  const [mode, setMode] = useState<ExportMode>(DEFAULT_EXPORT_MODE)
  const [format, setFormat] = useState<ExportFormat>(DEFAULT_EXPORT_FORMAT)
  const channels = outputChannels(mode)
  const [bitrateChoice, setBitrateChoice] = useState(() =>
    defaultBitrate(DEFAULT_EXPORT_FORMAT, outputChannels(DEFAULT_EXPORT_MODE)),
  )
  // モードや形式を変えると候補が変わるので、候補外なら既定値として扱う
  const bitrate = normalizeBitrate(format, channels, bitrateChoice)
  const [aacSupported, setAacSupported] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExportResult | null>(null)
  const jobRef = useRef<ExportJob | null>(null)

  // AAC は OS / ブラウザのエンコーダー次第。モノラル・ステレオの両方で確かめる
  useEffect(() => {
    let alive = true
    void Promise.all([
      probeCodecSupport('aac', meta.sampleRate, 1, defaultBitrate('aac', 1)),
      probeCodecSupport('aac', meta.sampleRate, 2, defaultBitrate('aac', 2)),
    ]).then(([mono, stereo]) => {
      if (alive) setAacSupported(mono && stereo)
    })
    return () => {
      alive = false
    }
  }, [meta.sampleRate])

  useEffect(() => () => jobRef.current?.cancel(), [])

  const formats = EXPORT_FORMATS.filter((f) => f.id !== 'aac' || aacSupported)
  const running = progress !== null
  const targets = exportTargets(
    fileBaseName(new Date(meta.createdAt)),
    mode,
    format,
  )
  const estimate = estimateOutputBytes({
    format,
    channels,
    bitrate,
    seconds: durationSeconds,
    sampleRate: meta.sampleRate,
  })

  const run = async () => {
    setError(null)
    setResult(null)
    let outputs
    try {
      // ピッカーはクリック直後に開く必要があるので、他の await より先に呼ぶ
      outputs = await chooseDestinations(targets, format)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    if (!outputs) return
    setProgress(0)
    try {
      if (outputs.some((o) => o.sink.kind === 'temp')) await clearExportTemp()
      const job = startExport(
        {
          sessionId: meta.id,
          sampleRate: meta.sampleRate,
          format,
          bitrate,
          outputs,
        },
        setProgress,
      )
      jobRef.current = job
      const done = await job.promise
      await downloadTempOutputs(done)
      setResult(done)
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(
          `書き出しに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    } finally {
      jobRef.current = null
      setProgress(null)
    }
  }

  return (
    <Panel tone="wash" className="space-y-4 p-4">
      <fieldset className="space-y-2">
        <legend className={labelClass}>書き出し方</legend>
        {EXPORT_MODES.map((option) => (
          <Radio
            key={option.id}
            name={`mode-${meta.id}`}
            checked={mode === option.id}
            disabled={running}
            onChange={() => setMode(option.id)}
            label={
              <>
                <span className="font-bold">{option.label}</span>
                <span className="block text-xs text-ink-muted">
                  {option.note}
                </span>
              </>
            }
          />
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className={labelClass}>形式</legend>
          {formats.map((option) => (
            <Radio
              key={option.id}
              name={`format-${meta.id}`}
              checked={format === option.id}
              disabled={running}
              onChange={() => setFormat(option.id)}
              label={
                <>
                  {option.label}
                  {option.note && (
                    <span className="block text-xs text-ink-muted">
                      {option.note}
                    </span>
                  )}
                </>
              }
            />
          ))}
        </fieldset>

        {format !== 'wav' && (
          <Field
            label={`ビットレート（${channels === 2 ? 'ステレオ' : 'モノラル'}）`}
          >
            <Select
              value={bitrate}
              disabled={running}
              onChange={(event) => setBitrateChoice(Number(event.target.value))}
            >
              {bitrateOptions(format, channels).map((value) => (
                <option key={value} value={value}>
                  {value / 1000} kbps
                  {value === defaultBitrate(format, channels) ? '（既定）' : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {mode === 'stereo' && format !== 'wav' && (
        <p className="text-xs leading-relaxed text-ink-muted">
          低いビットレートのステレオ圧縮では左右の音が少し混ざることがあります。
          話者を完全に分けて文字起こししたいときは「別ファイル」が確実です。
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => void run()}
          disabled={running || durationSeconds <= 0}
        >
          書き出す
        </button>
        {running && (
          <button
            type="button"
            className={subtleButtonClass}
            onClick={() => jobRef.current?.cancel()}
          >
            中止する
          </button>
        )}
        <span className="min-w-0 text-xs break-all text-ink-muted">
          {targets.map((t) => t.fileName).join('、')}（約{' '}
          {formatBytes(estimate * targets.length)}）
        </span>
      </div>

      {progress !== null && (
        <div
          className="h-2 overflow-hidden border border-ink bg-paper"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            className="h-full bg-ink transition-[width]"
            style={{ width: `${(progress * 100).toFixed(1)}%` }}
          />
        </div>
      )}

      {error && (
        <Note tone="error" role="alert">
          {error}
        </Note>
      )}

      {result && (
        <Note role="status" className="bg-paper">
          <p>
            書き出しました（{(result.elapsedMs / 1000).toFixed(1)}{' '}
            秒。実時間の約{' '}
            {Math.round(
              result.audioSeconds / Math.max(result.elapsedMs / 1000, 0.001),
            )}{' '}
            倍速）
          </p>
          <ul className="mt-1 text-xs break-all">
            {result.outputs.map((output) => (
              <li key={output.fileName}>
                {output.fileName}（{formatBytes(output.bytes)}）
              </li>
            ))}
          </ul>
          {result.encoderNote && (
            <p className="mt-1 text-xs text-ink-muted">{result.encoderNote}</p>
          )}
        </Note>
      )}
    </Panel>
  )
}
