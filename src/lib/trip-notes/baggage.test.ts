import { describe, expect, it } from 'vitest'
import {
  formatBaggageAllowance,
  formatBaggageMetrics,
  formatBookingBaggage,
  listBaggageSlots,
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

describe('formatBaggageMetrics / formatBaggageAllowance', () => {
  it('metrics は個数・重量・寸法だけを · でつなぐ', () => {
    expect(
      formatBaggageMetrics({
        pieces: 1,
        weightKg: 7,
        dimensions: '55x40x20cm',
        note: '前の座席の下',
      }),
    ).toBe('1個 · 7kg · 55x40x20cm')
  })

  it('note は metrics に混ぜず、allowance 全文では括弧に回す', () => {
    expect(
      formatBaggageAllowance({
        pieces: 1,
        dimensions: '40x30x15cm',
        note: '前の座席の下に収納できるもの',
      }),
    ).toBe('1個 · 40x30x15cm（前の座席の下に収納できるもの）')
  })

  it('pieces: 0 は「なし」と出す', () => {
    expect(formatBaggageMetrics({ pieces: 0 })).toBe('なし')
  })
})

describe('listBaggageSlots / formatBookingBaggage', () => {
  it('スロットを短いラベルの行に分ける。note は別フィールド', () => {
    expect(
      listBaggageSlots({
        personal: {
          pieces: 1,
          dimensions: '40x30x15cm',
          note: '前の座席の下。合計7kgまで',
        },
        cabin: { pieces: 1, dimensions: '56x36x23cm' },
        checked: { pieces: 1, weightKg: 23 },
      }),
    ).toEqual([
      {
        slot: 'personal',
        label: '身の回り',
        metrics: '1個 · 40x30x15cm',
        note: '前の座席の下。合計7kgまで',
      },
      {
        slot: 'cabin',
        label: '機内持込',
        metrics: '1個 · 56x36x23cm',
      },
      {
        slot: 'checked',
        label: '受託',
        metrics: '1個 · 23kg',
      },
    ])
  })

  it('1 行要約は短いラベル + metrics のみ(note なし)', () => {
    expect(
      formatBookingBaggage({
        personal: {
          pieces: 1,
          weightKg: 3,
          note: '長い注記は 1 行に載せない',
        },
        cabin: { pieces: 1, weightKg: 7 },
        checked: { pieces: 1, weightKg: 23 },
      }),
    ).toBe('身の回り 1個 · 3kg / 機内持込 1個 · 7kg / 受託 1個 · 23kg')
  })

  it('pieces: 0 は「なし」と出す', () => {
    expect(formatBookingBaggage({ checked: { pieces: 0 } })).toBe('受託 なし')
  })

  it('空なら null', () => {
    expect(formatBookingBaggage(undefined)).toBeNull()
    expect(formatBookingBaggage({})).toBeNull()
    expect(listBaggageSlots(undefined)).toBeNull()
  })
})
