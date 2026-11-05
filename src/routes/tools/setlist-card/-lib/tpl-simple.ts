/**
 * シンプルなテンプレート: ミニマル / トラックリスト / エディトリアル。
 * 色はすべてパレットの役割（ctx.pal）から取る。
 */
import {
  drawCredit,
  drawRows,
  drawText,
  font,
  hairline,
  innerOf,
  isWide,
  rowColors,
  rowsUsedHeight,
  scratchContext,
} from './draw'
import { ellipsize } from './fit'
import {
  fitRowsLayout,
  metaColumnEdges,
  numberColumnWidth,
  truncatedRowCount,
} from './rows'
import {
  TITLE_TRACKING,
  bodyStack,
  columnGap,
  columnsFor,
  drawPageHeader,
  fitTitle,
  labelSize,
  rowsInputFor,
  setLengthText,
  trackCountText,
  trackFonts,
  trackSizeRange,
} from './tpl-common'
import type { Ctx } from './draw'
import type { Rect } from './fit'
import type { RowsLayout } from './rows'
import { pageLabel } from './template-types'
import type {
  LayoutResult,
  Meta,
  PageSpec,
  TemplateArgs,
} from './template-types'

export function fromRows(
  layout: RowsLayout,
  extra: Partial<LayoutResult> = {},
): LayoutResult {
  return {
    overflow: layout.overflow,
    hidden: layout.hidden,
    lock: {
      rows: {
        columns: layout.columns,
        style: layout.style,
        size: layout.size,
        metaShown: layout.metaShown,
        extra: layout.extra,
      },
    },
    textSize: layout.size,
    metaShown: layout.metaShown,
    // 2 段以上で 1 段が文字 22 個ぶんに満たないと、名前がほとんど省略される
    cramped: layout.columns > 1 && layout.colWidth < layout.size * 22,
    shown: layout.placed,
    truncated: truncatedRowCount(layout.rows),
    ...extra,
  }
}

/** 縦長（9:16）では行の間を広めに取れるようにする */
export function tallSpread(ctx: Ctx): number {
  return ctx.H > ctx.W * 1.5 ? 1.3 : 0.8
}

const labelFont = (ctx: Ctx, opts: { caps?: boolean } = {}) =>
  font(400, labelSize(ctx), 'mono', opts.caps ? { tracking: 0.06 } : {})

/** フッター（曲数・セットの長さ と クレジット）。高さを返す */
function drawFooter(
  ctx: Ctx,
  meta: Meta,
  inner: Rect,
  opts: {
    rule?: string | null
    caps?: boolean
    left?: string
    /** 狭い柱では曲数とクレジットを 2 行に積む */
    stack?: boolean
  } = {},
): number {
  const { s, pal } = ctx
  const f = labelFont(ctx, { caps: opts.caps })
  const y = inner.y + inner.h
  const left =
    opts.left ??
    [trackCountText(meta), setLengthText(meta)].filter(Boolean).join(' · ')
  const leftText = opts.caps ? left.toUpperCase() : left
  if (opts.rule) hairline(ctx, inner.x, y - 34 * s, inner.w, opts.rule)
  if (opts.stack) {
    drawText(ctx, leftText, inner.x, y - 30 * s, f, pal.muted)
    drawCredit(ctx, inner.x, y, 'left')
    return 80 * s
  }
  drawText(ctx, leftText, inner.x, y, f, pal.muted)
  if (ctx.display.credit) {
    const room = inner.w - ctx.measure(leftText, f) - 40 * s
    if (room > 200 * s) drawCredit(ctx, inner.x + inner.w, y, 'right')
  }
  return opts.rule ? 34 * s + 26 * s : 50 * s
}

/** フッターの左（曲数・セットの長さ・ページ） */
function footerText(meta: Meta, page: PageSpec): string {
  return [trackCountText(meta), setLengthText(meta), pageLabel(page)]
    .filter(Boolean)
    .join(' · ')
}

