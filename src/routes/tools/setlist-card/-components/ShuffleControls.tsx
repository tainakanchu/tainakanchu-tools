import { Dices, Lock, LockOpen, Redo2, Undo2 } from 'lucide-react'
import { iconButtonClass, subtleButtonClass } from '../-lib/styles'
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

type Props = ShuffleActions & {
  /** full はデザインの欄（固定のトグルつき）、compact はプレビューの横 */
  variant: 'full' | 'compact'
}

const lockClass = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
    on
      ? 'border-cyan-400/70 bg-cyan-500/10 text-cyan-100'
      : 'border-white/15 text-gray-400 hover:border-white/30 hover:text-gray-200'
  }`

/**
 * 「ランダム」（テンプレート × パレット × 文字組みのおまかせ）と、戻る / 進む。
 * 曲・サイズ・解像度・長い名前の扱い・枚数・写真の位置は変えない。
 */
export function ShuffleControls({
  variant,
  onShuffle,
  onBack,
  onForward,
  canBack,
  canForward,
  locks,
  onLocksChange,
}: Props) {
  const bothLocked = locks.layout && locks.palette
  const shuffleTitle = bothLocked
    ? 'テンプレートとパレットの両方を固定しています'
    : 'テンプレート・パレット・文字組みをおまかせで選び直します'
  const history = (
    <>
      <button
        type="button"
        className={iconButtonClass}
        onClick={onBack}
        disabled={!canBack}
        aria-label="ひとつ前のデザインに戻る"
        title="戻る"
      >
        <Undo2 size={16} aria-hidden />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        onClick={onForward}
        disabled={!canForward}
        aria-label="戻したデザインに進む"
        title="進む"
      >
        <Redo2 size={16} aria-hidden />
      </button>
    </>
  )

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={`${subtleButtonClass} px-2.5! py-1.5! text-xs`}
          onClick={onShuffle}
          disabled={bothLocked}
          title={shuffleTitle}
        >
          <Dices size={16} aria-hidden className="text-cyan-300" />
          ランダム
        </button>
        {history}
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-gray-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={subtleButtonClass}
          onClick={onShuffle}
          disabled={bothLocked}
          title={shuffleTitle}
        >
          <Dices size={18} aria-hidden className="text-cyan-300" />
          ランダム
        </button>
        <button
          type="button"
          className={`${subtleButtonClass} px-2.5!`}
          onClick={onBack}
          disabled={!canBack}
          title="ひとつ前のデザインに戻る"
        >
          <Undo2 size={16} aria-hidden />
          戻る
        </button>
        <button
          type="button"
          className={`${iconButtonClass} h-9! w-9!`}
          onClick={onForward}
          disabled={!canForward}
          aria-label="戻したデザインに進む"
          title="進む"
        >
          <Redo2 size={16} aria-hidden />
        </button>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {(
            [
              ['layout', 'テンプレート固定'],
              ['palette', 'パレット固定'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={locks[key]}
              className={lockClass(locks[key])}
              onClick={() => onLocksChange({ ...locks, [key]: !locks[key] })}
            >
              {locks[key] ? (
                <Lock size={12} aria-hidden />
              ) : (
                <LockOpen size={12} aria-hidden />
              )}
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-gray-500">
        テンプレート・パレット・書体や区切りをおまかせで選び直します。曲・サイズ・解像度・写真の位置は変えません。気に入らなければ「戻る」で何度でも戻せます。
      </p>
    </div>
  )
}
