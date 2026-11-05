/**
 * セットの長さ（純粋関数）。「わからないことは書かない」ので、再生記録に実際の
 * 終わりがあるときだけ求め、それ以外は undefined（画像には出さない）。
 *
 * - 始まり: いちばん早い開始時刻（startAt。どの形式でも実際の時刻）
 * - 終わり: 最後の曲が実際に終わった時刻。Serato の end time（endAt）か、
 *   開始時刻 + 実際にかけていた秒数（playedSec: Serato の playtime、
 *   Traktor History の EXTENDEDDATA DURATION）
 *
 * ファイルの長さ（durationSec）や曲間の平均からは推さない。ファイルの長さは
 * 曲そのものの長さで、ミックスでは途中で次の曲に移るので、かけた長さではない。
 * rekordbox の書き出しには終わりの記録が無いので、常に出さない。
 */
import type { Track } from './types'

/** durationSec（ファイルの長さ）は受け取っても使わない */
type Timing = Pick<Track, 'startAt' | 'endAt' | 'playedSec' | 'durationSec'>

/** 実際に終わった時刻（記録に無ければ undefined） */
export function knownEndAt(track: Timing): number | undefined {
  const start = track.startAt
  if (start === undefined) return undefined
  if (track.endAt !== undefined && track.endAt > start) return track.endAt
  if (track.playedSec !== undefined && track.playedSec > 0)
    return start + track.playedSec
  return undefined
}

/**
 * セットの長さ（秒）。並びの最後の曲と、最後に始まった曲の両方の終わりが
 * 記録にあるときだけ（手で足した曲が最後にある・最後の曲の終わりが無い、なら出さない）。
 */
export function knownSetLength(
  tracks: ReadonlyArray<Timing>,
): number | undefined {
  const timed = tracks.filter(
    (t): t is Timing & { startAt: number } => t.startAt !== undefined,
  )
  const lastInList = tracks.at(-1)
  if (timed.length === 0 || !lastInList) return undefined
  const latest = timed.reduce((a, b) => (b.startAt >= a.startAt ? b : a))
  if (knownEndAt(lastInList) === undefined || knownEndAt(latest) === undefined)
    return undefined
  const first = Math.min(...timed.map((t) => t.startAt))
  const ends = timed.map(knownEndAt).filter((v): v is number => v !== undefined)
  const end = Math.max(...ends)
  return end > first ? end - first : undefined
}
