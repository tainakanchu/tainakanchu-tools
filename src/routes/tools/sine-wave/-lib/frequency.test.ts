import { describe, expect, it } from 'vitest'
import {
  MAX_HZ,
  MIN_HZ,
  channelToPan,
  clampHz,
  formatHz,
  hzToSliderPosition,
  parseHzInput,
  shiftOctave,
  sliderPositionToHz,
  stepHz,
  volumeToGain,
} from './frequency'

describe('clampHz', () => {
  it('範囲内はそのまま、範囲外は丸める', () => {
    expect(clampHz(440)).toBe(440)
    expect(clampHz(1)).toBe(MIN_HZ)
    expect(clampHz(99999)).toBe(MAX_HZ)
    expect(clampHz(Number.NaN)).toBe(MIN_HZ)
    expect(clampHz(Infinity)).toBe(MAX_HZ)
  })
  it('小数は 2 桁に丸める', () => {
    expect(clampHz(440.126)).toBe(440.13)
  })
})

describe('対数スライダー', () => {
  it('端点が 0 と 1 に対応する', () => {
    expect(hzToSliderPosition(MIN_HZ)).toBeCloseTo(0)
    expect(hzToSliderPosition(MAX_HZ)).toBeCloseTo(1)
    expect(sliderPositionToHz(0)).toBe(MIN_HZ)
    expect(sliderPositionToHz(1)).toBe(MAX_HZ)
  })
  it('20 と 20000 の中間（対数）は 632.46 Hz 付近', () => {
    expect(sliderPositionToHz(0.5)).toBeCloseTo(632.46, 1)
  })
  it('往復で元の値に戻る', () => {
    for (const hz of [50, 100, 440, 1000, 10000]) {
      expect(sliderPositionToHz(hzToSliderPosition(hz))).toBeCloseTo(hz, 1)
    }
  })
  it('範囲外は丸める', () => {
    expect(sliderPositionToHz(-1)).toBe(MIN_HZ)
    expect(sliderPositionToHz(2)).toBe(MAX_HZ)
    expect(hzToSliderPosition(1)).toBeCloseTo(0)
  })
})

describe('stepHz / shiftOctave', () => {
  it('加減算と丸め', () => {
    expect(stepHz(440, 10)).toBe(450)
    expect(stepHz(440, -1)).toBe(439)
    expect(stepHz(25, -10)).toBe(MIN_HZ)
    expect(stepHz(19995, 10)).toBe(MAX_HZ)
  })
  it('オクターブ移動と丸め', () => {
    expect(shiftOctave(440, 1)).toBe(880)
    expect(shiftOctave(440, -1)).toBe(220)
    expect(shiftOctave(30, -1)).toBe(MIN_HZ)
    expect(shiftOctave(15000, 1)).toBe(MAX_HZ)
  })
})

describe('volumeToGain', () => {
  it('2 乗カーブ', () => {
    expect(volumeToGain(0)).toBe(0)
    expect(volumeToGain(50)).toBeCloseTo(0.25)
    expect(volumeToGain(100)).toBe(1)
    expect(volumeToGain(150)).toBe(1)
    expect(volumeToGain(-5)).toBe(0)
  })
})

describe('channelToPan', () => {
  it('左右は完全に振り切る', () => {
    expect(channelToPan('left')).toBe(-1)
    expect(channelToPan('right')).toBe(1)
    expect(channelToPan('both')).toBe(0)
  })
})

describe('parseHzInput / formatHz', () => {
  it('パース', () => {
    expect(parseHzInput('440.5')).toBe(440.5)
    expect(parseHzInput(' 5 ')).toBe(MIN_HZ)
    expect(parseHzInput('')).toBeNull()
    expect(parseHzInput('abc')).toBeNull()
  })
  it('整形', () => {
    expect(formatHz(440)).toBe('440')
    expect(formatHz(440.5)).toBe('440.5')
    expect(formatHz(440.25)).toBe('440.25')
  })
})
