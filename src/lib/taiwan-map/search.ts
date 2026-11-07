/**
 * 一覧の文字検索（純関数）。
 *
 * 日本語の入力は表記ゆれが多いので、比べる前に両側を同じ形にそろえる:
 * - NFKC … 全角英数字・記号を半角に、半角カナを全角カナにそろえる
 *   （「ＣＡＦＥ」と「cafe」、「ｷﾞｭｳ」と「ギュウ」が同じになる）
 * - 小文字化 … 「Cafe」と「cafe」
 * - ひらがな → カタカナ … 「ぎゅうにく」で「ギュウニク」が見つかる
 *
 * 検索語は空白で区切った語ごとに見て、すべての語がどこかに含まれる
 * スポットだけを残す（「牛肉 深夜」は両方を含むもの）。
 */

/** ひらがな（ぁ〜ゖ）をカタカナへ。ゝゞ（踊り字）もヽヾへ */
function hiraganaToKatakana(text: string): string {
  return text.replace(/[ぁ-ゖゝゞ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  )
}

/** 比べるための形にそろえる。前後の空白は落とし、連続する空白は 1 つにする */
export function normalizeSearchText(text: string): string {
  return hiraganaToKatakana(text.normalize('NFKC').toLowerCase())
    .replace(/\s+/g, ' ')
    .trim()
}

/** 検索語を語ごとに分けて正規化する。空なら空配列（= 絞り込まない） */
export function searchTerms(query: string | undefined): Array<string> {
  if (query === undefined) return []
  const normalized = normalizeSearchText(query)
  return normalized === '' ? [] : normalized.split(' ')
}

/**
 * fields（名前・タグなど）のどこかに、すべての語が含まれるか。
 * 語が無ければ true（何も入力していなければ全件）
 */
export function matchesSearch(
  fields: ReadonlyArray<string | undefined>,
  terms: ReadonlyArray<string>,
): boolean {
  if (terms.length === 0) return true
  // 語がフィールドの境目をまたいで一致しないよう、改行でつなぐ
  // （正規化で空白は 1 つの半角スペースになるが、改行は語に含まれない）
  const haystack = fields
    .filter((f): f is string => f !== undefined)
    .map(normalizeSearchText)
    .join('\n')
  return terms.every((term) => haystack.includes(term))
}

type SearchableSpot = {
  name: string
  nameZh?: string
  tags?: ReadonlyArray<string>
  summary?: string
}

/**
 * スポットの検索対象: 名前・中国語名・タグ・エリア名・一言コメント。
 * summary は画面に出すもの（書きかけの TODO を落としたあと）を渡すこと
 */
export function spotSearchFields(
  spot: SearchableSpot,
  areaName: string | undefined,
): Array<string | undefined> {
  return [spot.name, spot.nameZh, ...(spot.tags ?? []), areaName, spot.summary]
}
