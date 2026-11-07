/**
 * 長い文字列の扱い（省略 / 横に縮める / 折り返し）と、1 行に並べるときの幅配分。
 * 文字幅は外から注入するので、canvas なしで単体テストできる。
 */
import { ellipsize } from './fit'
import type { Measure } from './fit'

export type LongTextMode = 'ellipsis' | 'condense' | 'wrap'

/** 「縮める」で許す最小の横倍率 */
export const CONDENSE_MIN = 0.75

export type FittedText = { text: string; scaleX: number; width: number }

/**
 * 1 行に収める。condense は横倍率を CONDENSE_MIN まで下げ、それでも入らなければ
 * その倍率のまま末尾を省略する。ellipsis（と wrap の 1 行扱い）は省略だけ。
 */
export function fitLine(
  text: string,
  maxWidth: number,
  font: string,
  measure: Measure,
  mode: LongTextMode,
): FittedText {
  const natural = measure(text, font)
  if (natural <= maxWidth || maxWidth <= 0) {
    return natural <= maxWidth
      ? { text, scaleX: 1, width: natural }
      : { text: '', scaleX: 1, width: 0 }
  }
  if (mode === 'condense') {
    const scale = maxWidth / natural
    if (scale >= CONDENSE_MIN) return { text, scaleX: scale, width: maxWidth }
    const cut = ellipsize(text, maxWidth / CONDENSE_MIN, font, measure)
    return {
      text: cut,
      scaleX: CONDENSE_MIN,
      width: measure(cut, font) * CONDENSE_MIN,
    }
  }
  const cut = ellipsize(text, maxWidth, font, measure)
  return { text: cut, scaleX: 1, width: measure(cut, font) }
}

/**
 * 1 行に「アーティスト — 曲名」を並べるときの幅配分。
 * どちらも入るならそのまま。縮めれば入るなら同じ倍率で縮める。
 * 入らないときはアーティストを最大 40% に抑えて曲名に残りを回し、
 * 片方が短ければ余った分をもう片方へ回す（どちらかが消えてしまわないように）。
 */
export function splitWidths(
  artistWidth: number,
  titleWidth: number,
  available: number,
  minScale: number,
  artistShare = 0.4,
): { artist: number; title: number } {
  const total = artistWidth + titleWidth
  if (total <= available) return { artist: artistWidth, title: titleWidth }
  if (total * minScale <= available) {
    const ratio = available / total
    return { artist: artistWidth * ratio, title: titleWidth * ratio }
  }
  const artistCap = available * artistShare
  if (artistWidth * minScale <= artistCap) {
    const artist = artistWidth * minScale
    return { artist, title: available - artist }
  }
  if (titleWidth * minScale <= available - artistCap) {
    const title = titleWidth * minScale
    return { artist: available - title, title }
  }
  return { artist: artistCap, title: available - artistCap }
}

// ---------------------------------------------------------------------------
// 折り返し
// ---------------------------------------------------------------------------

/** 1 文字ずつ折り返してよい文字（漢字・かな・全角記号など） */
const CJK = /[⺀-⿿　-〿぀-ヿ㄀-ㇿ㐀-䶿一-鿿豈-﫿＀-￯]/
/** 行頭に来てはいけない閉じ記号（前の文字にくっつける） */
const NO_LINE_START =
  /^[、。，．・：；？！）」』】〕〉》ー…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]$/

/** 単語（ラテン文字列）・空白・CJK 1 文字ずつに分ける */
export function tokenize(text: string): Array<string> {
  const tokens: Array<string> = []
  let word = ''
  const flush = () => {
    if (word) tokens.push(word)
    word = ''
  }
  for (const ch of Array.from(text)) {
    if (/\s/.test(ch)) {
      flush()
      const last = tokens.at(-1)
      if (last !== undefined && /^\s+$/.test(last)) {
        tokens[tokens.length - 1] = last + ch
      } else {
        tokens.push(ch)
      }
      continue
    }
    if (CJK.test(ch)) {
      flush()
      const last = tokens.at(-1)
      // 禁則: 閉じ記号は前のトークンにくっつけて行頭に来ないようにする
      if (NO_LINE_START.test(ch) && last !== undefined && !/^\s+$/.test(last)) {
        tokens[tokens.length - 1] = last + ch
      } else {
        tokens.push(ch)
      }
      continue
    }
    word += ch
  }
  flush()
  return tokens
}

