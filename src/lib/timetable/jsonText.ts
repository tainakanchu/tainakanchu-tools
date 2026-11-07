/**
 * AI の返答テキストから JSON を取り出す。
 *
 * AI は JSON だけを返すように頼んでも、前置きの一文・```json フェンス・
 * 末尾カンマ・全角スペースやスマートクォートを混ぜてくる。
 * コードブロックに入れずに本文として出された JSON をコピーすると、
 * 行末の \ や &#x20; が混ざったリッチテキストになる(repairRichText)。
 * 旅のしおりの aiImport.ts と同じく、ここで寛容に受けて、
 * 利用者に AI との往復をやり直させない。
 */

const FENCE_RE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/g
const FENCE_MARKER_RE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?/g
const EXOTIC_SPACE_RE =
  /[\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]/g
const UNICODE_SPACE_RE =
  /^[\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]$/
const SMART_QUOTE_RE = /^[“”„‟]$/
const SMART_QUOTE_GLOBAL_RE = /[“”„‟]/g
/** Markdown の強制改行(行末の \)。末尾の空白も許す */
const HARD_BREAK_RE = /\\[ \t]*(?=\r?$)/gm
const HTML_ENTITY_RE = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
}
/** JSON の文字列で正しいエスケープ文字 */
const JSON_ESCAPE_CHARS = '"\\/bfnrtu'
/** Markdown がバックスラッシュでエスケープしうる記号(JSON のエスケープ文字を除く) */
const MARKDOWN_ESCAPABLE = "!#$%&'()*+,-.:;<=>?@[]^_`{|}~"

/** 文字列リテラルの外にある末尾カンマ([1,] / {"a":1,})を消す */
function stripTrailingCommas(text: string): string {
  let result = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      result += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      result += ch
      continue
    }
    if (ch === ',') {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j += 1
      if (text[j] === '}' || text[j] === ']') continue
    }
    result += ch
  }
  return result
}

/**
 * 文字列リテラルの外にある // 行コメントを消す。
 * AI は「// 以下同様」のような注記を JSON の中に書くことがある。
 * URL の "https://" は文字列の中なので触らない。
 */
function stripLineComments(text: string): string {
  let result = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      result += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      result += ch
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
      result += '\n'
      continue
    }
    result += ch
  }
  return result
}

/**
 * 文字列リテラルの外だけに fn を適用する。
 * JSON の文字列は生の改行を含めないので、行をまたいだ状態の持ち越しは考えない。
 */
function mapOutsideStrings(text: string, fn: (ch: string) => string): string {
  let result = ''
  let inString = false
  let escaped = false
  for (const ch of text) {
    if (inString) {
      result += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      result += ch
      continue
    }
    result += fn(ch)
  }
  return result
}

/**
 * 文字列の外にある NBSP・全角スペースなどを半角スペースにする。
 * 文字列の中(出演名の全角スペースなど)はそのまま残す。
 */
function normalizeSpacesOutsideStrings(text: string): string {
  return mapOutsideStrings(text, (ch) => (UNICODE_SPACE_RE.test(ch) ? ' ' : ch))
}

/**
 * リッチテキストとしてコピーされた JSON の崩れを戻す。
 *
 * ChatGPT が JSON をコードブロックに入れずに本文として出すと、コピーした
 * テキストは Markdown 化されて、
 *   - 各行の末尾に \ (Markdown の強制改行)が付く
 *   - 行頭のスペースが &#x20; (HTML 実体参照)になる
 * という形で崩れる。
 *
 * 行末の \ を消しても正しい JSON は壊れない。JSON の文字列は生の改行を含めないので、
 * 改行の直前に来る \ は文字列の外にしかありえず、文字列の外の \ は JSON では常に不正。
 * そもそもこの関数は素の JSON.parse が失敗したときにしか呼ばない。
 */
function repairRichText(text: string): string {
  const unbroken = text.replace(HARD_BREAK_RE, '')
  const decoded = unbroken.replace(HTML_ENTITY_RE, (whole, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code > 0x10ffff) return whole
      return String.fromCodePoint(code)
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
  return normalizeSpacesOutsideStrings(decoded)
}

/**
 * Markdown のエスケープ(\_ \* \[ など)を戻す。
 * JSON として正しいエスケープ(\" \\ \/ \n \uXXXX など)には触らない。
 */
function unescapeMarkdown(text: string): string {
  let result = ''
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch !== '\\') {
      result += ch
      continue
    }
    const next = text[i + 1] as string | undefined
    if (next !== undefined && JSON_ESCAPE_CHARS.includes(next)) {
      result += ch + next
      i += 1
      continue
    }
    if (next !== undefined && MARKDOWN_ESCAPABLE.includes(next)) {
      result += next
      i += 1
      continue
    }
    result += ch
  }
  return result
}

