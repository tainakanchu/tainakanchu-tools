/**
 * AI の出力(や手書きの JSON)を TimetableDoc に正規化し、問題を列挙する層。
 *
 * 設計判断:
 * - 寛容に読む。全角数字・全角コロン、"14:00〜14:40" のような time 文字列だけ、
 *   id の欠落、会場を id ではなく名前で指定、といった揺れは AI の出力で日常的に
 *   起きるので、ここで直す。直したことは必要に応じて警告として残す。
 * - 部分成功を許す。1 件の出演が壊れていても残りは取り込む。
 *   壊れた出演はエラーとして「どの出演か」が分かる形で返し、UI で一覧にする。
 * - 保存データの読み込み(storage.ts)と共有URLの復元(share.ts)も同じ関数を通す。
 *   規則が 2 か所にあると「取り込めたのに次回起動で消える」壊れ方をするため。
 *   正しい TimetableDoc を通しても何も変わらない(冪等)ように書いている。
 */

import { hashId, normalizeKey, stableActId, uniqueId } from './id'
import { extractJson } from './jsonText'
import {
  MAX_HOUR,
  formatHm,
  isValidIsoDate,
  isValidTimezone,
  parseHm,
} from './time'
import { ACT_KINDS, DEFAULT_TIMEZONE } from './types'
import type {
  ActKind,
  TimetableAct,
  TimetableDay,
  TimetableDoc,
  TimetableTravel,
  TimetableVenue,
} from './types'

/** end < start を「0 時跨ぎ」と解釈してよい最大の長さ(分) */
const MAX_WRAP_MINUTES = 6 * 60

export type IssueLevel = 'error' | 'warning'

export interface ImportIssue {
  level: IssueLevel
  /** どこの問題か。'出演 12「9m88」' のような人間向けの表記 */
  where: string
  message: string
  /** 出演の問題なら入力配列での位置 */
  actIndex?: number
}

export interface NormalizeResult {
  /** 取り込める内容が 1 件も無ければ null */
  doc: TimetableDoc | null
  issues: Array<ImportIssue>
  /** 入力にあった出演の件数(壊れていたものも含む) */
  inputActCount: number
}

type Rec = Record<string, unknown>

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

/** 最初に値の入っているキーの文字列 */
function pick(rec: Rec, keys: ReadonlyArray<string>): string | undefined {
  for (const key of keys) {
    const value = str(rec[key])
    if (value !== undefined) return value
  }
  return undefined
}

function httpUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return /^https?:\/\/\S+$/i.test(value) ? value : undefined
}

// --- 時刻・日付の正規化 ---

/**
 * "14:30" に揃える。全角数字・全角コロン("１４：３０")、"14時30分"、"14.30"、
 * "1430"、秒付き("14:30:00")を受ける。読めなければ null。
 */
export function normalizeTime(raw: string): string | null {
  const text = raw
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '')
    .replace(/時半$/, '時30分')
  const match =
    /^(\d{1,2})[:.時](\d{1,2})?分?(?::\d{2})?$/.exec(text) ??
    /^(\d{1,2})(\d{2})$/.exec(text)
  if (match === null) return null
  // 分の省略("14時")では 2 番目のグループが undefined になる
  const groups: Array<string | undefined> = match
  const minutePart = Number(groups[2] ?? '0')
  if (minutePart > 59) return null
  const minutes = Number(groups[1]) * 60 + minutePart
  const formatted = formatHm(minutes)
  return parseHm(formatted) === null ? null : formatted
}

/** "14:00〜14:40" / "14:00 - 14:40" / "14:00~" を開始と終了に分ける */
export function splitTimeRange(raw: string): {
  start: string | null
  end: string | null
} {
  const text = raw.normalize('NFKC').trim()
  const parts: Array<string | undefined> = text.split(/\s*[〜~\-–—―ー]\s*/)
  const start = parts[0] === undefined ? null : normalizeTime(parts[0])
  const endText = parts[1]
  const end =
    endText === undefined || endText.length === 0
      ? null
      : normalizeTime(endText)
  return { start, end }
}

