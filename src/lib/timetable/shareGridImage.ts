/**
 * タイムテーブル形式の共有画像(会場を列・時刻を縦軸にした 1 日分のグリッド)の
 * レイアウト。純粋関数。
 *
 * 画面のグリッド(GridView)と同じ見た目の約束で、その日の全出演を描き、
 * お気に入りは会場色の塗り + ★、ほかは淡い(ダークでは暗い)地 + 会場色の左帯にする。
 * どこに何を何行で描くかをここで決め、canvas への描画は
 * routes/tools/timetable/-lib/shareGridImage.ts が受け持つ。
 * 文字幅は呼び出し側の measure を受け取るので、テストでは文字数で代用できる。
 */

import { actSpan, actTimeText, dayRange } from './derive'
import { ellipsize, wrapText } from './shareImage'
import { formatDateLabel, formatHmShort } from './time'
import type { TimetableDoc } from './types'

export type GridFontWeight = 400 | 700

/**
 * 文字幅を測る。source は書体を決める元の文字列(★ などを前に付けた行でも、
 * 出演名そのもので書体を選ぶため)
 */
export type GridMeasure = (
  text: string,
  size: number,
  weight: GridFontWeight,
  source: string,
) => number

/**
 * 寸法(px)。幅は既定 1080px(リストの画像と同じで、スマホの全幅でほぼ等倍)。
 *
 * 列の幅は (幅 - 余白 - 時刻の軸) / 会場数。会場が多くて MIN_COL_W を割るときは
 * 画像を横に広げて列幅を保つ(縮めて読めない字にするより、拡大して読めるほうがよい)。
 * ただし広げるのは MAX_WIDTH(既定の 2 倍)まで。それより会場が多いときは
 * 列を細くして、出演名は省略(…)で収める。
 * 縦は 1 分 = PX_PER_MIN。20 分の出演でも名前 1 行と時刻が入る高さにしてある。
 * iOS Safari は canvas の面積(幅 × 高さ)が約 1,677 万 px を超えると描けないので、
 * 長い日(オールナイトなど)で超えそうなときは 1 分あたりの高さを縮める。
 */
export const GRID_IMAGE = {
  baseWidth: 1080,
  maxWidth: 2160,
  maxArea: 16_777_216,
  pad: 48,
  axisW: 88,
  minColW: 140,
  colGap: 3,
  pxPerMin: 3.2,
  minPxPerMin: 1,
  minBlockH: 40,
  venueRowH: 76,
  venueSize: 22,
  venueLh: 26,
  hourSize: 22,
  titleSize: 22,
  titleLh: 27,
  timeSize: 18,
  timeLh: 22,
  blockPadX: 8,
  blockPadY: 6,
  barW: 6,
  maxTitleLines: 4,
} as const

export interface GridImageColumn {
  venueId: string
  /** colors.ts の venueColor に渡す番号(doc.venues の並び順) */
  venueIndex: number
  name: string
  nameLines: Array<string>
  x: number
  w: number
}

export interface GridImageHour {
  label: string
  y: number
  /** 1 時間ごとの線か(false なら 30 分の線) */
  major: boolean
}

export interface GridImageBlock {
  actId: string
  venueIndex: number
  fav: boolean
  x: number
  y: number
  w: number
  h: number
  /** 書体を決める元の文字列(出演名) */
  source: string
  weight: GridFontWeight
  lines: Array<string>
  /** 1 行目の文字の上下中央 */
  firstLineY: number
  textX: number
  time: { text: string; y: number } | null
}

export interface GridImageModel {
  width: number
  height: number
  title: { lines: Array<string>; firstY: number; source: string }
  kickerY: number
  day: { label: string; y: number }
  /** 日付の右に添える「★ お気に入り 3 組」 */
  note: { text: string; x: number } | null
  ruleY: number
  venueRow: { top: number; h: number }
  grid: { top: number; bottom: number; left: number; right: number }
  pxPerMin: number
  hours: Array<GridImageHour>
  columns: Array<GridImageColumn>
  blocks: Array<GridImageBlock>
  footerY: number
  favoriteCount: number
}

/** 見出し(タイトル・日付)の寸法。リストの画像と揃える */
const HEAD = {
  kickerSize: 26,
  titleSize: 54,
  titleLh: 68,
  daySize: 32,
  noteSize: 26,
}

function kindPrefix(kind: string | undefined, title: string): string {
  if (kind === 'signing') return '[サイン] '
  if (kind === 'dj' && !/dj/i.test(title)) return '[DJ] '
  return ''
}

/**
 * 1 日分のグリッド画像のレイアウトを作る。その日に出演が無ければ null。
 * 会場は doc.venues の順で、その日に出演のある会場だけを列にする(画面と同じ)。
 */
