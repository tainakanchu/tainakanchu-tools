/**
 * マイタイムテーブルを画像にするときの中身(行の組み立て・折り返し)。純粋関数。
 *
 * canvas への描画は routes/tools/timetable/-lib/shareImage.ts が受け持ち、
 * ここは「何を・どの順で・何行で描くか」だけを決める。文字幅は呼び出し側の
 * measure(canvas の measureText)を受け取るので、テストでは文字数で代用できる。
 */

import { actSpan, actTimeText, buildMyTimeline } from './derive'
import { formatDateLabel, formatDuration } from './time'
import type { GapKind, MyGap } from './derive'
import type { TimetableDoc } from './types'

export interface ShareImageGap {
  kind: GapKind
  text: string
}

export interface ShareImageRow {
  actId: string
  /** "13:00〜13:40" */
  time: string
  title: string
  subtitle?: string
  venueName: string
  /** colors.ts の venueColor に渡す番号(doc.venues の並び順) */
  venueIndex: number
  /** 同じ日のほかのお気に入りと時間が重なっている */
  conflict: boolean
  /** 直前の行との間(その日の最初の行では null) */
  gapBefore: ShareImageGap | null
}

export interface ShareImageDay {
  dayId: string
  /** "11/8(土)" */
  dateLabel: string
  label?: string
  rows: Array<ShareImageRow>
  overlaps: number
  tights: number
}

export interface ShareImageModel {
  title: string
  /** 見出しに並べる日付("11/8(土) DAY1" のように) */
  dayLabels: Array<string>
  days: Array<ShareImageDay>
  total: number
}

/**
 * 間の説明。会場名は行のほうに出ているので入れない(会場名と日本語の文を
 * 1 つの文字列にすると、中国語・韓国語の会場名が日本語の書体で描かれてしまう)
 */
function gapText(gap: MyGap): string {
  const assumed = gap.endAssumed ? '(終了時刻は推定)' : ''
  const free = formatDuration(gap.freeMinutes)
  const travel =
    gap.travelMinutes === null
      ? '移動時間は未登録'
      : `移動 ${formatDuration(gap.travelMinutes)}`
  switch (gap.kind) {
    case 'overlap':
      return `時間が ${formatDuration(-gap.freeMinutes)} 重なっています${assumed}`
    case 'tight':
      return `間に合わない可能性: 空き ${free}・別会場(${travel})${assumed}`
    case 'move':
      return `空き ${free}・別会場(${travel})${assumed}`
    case 'stay':
      return `空き ${free}・同じ会場${assumed}`
  }
}

/**
 * お気に入りを日ごと・時刻順の行にする。並びと間の判定は MyView と同じ
 * buildMyTimeline を使う。被りの印(conflict)は直前の 1 件だけでなく、
 * その日のほかのお気に入りすべてと比べて付ける(長い出演に 2 つ重なる場合も
 * 両方に印が付くように)。
 */
export function buildShareImageModel(
  doc: TimetableDoc,
  favorites: ReadonlySet<string>,
): ShareImageModel {
  const venueIndex = new Map(doc.venues.map((venue, i) => [venue.id, i]))
  const days: Array<ShareImageDay> = []
  let total = 0
  for (const { day, items } of buildMyTimeline(doc, favorites)) {
    const spans = items.map(({ act }) => actSpan(act))
    const rows = items.map(({ act, venue, gapBefore }, i): ShareImageRow => {
      const conflict = spans.some(
        (other, j) =>
          j !== i && other.start < spans[i].end && spans[i].start < other.end,
      )
      return {
        actId: act.id,
        time: actTimeText(act),
        title: act.title,
        ...(act.subtitle ? { subtitle: act.subtitle } : {}),
        venueName: venue?.name ?? '会場不明',
        venueIndex: venueIndex.get(act.venueId) ?? 0,
        conflict,
        gapBefore: gapBefore
          ? { kind: gapBefore.kind, text: gapText(gapBefore) }
          : null,
      }
    })
    total += rows.length
    days.push({
      dayId: day.id,
      dateLabel: formatDateLabel(day.date),
      ...(day.label ? { label: day.label } : {}),
      rows,
      overlaps: rows.filter((r) => r.gapBefore?.kind === 'overlap').length,
      tights: rows.filter((r) => r.gapBefore?.kind === 'tight').length,
    })
  }
  return {
    title: doc.title,
    dayLabels: days.map((d) =>
      d.label ? `${d.dateLabel} ${d.label}` : d.dateLabel,
    ),
    days,
    total,
  }
}

