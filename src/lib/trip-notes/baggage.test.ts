import { describe, expect, it } from 'vitest'
import {
  formatBaggageAllowance,
  formatBookingBaggage,
  parseBaggageAllowance,
  parseBookingBaggage,
} from './baggage'

describe('parseBaggageAllowance', () => {
  it('個数・重量・寸法を採用する', () => {
    expect(
      parseBaggageAllowance({
        pieces: 1,
        weightKg: 23,
        dimensions: '55x40x20cm',
      }),
    ).toEqual({ pieces: 1, weightKg: 23, dimensions: '55x40x20cm' })
  })

  it('pieces: 0 は無料枠なしとして残す', () => {
    expect(parseBaggageAllowance({ pieces: 0 })).toEqual({ pieces: 0 })
  })

  it('不正な個数・重量は落とし、空なら undefined', () => {
    expect(parseBaggageAllowance({ pieces: -1 })).toBeUndefined()
    expect(parseBaggageAllowance({ pieces: 1.5 })).toBeUndefined()
    expect(parseBaggageAllowance({ weightKg: 0 })).toBeUndefined()
    expect(parseBaggageAllowance({ weightKg: -3 })).toBeUndefined()
    expect(parseBaggageAllowance({ pieces: 100 })).toBeUndefined()
  })

  it('寸法の前後空白を除く。空文字は落とす', () => {
    expect(parseBaggageAllowance({ dimensions: '  40x30x20  ' })).toEqual({
      dimensions: '40x30x20',
    })
    expect(parseBaggageAllowance({ dimensions: '   ' })).toBeUndefined()
  })
})

describe('parseBookingBaggage', () => {
  it('3 スロットを読み、空スロットは省く', () => {
    expect(
      parseBookingBaggage({
        personal: { pieces: 1, weightKg: 3 },
        cabin: { pieces: 1, weightKg: 7 },
        checked: { pieces: 1, weightKg: 23 },
        unknown: { pieces: 9 },
      }),
    ).toEqual({
      personal: { pieces: 1, weightKg: 3 },
      cabin: { pieces: 1, weightKg: 7 },
      checked: { pieces: 1, weightKg: 23 },
    })
  })

  it('全部壊れていたら undefined(予約は残す側に倒す)', () => {
    expect(
      parseBookingBaggage({
        cabin: { pieces: -1 },
        checked: 'nope',
      }),
    ).toBeUndefined()
  })

  it('受託なしだけでも baggage として残る', () => {
    expect(parseBookingBaggage({ checked: { pieces: 0 } })).toEqual({
      checked: { pieces: 0 },
    })
  })
})

describe('formatBookingBaggage', () => {
  it('スロットごとのラベル付き 1 行にする', () => {
    expect(
      formatBookingBaggage({
        personal: { pieces: 1, weightKg: 3 },
        cabin: { pieces: 1, weightKg: 7 },
        checked: { pieces: 1, weightKg: 23 },
      }),
    ).toBe(
      '身の回り品 1個・3kg / 機内/車内持込 1個・7kg / 受託手荷物 1個・23kg',
    )
  })

  it('pieces: 0 は「なし」と出す', () => {
    expect(formatBaggageAllowance({ pieces: 0 })).toBe('なし')
    expect(formatBookingBaggage({ checked: { pieces: 0 } })).toBe(
      '受託手荷物 なし',
    )
  })

  it('空なら null', () => {
    expect(formatBookingBaggage(undefined)).toBeNull()
    expect(formatBookingBaggage({})).toBeNull()
  })
})
