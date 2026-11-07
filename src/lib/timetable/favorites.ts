/**
 * タイムテーブルを差し替えたとき(AI に追記・修正してもらって再取り込みしたとき)に
 * お気に入りを引き継ぐ。
 *
 * id は中身から作るハッシュ(id.ts)なので、時刻や会場が直された出演は
 * 別の id になる。そのままだとお気に入りが黙って消えるため、
 * 1. 同じ id があればそれ
 * 2. 無ければ「同じ日付 + 同じ出演名」が 1 件だけあればそれ
 * の順に拾い直す。同名が複数(ライブとサイン会など)あるときは、
 * 同じ会場のものが 1 件だけならそれを選び、決められなければ諦める。
 * 違う出演にお気に入りが付くより、外れるほうが害が小さい。
 */

import { normalizeKey } from './id'
import type { TimetableAct, TimetableDoc } from './types'

export interface RemapResult {
  ids: Array<string>
  /** 引き継げなかった出演名 */
  lost: Array<string>
}

export function remapActIds(
  oldDoc: TimetableDoc,
  newDoc: TimetableDoc,
  ids: ReadonlyArray<string>,
): RemapResult {
  const newIds = new Set(newDoc.acts.map((act) => act.id))
  const oldById = new Map(oldDoc.acts.map((act) => [act.id, act]))
  const oldDayDate = new Map(oldDoc.days.map((day) => [day.id, day.date]))
  const newDayDate = new Map(newDoc.days.map((day) => [day.id, day.date]))
  const oldVenueName = new Map(oldDoc.venues.map((v) => [v.id, v.name]))
  const newVenueName = new Map(newDoc.venues.map((v) => [v.id, v.name]))

  const result = new Set<string>()
  const lost: Array<string> = []
  for (const id of ids) {
    if (newIds.has(id)) {
      result.add(id)
      continue
    }
    const old = oldById.get(id)
    if (old === undefined) continue
    const date = oldDayDate.get(old.dayId)
    const title = normalizeKey(old.title)
    let candidates: Array<TimetableAct> = newDoc.acts.filter(
      (act) =>
        newDayDate.get(act.dayId) === date && normalizeKey(act.title) === title,
    )
    if (candidates.length > 1) {
      const venue = normalizeKey(oldVenueName.get(old.venueId) ?? '')
      candidates = candidates.filter(
        (act) => normalizeKey(newVenueName.get(act.venueId) ?? '') === venue,
      )
    }
    if (candidates.length === 1) result.add(candidates[0].id)
    else lost.push(old.title)
  }
  return { ids: [...result], lost }
}
