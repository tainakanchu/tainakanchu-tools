/**
 * rekordbox の「プレイリストをテキストで書き出す」(.txt) を読む。
 * タブ区切り・1 行目がヘッダー。列は表示中のカラム設定に依存し、
 * UI 言語によって英語名にも日本語名にもなるので別名で探す。
 */
import { findColumn, parseDelimited } from './csv'
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

export const TXT_COLUMNS = {
  title: [
    'Track Title',
    'Title',
    'Name',
    'トラックタイトル',
    'タイトル',
    '曲名',
  ],
  artist: ['Artist', 'アーティスト'],
  bpm: ['BPM'],
  key: ['Key', 'キー', 'Tonality'],
  time: ['Time', 'Length', 'Duration', '時間', '長さ', '再生時間'],
  genre: ['Genre', 'ジャンル'],
  label: ['Label', 'レーベル'],
  /** HISTORY を書き出したときに入ることがある再生時刻 */
  playedAt: ['Played Time', 'Start Time', '再生日時', '再生時刻', '開始時刻'],
  date: ['Date Added', 'Date', '追加日', '日付'],
} as const

/** ヘッダー行がタイトル列を含むか（判定用） */
export function looksLikeRekordboxTxt(text: string): boolean {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  if (!firstLine.includes('\t')) return false
  return findColumn(firstLine.split('\t'), TXT_COLUMNS.title) !== -1
}

export function parseRekordboxTxt(
  text: string,
  fileName?: string,
): ParseResult {
  const rows = parseDelimited(text, '\t')
  if (rows.length === 0) throw new Error('空のファイルです')
  const headers = rows[0]
  const col = (names: ReadonlyArray<string>) => findColumn(headers, names)
  const titleCol = col(TXT_COLUMNS.title)
  if (titleCol === -1) {
    throw new Error('タイトル列が見つかりませんでした')
  }
  const artistCol = col(TXT_COLUMNS.artist)
  const bpmCol = col(TXT_COLUMNS.bpm)
  const keyCol = col(TXT_COLUMNS.key)
  const timeCol = col(TXT_COLUMNS.time)
  const genreCol = col(TXT_COLUMNS.genre)
  const labelCol = col(TXT_COLUMNS.label)
  const playedCol = col(TXT_COLUMNS.playedAt)

  const body = rows.slice(1)
  const starts = unwrapMidnight(
    body.map((row) =>
      playedCol === -1 ? undefined : parseClockTime(at(row, playedCol)),
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
      durationSec: parseDuration(at(row, timeCol)),
      startAt: starts[index],
      genre: cleanText(at(row, genreCol)) || undefined,
      label: cleanText(at(row, labelCol)) || undefined,
    })
  })
  if (tracks.length === 0) throw new Error('曲が 1 曲も見つかりませんでした')

  const baseName = fileName ? fileName.replace(/\.[^.]+$/, '') : ''
  const playedDate =
    playedCol === -1 ? undefined : findDate(at(body[0], playedCol))
  return {
    format: 'rekordbox-txt',
    playlists: [
      {
        id: 'txt',
        name: baseName || 'プレイリスト',
        path: [],
        isHistory: /history|ヒストリー|履歴/i.test(baseName),
        setlist: {
          date: playedDate ?? findDate(baseName),
          tracks,
        },
      },
    ],
    defaultIndex: 0,
  }
}
