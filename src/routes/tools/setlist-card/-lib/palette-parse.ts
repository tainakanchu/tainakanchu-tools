/**
 * 自分の配色を貼り付けで作る: hex の並び（"#0b0b0b #f2efe9, c8553d" など）や
 * coolors.co の URL（https://coolors.co/0b0b0b-f2efe9-c8553d）を読み、
 * 役割（背景・文字・補助・差し色・罫線・幕）を自動で割り当てる。純粋関数。
 */
import { contrastRatio, hexToRgb, mix, rgbToHex } from './color'
import { rgbToOklch } from './oklab'
import { darkScrimOf, deriveRule, fixPalette, isDarkColor } from './palettes'
import type { RGB } from './color'
import type { PaletteColors } from './palettes'

const HEX_RE = /^[0-9a-f]{6}$|^[0-9a-f]{3}$/i

function normalizeHex(token: string): string | null {
  const t = token.trim().replace(/^#/, '')
  if (!HEX_RE.test(t)) return null
  const full =
    t.length === 3
      ? t
          .split('')
          .map((c) => c + c)
          .join('')
      : t
  return `#${full.toLowerCase()}`
}

/**
 * 文字列から色を取り出す（重複は除き、出てきた順のまま）。
 * 区切りはカンマ・空白・改行・ハイフン（coolors の URL）・セミコロン。
 */
export function parseColorList(input: string): Array<string> {
  let text = input.trim()
  // coolors.co/palette/xxxx-xxxx や coolors.co/xxxx-xxxx の URL
  const url = /coolors\.co\/(?:palette\/)?([0-9a-f-]+)/i.exec(text)
  if (url) text = url[1]
  const tokens = text.split(/[\s,;、-]+/).filter(Boolean)
  const out: Array<string> = []
  for (const token of tokens) {
    const hex = normalizeHex(token.replace(/^0x/i, ''))
    if (hex && !out.includes(hex)) out.push(hex)
  }
  return out
}

const chromaOf = (hex: string) => rgbToOklch(hexToRgb(hex))[1]

/**
 * 色の並びに役割を割り当てる。
 * - 背景と文字: いちばんコントラストが高い 2 色。先に書かれた方を背景にする
 *   （貼り付けた人の並び順を尊重する）
 * - 差し色: 残りでいちばん彩度が高い色
 * - 補助の文字: 残りの色で背景とのコントラストが足りるもの。無ければ文字と背景の中間
 * - 罫線・幕: 背景から作る
 * 最後にコントラストの制約（fg ≥ 7、muted ≥ 4.5、accent ≥ 3）を明度の調整で満たす。
 */
export function assignRoles(
  colors: ReadonlyArray<string>,
): PaletteColors | null {
  if (colors.length === 0) return null
  const list = [...colors]
  let bgIndex = 0
  let fgIndex = -1
  let best = -1
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const ratio = contrastRatio(hexToRgb(list[i]), hexToRgb(list[j]))
      if (ratio > best) {
        best = ratio
        bgIndex = i
        fgIndex = j
      }
    }
  }
  const bg = hexToRgb(list[bgIndex])
  const fgRgb: RGB =
    fgIndex >= 0
      ? hexToRgb(list[fgIndex])
      : isDarkColor(bg)
        ? [242, 240, 235]
        : [20, 20, 18]
  const rest = list.filter((_, i) => i !== bgIndex && i !== fgIndex)

  let accent: string | undefined
  if (rest.length > 0) {
    accent = rest.reduce((a, b) => (chromaOf(b) > chromaOf(a) ? b : a))
  }
  const others = rest.filter((c) => c !== accent)
  const mutedPick = others
    .filter((c) => contrastRatio(hexToRgb(c), bg) >= 3)
    .toSorted((a, b) => chromaOf(a) - chromaOf(b))[0]
  const muted = mutedPick ? hexToRgb(mutedPick) : mix(fgRgb, bg, 0.4)
  const bgHex = rgbToHex(bg)
  return fixPalette({
    bg: bgHex,
    fg: rgbToHex(fgRgb),
    muted: rgbToHex(muted),
    accent: accent ?? rgbToHex(fgRgb),
    rule: rgbToHex(deriveRule(bg, fgRgb)),
    scrim: isDarkColor(bg) ? darkScrimOf(bgHex) : bgHex,
  })
}

/** 1 色の hex 入力（# 無し・3 桁も可）を正規化する。読めなければ null */
export function parseHex(input: string): string | null {
  return normalizeHex(input)
}
