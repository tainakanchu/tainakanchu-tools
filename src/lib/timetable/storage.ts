/**
 * localStorage への保存。
 *
 * - タイムテーブル本体は 1 つのキーに一覧として持つ(数件・数十 KB の想定)。
 * - お気に入りと友達の選択はタイムテーブルごとに別キーにする。
 *   当日はお気に入りを頻繁に切り替えるので、そのたびにタイムテーブル全体を
 *   書き直さないため。
 * - 読み込みは normalizeTimetable を通す(取り込み時と同じ規則で検証する)。
 *   壊れた項目は捨てるが、一覧全体は捨てない。
 *
 * localStorage は private モードや容量超過で例外を投げるので、
 * 読み書きはすべて try/catch で包み、失敗しても画面は動き続けるようにする。
 */

import { normalizeTimetable } from './normalize'
import type { FriendPick, TimetableDoc } from './types'

const PREFIX = 'tainakanchu-tools:timetable:v1'
const LIBRARY_KEY = `${PREFIX}:library`
const favKey = (id: string) => `${PREFIX}:fav:${id}`
const friendsKey = (id: string) => `${PREFIX}:friends:${id}`

export interface SavedTimetable {
  /** 端末ローカルの id。共有URLには載せない */
  id: string
  doc: TimetableDoc
  savedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseLibrary(raw: unknown): Array<SavedTimetable> {
  if (!Array.isArray(raw)) return []
  const result: Array<SavedTimetable> = []
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    const { doc } = normalizeTimetable(entry.doc)
    if (doc === null) continue
    result.push({
      id: entry.id,
      doc,
      savedAt: typeof entry.savedAt === 'string' ? entry.savedAt : '',
    })
  }
  return result
}

export function parseIdList(raw: unknown): Array<string> {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((v): v is string => typeof v === 'string'))]
}

export function parseFriends(raw: unknown): Array<FriendPick> {
  if (!Array.isArray(raw)) return []
  const result: Array<FriendPick> = []
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    result.push({
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : '友達',
      actIds: parseIdList(entry.actIds),
      ...(entry.hidden === true ? { hidden: true } : {}),
    })
  }
  return result
}

function readJson(key: string): unknown {
  try {
    const text = window.localStorage.getItem(key)
    return text === null ? null : (JSON.parse(text) as unknown)
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // 消せなくても次回の読み込みで孤児になるだけ
  }
}

export function loadLibrary(): Array<SavedTimetable> {
  return parseLibrary(readJson(LIBRARY_KEY))
}

export function saveLibrary(library: ReadonlyArray<SavedTimetable>): boolean {
  return writeJson(LIBRARY_KEY, library)
}

export function loadFavorites(id: string): Array<string> {
  return parseIdList(readJson(favKey(id)))
}

export function saveFavorites(id: string, ids: ReadonlyArray<string>): boolean {
  return writeJson(favKey(id), ids)
}

export function loadFriends(id: string): Array<FriendPick> {
  return parseFriends(readJson(friendsKey(id)))
}

export function saveFriends(
  id: string,
  friends: ReadonlyArray<FriendPick>,
): boolean {
  return writeJson(friendsKey(id), friends)
}

export function removeTimetableData(id: string): void {
  remove(favKey(id))
  remove(friendsKey(id))
}

export function newLocalId(prefix = 't'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
