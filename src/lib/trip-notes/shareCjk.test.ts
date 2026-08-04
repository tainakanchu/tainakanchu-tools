/**
 * CJK-16384 エンコーディングの単体テスト。
 *
 * ここで一番大事なのは端数(パディング)の扱いが往復可逆であること。
 * 8bit と 14bit の最小公倍数は 56 なので、バイト長が 7 で割り切れないときは
 * 必ず端数が出る。バイト長 mod 7 のすべての残余を通す。
 */

import { describe, expect, it } from 'vitest'
import { bytesToCjk, cjkToBytes } from './shareCjk'

const CJK_BASE = 0x4e00
const CJK_COUNT = 16384

/** 決定的な擬似乱数バイト列。テストが実行ごとに揺れないようにする */
function pseudoRandomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  let seed = 0x2f6e2b1
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    bytes[i] = (seed >>> 16) & 0xff
  }
  return bytes
}

describe('bytesToCjk / cjkToBytes', () => {
  it('バイト長 0〜32 のすべてで往復可逆(mod 7 の全パターンを含む)', () => {
    for (let length = 0; length <= 32; length += 1) {
      const bytes = pseudoRandomBytes(length)
      const restored = cjkToBytes(bytesToCjk(bytes))
      expect(Array.from(restored), `length=${length}`).toEqual(
        Array.from(bytes),
      )
    }
  })

  it('全ビットが 1 のバイト列でも往復可逆(パディング0との取り違えが起きない)', () => {
    for (let length = 1; length <= 15; length += 1) {
      const bytes = new Uint8Array(length).fill(0xff)
      expect(Array.from(cjkToBytes(bytesToCjk(bytes)))).toEqual(
        Array.from(bytes),
      )
    }
  })

  it('末尾が 0x00 のバイト列でも長さが保たれる(端数の切り詰めと区別できる)', () => {
    for (let length = 1; length <= 15; length += 1) {
      const bytes = new Uint8Array(length)
      bytes[0] = 0xab
      expect(cjkToBytes(bytesToCjk(bytes)).length).toBe(length)
    }
  })

  it('生成される文字はすべて CJK統合漢字の 16384 字に収まる', () => {
    const text = bytesToCjk(pseudoRandomBytes(200))
    for (const char of text) {
      const code = char.codePointAt(0) ?? -1
      expect(code).toBeGreaterThanOrEqual(CJK_BASE)
      expect(code).toBeLessThan(CJK_BASE + CJK_COUNT)
    }
    // すべて BMP なのでサロゲートペアが発生せず、文字数と length が一致する
    expect(text.length).toBe(Array.from(text).length)
  })

  it('1文字あたり14bitを運ぶので、base64url より短くなる', () => {
    const bytes = pseudoRandomBytes(700)
    // 先頭1文字はパディング情報なので +1
    expect(bytesToCjk(bytes).length).toBe(Math.ceil((700 * 8) / 14) + 1)
  })

  it('空のバイト列はパディング情報の1文字だけになり、往復できる', () => {
    const text = bytesToCjk(new Uint8Array(0))
    expect(text.length).toBe(1)
    expect(cjkToBytes(text).length).toBe(0)
  })

  it('文字集合の外の文字が混ざっていたら例外を投げる', () => {
    const text = bytesToCjk(pseudoRandomBytes(10))
    expect(() => cjkToBytes(`${text}あ`)).toThrow()
    expect(() => cjkToBytes(`${text}A`)).toThrow()
  })

  it('空文字列は例外を投げる(パディング情報の1文字すら無い)', () => {
    expect(() => cjkToBytes('')).toThrow()
  })

  it('パディングビット数が 14 以上の指定は例外を投げる', () => {
    const body = bytesToCjk(pseudoRandomBytes(7)).slice(1)
    const badHeader = String.fromCodePoint(CJK_BASE + 14)
    expect(() => cjkToBytes(`${badHeader}${body}`)).toThrow()
  })

  it('バイト境界に揃わないパディング指定は例外を投げる', () => {
    // 7バイト = 4文字ちょうど(パディング0)。ここで 1 を指定すると 55bit になり 8 で割れない
    const body = bytesToCjk(pseudoRandomBytes(7)).slice(1)
    const badHeader = String.fromCodePoint(CJK_BASE + 1)
    expect(() => cjkToBytes(`${badHeader}${body}`)).toThrow()
  })
})
