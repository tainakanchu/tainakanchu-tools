/**
 * RFC 4180 寄りの区切り文字テキストパーサー。
 * ダブルクォート内のカンマ・改行・"" エスケープを扱う。
 */
export function parseDelimited(
  text: string,
  delimiter: string,
): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let field = ''
  let inQuotes = false
  let i = 0
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    // 空行は捨てる
    if (row.length > 1 || row[0].trim() !== '') rows.push(row)
    row = []
  }
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"' && field.trim() === '') {
      field = ''
      inQuotes = true
      i++
      continue
    }
    if (ch === delimiter) {
      pushField()
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      pushRow()
      if (ch === '\r' && text[i + 1] === '\n') i++
      i++
      continue
    }
    field += ch
    i++
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

/** ヘッダー名の比較用キー（大文字小文字・空白・記号を無視） */
export function headerKey(name: string): string {
  return name
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()（）]+/g, '')
}

/** 候補名のどれかに一致する列 index（無ければ -1） */
export function findColumn(
  headers: ReadonlyArray<string>,
  candidates: ReadonlyArray<string>,
): number {
  const keys = headers.map(headerKey)
  for (const candidate of candidates) {
    const index = keys.indexOf(headerKey(candidate))
    if (index !== -1) return index
  }
  return -1
}
