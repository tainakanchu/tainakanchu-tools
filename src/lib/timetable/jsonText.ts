/**
 * AI の返答テキストから JSON を取り出す。
 *
 * AI は JSON だけを返すように頼んでも、前置きの一文・```json フェンス・
 * 末尾カンマ・全角スペースやスマートクォートを混ぜてくる。
 * 旅のしおりの aiImport.ts と同じく、ここで寛容に受けて、
 * 利用者に AI との往復をやり直させない。
 */

const FENCE_RE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/g
const FENCE_MARKER_RE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?/g
const EXOTIC_SPACE_RE = /[　   ]/g
const SMART_QUOTE_RE = /[“”„‟]/g

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

function tryParse(text: string): unknown {
  const cleaned = stripTrailingCommas(stripLineComments(text))
  // スマートクォートの置換は出演名の中の引用符まで変えてしまうので最後に試す
  const attempts = [
    text,
    cleaned,
    cleaned.replace(EXOTIC_SPACE_RE, ' ').replace(SMART_QUOTE_RE, '"'),
  ]
  for (const attempt of attempts) {
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
