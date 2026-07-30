/**
 * 日付ヘルパー。
 * タイムゾーン・DST事故を避けるため、内部は 'YYYY-MM-DD' 文字列と
 * 日インデックスの整数演算に閉じる。Date は UTC 固定でのみ使う。
 */

const DAY_MS = 24 * 60 * 60 * 1000

export function parseISODate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function isValidISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  return !Number.isNaN(parseISODate(iso))
}

/** from から to までの日数差(to - from)。同日は 0 */
export function dayDiff(fromISO: string, toISO: string): number {
  return Math.round((parseISODate(toISO) - parseISODate(fromISO)) / DAY_MS)
}

export function addDays(iso: string, days: number): string {
  const date = new Date(parseISODate(iso) + days * DAY_MS)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const

/** 曜日番号 (0 = 日曜 〜 6 = 土曜)。土日の色分けや「月曜は休館日」判断に使う */
export function weekdayIndex(iso: string): number {
  return new Date(parseISODate(iso)).getUTCDay()
}

export function weekdayJa(iso: string): string {
  return WEEKDAY_JA[weekdayIndex(iso)]
}

/** '6/12(木)' 形式 */
export function formatShortJa(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}(${weekdayJa(iso)})`
}
