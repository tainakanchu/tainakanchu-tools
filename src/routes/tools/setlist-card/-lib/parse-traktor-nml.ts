/**
 * Traktor の History（.nml）を読む。
 *
 * - COLLECTION/ENTRY に曲情報。LOCATION の VOLUME + DIR + FILE を連結したものが
 *   プレイリスト側 PRIMARYKEY KEY と一致する。
 * - PLAYLIST/ENTRY/EXTENDEDDATA に再生記録。STARTDATE は (年<<16 | 月<<8 | 日)、
 *   STARTTIME はその日の 0 時からの秒。
 * - PLAYEDPUBLIC="0" はヘッドホンでの試聴なのでセトリから外す。
 * - プレイリストが無ければコレクション順をそのまま使う。
 */
import { normalizeKey, traktorKeyToName } from './keys'
import {
  cleanArtist,
  cleanText,
  findDate,
  formatDate,
  parseBpm,
  titleFromFileName,
} from './text'
import { createTrackId } from './types'
import type { ParseResult, PlaylistCandidate, Track } from './types'

type Entry = Omit<Track, 'id'>

function childByTag(el: Element, tag: string): Element | undefined {
  return Array.from(el.children).find((c) => c.tagName === tag)
}

export function decodeTraktorDate(
  packed: number,
): { year: number; month: number; day: number } | undefined {
  if (!Number.isFinite(packed) || packed <= 0) return undefined
  const year = packed >> 16
  const month = (packed >> 8) & 0xff
  const day = packed & 0xff
  if (year < 1990 || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined
  }
  return { year, month, day }
}

function locationKey(location: Element | undefined): string | undefined {
  if (!location) return undefined
  const volume = location.getAttribute('VOLUME') ?? ''
  const dir = location.getAttribute('DIR') ?? ''
  const file = location.getAttribute('FILE') ?? ''
  if (!file) return undefined
  return `${volume}${dir}${file}`
}

function entryFromElement(el: Element): Entry {
  const location = childByTag(el, 'LOCATION')
  const info = childByTag(el, 'INFO')
  const tempo = childByTag(el, 'TEMPO')
  const musicalKey = childByTag(el, 'MUSICAL_KEY')
  const keyValue = Number.parseInt(musicalKey?.getAttribute('VALUE') ?? '', 10)
  const playtime = Number.parseFloat(info?.getAttribute('PLAYTIME') ?? '')
  const title =
    cleanText(el.getAttribute('TITLE')) ||
    titleFromFileName(location?.getAttribute('FILE') ?? '')
  return {
    title,
    artist: cleanArtist(el.getAttribute('ARTIST')),
    bpm: parseBpm(tempo?.getAttribute('BPM')),
    key: traktorKeyToName(keyValue) ?? normalizeKey(info?.getAttribute('KEY')),
    durationSec:
      Number.isFinite(playtime) && playtime > 0 ? playtime : undefined,
    genre: cleanText(info?.getAttribute('GENRE')) || undefined,
    label: cleanText(info?.getAttribute('LABEL')) || undefined,
  }
}

type Played = { entry: Entry; startAt?: number; date?: string; public: boolean }

function readPlaylist(
  playlist: Element,
  byKey: Map<string, Entry>,
): Array<Played> {
  const played: Array<Played> = []
  for (const item of Array.from(playlist.children)) {
    if (item.tagName !== 'ENTRY') continue
    const primary = childByTag(item, 'PRIMARYKEY')
    const entry = byKey.get(primary?.getAttribute('KEY') ?? '')
    if (!entry) continue
    const ext = childByTag(item, 'EXTENDEDDATA')
    const date = decodeTraktorDate(
      Number.parseInt(ext?.getAttribute('STARTDATE') ?? '', 10),
    )
    const time = Number.parseInt(ext?.getAttribute('STARTTIME') ?? '', 10)
    const startAt =
      date && Number.isFinite(time)
        ? Date.UTC(date.year, date.month - 1, date.day) / 1000 + time
        : undefined
    played.push({
      entry,
      startAt,
      date: date ? formatDate(date.year, date.month, date.day) : undefined,
      public: ext?.getAttribute('PLAYEDPUBLIC') !== '0',
    })
  }
  // 全部が試聴扱いのときは判定が当てにならないので、外さずに全部使う
  return played.some((p) => p.public) ? played.filter((p) => p.public) : played
}

export function parseTraktorNml(text: string, fileName?: string): ParseResult {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Traktor NML として読み取れませんでした')
  }
  const root = doc.documentElement
  const collection = childByTag(root, 'COLLECTION')
  const byKey = new Map<string, Entry>()
  const ordered: Array<Entry> = []
  if (collection) {
    for (const el of Array.from(collection.children)) {
      if (el.tagName !== 'ENTRY') continue
      const entry = entryFromElement(el)
      ordered.push(entry)
      const key = locationKey(childByTag(el, 'LOCATION'))
      if (key) byKey.set(key, entry)
    }
  }

  const fileDate = findDate(fileName)
  const playlists: Array<PlaylistCandidate> = []
  const walk = (node: Element, path: Array<string>) => {
    for (const child of Array.from(node.children)) {
      if (child.tagName === 'SUBNODES') {
        walk(child, path)
        continue
      }
      if (child.tagName !== 'NODE') continue
      const name = cleanText(child.getAttribute('NAME'))
      const type = child.getAttribute('TYPE')
      if (type === 'FOLDER') {
        walk(child, name === '$ROOT' ? path : [...path, name])
        continue
      }
      if (type !== 'PLAYLIST') continue
      const playlist = childByTag(child, 'PLAYLIST')
      if (!playlist) continue
      const played = readPlaylist(playlist, byKey)
      if (played.length === 0) continue
      playlists.push({
        id: `pl-${playlists.length}`,
        name: name || 'History',
        path,
        isHistory: true,
        setlist: {
          date: played.find((p) => p.date)?.date ?? fileDate,
          tracks: played.map((p) => ({
            ...p.entry,
            id: createTrackId(),
            startAt: p.startAt,
          })),
        },
      })
    }
  }
  const playlistsEl = childByTag(root, 'PLAYLISTS')
  if (playlistsEl) walk(playlistsEl, [])

  if (playlists.length === 0 && ordered.length > 0) {
    playlists.push({
      id: 'collection',
      name: fileName ? fileName.replace(/\.[^.]+$/, '') : 'コレクション',
      path: [],
      isHistory: true,
      setlist: {
        date: fileDate,
        tracks: ordered.map((e) => ({ ...e, id: createTrackId() })),
      },
    })
  }
  if (playlists.length === 0) {
    throw new Error('曲が 1 曲も見つかりませんでした')
  }
  return {
    format: 'traktor-nml',
    playlists,
    // History ファイルは通常 1 つだけ。複数あれば最後（新しい方）を選ぶ
    defaultIndex: playlists.length - 1,
  }
}