/** "2026/11/08" "2026年11月8日" などを "2026-11-08" に */
export function normalizeDate(raw: string): string | null {
  const text = raw.normalize('NFKC').trim()
  const match = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/.exec(text)
  if (match === null) return null
  const iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  return isValidIsoDate(iso) ? iso : null
}

const KIND_ALIASES: Record<string, ActKind> = {
  live: 'live',
  band: 'live',
  ライブ: 'live',
  dj: 'dj',
  talk: 'talk',
  トーク: 'talk',
  signing: 'signing',
  sign: 'signing',
  サイン: 'signing',
  サイン会: 'signing',
  特典会: 'signing',
  other: 'other',
  その他: 'other',
  物販: 'other',
}

function normalizeKind(raw: string): ActKind | null {
  const key = normalizeKey(raw)
  const direct = ACT_KINDS.find((kind) => kind === key)
  if (direct !== undefined) return direct
  return key in KIND_ALIASES ? KIND_ALIASES[key] : null
}

function parseMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 0 && value <= 600 ? Math.round(value) : null
  }
  if (typeof value === 'string') {
    const match = /^(\d+)\s*分?$/.exec(value.normalize('NFKC').trim())
    if (match !== null) return parseMinutes(Number(match[1]))
  }
  return null
}

// --- 本体 ---

function actWhere(index: number, title: string | undefined): string {
  return title === undefined
    ? `出演 ${index + 1}`
    : `出演 ${index + 1}「${title}」`
}

