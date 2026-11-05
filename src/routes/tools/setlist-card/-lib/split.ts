/**
 * 何枚に分けるか（純粋関数）。
 *
 * 既定は「自動」: 1 枚に組んでみて、入りきらない（「ほか N 曲」が出る）か、
 * 名前が「…」で切れる曲が半分以上なら、読みやすい枚数に自動で分ける。
 * 「1 枚」はどんなに詰まっても 1 枚、「指定」は枚数をそのまま使う。
 */
import type { SplitOptions } from './render'

export type SplitMode = 'auto' | 'single' | 'manual'

export type SplitChoice = {
  mode: SplitMode
  /** 指定のときの枚数 */
  count: number
}

export const DEFAULT_SPLIT_CHOICE: SplitChoice = { mode: 'auto', count: 2 }

/** 1 枚に組んだときの結果 */
export type SingleFit = {
  overflow: boolean
  /** 載せた曲の数（「ほか N 曲」を除く） */
  shown: number
  /** 名前が「…」で切れた曲の数 */
  truncated: number
}

/** 名前が切れる曲が載せた曲の半分以上か */
export function mostlyTruncated(fit: Pick<SingleFit, 'shown' | 'truncated'>) {
  return fit.shown > 0 && fit.truncated * 2 >= fit.shown
}

/** 1 枚では読めないので、自動で分けるべきか */
export function needsAutoSplit(fit: SingleFit): boolean {
  return fit.overflow || mostlyTruncated(fit)
}

/**
 * 描画に渡す分割の設定。auto は「自動で分けた」か（プレビューの下に
 * 「N 枚に分けました · 1 枚にまとめる」を出す）。
 */
export function resolveSplit(
  choice: SplitChoice,
  fit: SingleFit | null,
): { split: SplitOptions; auto: boolean } {
  switch (choice.mode) {
    case 'single':
      return {
        split: { enabled: false, mode: 'auto', count: choice.count },
        auto: false,
      }
    case 'manual':
      return {
        split: { enabled: true, mode: 'manual', count: choice.count },
        auto: false,
      }
    case 'auto': {
      const split = fit !== null && needsAutoSplit(fit)
      return {
        split: { enabled: split, mode: 'auto', count: choice.count },
        auto: split,
      }
    }
  }
}
