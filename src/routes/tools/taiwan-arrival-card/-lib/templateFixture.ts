/**
 * **テスト専用**。公式テンプレート(xlsx)を読み解くための道具。
 *
 * ここにあるのは「テンプレートに実際には何が書いてあるか」を、アプリのコードを
 * 一切通さずに読み直すための実装。options.ts や xlsx.ts が正しいかを確かめる
 * ためのものなので、検証対象のコードを再利用してはいけない(同じ勘違いをして
 * いたら両方揃って間違え、テストは緑のままになる)。
 *
 * node:fs を使うのでブラウザでは動かない。アプリ側からは import しないこと
 * (import していないので、バンドルにも入らない)。
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'

const here = path.dirname(fileURLToPath(import.meta.url))

export const TEMPLATE_PATH = path.resolve(
  here,
  '../../../../../public/assets/taiwan-arrival-card/template.xlsx',
)

export function readTemplateBytes(): Uint8Array {
  return new Uint8Array(readFileSync(TEMPLATE_PATH))
}

export function templateEntries(): Record<string, Uint8Array> {
  return unzipSync(readTemplateBytes())
}

export function entryText(
  entries: Record<string, Uint8Array>,
  filePath: string,
): string {
  // 型の上では必ず取れることになっているが、実際に何が入っているかは
  // 読み込んだファイル次第。テストの失敗理由が「undefined を decode した」
  // では追えないので、パス付きで落とす
  if (!(filePath in entries)) throw new Error(`entry not found: ${filePath}`)
  return new TextDecoder('utf-8').decode(entries[filePath])
}

/** XML のテキストノードを素の文字列に戻す。&amp; は最後に戻す(二重展開を避ける) */
function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&amp;/g, '&')
}

/**
 * sharedStrings.xml の一覧。
 * 1 つの <si> が複数の <t>(書式の変わり目で分かれたリッチテキスト)を持つことが
 * あるので、必ず連結する。最初の <t> だけを見ると文字列が途中で切れる。
 */
export function sharedStrings(
  entries: Record<string, Uint8Array>,
): Array<string> {
  const xml = entryText(entries, 'xl/sharedStrings.xml')
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) =>
    [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((t) => decodeXmlText(t[1]))
      .join(''),
  )
}

/**
 * シート 1 枚を「セル参照 → 表示される文字列」の Map にする。
 * 共有文字列(t="s")とインライン文字列(t="inlineStr")の両方を解決する。
 */
export function sheetCells(
  entries: Record<string, Uint8Array>,
  sheetPath: string,
): Map<string, string> {
  const strings = sharedStrings(entries)
  const xml = entryText(entries, sheetPath)
  const cells = new Map<string, string>()
  const cellRe = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g

  for (const match of xml.matchAll(cellRe)) {
    const [, ref, attrs, body = ''] = match
    const type = /t="([^"]+)"/.exec(attrs)?.[1]
    if (type === 's') {
      const index = /<v>([\s\S]*?)<\/v>/.exec(body)
      if (index !== null) cells.set(ref, strings[Number(index[1])] ?? '')
      continue
    }
    if (type === 'inlineStr') {
      cells.set(
        ref,
        [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((t) => decodeXmlText(t[1]))
          .join(''),
      )
      continue
    }
    const value = /<v>([\s\S]*?)<\/v>/.exec(body)
    if (value !== null) cells.set(ref, decodeXmlText(value[1]))
  }
  return cells
}

/** 選択肢マスタが載っている非表示シート */
export const SHEET2_PATH = 'xl/worksheets/sheet2.xml'
export const SHEET1_PATH = 'xl/worksheets/sheet1.xml'

/** 工作表2 の 1 列ぶんを、行番号の範囲で切り出す(例: 'N', 2, 259) */
export function columnRange(
  cells: Map<string, string>,
  column: string,
  fromRow: number,
  toRow: number,
): Array<string> {
  const values: Array<string> = []
  for (let row = fromRow; row <= toRow; row += 1) {
    const value = cells.get(`${column}${row}`)
    if (value === undefined) {
      throw new Error(
        `工作表2 の ${column}${row} が空です(範囲の指定が古い可能性)`,
      )
    }
    values.push(value)
  }
  return values
}
