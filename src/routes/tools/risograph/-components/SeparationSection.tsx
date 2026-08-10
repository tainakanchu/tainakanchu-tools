import { Play, TriangleAlert } from 'lucide-react'
import { deltaE00Xyz } from '../../../../lib/risograph/color'
import { INK_PRESETS, PAPER_PRESETS } from '../../../../lib/risograph/presets'
import {
  fieldClass,
  labelClass,
  primaryButtonClass,
  sectionClass,
  sectionNoteClass,
  sectionTitleClass,
  statValueClass,
} from '../-lib/styles'
import type { GamutMapMode } from '../../../../lib/risograph/types'
import type { SeparationResult } from '../-lib/separationClient'

type Props = {
  gamutMode: GamutMapMode
  onGamutModeChange: (mode: GamutMapMode) => void
  lutSize: 17 | 33
  onLutSizeChange: (size: 17 | 33) => void
  paperId: string
  onPaperIdChange: (id: string) => void
  canRun: boolean
  running: boolean
  progress: { fraction: number; message: string } | null
  error: string | null
  result: SeparationResult | null
  onRun: () => void
}

const GAMUT_LABELS: Array<{
  value: GamutMapMode
  label: string
  note: string
}> = [
  {
    value: 'clip',
    label: 'クリップ',
    note: 'ガモット外をそのまま境界へ寄せる。彩度は残るが階調が潰れやすい',
  },
  {
    value: 'chroma-compress',
    label: '彩度圧縮',
    note: '明度を保ったまま彩度だけ滑らかに圧縮する（既定）',
  },
  {
    value: 'lightness-first',
    label: '明度優先',
    note: '明暗の関係を優先し、色相・彩度は犠牲にする',
  },
]

function Stat({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-gray-950/60 px-3 py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={statValueClass}>{value}</p>
      {note ? <p className="mt-0.5 text-[11px] text-gray-500">{note}</p> : null}
    </div>
  )
}

function fmt(value: number): string {
  return value.toFixed(2)
}

export function SeparationSection({
  gamutMode,
  onGamutModeChange,
  lutSize,
  onLutSizeChange,
  paperId,
  onPaperIdChange,
  canRun,
  running,
  progress,
  error,
  result,
  onRun,
}: Props) {
  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>
        <span className="text-cyan-400">3.</span> 分版設定と実行
      </h2>
      <p className={`${sectionNoteClass} mt-2`}>
        選んだインクの組み合わせで仮想プレスのプロファイルを作り、 sRGB →
        インク面積率の LUT を解いて画像に適用します。
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={labelClass}>ガモットマッピング</span>
          <select
            className={fieldClass}
            value={gamutMode}
            onChange={(event) => {
              const found = GAMUT_LABELS.find(
                (g) => g.value === event.target.value,
              )
              if (found) onGamutModeChange(found.value)
            }}
          >
            {GAMUT_LABELS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <span className="block text-xs text-gray-500">
            {GAMUT_LABELS.find((g) => g.value === gamutMode)?.note}
          </span>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>品質</span>
          <select
            className={fieldClass}
            value={lutSize}
            onChange={(event) =>
              onLutSizeChange(event.target.value === '33' ? 33 : 17)
            }
          >
            <option value={17}>下書き（17³ LUT・速い）</option>
            <option value={33}>高品質（33³ LUT・遅い）</option>
          </select>
          <span className="block text-xs text-gray-500">
            高品質は数十秒かかることがあります。
          </span>
        </label>
      </div>

      <div className="mt-4 space-y-2">
        <span className={labelClass}>紙</span>
        <ul className="flex flex-wrap gap-2">
          {PAPER_PRESETS.map((paper) => {
            const selected = paper.id === paperId
            return (
              <li key={paper.id}>
                <button
                  type="button"
                  onClick={() => onPaperIdChange(paper.id)}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                    selected
                      ? 'border-cyan-400 bg-cyan-500/10 text-cyan-100'
                      : 'border-white/15 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <span
                    className="h-5 w-5 rounded-full border border-white/30"
                    style={{ backgroundColor: paper.hex }}
                    aria-hidden
                  />
                  {paper.name}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="text-xs leading-relaxed text-gray-500">
          紙の色は分版そのものに反映されます（暗い紙では出せる色が狭くなります）。
          変更すると分版はやり直しになります。
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={primaryButtonClass}
          onClick={onRun}
          disabled={!canRun || running}
        >
          <Play size={16} aria-hidden />
          {running ? '分版中…' : '分版する'}
        </button>
        {!canRun && !running ? (
          <span className="text-xs text-gray-500">
            画像を読み込むと実行できます。
          </span>
        ) : null}
      </div>

      {running ? (
        <div className="mt-3">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((progress?.fraction ?? 0) * 100)}
          >
            <div
              className="h-full rounded-full bg-cyan-500 transition-[width] duration-150"
              style={{
                width: `${Math.round((progress?.fraction ?? 0) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {progress?.message ?? '準備中'}（
            {Math.round((progress?.fraction ?? 0) * 100)}%）
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">
            プロファイル品質
          </h3>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Stat
              label="Yule-Nielsen n"
              value={result.profile.yuleNielsenN.toFixed(2)}
              note="光学的にじみの推定値"
            />
            <Stat
              label="ホールドアウト ΔE00 平均"
              value={fmt(result.profile.fitStats.holdoutDeltaEMean)}
              note="学習に使っていない重ね刷りパッチ"
            />
            <Stat
              label="ホールドアウト ΔE00 p95"
              value={fmt(result.profile.fitStats.holdoutDeltaEP95)}
            />
            <Stat
              label="3インク検証 ΔE00"
              value={
                result.profile.fitStats.threeInkDeltaEMean === null
                  ? '—'
                  : fmt(result.profile.fitStats.threeInkDeltaEMean)
              }
              note="3色重ねの外挿精度"
            />
            <Stat
              label="LUT ガモット内 ΔE00 平均"
              value={fmt(result.lutQuality.inGamutDeltaEMean)}
              note={`隣接ノード L2 p99: ${fmt(result.lutQuality.neighborL2P99)}`}
            />
          </div>

          <h3 className="pt-2 text-sm font-semibold text-gray-200">
            参照色との ΔE00
          </h3>
          <p className="text-xs leading-relaxed text-gray-500">
            仮想インクのベタが、RISO
            公称色（参照色）からどれだけ離れているかの表示です。
            参照色は計算には使っておらず、値が大きいことは失敗を意味しません。
            実機の特色そのものではなく「その色を狙った仮想インク」だと捉えてください。
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {result.inkIds.map((id) => {
              const preset = INK_PRESETS.find((p) => p.id === id)
              const ink = result.profile.inks.find((i) => i.id === id)
              const delta =
                ink?.referenceColor === undefined
                  ? null
                  : deltaE00Xyz(ink.referenceColor, ink.measuredSolid)
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-gray-950/60 px-3 py-2"
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-full border border-white/20"
                    style={{ backgroundColor: preset?.hex ?? '#000000' }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-300">
                    {preset?.name ?? id}
                  </span>
                  <span className="text-sm font-semibold text-gray-100 tabular-nums">
                    {delta === null ? '—' : fmt(delta)}
                  </span>
                </li>
              )
            })}
          </ul>

          {result.warnings.length > 0 ? (
            <ul className="space-y-1">
              {result.warnings.map((warning) => (
                <li
                  key={warning}
                  className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200"
                >
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