/**
 * JSON の構造の位置にあるスマートクォートだけを " にする。
 * 直前の(空白を除く)文字が { [ , : か先頭、または直後が : , } ] か末尾のときだけ。
 * 値の中の「“新曲”披露」のような引用符は前後が地の文なので変えない。
 */
function replaceStructuralSmartQuotes(text: string): string {
  let result = ''
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (!SMART_QUOTE_RE.test(ch)) {
      result += ch
      continue
    }
    let p = i - 1
    while (p >= 0 && /\s/.test(text[p])) p -= 1
    let n = i + 1
    while (n < text.length && /\s/.test(text[n])) n += 1
    const before = p < 0 || '{[,:'.includes(text[p])
    const after = n >= text.length || ':,}]'.includes(text[n])
    result += before || after ? '"' : ch
  }
  return result
}

function* parseAttempts(text: string): Generator<string> {
  const clean = (t: string) => stripTrailingCommas(stripLineComments(t))
  yield text
  const cleaned = clean(text)
  yield cleaned
  yield normalizeSpacesOutsideStrings(cleaned)
  // ここから先はリッチテキストとしてコピーされた返答の救済。素直に読めたときは通らない
  const repaired = repairRichText(text)
  yield clean(repaired)
  const unescaped = unescapeMarkdown(repaired)
  yield clean(unescaped)
  // スマートクォートの置換は出演名の中の引用符まで変えうるので最後に試す。
  // まず構造の位置だけ、だめなら(従来どおり)すべて置き換える
  yield clean(
    normalizeSpacesOutsideStrings(replaceStructuralSmartQuotes(unescaped)),
  )
  yield clean(unescaped)
    .replace(EXOTIC_SPACE_RE, ' ')
    .replace(SMART_QUOTE_GLOBAL_RE, '"')
}

function tryParse(text: string): unknown {
  for (const attempt of parseAttempts(text)) {
    try {
      return JSON.parse(attempt) as unknown
    } catch {
      // 次の段階へ
    }
  }
  return undefined
}

/** 最初の open から対応する close まで。文字列リテラル内の括弧は数えない */
function balancedSpan(
  text: string,
  open: string,
  close: string,
): string | null {
  const start = text.indexOf(open)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export type ExtractResult =
  | { ok: true; value: unknown }
  /**
   * none: JSON らしきものが無い。
   * broken: { で始まる JSON はあるが壊れている(途中の省略記号・コメント・出力の途切れ)。
   */
  | { ok: false; reason: 'none' | 'broken' }

function isObjectArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === 'object' && v !== null && !Array.isArray(v))
  )
}

/**
 * テキスト中の JSON を読む。
 *
 * TimetableDoc はオブジェクトなので、最初に現れるのが { ならオブジェクトとしてだけ読む。
 * 壊れたオブジェクトの中にある最初の [ (days の配列など)へ逃げると、
 * 「日付だけ取り込めた」ような誤った成功になるため。その場合は broken を返し、
 * 利用者に AI への頼み直しを案内する。
 * 配列として読むのは、先に [ が現れ、中身がオブジェクトの配列だったときだけ。
 */
export function extractJson(text: string): ExtractResult {
  const sources: Array<string> = []
  for (const match of text.matchAll(FENCE_RE)) sources.push(match[1])
  sources.push(text.replace(FENCE_MARKER_RE, ''))
  sources.push(text)

  let sawBrokenObject = false
  for (const source of sources) {
    const trimmed = source.trim()
    if (trimmed.length === 0) continue
    const objectFirst = trimmed.indexOf('{')
    const arrayFirst = trimmed.indexOf('[')
    const arrayLeads =
      arrayFirst >= 0 && (objectFirst < 0 || arrayFirst < objectFirst)

    if (arrayLeads) {
      for (const candidate of [trimmed, balancedSpan(trimmed, '[', ']')]) {
        if (candidate === null) continue
        const parsed = tryParse(candidate)
        if (isObjectArray(parsed)) return { ok: true, value: parsed }
      }
      continue
    }
    if (objectFirst < 0) continue
    const candidates = [
      trimmed,
      balancedSpan(trimmed, '{', '}'),
      trimmed.slice(objectFirst, trimmed.lastIndexOf('}') + 1),
    ]
    for (const candidate of candidates) {
      if (candidate === null || candidate.length === 0) continue
      const parsed = tryParse(candidate)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      )
        return { ok: true, value: parsed }
    }
    sawBrokenObject = true
  }
  return { ok: false, reason: sawBrokenObject ? 'broken' : 'none' }
}