export function normalizeTimetable(raw: unknown): NormalizeResult {
  const issues: Array<ImportIssue> = []
  const error = (where: string, message: string, actIndex?: number) =>
    issues.push({ level: 'error', where, message, actIndex })
  const warn = (where: string, message: string, actIndex?: number) =>
    issues.push({ level: 'warning', where, message, actIndex })

  // 出演の配列だけが返ってきた場合も受ける
  const root: Rec = Array.isArray(raw)
    ? { acts: raw }
    : isRecord(raw)
      ? raw
      : {}
  if (!isRecord(raw) && !Array.isArray(raw)) {
    error('全体', 'タイムテーブルの JSON として読めませんでした。')
    return { doc: null, issues, inputActCount: 0 }
  }

  // タイトル・タイムゾーン
  let title = pick(root, ['title', 'name', 'event'])
  if (title === undefined) {
    title = '無題のタイムテーブル'
    warn('全体', 'title がありません。「無題のタイムテーブル」にしました。')
  }
  let timezone = str(root.timezone) ?? DEFAULT_TIMEZONE
  if (!isValidTimezone(timezone)) {
    warn(
      '全体',
      `timezone「${timezone}」が読めないので ${DEFAULT_TIMEZONE} にしました。`,
    )
    timezone = DEFAULT_TIMEZONE
  }
  const sourceUrl = httpUrl(str(root.sourceUrl))

  // 日付
  const days: Array<TimetableDay> = []
  const dayLookup = new Map<string, TimetableDay>()
  const addDayKeys = (day: TimetableDay) => {
    for (const key of [day.id, day.date, day.label]) {
      if (key === undefined) continue
      const k = normalizeKey(key)
      if (!dayLookup.has(k)) dayLookup.set(k, day)
    }
  }
  const rawDays = Array.isArray(root.days) ? root.days : []
  rawDays.forEach((entry, index) => {
    const where = `日付 ${index + 1}`
    const rec: Rec = isRecord(entry)
      ? entry
      : typeof entry === 'string'
        ? { date: entry }
        : {}
    const dateText = str(rec.date)
    const date = dateText === undefined ? null : normalizeDate(dateText)
    if (date === null) {
      error(
        where,
        `date が YYYY-MM-DD の形ではありません(${dateText ?? '空'})。`,
      )
      return
    }
    const id = str(rec.id) ?? date
    if (days.some((day) => day.id === id)) {
      error(where, `日付の id「${id}」が重複しています。`)
      return
    }
    const label = str(rec.label)
    const day: TimetableDay = { id, date, ...(label ? { label } : {}) }
    days.push(day)
    addDayKeys(day)
  })

  // 会場
  const venues: Array<TimetableVenue> = []
  // id と名前は別の表で引く。ある会場の名前が別の会場の id と同じ文字列でも
  // (例: id "www" の会場と、名前 "WWW" の会場)、id 指定は id として解決する
  const venueById = new Map<string, TimetableVenue>()
  const venueByName = new Map<string, TimetableVenue>()
  const findVenue = (ref: string): TimetableVenue | undefined => {
    const k = normalizeKey(ref)
    return venueById.get(k) ?? venueByName.get(k)
  }
  /** venue / stage に書かれた値は名前のはずなので、名前を先に引く */
  const findVenueByName = (ref: string): TimetableVenue | undefined => {
    const k = normalizeKey(ref)
    return venueByName.get(k) ?? venueById.get(k)
  }
  const usedVenueIds = new Set<string>()
  const addVenue = (
    name: string,
    id: string | undefined,
    extra: Partial<TimetableVenue>,
  ): TimetableVenue => {
    const venue: TimetableVenue = {
      id: id ?? uniqueId(hashId('v', [name]), usedVenueIds),
      name,
      ...extra,
    }
    usedVenueIds.add(venue.id)
    venues.push(venue)
    const idKey = normalizeKey(venue.id)
    const nameKey = normalizeKey(venue.name)
    if (!venueById.has(idKey)) venueById.set(idKey, venue)
    if (!venueByName.has(nameKey)) venueByName.set(nameKey, venue)
    return venue
  }
  const rawVenues = Array.isArray(root.venues)
    ? root.venues
    : Array.isArray(root.stages)
      ? root.stages
      : []
  rawVenues.forEach((entry, index) => {
    const where = `会場 ${index + 1}`
    const rec: Rec = isRecord(entry)
      ? entry
      : typeof entry === 'string'
        ? { name: entry }
        : {}
    const name = pick(rec, ['name', 'title', 'stage', 'venue'])
    if (name === undefined) {
      error(where, '会場の name がありません。')
      return
    }
    const id = str(rec.id)
    if (id !== undefined && usedVenueIds.has(id)) {
      error(`${where}「${name}」`, `会場の id「${id}」が重複しています。`)
      return
    }
    const group = str(rec.group)
    const note = str(rec.note)
    const mapUrl = httpUrl(str(rec.mapUrl))
    addVenue(name, id, {
      ...(group ? { group } : {}),
      ...(note ? { note } : {}),
      ...(mapUrl ? { mapUrl } : {}),
    })
  })

  // 出演
  const rawActs = Array.isArray(root.acts)
    ? root.acts
    : Array.isArray(root.performances)
      ? root.performances
      : []
  const acts: Array<TimetableAct> = []
  const usedActIds = new Set<string>()
  // 明示 id を先に予約しておく。生成 id が後ろの明示 id と衝突しないように
  const explicitIds = new Set<string>()
  for (const entry of rawActs) {
    if (isRecord(entry)) {
      const id = str(entry.id)
      if (id !== undefined) explicitIds.add(id)
    }
  }
  const pendingGenerated: Array<{
    act: Omit<TimetableAct, 'id'>
    base: string
    slot: number
  }> = []

  rawActs.forEach((entry, index) => {
    if (!isRecord(entry)) {
      error(
        actWhere(index, undefined),
        '出演がオブジェクトではありません。',
        index,
      )
      return
    }
    const actTitle = pick(entry, ['title', 'artist', 'name', 'performer'])
    const where = actWhere(index, actTitle)
    if (actTitle === undefined) {
      error(where, '出演名(title)がありません。', index)
      return
    }

    // 日付
    let day: TimetableDay | undefined
    const dayRef = pick(entry, ['dayId', 'day', 'date'])
    if (dayRef !== undefined) {
      day = dayLookup.get(normalizeKey(dayRef))
      // "day": 1 のような通し番号(1 始まり)
      if (day === undefined && /^\d{1,2}$/.test(dayRef)) {
        const n = Number(dayRef)
        if (n >= 1 && n <= days.length) day = days[n - 1]
      }
      if (day === undefined) {
        const date = normalizeDate(dayRef)
        if (date !== null) {
          day = dayLookup.get(normalizeKey(date))
          if (day === undefined) {
            day = { id: date, date }
            days.push(day)
            addDayKeys(day)
            warn(where, `days に無い日付 ${date} を追加しました。`, index)
          }
        }
      }
      if (day === undefined) {
        error(where, `dayId「${dayRef}」が days にありません。`, index)
        return
      }
    } else if (days.length === 1) {
      day = days[0]
    } else {
      error(
        where,
        days.length === 0
          ? '日付がありません。days を書くか、出演に date を付けてください。'
          : 'dayId がありません。複数日あるので、どの日の出演か指定が必要です。',
        index,
      )
      return
    }

    // 会場
    let venue: TimetableVenue | undefined
    const venueIdRef = str(entry.venueId) ?? str(entry.stageId)
    const venueNameRef = pick(entry, ['venue', 'stage', 'venueName', 'place'])
    if (venueIdRef !== undefined) {
      venue = findVenue(venueIdRef)
    }
    if (venue === undefined && venueNameRef !== undefined) {
      venue = findVenueByName(venueNameRef)
      if (venue === undefined && venueIdRef === undefined) {
        venue = addVenue(venueNameRef, undefined, {})
        warn(
          where,
          `venues に無い会場「${venueNameRef}」を追加しました。`,
          index,
        )
      }
    }
    if (venue === undefined) {
      error(
        where,
        venueIdRef !== undefined
          ? `venueId「${venueIdRef}」が venues にありません。`
          : '会場(venueId)がありません。',
        index,
      )
      return
    }

    // 時刻
    let start: string | null = null
    let end: string | null = null
    const startText = str(entry.start)
    const endText = str(entry.end)
    const timeText = str(entry.time)
    if (startText !== undefined) {
      const range = splitTimeRange(startText)
      start = range.start
      if (endText === undefined) end = range.end
    } else if (timeText !== undefined) {
      const range = splitTimeRange(timeText)
      start = range.start
      end = range.end
    }
    if (endText !== undefined) {
      end = normalizeTime(endText)
      if (end === null) {
        warn(where, `終了時刻「${endText}」が読めないので省きました。`, index)
      }
    }
    if (start === null) {
      error(
        where,
        `開始時刻が読めません(${startText ?? timeText ?? '空'})。"14:30" の形で書いてください。`,
        index,
      )
      return
    }
    const startMin = parseHm(start) ?? 0
    let sameAsStart = false
    if (end !== null) {
      const endMin = parseHm(end) ?? 0
      if (endMin < startMin) {
        // 23:30〜00:30 のように 0 時を跨いだだけの書き方は、24 時以降の表記に直して残す。
        // 差が大きいもの(14:00〜13:00 など)は読み違いの可能性が高いので落とす
        const wrapped = endMin + 1440
        if (
          wrapped - startMin <= MAX_WRAP_MINUTES &&
          wrapped <= MAX_HOUR * 60 + 59
        ) {
          const fixed = formatHm(wrapped)
          warn(
            where,
            `終了 ${end} が開始 ${start} より前なので、0時を跨いだものとして ${fixed} にしました。`,
            index,
          )
          end = fixed
        } else {
          error(
            where,
            `終了 ${end} が開始 ${start} より前です。0時を跨ぐときは "25:00" のように24時以降の表記にしてください。`,
            index,
          )
          return
        }
      } else if (endMin === startMin) {
        warn(
          where,
          `開始と終了が同じ ${start} なので、終了時刻を省きました。`,
          index,
        )
        end = null
        sameAsStart = true
      }
    }
    if (end === null && endText === undefined && !sameAsStart) {
      warn(where, '終了時刻がありません。30分として表示します。', index)
    }

    const subtitle = pick(entry, ['subtitle', 'sub', 'members'])
    let kind: ActKind | undefined
    const kindText = str(entry.kind) ?? str(entry.type)
    if (kindText !== undefined) {
      const normalized = normalizeKind(kindText)
      if (normalized === null) {
        warn(where, `kind「${kindText}」は使えないので省きました。`, index)
      } else if (normalized !== 'live') {
        kind = normalized
      }
    }
    const note = str(entry.note)
    const url = httpUrl(str(entry.url))

    const act: Omit<TimetableAct, 'id'> = {
      dayId: day.id,
      venueId: venue.id,
      start,
      ...(end !== null ? { end } : {}),
      title: actTitle,
      ...(subtitle ? { subtitle } : {}),
      ...(kind ? { kind } : {}),
      ...(note ? { note } : {}),
      ...(url ? { url } : {}),
    }

    const id = str(entry.id)
    if (id !== undefined) {
      if (usedActIds.has(id)) {
        error(where, `id「${id}」が他の出演と重複しています。`, index)
        return
      }
      usedActIds.add(id)
      acts.push({ id, ...act })
    } else {
      // 生成 id は全部読み終えてから振る(明示 id との衝突を避けるため)
      pendingGenerated.push({
        act,
        base: stableActId(day.date, venue.name, start, actTitle),
        slot: acts.length,
      })
      acts.push({ id: '', ...act })
    }
  })

  const reserved = new Set([...explicitIds, ...usedActIds])
  for (const pending of pendingGenerated) {
    const id = uniqueId(pending.base, reserved)
    reserved.add(id)
    acts[pending.slot] = { id, ...pending.act }
  }

  // 移動時間
  const travel: Array<TimetableTravel> = []
  const rawTravel = Array.isArray(root.travel) ? root.travel : []
  rawTravel.forEach((entry, index) => {
    const where = `移動時間 ${index + 1}`
    if (!isRecord(entry)) return
    const fromRef = str(entry.from)
    const toRef = str(entry.to)
    const from = fromRef === undefined ? undefined : findVenue(fromRef)
    const to = toRef === undefined ? undefined : findVenue(toRef)
    const minutes = parseMinutes(entry.minutes)
    if (from === undefined || to === undefined || minutes === null) {
      warn(where, '会場か分数が読めないので省きました。')
      return
    }
    if (from.id === to.id) return
    if (
      travel.some(
        (t) =>
          (t.from === from.id && t.to === to.id) ||
          (t.from === to.id && t.to === from.id),
      )
    ) {
      return
    }
    travel.push({ from: from.id, to: to.id, minutes })
  })

  if (acts.length === 0) {
    error(
      '全体',
      rawActs.length === 0
        ? '出演(acts)が 1 件もありません。'
        : '取り込める出演が 1 件もありませんでした。',
    )
    return { doc: null, issues, inputActCount: rawActs.length }
  }

  // 出演の無い会場は残す(タイムテーブル上の列として意味がある)が、日付は順に並べる
  days.sort((a, b) => a.date.localeCompare(b.date))

  const doc: TimetableDoc = {
    version: 1,
    title,
    timezone,
    ...(sourceUrl ? { sourceUrl } : {}),
    days,
    venues,
    acts,
    ...(travel.length > 0 ? { travel } : {}),
  }
  return { doc, issues, inputActCount: rawActs.length }
}

/** 貼り付けられたテキストから読む */
export function parseTimetableText(text: string): NormalizeResult {
  if (text.trim().length === 0) {
    return {
      doc: null,
      issues: [
        {
          level: 'error',
          where: '全体',
          message: 'AI の返答を貼り付けてください。',
        },
      ],
      inputActCount: 0,
    }
  }
  const json = extractJson(text)
  if (!json.ok) {
    return {
      doc: null,
      issues: [
        {
          level: 'error',
          where: '全体',
          message:
            json.reason === 'broken'
              ? 'JSON の途中に省略やコメントがあるようです(「...」「以下同様」など)。AI に「省略せず全件を JSON で出力して」と頼み直してください。'
              : 'JSON が見つかりませんでした。AI の返答をそのまま全部貼るか、「JSON だけで出力して」と頼み直してください。',
        },
      ],
      inputActCount: 0,
    }
  }
  return normalizeTimetable(json.value)
}
