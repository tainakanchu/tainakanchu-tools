/**
 * マイタイムテーブルの画像(PNG)を Canvas 2D で描く。
 *
 * 何をどの順で描くかは lib/timetable/shareImage.ts が決め、ここは位置と描画だけ。
 * 幅 1080px・高さは中身なり。等倍で描く(1080px はスマホの全幅でほぼ 1:1 になり、
 * 倍にするとファイルが大きく、iOS の canvas の面積上限にも当たりやすいため)。
 *
 * 書体は文字列ごとに langOf で選ぶ(systemFonts.ts。画面の :lang() と同じスタック)。
 * canvas は lang 属性を持てないので、丑橘出逃乐队 のような名前を 1 つの書体で
 * 描くには font の値そのものを切り替えるしかない。
 */

import { systemCanvasFont } from '@/lib/cjk/systemFonts'
import { SITE_ORIGIN, siteName } from '@/lib/site-meta'
import { venueColor } from '../../../../lib/timetable/colors'
import {
  buildShareImageModel,
  ellipsize,
  wrapText,
} from '../../../../lib/timetable/shareImage'
import type {
  ShareImageGap,
  ShareImageModel,
  ShareImageRow,
} from '../../../../lib/timetable/shareImage'
import type { TimetableDoc } from '../../../../lib/timetable/types'

const WIDTH = 1080
const PAD = 64
const RIGHT = WIDTH - PAD
const BAR_W = 10
const TIME_X = PAD + BAR_W + 20
const TIME_W = 250
const BODY_X = TIME_X + TIME_W
const BODY_W = RIGHT - BODY_X

const C = {
  bg: '#ffffff',
  text: '#111827',
  muted: '#4b5563',
  faint: '#6b7280',
  rule: '#e5e7eb',
  strong: '#111827',
  rose: '#be123c',
  roseBg: '#fff1f2',
  roseText: '#9f1239',
  amber: '#d97706',
  amberBg: '#fffbeb',
  amberText: '#78350f',
}

export type Weight = 400 | 700
type Op = (ctx: CanvasRenderingContext2D) => void

export interface TextStyle {
  size: number
  weight?: Weight
  color: string
}

/** 位置を決めながら描画の手順を積む。高さが決まってから canvas を作って流す */
export class Painter {
  readonly ops: Array<Op> = []
  y = 0

  constructor(private readonly measureCtx: CanvasRenderingContext2D) {}

  font(text: string, style: TextStyle): string {
    return systemCanvasFont(text, style.size, style.weight ?? 400)
  }

  measure(text: string, style: TextStyle): number {
    this.measureCtx.font = this.font(text, style)
    return this.measureCtx.measureText(text).width
  }

  /** 折り返し。文字列全体で書体を決め、行ごとに同じ書体で測る */
  wrap(text: string, style: TextStyle, width: number, maxLines: number) {
    this.measureCtx.font = this.font(text, style)
    return wrapText(
      text,
      width,
      (s) => this.measureCtx.measureText(s).width,
      maxLines,
    )
  }

  fit(text: string, style: TextStyle, width: number): string {
    this.measureCtx.font = this.font(text, style)
    return ellipsize(text, width, (s) => this.measureCtx.measureText(s).width)
  }

  /**
   * 1 行を描く。y は既定では行の上下中央(baseline: middle)。
   * 書体は元の文字列(source)で決める。折り返した 1 行だけで判定すると、
   * 行ごとに書体が変わりうるため
   */
  text(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    opts: {
      source?: string
      align?: CanvasTextAlign
      baseline?: CanvasTextBaseline
    } = {},
  ) {
    const font = this.font(opts.source ?? text, style)
    this.ops.push((ctx) => {
      ctx.font = font
      ctx.fillStyle = style.color
      ctx.textAlign = opts.align ?? 'left'
      ctx.textBaseline = opts.baseline ?? 'middle'
      ctx.fillText(text, x, y)
    })
  }

  rect(x: number, y: number, w: number, h: number, color: string, r = 0) {
    this.ops.push((ctx) => {
      ctx.fillStyle = color
      if (r > 0) {
        ctx.beginPath()
        ctx.roundRect(x, y, w, h, r)
        ctx.fill()
      } else {
        ctx.fillRect(x, y, w, h)
      }
    })
  }
}

