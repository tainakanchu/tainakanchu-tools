/**
 * M3U / M3U8 のプレイリスト（rekordbox の「プレイリストを書き出す」など）を読む。
 *
 *   #EXTM3U
 *   #EXTINF:177,靜芳, EAERAN - Sweetless
 *   C:\Users\dj\Music\…\1-07 Sweetless.mp3
 *
 * - #EXTINF の秒数はファイルの長さなので使わない（どこにも出さない）
 * - 「アーティスト - 曲名」は最初の " - " で分ける。" - " が無いとき・#EXTINF が無いとき
 *   （パスだけの M3U）は、ファイル名から拡張子と先頭の曲番号（"1-07 " / "03 "）を除いた
 *   ものを曲名にし、アーティストは空のまま（推測で作らない）
 * - BPM・Key・時刻は無い。日付はファイル名に日付があるときだけ（他の形式と同じ）
 * - 文字コードは parse.ts の decodeText（UTF-8 / BOM / UTF-16、古い .m3u の Shift_JIS・CP1252）
 */
import { cleanArtist, cleanText, findDate } from './text'
import { createTrackId } from './types'
import type { ParseResult, Track } from './types'

const EXTINF = /^#EXTINF\s*:\s*(-?\d+(?:\.\d+)?)?[^,]*,(.*)$/i

/** M3U らしいか（#EXTM3U か #EXTINF の行がある） */
export function looksLikeM3u(text: string): boolean {
  return /^\s*#EXTM3U\b/i.test(text) || /^#EXTINF\s*:/im.test(text)
}

/** パスのファイル名から曲名を作る（拡張子と先頭の曲番号を除く） */
export function titleFromPath(location: string): string {
  const base = location.split(/[\\/]/).pop() ?? ''
  const name = base.replace(/\.[a-z0-9]{2,5}$/i, '')
  return cleanText(
    name.replace(/^\d{1,2}-\d{1,3}\s+|^\d{1,2}(?:\s*[-.]\s*|\s+)/, ''),
  )
}

type Entry = Omit<Track, 'id'>

function entryFrom(
  info: string | undefined,
  location: string,
): Entry | undefined {
  const text = cleanText(info)
  const at = text.indexOf(' - ')
  if (at > 0 && at < text.length - 3) {
    const artist = cleanArtist(text.slice(0, at))
    const title = cleanText(text.slice(at + 3))
    return { artist, title }
  }
  const title = (location ? titleFromPath(location) : '') || text
  return title ? { artist: '', title } : undefined
}

export function parseM3u(text: string, fileName?: string): ParseResult {
  const tracks: Array<Track> = []
  let info: string | undefined
  let hasInfo = false
  const push = (entry: Entry | undefined) => {
    if (entry) tracks.push({ ...entry, id: createTrackId() })
  }
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = EXTINF.exec(line)
    if (m) {
      // 前の #EXTINF にパスが続かなかったときも、その曲は残す
      if (hasInfo) push(entryFrom(info, ''))
      info = m[2]
      hasInfo = true
      continue
    }
    if (line.startsWith('#')) continue
    push(entryFrom(hasInfo ? info : undefined, line))
    info = undefined
    hasInfo = false
  }
  if (hasInfo) push(entryFrom(info, ''))
  if (tracks.length === 0) {
    throw new Error('曲が 1 曲も見つかりませんでした')
  }
  const name = fileName ? fileName.replace(/\.[^.]+$/, '') : 'M3U'
  return {
    format: 'm3u',
    playlists: [
      {
        id: 'm3u',
        name,
        path: [],
        isHistory: false,
        setlist: { date: findDate(fileName), tracks },
      },
    ],
    defaultIndex: 0,
  }
}