// ---------------------------------------------------------------------------
// ミニマル
// ---------------------------------------------------------------------------

/** 見出し（日付・会場 / イベント名 / DJ 名）。高さを返す */
function drawMinimalHeader(
  ctx: Ctx,
  meta: Meta,
  rect: Rect,
  stacked: boolean,
): number {
  const { s, pal } = ctx
  const lf = labelFont(ctx)
  let y = rect.y
  const ls = labelSize(ctx)
  if (!stacked) {
    const date = meta.date
    const venue = ellipsize(
      meta.venue,
      rect.w - ctx.measure(date, lf) - 40 * s,
      lf,
      ctx.measure,
    )
    drawText(ctx, date, rect.x, y + ls * 0.8, lf, pal.muted)
    drawText(ctx, venue, rect.x + rect.w, y + ls * 0.8, lf, pal.muted, 'right')
    if (date || venue) y += ls + 76 * s
  } else if (meta.date) {
    drawText(ctx, meta.date, rect.x, y + ls * 0.8, lf, pal.muted)
    y += ls + 48 * s
  }
  const heading = meta.event || meta.dj || 'Setlist'
  const body = bodyStack(ctx)
  const titleAt = (size: number) =>
    font(body === 'serif' ? 700 : 500, size, body, { tracking: TITLE_TRACKING })
  const t = fitTitle(
    ctx,
    heading,
    rect.w,
    titleAt,
    (stacked ? 40 : 52) * s,
    (stacked ? 64 : 88) * s,
    stacked ? 3 : 2,
  )
  const lh = t.size * 1.06
  t.lines.forEach((line, i) => {
    drawText(
      ctx,
      line,
      rect.x,
      y + t.size * 0.82 + i * lh,
      titleAt(t.size),
      pal.fg,
    )
  })
  y += t.size * 0.82 + lh * (t.lines.length - 1) + t.size * 0.24
  const sub = meta.event ? meta.dj : ''
  if (sub) {
    const f = font(400, (stacked ? 28 : 32) * s, body)
    y += 22 * s
    drawText(
      ctx,
      ellipsize(sub, rect.w, f, ctx.measure),
      rect.x,
      y + 28 * s,
      f,
      pal.fg,
    )
    y += 36 * s
  }
  if (stacked && meta.venue) {
    y += 20 * s
    drawText(
      ctx,
      ellipsize(meta.venue, rect.w, lf, ctx.measure),
      rect.x,
      y + ls,
      lf,
      pal.muted,
    )
    y += ls + 6 * s
  }
  return y - rect.y
}

export function renderMinimal(a: TemplateArgs): LayoutResult {
  const { ctx, meta, items, frame, page, lock } = a
  const { s, pal } = ctx
  const inner = innerOf(ctx, frame)
  const gap = columnGap(ctx)
  const footerH = 64 * s
  let area: Rect
  let anchorBottom = false
  // 横長は 2 枚目以降も左の柱に見出しを置く（どのページも曲の領域を同じにする）
  if (page.index > 0 && !isWide(frame)) {
    const h = drawPageHeader(ctx, meta, inner, page)
    const top = inner.y + h + 30 * s
    area = {
      x: inner.x,
      y: top,
      w: inner.w,
      h: inner.y + inner.h - footerH - top,
    }
  } else if (isWide(frame)) {
    const sideW = Math.round(inner.w * 0.34)
    drawMinimalHeader(
      ctx,
      meta,
      { x: inner.x, y: inner.y, w: sideW, h: inner.h },
      true,
    )
    const x = inner.x + sideW + 64 * s
    area = { x, y: inner.y, w: inner.x + inner.w - x, h: inner.h - footerH }
  } else {
    const h = drawMinimalHeader(ctx, meta, inner, false)
    const top = inner.y + h + 70 * s
    area = {
      x: inner.x,
      y: top,
      w: inner.w,
      h: inner.y + inner.h - footerH - top,
    }
    anchorBottom = true
  }
  const layout = fitRowsLayout(
    rowsInputFor(ctx, items, area, gap, trackFonts(ctx)),
    {
      columnsOptions: columnsFor(ctx, a.columns, area.w, gap, 2),
      sizeRange: trackSizeRange(ctx),
      lock: lock?.rows,
    },
  )
  // 1 枚目は曲の塊を下に寄せ、見出しとの間を空ける（縦長でも下が間延びしない）
  const offsetY = anchorBottom
    ? Math.max(0, area.h - rowsUsedHeight(layout, area.y))
    : 0
  if (anchorBottom) {
    hairline(ctx, inner.x, area.y + offsetY - 26 * s, inner.w, pal.rule)
  }
  drawRows(ctx, layout, rowColors(ctx, { title: pal.muted }), {
    offsetY,
    dividers: layout.style === 'compact' ? null : pal.rule,
  })
  drawFooter(ctx, meta, inner, {
    rule: isWide(frame) ? null : pal.rule,
    left: footerText(meta, page),
  })
  return fromRows(layout)
}

