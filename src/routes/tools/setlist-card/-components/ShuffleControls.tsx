import { Chip } from './ui'
import type { ShuffleLocks } from '../-lib/shuffle'

export type ShuffleActions = {
  onShuffle: () => void
  onBack: () => void
  onForward: () => void
  canBack: boolean
  canForward: boolean
  locks: ShuffleLocks
  onLocksChange: (locks: ShuffleLocks) => void
}

/**
 * 「ランダム」（テンプレート × 配色 × 文字組みのおまかせ）と、戻る / 進む。
 * 曲・サイズ・解像度・長い名前の扱い・枚数・写真の位置は変えない。
 */
export function ShuffleControls({
  onShuffle,
  onBack,
  onForward,
  canBack,
  canForward,
  locks,
}: ShuffleActions) {
  const bothLocked = locks.layout && locks.palette
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onShuffle}
        disabled={bothLocked}
        title={
          bothLocked
            ? 'テンプレートと配色の両方を固定しています'
            : 'テンプレート、配色、文字組みをおまかせで選び直す'
        }
      >
        ランダム
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={onBack}
        disabled={!canBack}
        aria-label="ひとつ前のデザインに戻る"
        title="戻る"
      >
        戻る
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={onForward}
        disabled={!canForward}
        aria-label="戻したデザインに進む"
        title="進む"
      >
        進む
      </button>
    </div>
  )
}

/** ランダムで変えないようにする（テンプレート / 配色の見出しの右に置く） */
export function LockChip({
  target,
  locks,
  onLocksChange,
}: {
  target: keyof ShuffleLocks
  locks: ShuffleLocks
  onLocksChange: (locks: ShuffleLocks) => void
}) {
  const name = target === 'layout' ? 'テンプレート' : '配色'
  return (
    <Chip
      pressed={locks[target]}
      onClick={() => onLocksChange({ ...locks, [target]: !locks[target] })}
      label={`ランダムで${name}を変えない`}
    >
      固定
    </Chip>
  )
}
