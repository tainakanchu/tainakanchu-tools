/**
 * Serato DJ の History 書き出し（.csv）を読む。
 *
 * 列の並びはバージョンや表示設定で変わるので、ヘッダー名で探す。
 * 1 行目のデータはたいていセッションのまとめ行（name にセッション名や日付、
 * artist は空、start/end time にセッション全体の時刻）なので、
 * タイトル・日付に使って曲からは外す。
 */
import { findColumn, headerKey, parseDelimited } from './csv'
import { normalizeKey } from './keys'
import {
  cleanArtist,
  cleanText,
  findDate,
  parseBpm,
  parseClockTime,
  parseDuration,
  unwrapMidnight,
} from './text'
import { createTrackId } from './types'
import type { ParseResult, Track } from './types'

/** 列が無い（-1）ときや行が短いときは空文字 */
function at(row: ReadonlyArray<string>, index: number): string {
  return index === -1 ? '' : (row[index] ?? '')
}

export const CSV_COLUMNS = {
  title: ['name', 'title', 'track', 'song'],
  artist: ['artist'],
  start: ['start time', 'start', 'played at'],
  end: ['end time', 'end'],
  playtime: ['playtime', 'play time', 'duration', 'length'],
  deck: ['deck'],
  bpm: ['bpm'],
  key: ['key'],
  genre: ['genre'],
  label: ['label'],
} as const

export function looksLikeSeratoCsv(text: string): boolean {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  if (!firstLine.includes(',')) return false
  const headers = parseDelimited(firstLine, ',')[0] ?? []
  const keys = headers.map(headerKey)
  return (
    findColumn(headers, CSV_COLUMNS.title) !== -1 &&
    (keys.includes('artist') ||
      keys.includes('starttime') ||
      keys.includes('playtime'))
  )
}

const SESSION_MIN_SEC = 20 * 60

export function parseSeratoCsv(text: string, fileName?: string): ParseResult {
  const rows = parseDelimited(text, ',')
  if (rows.length === 0) throw new Error('空のファイルです')
  const headers = rows[0]
  const col = (names: ReadonlyArray<string>) => findColumn(headers, names)
  const titleCol = col(CSV_COLUMNS.title)
  if (titleCol === -1) throw new Error('name 列が見つかりませんでした')
  const artistCol = col(CSV_COLUMNS.artist)
  const startCol = col(CSV_COLUMNS.start)
  const playtimeCol = col(CSV_COLUMNS.playtime)
  const deckCol = col(CSV_COLUMNS.deck)
  const bpmCol = col(CSV_COLUMNS.bpm)
  const keyCol = col(CSV_COLUMNS.key)
  const genreCol = col(CSV_COLUMNS.genre)
  const labelCol = col(CSV_COLUMNS.label)

  let body = rows.slice(1)
  let sessionName: string | undefined
  let sessionDate: string | undefined
  const first = body.at(0)
  if (first) {
    const name = cleanText(at(first, titleCol))
    const artistEmpty = cleanText(at(first, artistCol)) === ''
    const deckEmpty = cleanText(at(first, deckCol)) === ''
    const playtime = parseDuration(at(first, playtimeCol)) ?? 0
    const date = findDate(name)
    const isSession =
      artistEmpty &&
      deckEmpty &&
      (deckCol !== -1 || date !== undefined || playtime >= SESSION_MIN_SEC)
    if (isSession) {
      body = body.slice(1)
      sessionDate = date ?? findDate(at(first, startCol))
      // セッション名が日付そのものならタイトルには使わない
      if (name && !date) sessionName = name
    }
  }

  const starts = unwrapMidnight(
    body.map((row) =>
      startCol === -1 ? undefined : parseClockTime(at(row, startCol)),
    ),
  )
  const tracks: Array<Track> = []
  body.forEach((row, index) => {
    const title = cleanText(at(row, titleCol))
    const artist = cleanArtist(at(row, artistCol))
    if (!title && !artist) return
    tracks.push({
      id: createTrackId(),
      title,
      artist,
      bpm: parseBpm(at(row, bpmCol)),
      key: normalizeKey(at(row, keyCol)),
      startAt: starts[index],
      durationSec: parseDuration(at(row, playtimeCol)),
      genre: cleanText(at(row, genreCol)) || undefined,
      label: cleanText(at(row, labelCol)) || undefined,
    })
  })
  if (tracks.length === 0) throw new Error('曲が 1 曲も見つかりませんでした')

  const baseName = fileName ? fileName.replace(/\.[^.]+$/, '') : ''
  return {
    format: 'serato-csv',
    playlists: [
      {
        id: 'csv',
        name: sessionName ?? (baseName || 'History'),
        path: [],
        isHistory: true,
        setlist: {
          title: sessionName,
          date: sessionDate ?? findDate(baseName),
          tracks,
        },
      },
    ],
    defaultIndex: 0,
  }
}