// ---------------------------------------------------------------------------
// トラックリスト（レコードの裏ジャケ）
// ---------------------------------------------------------------------------

function drawSleeveHeader(
  ctx: Ctx,
  meta: Meta,
  rect: Rect,
  stacked: boolean,
): number {
  const { s, pal } = ctx
  const lf = labelFont(ctx, { caps: true })
  const ls = labelSize(ctx)
  let y = rect.y
  drawText(ctx, meta.catalog, rect.x, y + ls * 0.8, lf, pal.muted)
  if (meta.date && !stacked) {
    drawText(
      ctx,
      meta.date,
      rect.x + rect.w,
      y + ls * 0.8,
      lf,
      pal.muted,
      'right',
    )
  }
  y += ls + (stacked ? 44 : 64) * s
  const body = bodyStack(ctx)
  const titleAt = (size: number) =>
    font(body === 'serif' ? 700 : 600, size, body, { tracking: TITLE_TRACKING })
  const heading = meta.event || meta.dj || 'Setlist'
  const t = fitTitle(
    ctx,
    heading,
    rect.w,
    titleAt,
    40 * s,
    (stacked ? 58 : 76) * s,
    2,
  )
  const lh = t.size * 1.04
  t.lines.forEach((line, i) =>
    drawText(
      ctx,
      line,
      rect.x,
      y + t.size * 0.82 + i * lh,
      titleAt(t.size),
      pal.fg,
    ),
  )
  y += t.size * 0.82 + lh * (t.lines.length - 1) + t.size * 0.22
  const sub = meta.event ? meta.dj : ''
  const subFont = font(400, 30 * s, body)
  if (sub) {
    y += 16 * s
    drawText(
      ctx,
      ellipsize(sub, rect.w, subFont, ctx.measure),
      rect.x,
      y + 26 * s,
      subFont,
      pal.fg,
    )
    y += 34 * s
  }
  const place = [stacked ? meta.date : '', meta.venue]
    .filter(Boolean)
    .join('  ·  ')
  if (place) {
    y += 14 * s
    drawText(
      ctx,
      ellipsize(place, rect.w, lf, ctx.measure),
      rect.x,
      y + ls * 0.8,
      lf,
      pal.muted,
    )
    y += ls
  }
  return y - rect.y
}

export const META_HEADINGS: Record<string, string> = {
  time: 'TIME',
  bpm: 'BPM',
  key: 'KEY',
  label: 'LABEL',
}

