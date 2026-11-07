/**
 * 時刻まわりの小さな関数群。
 *
 * アクトの時刻は "HH:MM"(24 以上も可)の文字列で持ち、計算は「その日の 0:00 から
 * の分」に直して行う。日付を跨ぐ比較(深夜帯・連日開催)では day の日付差を
 * 1440 分単位で足す。夏時間の切り替わりを跨ぐ深夜イベントでは 1 時間ずれうるが、
 * 画面上の「その日の何分目か」はタイムテーブルの表記どおりであるべきなので、
 * 実時刻が必要な場面(.ics とカウントダウン)だけ Temporal で正確に変換する。
 */

/** 24 時以降の表記を何時まで許すか。48:00 を超える表記は現実のタイムテーブルに無い */
export const MAX_HOUR = 47

const HM_RE = /^(\d{1,2}):(\d{2})$/

/** "HH:MM" を分に。形式が違えば null */
export function parseHm(value: string): number | null {
  const match = HM_RE.exec(value)
  if (match === null) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > MAX_HOUR || minute > 59) return null
  return hour * 60 + minute
}

/** 分を "HH:MM" に。24 時以降もそのまま 25:30 のように書く */
export function formatHm(minutes: number): string {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** 画面表示用。深夜表記は時計の時刻に直さず、公式の表記どおりに見せる */
export function formatHmShort(minutes: number): string {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${hour}:${String(minute).padStart(2, '0')}`
}

/** "1時間5分" のような長さの表記 */
export function formatDuration(minutes: number): string {
  const abs = Math.abs(Math.round(minutes))
  if (abs < 60) return `${abs}分`
  const hour = Math.floor(abs / 60)
  const minute = abs % 60
  if (hour >= 24) {
    const day = Math.floor(hour / 24)
    const restHour = hour % 24
    return restHour === 0 ? `${day}日` : `${day}日${restHour}時間`
  }
  return minute === 0 ? `${hour}時間` : `${hour}時間${minute}分`
}

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日']

/** "11/8(土)" */
export function formatDateLabel(isoDate: string): string {
  try {
    const date = Temporal.PlainDate.from(isoDate)
    return `${date.month}/${date.day}(${WEEKDAYS[date.dayOfWeek - 1]})`
  } catch {
    return isoDate
  }
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  try {
    Temporal.PlainDate.from(value, { overflow: 'reject' })
    return true
  } catch {
    return false
  }
}

export function isValidTimezone(value: string): boolean {
  if (value.length === 0) return false
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions()
        .timeZone.length > 0
    )
  } catch {
    return false
  }
}

/** 日付 + その日の何分目か → epoch ms(イベントのタイムゾーン基準) */
export function toEpochMs(
  isoDate: string,
  minutes: number,
  timezone: string,
): number {
  const start = Temporal.PlainDate.from(isoDate).toPlainDateTime({
    hour: 0,
    minute: 0,
  })
  return start
    .add({ minutes })
    .toZonedDateTime(timezone, { disambiguation: 'compatible' })
    .epochMilliseconds
}

/** epoch ms → イベントのタイムゾーンでの日付と、その日の何分目か */
export function wallClock(
  nowMs: number,
  timezone: string,
): { date: string; minutes: number } {
  const zdt =
    Temporal.Instant.fromEpochMilliseconds(nowMs).toZonedDateTimeISO(timezone)
  return {
    date: zdt.toPlainDate().toString(),
    minutes: zdt.hour * 60 + zdt.minute,
  }
}

/** b - a の日数 */
export function daysBetween(a: string, b: string): number {
  return Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b), {
    largestUnit: 'days',
  }).days
}