function drawHeader(p: Painter, model: ShareImageModel) {
  p.y = PAD
  const kicker: TextStyle = { size: 26, weight: 700, color: C.muted }
  p.text('マイタイムテーブル', PAD, p.y + 18, kicker)
  p.y += 44

  const title: TextStyle = { size: 54, weight: 700, color: C.text }
  const titleLh = 68
  for (const line of p.wrap(model.title, title, RIGHT - PAD, 2)) {
    p.text(line, PAD, p.y + titleLh / 2, title, { source: model.title })
    p.y += titleLh
  }

  const days: TextStyle = { size: 28, color: C.muted }
  const daysText = model.dayLabels.join(' / ')
  p.y += 6
  for (const line of p.wrap(daysText, days, RIGHT - PAD, 2)) {
    p.text(line, PAD, p.y + 20, days, { source: daysText })
    p.y += 40
  }
  p.y += 24
  p.rect(PAD, p.y, RIGHT - PAD, 4, C.strong)
  p.y += 4
}

function drawGap(p: Painter, gap: ShareImageGap) {
  if (gap.kind === 'overlap' || gap.kind === 'tight') {
    const isOverlap = gap.kind === 'overlap'
    const style: TextStyle = {
      size: 24,
      weight: 700,
      color: isOverlap ? C.roseText : C.amberText,
    }
    const lines = p.wrap(gap.text, style, RIGHT - PAD - 40, 2)
    const lh = 34
    const h = lines.length * lh + 20
    p.rect(PAD, p.y, RIGHT - PAD, h, isOverlap ? C.roseBg : C.amberBg)
    p.rect(PAD, p.y, 6, h, isOverlap ? C.rose : C.amber)
    let y = p.y + 10
    for (const line of lines) {
      p.text(line, PAD + 24, y + lh / 2, style, { source: gap.text })
      y += lh
    }
    p.y += h
    return
  }
  const style: TextStyle = { size: 22, color: C.faint }
  p.text(p.fit(gap.text, style, BODY_W), BODY_X, p.y + 22, style, {
    source: gap.text,
  })
  p.y += 44
}

function drawRow(p: Painter, row: ShareImageRow) {
  const top = p.y
  const color = venueColor(row.venueIndex)
  let y = top + 20

  // 左: 時刻と被りの印
  const time: TextStyle = { size: 29, weight: 700, color: C.text }
  p.text(row.time, TIME_X, y + 24, time)
  let leftBottom = y + 42
  if (row.conflict) {
    const tag: TextStyle = { size: 22, weight: 700, color: '#ffffff' }
    const label = '被りあり'
    const w = p.measure(label, tag) + 20
    p.rect(TIME_X, leftBottom + 6, w, 34, C.rose, 4)
    p.text(label, TIME_X + 10, leftBottom + 6 + 17, tag)
    leftBottom += 40
  }

  // 右: 出演名(2 行まで)、会場の札と補足
  const title: TextStyle = { size: 36, weight: 700, color: C.text }
  const titleLh = 48
  for (const line of p.wrap(row.title, title, BODY_W, 2)) {
    p.text(line, BODY_X, y + titleLh / 2, title, { source: row.title })
    y += titleLh
  }
  y += 6

  const chip: TextStyle = { size: 24, weight: 700, color: color.text }
  const chipH = 38
  const venue = p.fit(row.venueName, chip, BODY_W - 24)
  const chipW = p.measure(venue, chip) + 24
  p.rect(BODY_X, y, chipW, chipH, color.fill, 4)
  p.text(venue, BODY_X + 12, y + chipH / 2, chip, { source: row.venueName })

  if (row.subtitle) {
    const sub: TextStyle = { size: 24, color: C.muted }
    const rest = BODY_W - chipW - 16
    if (rest >= 160) {
      const text = p.fit(row.subtitle, sub, rest)
      p.text(text, BODY_X + chipW + 16, y + chipH / 2, sub, {
        source: row.subtitle,
      })
      y += chipH
    } else {
      y += chipH + 6
      const text = p.fit(row.subtitle, sub, BODY_W)
      p.text(text, BODY_X, y + 17, sub, { source: row.subtitle })
      y += 34
    }
  } else {
    y += chipH
  }

  const bottom = Math.max(y, leftBottom) + 20
  // 会場色の縦帯(行の高さいっぱい)
  p.rect(PAD, top + 20, BAR_W, bottom - top - 40, color.fill, 2)
  p.rect(PAD, bottom, RIGHT - PAD, 1, C.rule)
  p.y = bottom + 1
}

