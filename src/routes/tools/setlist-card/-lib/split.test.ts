import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPLIT_CHOICE,
  mostlyTruncated,
  needsAutoSplit,
  resolveSplit,
} from './split'

const fit = (overflow: boolean, shown: number, truncated: number) => ({
  overflow,
  shown,
  truncated,
})

describe('needsAutoSplit（自動で複数枚に分けるか）', () => {
  it('「ほか N 曲」が出るなら分ける', () => {
    expect(needsAutoSplit(fit(true, 30, 0))).toBe(true)
  })

  it('名前が切れる曲が半分以上なら分ける', () => {
    expect(needsAutoSplit(fit(false, 14, 7))).toBe(true)
    expect(needsAutoSplit(fit(false, 14, 14))).toBe(true)
  })

  it('全部入って、切れる曲が半分未満なら 1 枚のまま', () => {
    expect(needsAutoSplit(fit(false, 14, 6))).toBe(false)
    expect(needsAutoSplit(fit(false, 14, 0))).toBe(false)
  })

  it('曲が無ければ分けない', () => {
    expect(mostlyTruncated({ shown: 0, truncated: 0 })).toBe(false)
    expect(needsAutoSplit(fit(false, 0, 0))).toBe(false)
  })
})

describe('resolveSplit', () => {
  it('既定は自動', () => {
    expect(DEFAULT_SPLIT_CHOICE.mode).toBe('auto')
  })

  it('自動: 1 枚で読めるなら分けない', () => {
    expect(resolveSplit(DEFAULT_SPLIT_CHOICE, fit(false, 14, 2))).toEqual({
      split: { enabled: false, mode: 'auto', count: 2 },
      auto: false,
    })
  })

  it('自動: 入りきらないなら、警告を出さずに自動の枚数で分ける', () => {
    expect(resolveSplit(DEFAULT_SPLIT_CHOICE, fit(true, 20, 3))).toEqual({
      split: { enabled: true, mode: 'auto', count: 2 },
      auto: true,
    })
    expect(resolveSplit(DEFAULT_SPLIT_CHOICE, fit(false, 20, 12)).auto).toBe(
      true,
    )
  })

  it('自動: まだ組んでいない（曲が無い）ときは分けない', () => {
    expect(resolveSplit(DEFAULT_SPLIT_CHOICE, null).split.enabled).toBe(false)
  })

  it('「1 枚にまとめる」はあふれても 1 枚', () => {
    expect(
      resolveSplit({ mode: 'single', count: 3 }, fit(true, 20, 20)),
    ).toEqual({
      split: { enabled: false, mode: 'auto', count: 3 },
      auto: false,
    })
  })

  it('枚数を指定したら、その枚数で分ける', () => {
    expect(resolveSplit({ mode: 'manual', count: 4 }, null)).toEqual({
      split: { enabled: true, mode: 'manual', count: 4 },
      auto: false,
    })
  })
})
