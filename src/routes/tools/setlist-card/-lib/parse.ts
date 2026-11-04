/**
 * ファイルの中身から形式を判定して、対応するパーサーへ振り分ける入口。
 * 拡張子は当てにせず中身で決める（.txt の CSV や .xml の NML があり得るため）。
 */
import { looksLikeRekordboxTxt, parseRekordboxTxt } from './parse-rekordbox-txt'
import { parseRekordboxXml } from './parse-rekordbox-xml'
import { looksLikeSeratoCsv, parseSeratoCsv } from './parse-serato-csv'
import { parseTraktorNml } from './parse-traktor-nml'
import { decodeText } from './text'
import type { ParseResult } from './types'

export class UnsupportedFormatError extends Error {}

export function parseSetlistText(text: string, fileName?: string): ParseResult {
  const body = text.replace(/^﻿/, '')
  const head = body.slice(0, 4096)
  if (/<DJ_PLAYLISTS[\s>]/.test(head)) return parseRekordboxXml(body)
  if (/<NML[\s>]/.test(head)) return parseTraktorNml(body, fileName)
  if (looksLikeRekordboxTxt(body)) return parseRekordboxTxt(body, fileName)
  if (looksLikeSeratoCsv(body)) return parseSeratoCsv(body, fileName)
  throw new UnsupportedFormatError(
    '対応していない形式です。rekordbox の XML / テキスト書き出し、Traktor の History (.nml)、Serato の History (.csv) を読み込めます。',
  )
}

export function parseSetlistBuffer(
  buffer: ArrayBuffer,
  fileName?: string,
): ParseResult {
  return parseSetlistText(decodeText(buffer), fileName)
}