export type WrapRun<R extends string = string> = { text: string; role: R }
export type PlacedRun<R extends string = string> = WrapRun<R> & {
  x: number
  width: number
}

/**
 * 書体の違う run の並びを、幅 width・最大 maxLines 行に折り返す。
 * CJK は 1 文字単位、ラテン文字は空白で折り返し、1 行に入らない長い単語だけ
 * 1 文字単位に崩す。入りきらなければ最終行の末尾を「…」で省略する。
 */
export function wrapRuns<R extends string>(
  runs: ReadonlyArray<WrapRun<R>>,
  width: number,
  maxLines: number,
  fontFor: (role: R) => string,
  measure: Measure,
): Array<Array<PlacedRun<R>>> {
  type Token = { text: string; role: R; space: boolean }
  const tokens: Array<Token> = []
  for (const run of runs) {
    for (const t of tokenize(run.text)) {
      tokens.push({ text: t, role: run.role, space: /^\s+$/.test(t) })
    }
  }
  const lines: Array<Array<PlacedRun<R>>> = []
  let line: Array<PlacedRun<R>> = []
  let x = 0
  let truncated = false

  const pushPiece = (text: string, role: R, w: number) => {
    const last = line.at(-1)
    // 同じ role が続くなら 1 つの run にまとめる（描画回数を減らす）
    if (last && last.role === role) {
      last.text += text
      last.width += w
    } else {
      line.push({ text, role, x, width: w })
    }
    x += w
  }
  const newLine = (): boolean => {
    // 行末の空白は捨てる
    const last = line.at(-1)
    if (last && /\s$/.test(last.text)) {
      const trimmed = last.text.trimEnd()
      const removed =
        measure(last.text, fontFor(last.role)) -
        measure(trimmed, fontFor(last.role))
      last.text = trimmed
      last.width -= removed
      if (!trimmed) line.pop()
    }
    lines.push(line)
    line = []
    x = 0
    return lines.length < maxLines
  }

  outer: for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const font = fontFor(token.role)
    if (token.space && line.length === 0) continue
    const w = measure(token.text, font)
    if (x + w <= width) {
      pushPiece(token.text, token.role, w)
      continue
    }
    if (token.space) {
      if (!newLine()) {
        truncated = tokens.slice(i + 1).some((t) => !t.space)
        break
      }
      continue
    }
    if (w <= width && line.length > 0) {
      if (!newLine()) {
        truncated = true
        break
      }
      pushPiece(token.text, token.role, w)
      continue
    }
    // 1 行に入らない長い単語は 1 文字ずつ
    for (const ch of Array.from(token.text)) {
      const cw = measure(ch, font)
      if (x + cw > width && line.length > 0) {
        if (!newLine()) {
          truncated = true
          break outer
        }
      }
      pushPiece(ch, token.role, cw)
    }
  }
  if (line.length > 0 && lines.length < maxLines) lines.push(line)

  if (truncated && lines.length > 0) {
    const last = lines[lines.length - 1]
    // 最終行を「…」込みで幅に収める
    const used = last.reduce((sum, r) => sum + r.width, 0)
    const tail = last[last.length - 1]
    const tailFont = fontFor(tail.role)
    const room = width - (used - tail.width)
    const cut = ellipsize(`${tail.text}…`, room, tailFont, measure)
    tail.text = cut.endsWith('…') ? cut : `${cut}…`
    tail.width = measure(tail.text, tailFont)
  }
  return lines
}

/** 1 種類の書体の文字列を折り返す（wrapRuns の簡易版） */
export function wrapText(
  text: string,
  width: number,
  maxLines: number,
  font: string,
  measure: Measure,
): Array<string> {
  return wrapRuns(
    [{ text, role: 'text' }],
    width,
    maxLines,
    () => font,
    measure,
  ).map((line) => line.map((r) => r.text).join(''))
}