export function renderTracklist(a: TemplateArgs): LayoutResult {
  const { ctx, meta, items, frame, page, lock, metaKeys } = a
  const { s, pal } = ctx
  const inner = innerOf(ctx, frame)
  const gap = columnGap(ctx) * 1.2
  const footerH = 64 * s
  let top: number
  let x = inner.x
  let w = inner.w
  // 横長は曲数・クレジットを左の柱の下に置き、表に高さを回す
  let footerRect: Rect = inner
  let tableBottom = inner.y + inner.h - footerH
  if (page.index > 0 && !isWide(frame)) {
    top =
      inner.y + drawPageHeader(ctx, meta, inner, page, { rule: false }) + 30 * s
  } else if (isWide(frame)) {
    const sideW = Math.round(inner.w * 0.32)
    drawSleeveHeader(
      ctx,
      meta,
      { x: inner.x, y: inner.y, w: sideW, h: inner.h },
      true,
    )
    x = inner.x + sideW + 56 * s
    w = inner.x + inner.w - x
    top = inner.y
    footerRect = { ...inner, w: sideW }
    tableBottom = inner.y + inner.h - 16 * s
  } else {
    top = inner.y + drawSleeveHeader(ctx, meta, inner, false) + 44 * s
  }
  // 表の見出しの行
  const headH = 40 * s
  hairline(ctx, x, top, w, pal.fg)
  const area: Rect = {
    x,
    y: top + headH + 8 * s,
    w,
    h: tableBottom - (top + headH + 8 * s),
  }
  const fonts = trackFonts(ctx)
  const input = rowsInputFor(ctx, items, area, gap, fonts, {
    spread: tallSpread(ctx),
  })
  const layout = fitRowsLayout(input, {
    columnsOptions: columnsFor(ctx, a.columns, w, gap, 2),
    styles: ['single', 'compact'],
    sizeRange: trackSizeRange(ctx),
    lock: lock?.rows,
  })
  const hf = font(400, Math.max(ctx.minFont * 0.8, 15 * s), 'mono', {
    tracking: 0.06,
  })
  const headY = top + headH / 2 + 2 * s
  const numW = numberColumnWidth(input, layout)
  const edges = metaColumnEdges(input, layout)
  const colW = (w - gap * (layout.columns - 1)) / layout.columns
  for (let col = 0; col < layout.columns; col++) {
    const cx = x + col * (colW + gap)
    if (ctx.display.number)
      drawText(ctx, 'NO.', cx, headY, hf, pal.muted, 'left', 'middle')
    drawText(
      ctx,
      'ARTIST — TITLE',
      cx + numW,
      headY,
      hf,
      pal.muted,
      'left',
      'middle',
    )
    edges.forEach((edge, i) => {
      const key = metaKeys.at(i)
      if (key !== undefined)
        drawText(
          ctx,
          META_HEADINGS[key] ?? '',
          cx + edge,
          headY,
          hf,
          pal.muted,
          'right',
          'middle',
        )
    })
  }
  hairline(ctx, x, top + headH, w, pal.rule)
  drawRows(ctx, layout, rowColors(ctx, { title: pal.fg, sep: pal.muted }), {
    dividers: pal.rule,
  })
  // 表の下端
  const bottom = layout.rows.reduce((m, r) => Math.max(m, r.y + r.h), area.y)
  hairline(ctx, x, bottom + 6 * s, w, pal.fg)
  const sides = items.length > 0 && /^[A-Z]\d/.test(items[0].num)
  const left = [
    sides ? sideRange(a) : '',
    trackCountText(meta),
    setLengthText(meta),
    pageLabel(page),
  ]
    .filter(Boolean)
    .join(' · ')
  drawFooter(
    ctx,
    meta,
    footerRect === inner ? { ...inner, x, w } : footerRect,
    { caps: true, left, stack: footerRect !== inner },
  )
  return fromRows(layout)
}

function sideRange(a: TemplateArgs): string {
  const first = a.items[0]?.num[0]
  const last = a.items.at(-1)?.num[0]
  if (!first || !last) return ''
  return first === last ? `Side ${first}` : `Sides ${first}–${last}`
}

// ---------------------------------------------------------------------------
// エディトリアル
// ---------------------------------------------------------------------------

