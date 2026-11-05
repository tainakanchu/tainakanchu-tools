/**
 * センター（フライヤーのラインナップ風）。すべて中央揃え、階層は 3 段まで:
 *   1. 見出し（イベント名。1 行に収まる最大、12%W まで）
 *   2. DJ 名・日付・会場の 1 行
 *   3. 曲（「Artist ／ Title」か、アーティストと曲名の 2 行）
 * 飾りは付けない。単色のパレット（リソ・アシッド・ティールナイトなど）が合う。
 */
import { fitCentered, truncatedBlockCount } from './center'
import {
  drawCredit,
  drawMark,
  drawScaled,
  drawText,
  font,
  innerOf,
  isWide,
} from './draw'
import { ellipsize, fitFontSize } from './fit'
import { columnGap, metaStack, separatorOf } from './tpl-common'
import { pageLabel } from './template-types'
import type { CenterRole } from './center'
import type { Ctx } from './draw'
import type { Rect } from './fit'
import type { FontStack } from './fonts'
import type {
  LayoutResult,
  Meta,
  PageSpec,
  TemplateArgs,
} from './template-types'

function stacks(ctx: Ctx): { head: FontStack; body: FontStack } {
  return ctx.style.family === 'serif'
    ? { head: 'serif', body: 'serif' }
    : { head: 'condensed', body: 'sans' }
}

function headFont(ctx: Ctx, size: number): string {
  const { head } = stacks(ctx)
  return head === 'serif'
    ? font(700, size, 'serif', { tracking: -0.01 })
    : font(800, size, 'condensed', {
        stretch: 'semi-condensed',
        tracking: -0.01,
      })
}

/** 見出し 2 段（見出しと DJ・日付・会場の行）。高さを返す */
function drawCenterHeader(
  ctx: Ctx,
  meta: Meta,
  rect: Rect,
  page: PageSpec,
): number {
  const compact = page.index > 0
  const { s, pal } = ctx
  const cx = rect.x + rect.w / 2
  const heading = meta.event || meta.dj || 'Setlist'
  const size = fitFontSize(
    heading,
    rect.w,
    (sz) => headFont(ctx, sz),
    ctx.measure,
    (compact ? 30 : 40) * s,
    (compact ? 44 : isWide(rect) ? 84 : 130) * s,
  )
  const f = headFont(ctx, size)
  drawText(
    ctx,
    ellipsize(heading, rect.w, f, ctx.measure),
    cx,
    rect.y + size * 0.78,
    f,
    pal.fg,
    'center',
  )
  let y = rect.y + size * 0.78 + size * 0.22
  const info = [
    meta.event ? meta.dj : '',
    compact ? pageLabel(page) : meta.date,
    compact ? '' : meta.venue,
  ]
    .filter(Boolean)
    .join('　·　')
  if (info) {
    const lf = font(
      400,
      Math.max(ctx.minFont, (compact ? 22 : 26) * s),
      stacks(ctx).body,
    )
    y += (compact ? 18 : 30) * s
    drawText(
      ctx,
      ellipsize(info, rect.w, lf, ctx.measure),
      cx,
      y + 22 * s,
      lf,
      pal.muted,
      'center',
    )
    y += 30 * s
  }
  return y - rect.y
}