// --- 折り返し ---

export type Measure = (text: string) => number

const ELLIPSIS = '…'
/** 行頭に来てはいけない字(句読点・閉じ括弧など)。前の語に付けて送る */
const NO_LINE_START =
  /^[、。，．,.!?！？)）」』】〕〉》ー〜ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々]/u

function graphemes(text: string): Array<string> {
  return Array.from(
    new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text),
    (s) => s.segment,
  )
}

/**
 * 折り返しの単位。欧文は語ごと(後ろの空白込み)、漢字・かな・ハングルは
 * Intl.Segmenter の語の切れ目で分ける。行頭禁則の字は前の単位に付ける。
 */
function breakUnits(text: string): Array<string> {
  const units: Array<string> = []
  for (const { segment } of new Intl.Segmenter('ja', {
    granularity: 'word',
  }).segment(text)) {
    const last = units.length - 1
    if (last >= 0 && (/^\s+$/u.test(segment) || NO_LINE_START.test(segment))) {
      units[last] += segment
    } else {
      units.push(segment)
    }
  }
  return units
}

/** 幅に収まるまで末尾を削って … を付ける */
export function ellipsize(
  text: string,
  maxWidth: number,
  measure: Measure,
): string {
  if (measure(text) <= maxWidth) return text
  return withEllipsis(text, maxWidth, measure)
}

/** 末尾に … を付け、収まるまで手前の字を削る */
function withEllipsis(
  text: string,
  maxWidth: number,
  measure: Measure,
): string {
  const chars = graphemes(text.trimEnd())
  while (chars.length > 0) {
    const candidate = chars.join('').trimEnd() + ELLIPSIS
    if (measure(candidate) <= maxWidth) return candidate
    chars.pop()
  }
  return ELLIPSIS
}

/**
 * maxWidth に収まるように折り返す。maxLines を超える分は最後の行を … で切る。
 * 1 語で幅を超えるとき(長い英単語・区切りの無い漢字列)は字の単位で割る。
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: Measure,
  maxLines = 2,
): Array<string> {
  const source = text.trim().replace(/\s+/gu, ' ')
  if (source.length === 0) return []
  const lines: Array<string> = []
  let current = ''
  const fits = (s: string) => measure(s.trimEnd()) <= maxWidth

  const pushChars = (unit: string) => {
    for (const ch of graphemes(unit)) {
      if (current === '' || fits(current + ch)) {
        current += ch
      } else {
        lines.push(current.trimEnd())
        current = ch.trimStart()
      }
    }
  }

  for (const unit of breakUnits(source)) {
    if (fits(current + unit)) {
      current += unit
      continue
    }
    if (current.trim() !== '') {
      lines.push(current.trimEnd())
      current = ''
    }
    const head = unit.trimStart()
    if (fits(head)) current = head
    else pushChars(head)
  }
  if (current.trim() !== '') lines.push(current.trimEnd())

  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1]
  // 続きがあることを示すため、最後の行は収まっていても … を付ける
  kept[maxLines - 1] = withEllipsis(last, maxWidth, measure)
  return kept
}

/** 画像のファイル名。タイトルを使い、ファイル名に使えない字と空白は - にする */
export function shareImageFileName(title: string): string {
  const slug = title
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|#%&{}$!'@`+=]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .slice(0, 60)
    .replace(/^-|-$/gu, '')
  return `${slug || 'timetable'}-my.png`
}