/** 大きなセリフの見出し（イベント名は正体、DJ 名は斜体）。高さを返す */
function drawEditorialHeadline(
  ctx: Ctx,
  meta: Meta,
  rect: Rect,
  scale: number,
): number {
  const { s, pal } = ctx
  const serif = ctx.style.family === 'serif'
  const stack = serif ? 'display' : 'sans'
  const weight = serif ? 400 : 500
  const roman = (size: number) =>
    font(weight, size, stack, { tracking: serif ? -0.01 : TITLE_TRACKING })
  const italic = (size: number) =>
    font(weight, size, stack, { tracking: -0.005, italic: serif })
  const max = 132 * s * scale
  const min = 56 * s * scale
  let y = rect.y
  const event = meta.event
  const dj = meta.dj
  if (event) {
    const t = fitTitle(ctx, event, rect.w, roman, min, max, 3)
    t.lines.forEach((line, i) =>
      drawText(
        ctx,
        line,
        rect.x,
        y + t.size * 0.8 + i * t.size,
        roman(t.size),
        pal.fg,
      ),
    )
    y += t.size * 0.8 + t.size * (t.lines.length - 1) + t.size * 0.22
    if (dj) {
      const d = fitTitle(ctx, dj, rect.w, italic, min * 0.7, t.size * 0.62, 2)
      d.lines.forEach((line, i) =>
        drawText(
          ctx,
          line,
          rect.x,
          y + d.size * 0.9 + i * d.size,
          italic(d.size),
          pal.fg,
        ),
      )
      y += d.size * 0.9 + d.size * (d.lines.length - 1) + d.size * 0.2
    }
  } else {
    const t = fitTitle(ctx, dj || 'Setlist', rect.w, italic, min, max, 3)
    t.lines.forEach((line, i) =>
      drawText(
        ctx,
        line,
        rect.x,
        y + t.size * 0.8 + i * t.size,
        italic(t.size),
        pal.fg,
      ),
    )
    y += t.size * 0.8 + t.size * (t.lines.length - 1) + t.size * 0.22
  }
  return y - rect.y
}

/** 右の柱のクレジット（小さなラベル + 値）。高さを返す */
function drawCredits(ctx: Ctx, meta: Meta, rect: Rect, page = ''): number {
  const { s, pal } = ctx
  const lf = font(400, Math.max(ctx.minFont * 0.75, 15 * s), 'mono', {
    tracking: 0.06,
  })
  const vf = font(400, Math.max(ctx.minFont, 22 * s), 'sans')
  // DJ 名は見出しに斜体で入っているので、ここには出さない
  const entries: Array<[string, string]> = [
    ['DATE', meta.date],
    ['VENUE', meta.venue],
    ['TRACKS', String(meta.total)],
    ['LENGTH', setLengthText(meta)],
    ['PAGE', page],
  ]
  let y = rect.y
  for (const [label, value] of entries) {
    if (!value) continue
    // 柱の高さに収まらない項目は出さない
    if (rect.h > 0 && y + 58 * s > rect.y + rect.h) break
    drawText(ctx, label, rect.x, y + 14 * s, lf, pal.muted)
    const lines = fitTitle(ctx, value, rect.w, () => vf, 1, 1, 2).lines
    lines.forEach((line, i) =>
      drawText(ctx, line, rect.x, y + 48 * s + i * 30 * s, vf, pal.fg),
    )
    y += 48 * s + (lines.length - 1) * 30 * s + 40 * s
  }
  return y - rect.y
}

