/**
 * タイムテーブル形式の共有画像(1 日分のグリッド)を Canvas 2D で描く。
 *
 * 位置と行の組み立ては lib/timetable/shareGridImage.ts が決め、ここは描くだけ。
 * 書体の選び方・見出し・下端のサイト名はリストの画像(shareImage.ts)と同じ。
 *
 * 配色はいまの画面の配色(ライト / ダーク)で描く。画面のグリッドを
 * そのまま切り取ったような画像にしたいので、見ている配色と揃えるほうが
 * 「さっき見ていたもの」として伝わる(リストの画像は従来どおりライトのまま)。
 */

import { systemCanvasFont } from '@/lib/cjk/systemFonts'
import { gridColors, venueColor } from '../../../../lib/timetable/colors'
import {
  GRID_IMAGE,
  buildGridImageModel,
} from '../../../../lib/timetable/shareGridImage'
import { FOOTER_CREDIT, FOOTER_URL, Painter, paintToPng } from './shareImage'
import type { ColorTheme } from '../../../../lib/timetable/colors'
import type { GridImageModel } from '../../../../lib/timetable/shareGridImage'
import type { TextStyle, Weight } from './shareImage'
import type { TimetableDoc } from '../../../../lib/timetable/types'

interface Chrome {
  bg: string
  text: string
  muted: string
  faint: string
  strong: string
  border: string
}

const CHROME: Record<ColorTheme, Chrome> = {
  light: {
    bg: '#ffffff',
    text: '#111827',
    muted: '#4b5563',
    faint: '#6b7280',
    strong: '#111827',
    border: '#d1d5db',
  },
  dark: {
    bg: '#030712',
    text: '#f3f4f6',
    muted: '#d1d5db',
    faint: '#9ca3af',
    strong: '#e5e7eb',
    border: '#374151',
  },
}

function drawHeader(p: Painter, m: GridImageModel, c: Chrome) {
  const { pad } = GRID_IMAGE
  p.text('タイムテーブル', pad, m.kickerY, {
    size: 26,
    weight: 700,
    color: c.muted,
  })
  const title: TextStyle = { size: 54, weight: 700, color: c.text }
  m.title.lines.forEach((line, i) => {
    p.text(line, pad, m.title.firstY + i * 68, title, {
      source: m.title.source,
    })
  })
  p.text(m.day.label, pad, m.day.y, { size: 32, weight: 700, color: c.text })
  if (m.note) {
    p.text(m.note.text, m.note.x, m.day.y, { size: 26, color: c.muted })
  }
  p.rect(pad, m.ruleY, m.width - pad * 2, 4, c.strong)
}

function drawGrid(p: Painter, m: GridImageModel, theme: ColorTheme) {
  const c = CHROME[theme]
  const g = gridColors(theme)
  const { grid, venueRow } = m
  const height = grid.bottom - grid.top

  // 罫線(30 分は細く薄く、1 時間は濃く)
  for (const hour of m.hours) {
    p.rect(
      grid.left,
      hour.y,
      grid.right - grid.left,
      hour.major ? 2 : 1,
      hour.major ? g.line60 : g.line30,
    )
  }
  // 列の区切り
  for (const col of m.columns) {
    p.rect(col.x, grid.top, 1, height, c.border)
  }
  p.rect(grid.left - 1, venueRow.top, 2, grid.bottom - venueRow.top, c.border)

  // 時刻の軸。最初の時刻は線の下に、それ以外は線の上下中央に置く
  const hourStyle: TextStyle = { size: GRID_IMAGE.hourSize, color: c.muted }
  m.hours.forEach((hour, i) => {
    if (!hour.major) return
    p.text(hour.label, grid.left - 12, hour.y, hourStyle, {
      align: 'right',
      baseline: i === 0 ? 'top' : 'middle',
    })
  })

  // 会場名の行
  for (const col of m.columns) {
    const color = venueColor(col.venueIndex, theme)
    p.rect(col.x + 1, venueRow.top, col.w - 1, venueRow.h, color.fill)
    const style: TextStyle = {
      size: GRID_IMAGE.venueSize,
      weight: 700,
      color: color.text,
    }
    const lh = GRID_IMAGE.venueLh
    const startY = venueRow.top + (venueRow.h - col.nameLines.length * lh) / 2
    col.nameLines.forEach((line, i) => {
      p.text(line, col.x + 9, startY + lh * i + lh / 2, style, {
        source: col.name,
      })
    })
  }

  // 出演
  for (const block of m.blocks) {
    const color = venueColor(block.venueIndex, theme)
    if (block.fav) {
      p.rect(block.x, block.y, block.w, block.h, color.fill, 4)
    } else {
      p.rect(block.x, block.y, block.w, block.h, color.tint, 4)
      p.rect(block.x, block.y, GRID_IMAGE.barW, block.h, color.bar, 2)
    }
    const fg = block.fav ? color.text : color.tintText
    const weight: Weight = block.weight
    block.lines.forEach((line, i) => {
      p.text(
        line,
        block.textX,
        block.firstLineY + i * GRID_IMAGE.titleLh,
        { size: GRID_IMAGE.titleSize, weight, color: fg },
        { source: block.source },
      )
    })
    if (block.time) {
      p.text(block.time.text, block.textX, block.time.y, {
        size: GRID_IMAGE.timeSize,
        color: fg,
      })
    }
  }
}

function drawFooter(p: Painter, m: GridImageModel, c: Chrome) {
  const style: TextStyle = { size: 22, color: c.faint }
  const y = m.footerY + 15
  p.text(FOOTER_CREDIT, GRID_IMAGE.pad, y, style)
  p.text(FOOTER_URL, m.width - GRID_IMAGE.pad, y, style, { align: 'right' })
}

/** 1 日分のタイムテーブルの PNG を作る。その日に出演が無ければ null */
export async function renderGridTimetableImage(
  doc: TimetableDoc,
  dayId: string,
  favorites: ReadonlySet<string>,
  theme: ColorTheme,
): Promise<Blob | null> {
  // リストの画像と同じく、書体の読み込み待ちが残ったまま測らない
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('canvas を使えません')

  const model = buildGridImageModel(
    doc,
    dayId,
    favorites,
    (text, size, weight, source) => {
      ctx.font = systemCanvasFont(source, size, weight)
      return ctx.measureText(text).width
    },
  )
  if (model === null) return null

  const c = CHROME[theme]
  const p = new Painter(ctx)
  drawHeader(p, model, c)
  drawGrid(p, model, theme)
  drawFooter(p, model, c)
  return paintToPng(canvas, p, model.width, model.height, c.bg)
}