function drawDays(p: Painter, model: ShareImageModel) {
  for (const day of model.days) {
    p.y += 40
    const date: TextStyle = { size: 40, weight: 700, color: C.text }
    const lh = 52
    let x = PAD
    p.text(day.dateLabel, x, p.y + 42, date, { baseline: 'alphabetic' })
    x += p.measure(day.dateLabel, date) + 16

    // 日の見出しの右側: ラベル・組数・重なり・移動が厳しい(下端を揃える)
    const pieces: Array<[string, TextStyle]> = []
    if (day.label) pieces.push([day.label, { size: 28, color: C.text }])
    pieces.push([`${day.rows.length} 組`, { size: 26, color: C.muted }])
    if (day.overlaps > 0)
      pieces.push([
        `重なり ${day.overlaps}`,
        { size: 26, weight: 700, color: C.rose },
      ])
    if (day.tights > 0)
      pieces.push([
        `移動が厳しい ${day.tights}`,
        { size: 26, weight: 700, color: C.amberText },
      ])
    for (const [text, style] of pieces) {
      const fitted = p.fit(text, style, RIGHT - x)
      if (fitted === '…') break
      // 日付と大きさが違うので、ベースラインで揃える
      p.text(fitted, x, p.y + 42, style, {
        source: text,
        baseline: 'alphabetic',
      })
      x += p.measure(fitted, style) + 18
    }
    p.y += lh + 6
    p.rect(PAD, p.y, RIGHT - PAD, 3, C.strong)
    p.y += 3

    for (const row of day.rows) {
      if (row.gapBefore) drawGap(p, row.gapBefore)
      drawRow(p, row)
    }
  }
}

/** 画像の下端に入れるサイト名と URL(タイムテーブル形式の画像とも揃える) */
export const FOOTER_CREDIT = `${siteName} マイタイムテーブル`
export const FOOTER_URL = `${SITE_ORIGIN.replace(/^https?:\/\//, '')}/tools/timetable`

function drawFooter(p: Painter) {
  p.y += 48
  const style: TextStyle = { size: 22, color: C.faint }
  p.text(FOOTER_CREDIT, PAD, p.y + 15, style)
  p.text(FOOTER_URL, RIGHT, p.y + 15, style, { align: 'right' })
  p.y += 30 + PAD - 16
}

/** マイタイムテーブルの PNG を作る。お気に入りが無ければ null */
export async function renderMyTimetableImage(
  doc: TimetableDoc,
  favorites: ReadonlySet<string>,
): Promise<Blob | null> {
  const model = buildShareImageModel(doc, favorites)
  if (model.total === 0) return null
  // OS の標準フォントでも、Web フォントの読み込み待ちが残っていると
  // 最初の measureText が代わりの書体の幅で測られることがある
  await document.fonts.ready

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas を使えません')

  const p = new Painter(ctx)
  drawHeader(p, model)
  drawDays(p, model)
  drawFooter(p)
  return paintToPng(canvas, p, WIDTH, Math.ceil(p.y), C.bg)
}

/** 積んだ描画の手順を、決まった大きさの canvas に流して PNG にする */
export function paintToPng(
  canvas: HTMLCanvasElement,
  p: Painter,
  width: number,
  height: number,
  background: string,
): Promise<Blob> {
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas を使えません')
  canvas.width = width
  canvas.height = height
  // 大きさを変えると状態が初期化されるので、ここから描く
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  for (const op of p.ops) op(ctx)

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('画像を作れませんでした')),
      'image/png',
    ),
  )
}
