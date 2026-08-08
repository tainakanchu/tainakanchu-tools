import { describe, expect, it } from 'vitest'
import { isValidIsoDate, toDdMmYyyy } from './dates'

describe('isValidIsoDate', () => {
  it('実在する日付を通す', () => {
    expect(isValidIsoDate('2026-03-15')).toBe(true)
    expect(isValidIsoDate('2026-01-01')).toBe(true)
    expect(isValidIsoDate('2026-12-31')).toBe(true)
  })

  it('形が違うものを弾く', () => {
    expect(isValidIsoDate('')).toBe(false)
    expect(isValidIsoDate('2026/03/15')).toBe(false)
    expect(isValidIsoDate('15/03/2026')).toBe(false)
    expect(isValidIsoDate('2026-3-5')).toBe(false)
    expect(isValidIsoDate('March 15, 2026')).toBe(false)
    expect(isValidIsoDate('2026-03-15T00:00:00Z')).toBe(false)
  })

  it('前後に空白が付いていれば弾く(呼び出し側で trim させる)', () => {
    expect(isValidIsoDate(' 2026-03-15 ')).toBe(false)
  })

  it('形は合っているが実在しない日付を弾く', () => {
    // ここがこの関数の存在理由。Date.UTC は 2/30 を 3/2 に繰り上げて
    // 受け入れてしまうので、往復して確かめている
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('2026-02-31')).toBe(false)
    expect(isValidIsoDate('2026-04-31')).toBe(false)
    expect(isValidIsoDate('2026-06-31')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('2026-00-10')).toBe(false)
    expect(isValidIsoDate('2026-01-00')).toBe(false)
    expect(isValidIsoDate('2026-01-32')).toBe(false)
  })

  it('うるう年を正しく判定する', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true)
    expect(isValidIsoDate('2027-02-29')).toBe(false)
    // 400 で割り切れる年はうるう年、100 で割り切れるだけの年は違う
    expect(isValidIsoDate('2000-02-29')).toBe(true)
    expect(isValidIsoDate('2100-02-29')).toBe(false)
  })
})

describe('toDdMmYyyy', () => {
  it("'YYYY-MM-DD' を 'DD/MM/YYYY' に変換する", () => {
    expect(toDdMmYyyy('2026-03-15')).toBe('15/03/2026')
  })

  it('前後の空白は落とす', () => {
    expect(toDdMmYyyy('  2026-12-01  ')).toBe('01/12/2026')
  })

  it('空文字は空文字のまま返す', () => {
    expect(toDdMmYyyy('')).toBe('')
  })

  it('形式が違うものは空文字にする', () => {
    expect(toDdMmYyyy('2026/03/15')).toBe('')
    expect(toDdMmYyyy('15/03/2026')).toBe('')
    expect(toDdMmYyyy('2026-3-5')).toBe('')
    expect(toDdMmYyyy('not a date')).toBe('')
  })

  it('存在しない日付は空文字にする', () => {
    expect(toDdMmYyyy('2026-02-31')).toBe('')
    expect(toDdMmYyyy('2026-13-01')).toBe('')
    expect(toDdMmYyyy('2026-00-10')).toBe('')
  })

  it('うるう年の 2/29 は通す', () => {
    expect(toDdMmYyyy('2028-02-29')).toBe('29/02/2028')
    expect(toDdMmYyyy('2027-02-29')).toBe('')
  })
})
