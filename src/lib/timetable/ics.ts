/**
 * お気に入りを iCalendar(.ics)として書き出す。
 *
 * 旅のしおりの ics.ts と同じ方針:
 * - 時刻は UTC(…Z)で出し、VTIMEZONE を書かない。イベントのタイムゾーンで
 *   壁時計時刻 → 瞬間に直すのは Temporal に任せる。
 * - UID は出演 id から作る。入れ直したときにカレンダー側が同じ予定と
 *   判断できる余地を残すため。
 * - 通知(VALARM)は付けない。通知の好みは利用者のカレンダー側の設定に任せる。
 * - 行は 75 オクテットで折る(日本語は 1 文字 3 オクテット)。
 */

import { actSpan } from './derive'
import { toEpochMs } from './time'
import type { TimetableDoc } from './types'

const MAX_LINE_OCTETS = 75

function utf8Size(codePoint: number): number {
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  if (codePoint < 0x10000) return 3
  return 4
}

function foldLine(line: string): string {
  const chunks: Array<string> = []
  let current = ''
  let octets = 0
  let limit = MAX_LINE_OCTETS
  for (const char of line) {
    const size = utf8Size(char.codePointAt(0) ?? 0)
    if (octets + size > limit) {
      chunks.push(current)
      current = ''
      octets = 0
      limit = MAX_LINE_OCTETS - 1
    }
    current += char
    octets += size
  }
  chunks.push(current)
  return chunks.join('\r\n ')
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function formatUtc(epochMs: number): string {
  const d = new Date(epochMs)
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

export function buildFavoritesIcs(
  doc: TimetableDoc,
  favorites: ReadonlySet<string>,
  nowMs: number,
): string {
  const dayById = new Map(doc.days.map((day) => [day.id, day]))
  const venueById = new Map(doc.venues.map((venue) => [venue.id, venue]))
  const dtstamp = formatUtc(nowMs)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//tainakanchu-tools//timetable//JA',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(doc.title)}`,
  ]
  for (const act of doc.acts) {
    if (!favorites.has(act.id)) continue
    const day = dayById.get(act.dayId)
    if (day === undefined) continue
    const span = actSpan(act)
    const venue = venueById.get(act.venueId)
    const description = [
      act.subtitle,
      act.note,
      span.endKnown ? undefined : '終了時刻は未定(30分で仮置き)',
      act.url,
      doc.title,
    ]
      .filter((v): v is string => v !== undefined && v.length > 0)
      .join('\n')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${encodeURIComponent(act.id)}@timetable.tainakanchu-tools`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${formatUtc(toEpochMs(day.date, span.start, doc.timezone))}`,
      `DTEND:${formatUtc(toEpochMs(day.date, span.end, doc.timezone))}`,
      `SUMMARY:${escapeText(act.title)}`,
      ...(venue ? [`LOCATION:${escapeText(venue.name)}`] : []),
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      ...(act.url ? [`URL:${act.url}`] : []),
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

/** ファイル名に使えない文字を落とす */
export function safeFileName(title: string, ext: string): string {
  const base =
    title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'timetable'
  return `${base}.${ext}`
}