export function renderCenter(a: TemplateArgs): LayoutResult {
  const { ctx, meta, items, frame, page, lock } = a
  const { s, pal } = ctx
  const inner = innerOf(ctx, frame)
  const wide = isWide(frame)
  const compact = page.index > 0
  const headerH = drawCenterHeader(ctx, meta, inner, page)
  const footer = ctx.display.credit ? 44 * s : 0
  const top = inner.y + headerH + (compact ? 48 : 84) * s
  const area: Rect = {
    x: inner.x,
    y: top,
    w: inner.w,
    h: inner.y + inner.h - footer - top,
  }
  const { body } = stacks(ctx)
  const serif = body === 'serif'
  const fontFor = (role: CenterRole, size: number) => {
    switch (role) {
      case 'num':
        return font(
          400,
          Math.max(ctx.minFont * 0.85, size * 0.62),
          metaStack(ctx),
        )
      case 'artist':
        return serif
          ? font(700, size, 'serif')
          : font(700, size, 'condensed', { stretch: 'semi-condensed' })
      case 'more':
        return font(400, size * 0.9, body)
      default:
        return font(serif ? 500 : 400, size, body)
    }
  }
  const stack = ctx.style.separator === 'stack'
  const gap = columnGap(ctx) * 1.4
  const maxCols = wide ? 3 : 2
  const columnsOptions = Array.from(
    { length: maxCols },
    (_, i) => i + 1,
  ).filter((n) => (area.w - gap * (n - 1)) / n >= ctx.minFont * 14)
  const layout = fitCentered(
    {
      items,
      width: area.w,
      height: area.h,
      gap,
      separator: separatorOf(ctx),
      stack,
      showNumber: ctx.display.number,
      mode: ctx.text.longText,
      fontFor,
      measure: ctx.measure,
    },
    {
      columnsOptions: columnsOptions.length > 0 ? columnsOptions : [1],
      sizeRange: [ctx.minFont, Math.max(ctx.minFont, (stack ? 38 : 34) * s)],
      lock: lock?.center,
    },
  )
  // 余った高さは曲の間に少し配り、残りは上下に等分（縦の中央に置く）
  const perCol = new Map<number, number>()
  for (const b of layout.blocks) perCol.set(b.col, (perCol.get(b.col) ?? 0) + 1)
  const maxItems = Math.max(1, ...perCol.values())
  const extra = Math.min(
    layout.size * (stack ? 0.7 : 0.5),
    Math.max(0, area.h - layout.usedHeight) / Math.max(1, maxItems - 1),
  )
  const colHeights = new Map<number, number>()
  for (const b of layout.blocks) {
    const idx = layout.blocks.filter((x) => x.col === b.col).indexOf(b)
    colHeights.set(
      b.col,
      Math.max(colHeights.get(b.col) ?? 0, b.y + b.h + idx * extra),
    )
  }
  const tallest = Math.max(0, ...colHeights.values())
  const offsetY = area.y + Math.max(0, (area.h - tallest) * 0.42)
  const colW = layout.colWidth
  const colorOf = (role: CenterRole) =>
    role === 'artist'
      ? pal.fg
      : role === 'title'
        ? stack
          ? pal.muted
          : pal.fg
        : pal.muted
  const seen = new Map<number, number>()
  for (const block of layout.blocks) {
    const idx = seen.get(block.col) ?? 0
    seen.set(block.col, idx + 1)
    const cx = area.x + block.col * (colW + gap) + colW / 2
    block.lines.forEach((line, i) => {
      const x0 = cx - line.width / 2
      const y = offsetY + block.y + idx * extra + layout.lineHeight * (i + 0.5)
      for (const run of line.runs) {
        if (run.mark) {
          drawMark(
            ctx,
            run.mark,
            x0 + run.x,
            y,
            run.width,
            layout.size,
            colorOf(run.role),
          )
          continue
        }
        drawScaled(
          ctx,
          run.text,
          x0 + run.x,
          y,
          fontFor(run.role, layout.size),
          colorOf(run.role),
          'left',
          'middle',
          run.scaleX,
        )
      }
    })
  }
  drawCredit(ctx, inner.x + inner.w / 2, inner.y + inner.h, 'center')
  return {
    overflow: layout.overflow,
    hidden: layout.hidden,
    lock: { center: { columns: layout.columns, size: layout.size } },
    textSize: layout.size,
    metaShown: 0,
    shown: layout.placed,
    truncated: truncatedBlockCount(layout.blocks),
  }
}