export function buildGridImageModel(
  doc: TimetableDoc,
  dayId: string,
  favorites: ReadonlySet<string>,
  measure: GridMeasure,
): GridImageModel | null {
  const day = doc.days.find((d) => d.id === dayId)
  const range = dayRange(doc, dayId)
  if (day === undefined || range === null) return null
  const G = GRID_IMAGE

  const acts = doc.acts.filter((act) => act.dayId === dayId)
  const venues = doc.venues
    .map((venue, venueIndex) => ({ venue, venueIndex }))
    .filter(({ venue }) => acts.some((act) => act.venueId === venue.id))
  const n = Math.max(1, venues.length)

  // 幅: 既定の幅で列が細すぎるなら、列幅を保てるところまで広げる
  const fixed = G.pad * 2 + G.axisW
  const width =
    (G.baseWidth - fixed) / n >= G.minColW
      ? G.baseWidth
      : Math.min(G.maxWidth, Math.ceil(fixed + n * G.minColW))
  const colW = (width - fixed) / n
  const right = width - G.pad

  // 見出し
  let y = G.pad
  const kickerY = y + 18
  y += 44
  const titleLines = wrapText(
    doc.title,
    right - G.pad,
    (s) => measure(s, HEAD.titleSize, 700, doc.title),
    2,
  )
  const titleFirstY = y + HEAD.titleLh / 2
  y += titleLines.length * HEAD.titleLh + 6
  const dayLabel = day.label
    ? `${formatDateLabel(day.date)} ${day.label}`
    : formatDateLabel(day.date)
  const dayText = ellipsize(dayLabel, right - G.pad, (s) =>
    measure(s, HEAD.daySize, 700, dayLabel),
  )
  const dayY = y + 22
  const favoriteCount = acts.filter((act) => favorites.has(act.id)).length
  let note: GridImageModel['note'] = null
  if (favoriteCount > 0) {
    const text = `★ お気に入り ${favoriteCount} 組`
    const x = G.pad + measure(dayText, HEAD.daySize, 700, dayLabel) + 24
    if (x + measure(text, HEAD.noteSize, 400, text) <= right) note = { text, x }
  }
  y += 44 + 20
  const ruleY = y
  y += 4 + 16

  const venueRow = { top: y, h: G.venueRowH }
  const gridTop = y + G.venueRowH
  const gridStart = Math.floor(range.start / 60) * 60
  const gridEnd = Math.ceil(range.end / 60) * 60
  const minutes = Math.max(60, gridEnd - gridStart)

  // 縦: 面積の上限を超えるなら 1 分あたりを縮める(下の余白と足場ぶんを見込む)
  const footerH = 40 + 30 + G.pad - 16
  const maxHeight = Math.floor(G.maxArea / width)
  const pxPerMin = Math.max(
    G.minPxPerMin,
    Math.min(
      G.pxPerMin,
      (maxHeight - gridTop - footerH - G.minBlockH) / minutes,
    ),
  )
  const yOf = (min: number) => gridTop + (min - gridStart) * pxPerMin

  const hours: Array<GridImageHour> = []
  for (let m = gridStart; m <= gridEnd; m += 30) {
    hours.push({ label: formatHmShort(m), y: yOf(m), major: m % 60 === 0 })
  }

  const columns: Array<GridImageColumn> = venues.map(
    ({ venue, venueIndex }, i) => ({
      venueId: venue.id,
      venueIndex,
      name: venue.name,
      nameLines: wrapText(
        venue.name,
        colW - 16,
        (s) => measure(s, G.venueSize, 700, venue.name),
        2,
      ),
      x: G.pad + G.axisW + i * colW,
      w: colW,
    }),
  )

  const blocks: Array<GridImageBlock> = []
  let bottom = yOf(gridEnd)
  for (const column of columns) {
    for (const act of acts) {
      if (act.venueId !== column.venueId) continue
      const span = actSpan(act)
      const fav = favorites.has(act.id)
      const x = column.x + G.colGap
      const w = column.w - G.colGap * 2
      const top = yOf(span.start) + 1
      const h = Math.max((span.end - span.start) * pxPerMin - 3, G.minBlockH)
      bottom = Math.max(bottom, top + h)

      const textX = x + (fav ? G.blockPadX : G.barW + G.blockPadX)
      const textW = x + w - 6 - textX
      const weight: GridFontWeight = fav ? 700 : 400
      const text = `${fav ? '★ ' : ''}${kindPrefix(act.kind, act.title)}${act.title}`
      const fit = (s: string) => measure(s, G.titleSize, weight, act.title)

      const room = h - G.blockPadY * 2
      const full = actTimeText(act)
      const timeText =
        measure(full, G.timeSize, 400, full) <= textW
          ? full
          : `${formatHmShort(span.start)}〜`
      // 出演名を優先し、名前を描いて余った高さに時刻が入るなら添える
      const maxLines = Math.max(
        1,
        Math.min(G.maxTitleLines, Math.floor(room / G.titleLh)),
      )
      const lines = wrapText(text, textW, fit, maxLines)
      const withTime = room - lines.length * G.titleLh >= G.timeLh
      // 1 行しか入らない短い枠は、上下の真ん中に置く
      const firstLineY =
        room < G.titleLh * 2 && !withTime
          ? top + h / 2
          : top + G.blockPadY + G.titleLh / 2
      blocks.push({
        actId: act.id,
        venueIndex: column.venueIndex,
        fav,
        x,
        y: top,
        w,
        h,
        source: act.title,
        weight,
        lines,
        firstLineY,
        textX,
        time: withTime
          ? {
              text: timeText,
              y: firstLineY + lines.length * G.titleLh - 2,
            }
          : null,
      })
    }
  }

  const footerY = bottom + 40
  return {
    width,
    height: Math.ceil(footerY + 30 + G.pad - 16),
    title: { lines: titleLines, firstY: titleFirstY, source: doc.title },
    kickerY,
    day: { label: dayText, y: dayY },
    note,
    ruleY,
    venueRow,
    grid: { top: gridTop, bottom: yOf(gridEnd), left: G.pad + G.axisW, right },
    pxPerMin,
    hours,
    columns,
    blocks,
    footerY,
    favoriteCount,
  }
}