export function renderEditorial(a: TemplateArgs): LayoutResult {
  const { ctx, meta, items, frame, page, lock } = a
  const { s, pal } = ctx
  const inner = innerOf(ctx, frame)
  const wide = isWide(frame)
  const fonts = trackFonts(ctx, { body: 'sans' })
  const colors = rowColors(ctx, { num: pal.accent, title: pal.muted })
  const credit = ctx.display.credit ? 40 * s : 0

  const compose = (scale: number, draw: boolean) => {
    const target = draw ? ctx : { ...ctx, c: scratchContext(), boxes: null }
    let listRect: Rect
    let creditsRect: Rect | null = null
    let ruleAt: number | null = null
    if (page.index > 0 && !wide) {
      const h = drawPageHeader(target, meta, inner, page)
      const top = inner.y + h + 30 * s
      listRect = {
        x: inner.x,
        y: top,
        w: inner.w,
        h: inner.y + inner.h - top - credit,
      }
    } else if (wide) {
      const leftW = Math.round(inner.w * 0.44)
      // 見出しの上の細い罫線
      hairline(target, inner.x, inner.y, leftW, pal.fg)
      const hh = drawEditorialHeadline(
        target,
        meta,
        { x: inner.x, y: inner.y + 30 * s, w: leftW, h: 0 },
        scale * 0.62,
      )
      const cy = inner.y + 30 * s + hh + 30 * s
      creditsRect = {
        x: inner.x,
        y: cy,
        w: leftW,
        h: inner.y + inner.h - cy,
      }
      const x = inner.x + leftW + 64 * s
      listRect = {
        x,
        y: inner.y,
        w: inner.x + inner.w - x,
        h: inner.h - credit,
      }
    } else {
      hairline(target, inner.x, inner.y, inner.w, pal.fg)
      const lf = font(400, labelSize(ctx), 'mono', { tracking: 0.06 })
      drawText(target, 'SETLIST', inner.x, inner.y + 34 * s, lf, pal.muted)
      if (meta.date)
        drawText(
          target,
          meta.date,
          inner.x + inner.w,
          inner.y + 34 * s,
          lf,
          pal.muted,
          'right',
        )
      const hy = inner.y + 84 * s
      const hh = drawEditorialHeadline(
        target,
        meta,
        { x: inner.x, y: hy, w: inner.w, h: 0 },
        scale,
      )
      const top = hy + hh + 40 * s
      ruleAt = top
      const listW = Math.round((inner.w - 48 * s) * (2 / 3))
      listRect = {
        x: inner.x,
        y: top + 28 * s,
        w: listW,
        h: inner.y + inner.h - top - 28 * s - credit,
      }
      creditsRect = {
        x: inner.x + listW + 48 * s,
        y: top + 28 * s,
        w: inner.w - listW - 48 * s,
        h: 0,
      }
    }
    const layout = fitRowsLayout(
      rowsInputFor(target, items, listRect, columnGap(ctx), fonts, {
        spread: tallSpread(ctx),
      }),
      {
        columnsOptions: [1],
        sizeRange: trackSizeRange(ctx, 0.92),
        lock: lock?.rows,
      },
    )
    if (draw) {
      // 1 枚目は本文（曲とクレジット）を下に寄せ、見出しとの間を空ける
      const offsetY =
        ruleAt !== null
          ? Math.max(0, listRect.h - rowsUsedHeight(layout, listRect.y))
          : 0
      if (ruleAt !== null) {
        hairline(ctx, inner.x, ruleAt + offsetY, inner.w, pal.rule)
      }
      if (creditsRect) {
        drawCredits(
          ctx,
          meta,
          { ...creditsRect, y: creditsRect.y + offsetY },
          pageLabel(page),
        )
      }
      drawRows(ctx, layout, colors, { dividers: null, offsetY })
      drawCredit(ctx, listRect.x, inner.y + inner.h, 'left')
    }
    return layout
  }

  // 見出しを大きく取りすぎて曲が窮屈なら、見出しを小さくした組みを使う
  const scales = [1, 0.8, 0.64]
  let scale = lock?.variant ?? 1
  if (lock?.variant === undefined && page.index === 0) {
    const comfortable = ctx.minFont * 1.15
    for (const sc of scales) {
      scale = sc
      const trial = compose(sc, false)
      if (!trial.overflow && trial.size >= comfortable) break
    }
  }
  const layout = compose(scale, true)
  const result = fromRows(layout)
  return { ...result, lock: { ...result.lock, variant: scale } }
}
