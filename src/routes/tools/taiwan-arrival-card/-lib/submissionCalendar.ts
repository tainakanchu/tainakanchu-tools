/**
 * TWAC 申請開始日をカレンダーに入れるための URL / .ics 生成。
 *
 * trip-notes と同じく API は叩かず、プリセット済み URL とファイルを返すだけ。
 * スマホの Google カレンダーは .ics を取り込めないので、主経路は Google の
 * TEMPLATE URL。デスクトップや Apple 向けに .ics も併せて出せるようにする。
 */

import { TWAC_OFFICIAL_URL } from './twac'
import { isValidIsoDate } from './dates'

const GOOGLE_CALENDAR_RENDER = 'https://calendar.google.com/calendar/render'
const PRODID = '-//tainakanchu tools//台湾入国カード//JA'
const UID_DOMAIN = 'tainakanchu-tools'

/** 'YYYY-MM-DD' → 'YYYYMMDD'。壊れていれば null */
function toCompactDate(iso: string): string | null {
  if (!isValidIsoDate(iso)) return null
  return iso.replaceAll('-', '')
}

/**
 * 申請開始日の終日イベントを Google カレンダーに入れる URL。
 * 押しただけでは登録されず、作成画面が開くだけ。
 */
export function twacOpenDayGoogleCalendarUrl(opensOn: string): string | null {
  const start = toCompactDate(opensOn)
  if (start === null) return null
  // 終日の終わりは排他。翌日の YYYYMMDD
  const endDate = Temporal.PlainDate.from(opensOn).add({ days: 1 }).toString()
  const end = toCompactDate(endDate)
  if (end === null) return null

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: '台湾入国カード（TWAC）申請開始',
    dates: `${start}/${end}`,
    details: [
      '台湾オンライン入国カードの提出が可能になる日です。',
      `公式: ${TWAC_OFFICIAL_URL}`,
    ].join('\n'),
  })
  return `${GOOGLE_CALENDAR_RENDER}?${params.toString()}`
}

/**
 * 申請開始日の終日イベント 1 件だけの .ics。
 * VALARM で当日朝 9:00(相対 −15h は使わず、DATE 終日 + TRIGGER で朝通知)。
 */
export function buildTwacOpenDayIcs(
  opensOn: string,
  nowMs: number = Date.now(),
): string | null {
  if (!isValidIsoDate(opensOn)) return null
  const start = toCompactDate(opensOn)
  if (start === null) return null
  const end = toCompactDate(
    Temporal.PlainDate.from(opensOn).add({ days: 1 }).toString(),
  )
  if (end === null) return null

  // DTSTAMP は UTC の 'YYYYMMDDTHHMMSSZ'
  const dtstamp = Temporal.Instant.fromEpochMilliseconds(nowMs)
    .toZonedDateTimeISO('UTC')
    .toPlainDateTime()
    .toString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.\d+$/, '')
    .concat('Z')

  const uid = `twac-open-${opensOn}@${UID_DOMAIN}`
  const summary = '台湾入国カード（TWAC）申請開始'
  const description = [
    '台湾オンライン入国カードの提出が可能になる日です。',
    `公式: ${TWAC_OFFICIAL_URL}`,
  ].join('\\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `URL:${TWAC_OFFICIAL_URL}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:TWAC 申請開始',
    // 終日イベントの「当日 09:00」相当。多くのクライアントで当日朝に鳴る
    'TRIGGER:-PT15H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.join('\r\n')}\r\n`
}

export function twacOpenDayIcsFileName(opensOn: string): string {
  return `twac-apply-${opensOn}.ics`
}
