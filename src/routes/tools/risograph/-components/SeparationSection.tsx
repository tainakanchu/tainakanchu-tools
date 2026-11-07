import { useId } from 'react'
import { deltaE00Xyz } from '../../../../lib/risograph/color'
import {
  Chip,
  Note,
  Radio,
  SegmentedControl,
  Swatch,
} from '../../../../components/ui'
import { INK_PRESETS, PAPER_PRESETS } from '../../../../lib/risograph/presets'
import {
  labelClass,
  primaryButtonClass,
  rowClass,
  rowListClass,
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
    <div className="border-t border-rule pt-2">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={statValueClass}>{value}</p>
      {note ? <p className="mt-0.5 text-xs text-ink-muted">{note}</p> : null}
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
  const qualityLabelId = useId()
  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>3. 分版設定と実行</h2>
      <p className={`${sectionNoteClass} mt-2`}>
        選んだインクの組み合わせで仮想プレスのプロファイルを作り、sRGB
        からインク面積率への LUT を解いて画像に適用します。
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <fieldset className="min-w-0">
          <legend className={`${labelClass} mb-2`}>ガモットマッピング</legend>
          <div className="space-y-2">
            {GAMUT_LABELS.map((g) => (
              <Radio
                key={g.value}
                name="risograph-gamut"
                value={g.value}
                checked={gamutMode === g.value}
                onChange={() => onGamutModeChange(g.value)}
                label={
                  <>
                    {g.label}
                    <span className="block text-xs text-ink-muted">
                      {g.note}
                    </span>
                  </>
                }
              />
            ))}
          </div>
        </fieldset>

        <div className="field">
          <span id={qualityLabelId} className={labelClass}>
            品質
          </span>
          <SegmentedControl
            labelledBy={qualityLabelId}
            value={lutSize}
            onChange={onLutSizeChange}
            options={[
              { value: 17, label: '下書き' },
              { value: 33, label: '高品質' },
            ]}
          />
          <span className="field-hint">
            下書きは 17³、高品質は 33³ の LUT
            で解きます。高品質は数十秒かかることがあります。
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <span className={labelClass}>紙</span>
        <ul className="flex flex-wrap gap-3">
          {PAPER_PRESETS.map((paper) => {
            const selected = paper.id === paperId
            return (
              <li key={paper.id}>
                <Chip
                  pressed={selected}
                  onPressedChange={() => onPaperIdChange(paper.id)}
                  dot={paper.hex}
                >
                  {paper.name}
                </Chip>
              </li>
            )
          })}
        </ul>
        <p className="field-hint">
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
          {running ? '分版中…' : '分版する'}
        </button>
        {!canRun && !running ? (
          <span className="text-xs text-ink-muted">
            画像を読み込むと実行できます。
          </span>
        ) : null}
      </div>

      {running ? (
        <div className="mt-3">
          <div
            className="h-2 w-full overflow-hidden border border-ink bg-wash"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((progress?.fraction ?? 0) * 100)}
          >
            <div
              className="h-full bg-ink transition-[width] duration-150"
              style={{
                width: `${Math.round((progress?.fraction ?? 0) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {progress?.message ?? '準備中'}（
            {Math.round((progress?.fraction ?? 0) * 100)}%）
          </p>
        </div>
      ) : null}

      {error ? (
        <Note tone="error" role="alert" className="mt-3">
          {error}
        </Note>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-bold">プロファイル品質</h3>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
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
              label="3 インク検証 ΔE00"
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

          <h3 className="pt-2 text-sm font-bold">参照色との ΔE00</h3>
          <p className="text-xs leading-relaxed text-ink-muted">
            仮想インクのベタが、RISO
            公称色（参照色）からどれだけ離れているかの表示です。
            参照色は計算には使っておらず、値が大きいことは失敗を意味しません。
            実機の特色そのものではなく「その色を狙った仮想インク」だと捉えてください。
          </p>
          <ul className={`sm:max-w-sm ${rowListClass}`}>
            {result.inkIds.map((id) => {
              const preset = INK_PRESETS.find((p) => p.id === id)
              const ink = result.profile.inks.find((i) => i.id === id)
              const delta =
                ink?.referenceColor === undefined
                  ? null
                  : deltaE00Xyz(ink.referenceColor, ink.measuredSolid)
              return (
                <li key={id} className={`flex items-center gap-2 ${rowClass}`}>
                  <Swatch color={preset?.hex ?? '#000000'} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {preset?.name ?? id}
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {delta === null ? '—' : fmt(delta)}
                  </span>
                </li>
              )
            })}
          </ul>

          {result.warnings.length > 0 ? (
            <Note tone="warn">
              <ul className="space-y-1">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Note>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
