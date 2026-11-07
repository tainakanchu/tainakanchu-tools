/**
 * rekordbox の「コレクションを xml 形式でエクスポート」(DJ_PLAYLISTS) を読む。
 *
 * - COLLECTION/TRACK にメタ情報、PLAYLISTS/NODE にフォルダ (Type=0) と
 *   プレイリスト (Type=1) の木がある。
 * - プレイリスト内の TRACK Key は KeyType=0 なら TrackID、1 なら Location。
 * - 1 ファイルに大量のプレイリストが入るので、候補をすべて返して選ばせる。
 *   HISTORY 系フォルダ配下・日付入りの名前のうち一番新しいものを既定にする。
 */
import { normalizeKey } from './keys'
import { cleanArtist, cleanText, findDate, parseBpm } from './text'
import { createTrackId } from './types'
import type { ParseResult, PlaylistCandidate, Track } from './types'

const HISTORY_PATTERN = /history|ヒストリー|履歴/i

function decodeLocation(location: string): string {
  try {
    return decodeURI(location)
  } catch {
    return location
  }
}

function trackFromElement(el: Element): Omit<Track, 'id'> {
  const totalTime = Number.parseFloat(el.getAttribute('TotalTime') ?? '')
  const location = el.getAttribute('Location') ?? ''
  const fileName = decodeLocation(location).split('/').pop() ?? ''
  const title =
    cleanText(el.getAttribute('Name')) ||
    cleanText(fileName.replace(/\.[a-z0-9]{2,5}$/i, ''))
  return {
    title,
    artist: cleanArtist(el.getAttribute('Artist')),
    bpm: parseBpm(el.getAttribute('AverageBpm')),
    key: normalizeKey(el.getAttribute('Tonality')),
    durationSec:
      Number.isFinite(totalTime) && totalTime > 0 ? totalTime : undefined,
    genre: cleanText(el.getAttribute('Genre')) || undefined,
    label: cleanText(el.getAttribute('Label')) || undefined,
  }
}

/** 名前に含まれる日付で新しさを比べるためのキー（YYYYMMDD の数値） */
function dateSortKey(name: string): number | undefined {
  const date = findDate(name)
  if (!date) return undefined
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(date)
  if (!match) return undefined
  return Number(`${match[1]}${match[2]}${match[3]}`)
}

/** 既定で選ぶ候補: HISTORY 系の中で日付が一番新しいもの → HISTORY 系の最後 → 最初 */
export function pickDefaultPlaylist(
  playlists: ReadonlyArray<PlaylistCandidate>,
): number {
  if (playlists.length === 0) return 0
  const scored = playlists.map((p, index) => ({
    index,
    history: p.isHistory || HISTORY_PATTERN.test(p.name),
    date: dateSortKey(p.name),
  }))
  const pool = scored.some((s) => s.history)
    ? scored.filter((s) => s.history)
    : scored
  const dated = pool.filter((s) => s.date !== undefined)
  if (dated.length > 0) {
    // 同じ日付なら後ろ（"HISTORY 2024-05-01 (2)" のような後のセッション）を優先
    return dated.reduce((best, s) =>
      (s.date ?? 0) >= (best.date ?? 0) ? s : best,
    ).index
  }
  return pool === scored ? pool[0].index : pool[pool.length - 1].index
}

export function parseRekordboxXml(text: string): ParseResult {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('rekordbox XML として読み取れませんでした')
  }
  const root = doc.documentElement
  const collection = Array.from(root.children).find(
    (el) => el.tagName === 'COLLECTION',
  )
  const byId = new Map<string, Omit<Track, 'id'>>()
  const byLocation = new Map<string, Omit<Track, 'id'>>()
  const collectionOrder: Array<Omit<Track, 'id'>> = []
  if (collection) {
    for (const el of Array.from(collection.children)) {
      if (el.tagName !== 'TRACK') continue
      const track = trackFromElement(el)
      collectionOrder.push(track)
      const id = el.getAttribute('TrackID')
      if (id) byId.set(id, track)
      const location = el.getAttribute('Location')
      if (location) byLocation.set(decodeLocation(location), track)
    }
  }

  const playlists: Array<PlaylistCandidate> = []
  const walk = (node: Element, path: Array<string>, inHistory: boolean) => {
    for (const child of Array.from(node.children)) {
      if (child.tagName !== 'NODE') continue
      const name = cleanText(child.getAttribute('Name'))
      const type = child.getAttribute('Type')
      if (type === '0') {
        walk(child, [...path, name], inHistory || HISTORY_PATTERN.test(name))
        continue
      }
      if (type !== '1') continue
      const byLocationKey = child.getAttribute('KeyType') === '1'
      const tracks: Array<Track> = []
      for (const ref of Array.from(child.children)) {
        if (ref.tagName !== 'TRACK') continue
        const key = ref.getAttribute('Key') ?? ''
        const found = byLocationKey
          ? byLocation.get(decodeLocation(key))
          : byId.get(key)
        if (found) tracks.push({ ...found, id: createTrackId() })
      }
      if (tracks.length === 0) continue
      playlists.push({
        id: `pl-${playlists.length}`,
        name,
        path,
        isHistory: inHistory || HISTORY_PATTERN.test(name),
        setlist: { title: undefined, date: findDate(name), tracks },
      })
    }
  }
  const playlistsEl = Array.from(root.children).find(
    (el) => el.tagName === 'PLAYLISTS',
  )
  const rootNode = playlistsEl
    ? Array.from(playlistsEl.children).find((el) => el.tagName === 'NODE')
    : undefined
  // ROOT ノード自体は階層表示に含めない
  if (rootNode) walk(rootNode, [], false)

  if (playlists.length === 0 && collectionOrder.length > 0) {
    playlists.push({
      id: 'collection',
      name: 'コレクション全体',
      path: [],
      isHistory: false,
      setlist: {
        tracks: collectionOrder.map((t) => ({ ...t, id: createTrackId() })),
      },
    })
  }
  if (playlists.length === 0) {
    throw new Error('曲の入ったプレイリストが見つかりませんでした')
  }
  return {
    format: 'rekordbox-xml',
    playlists,
    defaultIndex: pickDefaultPlaylist(playlists),
  }
}
