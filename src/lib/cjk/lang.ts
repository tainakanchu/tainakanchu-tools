/**
 * 利用者の入れた文字列（出演者名・会場名など）に付ける lang 属性。純粋関数。
 *
 * ページは lang="ja" なので、日本語の書体に無い字（簡体字の 乐 队 动 など）を含む
 * 文字列は 1 文字ずつ別の書体に置き換わり、字のデザインが混ざる。文字列ごとに
 * lang を付け、styles.css の :lang() で中国語・韓国語の書体を先頭に回す。
 *
 *   ハングルを含む                 → ko
 *   かなを含む                     → ja
 *   漢字だけで、日本語の文字集合（Shift_JIS / CP932）に無い字を含む
 *                                  → detectScript の判定で zh-Hans / zh-Hant
 *   それ以外（欧文だけ・日本語の書体で描ける漢字だけ）
 *                                  → undefined（ページの ja を引き継ぐ）
 *
 * 「日本語の書体で描ける漢字だけ」を中国語扱いしないのは、長渕剛・東京事変・
 * 国立競技場のような漢字だけの日本語の名前を中国語の書体で描かないため
 * （衛柏 のような台湾の名前も日本語の書体で崩れずに描ける）。
 */

import { detectScript, hasHan, hasHangul, hasKana } from './script'

export type TextLang = 'ja' | 'zh-Hans' | 'zh-Hant' | 'ko'

let jisHan: Set<string> | undefined

/** CP932（Windows の Shift_JIS）で表せる漢字。日本語の書体なら必ず持っている字 */
function japaneseHan(): Set<string> {
  if (jisHan) return jisHan
  const set = new Set<string>()
  const decoder = new TextDecoder('shift_jis')
  const bytes = new Uint8Array(2)
  for (let lead = 0x81; lead <= 0xfc; lead++) {
    if (lead > 0x9f && lead < 0xe0) continue
    for (let trail = 0x40; trail <= 0xfc; trail++) {
      if (trail === 0x7f) continue
      bytes[0] = lead
      bytes[1] = trail
      const ch = decoder.decode(bytes)
      if (hasHan(ch)) set.add(ch)
    }
  }
  jisHan = set
  return set
}

/** 日本語の文字集合に無い漢字を含むか */
export function hasNonJapaneseHan(text: string): boolean {
  const jis = japaneseHan()
  for (const ch of text) {
    if (hasHan(ch) && !jis.has(ch)) return true
  }
  return false
}

const cache = new Map<string, TextLang | undefined>()

function compute(text: string): TextLang | undefined {
  if (hasHangul(text)) return 'ko'
  if (hasKana(text)) return 'ja'
  if (!hasHan(text) || !hasNonJapaneseHan(text)) return undefined
  const script = detectScript(text)
  if (script === 'zh-hans') return 'zh-Hans'
  if (script === 'zh-hant') return 'zh-Hant'
  return undefined
}

/** 文字列に付ける lang 属性（ページの ja を引き継ぐときは undefined） */
export function langOf(text: string | null | undefined): TextLang | undefined {
  if (!text) return undefined
  if (cache.has(text)) return cache.get(text)
  const lang = compute(text)
  if (cache.size > 2000) cache.clear()
  cache.set(text, lang)
  return lang
}
