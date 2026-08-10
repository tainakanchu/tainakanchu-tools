/**
 * TWAC(台湾オンライン入国カード)の提出可能期間の簡易判定。
 *
 * 公式 FAQ (https://twac.immigration.gov.tw/faq):
 *   「入国日を含む 7 日前から提出できる」
 *   例: 入国日 10/7 → 10/1 から申請可
 *
 * これは公式サイトの検証を完全に写したものではない簡易チェック。
 * ウィンドウ日数が変わったら TWAC_SUBMISSION_WINDOW_DAYS だけ直す。
 *
 * 「今日」は台湾(Asia/Taipei)の暦日で見る。日本は同じ UTC+9 だが、
 * 欧州などから出発する利用者がブラウザのローカル日付で判定すると 1 日ずれる。
 */

import { isValidIsoDate } from './dates'

/**
 * 提出可能な日数(入国日を含む)。
 * 以前は 3 日だった時期があり、FAQ が変わったらここだけ直す。
 */
export const TWAC_SUBMISSION_WINDOW_DAYS = 7

/** 提出可否判定で使うタイムゾーン */
export const TWAC_TIMEZONE = 'Asia/Taipei'

export type SubmissionWindowStatus =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | {
      kind: 'too_early'
      entryDate: string
      opensOn: string
      /** 申請開始日まであと何日か(1 以上) */
      daysUntilOpen: number
      /** 提出可能日 [opensOn … entryDate] の ISO 日付列 */
      windowDays: ReadonlyArray<string>
    }
  | {
      kind: 'open'
      entryDate: string
      opensOn: string
      /** 入国日まであと何日か(当日は 0) */
      daysUntilEntry: number
      windowDays: ReadonlyArray<string>
    }
  | {
      kind: 'past'
      entryDate: string
      opensOn: string
      windowDays: ReadonlyArray<string>
    }

/** 台湾の今日を 'YYYY-MM-DD' で返す。nowMs はテスト差し込み用 */
export function todayInTaipei(nowMs: number = Date.now()): string {
  return Temporal.Instant.fromEpochMilliseconds(nowMs)
    .toZonedDateTimeISO(TWAC_TIMEZONE)
    .toPlainDate()
    .toString()
}

/** 申請開始日 = 入国日 − (ウィンドウ日数 − 1)。例: 10/7 と 7 日なら 10/1 */
export function submissionOpensOn(entryDate: string): string | null {
  if (!isValidIsoDate(entryDate)) return null
  return Temporal.PlainDate.from(entryDate)
    .subtract({ days: TWAC_SUBMISSION_WINDOW_DAYS - 1 })
    .toString()
}

/** [from, to] を含む連続した ISO 日付列。from > to なら空 */
export function eachIsoDateInclusive(from: string, to: string): Array<string> {
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) return []
  let cursor = Temporal.PlainDate.from(from)
  const end = Temporal.PlainDate.from(to)
  if (Temporal.PlainDate.compare(cursor, end) > 0) return []
  const out: Array<string> = []
  while (Temporal.PlainDate.compare(cursor, end) <= 0) {
    out.push(cursor.toString())
    cursor = cursor.add({ days: 1 })
  }
  return out
}

/**
 * 入国日と「今日」(いずれも YYYY-MM-DD)から提出可否を返す。
 * today は呼び出し側で todayInTaipei() などを渡す(テストで固定しやすくするため)。
 */
export function assessSubmissionWindow(
  entryDate: string,
  today: string,
): SubmissionWindowStatus {
  const trimmed = entryDate.trim()
  if (trimmed.length === 0) return { kind: 'empty' }
  if (!isValidIsoDate(trimmed) || !isValidIsoDate(today)) {
    return { kind: 'invalid' }
  }

  const opensOn = submissionOpensOn(trimmed)
  if (opensOn === null) return { kind: 'invalid' }

  const windowDays = eachIsoDateInclusive(opensOn, trimmed)
  const entry = Temporal.PlainDate.from(trimmed)
  const open = Temporal.PlainDate.from(opensOn)
  const now = Temporal.PlainDate.from(today)

  if (Temporal.PlainDate.compare(now, open) < 0) {
    return {
      kind: 'too_early',
      entryDate: trimmed,
      opensOn,
      daysUntilOpen: open.since(now).days,
      windowDays,
    }
  }
  if (Temporal.PlainDate.compare(now, entry) > 0) {
    return {
      kind: 'past',
      entryDate: trimmed,
      opensOn,
      windowDays,
    }
  }
  return {
    kind: 'open',
    entryDate: trimmed,
    opensOn,
    daysUntilEntry: entry.since(now).days,
    windowDays,
  }
}

/** UI 用の短い月日表記。'2026-10-07' → '10/7' */
export function formatMonthDay(iso: string): string {
  if (!isValidIsoDate(iso)) return iso
  const d = Temporal.PlainDate.from(iso)
  return `${d.month}/${d.day}`
}
