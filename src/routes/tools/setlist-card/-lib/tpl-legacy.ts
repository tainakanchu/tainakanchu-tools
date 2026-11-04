/**
 * 旧テンプレート（リスト / 段組み / ポスター）。配色の役割で描き直したもの。
 * ネオンのにじみ・文字の影・字間を空けたラベル・走査線・版ズレ・レコード盤の飾りは外した。
 * どれを残すかは後で決めるので、組み方（自動フィット・段組み・ページ分割）は元のまま。
 */
import { rgba } from './color'
import { cssFont, drawScaled, drawText, measureHeight } from './draw'
import { ellipsize, fitFlow, fitFontSize } from './fit'
import { FONT_STACKS } from './fonts'
import { columnOptions, isLandscape, maxColumnsFor } from './layouts'
import { fitRowsLayout } from './rows'
import { pageLabel } from './template-types'
import { fromRows } from './tpl-simple'
import type { Ctx } from './draw'
import type { Rect, Run } from './fit'
import type { ColumnsSetting, PhotoPlan } from './layouts'
import type { FontFor, RowItem, RowStyle, RowsInput, RowsLayout } from './rows'
import type {
  LayoutResult,
  Meta,
  PageLock,
  PageSpec,
  TemplateArgs,
} from './template-types'

const SANS = FONT_STACKS.sans
const MONO = FONT_STACKS.mono
const DISPLAY = FONT_STACKS.black
const DISPLAY_WEIGHT = 800

const CREDIT_TEXT = 'セトリ画像メーカー · tools.tainakanchu.com'

/** 文字の影は外した（読みやすさは写真の幕で確保する） */
function withShadow(_ctx: Ctx, fn: () => void) {
  fn()
}

/** 字間を空けたラベルはやめて、普通に描く */
function drawSpaced(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  f: string,
  color: string,
  _spacing: number,
  align: 'left' | 'right' = 'left',
) {
  drawText(ctx, text, x, y, f, color, align)
}

/** 見出し。写真にまたがるときだけ背景色の縁取りを付ける */
function drawDisplay(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  f: string,
  color: string,
  opts: { outline?: string; align?: CanvasTextAlign } = {},
) {
  const { c, u } = ctx
  const align = opts.align ?? 'left'
  if (opts.outline) {
    c.save()
    c.font = f
    c.textAlign = align
    c.textBaseline = 'alphabetic'
    c.lineJoin = 'round'
    c.lineWidth = 10 * u
    c.strokeStyle = opts.outline
    c.strokeText(text, x, y)
    c.restore()
  }
  drawText(ctx, text, x, y, f, color, align)
}

/** ポスターの見出しはラテン文字を大文字にする */
const upper = (text: string) => text.toUpperCase()

function listFonts(): FontFor {
  return (role, size, style) => {
    switch (role) {
      case 'num':
        return cssFont(700, size * 0.8, MONO)
      case 'artist':
        return cssFont(700, size, SANS)
      case 'title':
      case 'sep':
        return cssFont(400, size, SANS)
      case 'meta':
        return cssFont(500, size * (style === 'compact' ? 0.66 : 0.74), MONO)
      case 'more':
        return cssFont(600, size * 0.9, SANS)
    }
  }
}

function rowsInput(
  ctx: Ctx,
  items: ReadonlyArray<RowItem>,
  area: Rect,
  gap: number,
  fonts: FontFor,
): RowsInput {
  return {
    items,
    area,
    gap,
    mode: ctx.text.longText,
    showNumber: ctx.display.number,
    fontFor: fonts,
    measure: ctx.measure,
  }
}

const range = (lo: number, hi: number) => [lo, Math.max(lo, hi)] as const

/** 行の形ごとの文字サイズの範囲（最小は読める大きさ、2 行組みは少し大きめから） */
function listSizeRange(ctx: Ctx): Record<RowStyle, readonly [number, number]> {
  const { u, minFont } = ctx
  return {
    double: [minFont * 1.3, 44 * u],
    single: range(minFont, 38 * u),
    compact: range(minFont, 30 * u),
  }
}

function drawRowsLayout(
  ctx: Ctx,
  layout: RowsLayout,
  opts: { dividers: boolean; offsetY?: number },
) {
  const { c, pal, u } = ctx
  const dy = opts.offsetY ?? 0
  if (opts.dividers) {
    c.fillStyle = rgba(pal.fg, 0.12)
    layout.rows.forEach((row, i) => {
      const prev = layout.rows[i - 1] as
        (typeof layout.rows)[number] | undefined
      if (prev && prev.col === row.col) {
        c.fillRect(row.x, row.y + dy, row.w, Math.max(1, 1.2 * u))
      }
    })
  }
  withShadow(ctx, () => {
    for (const row of layout.rows) {
      for (const t of row.texts) {
        const color =
          t.role === 'num'
            ? pal.accent
            : t.role === 'artist' || (t.role === 'title' && !t.muted)
              ? pal.fg
              : pal.muted
        drawScaled(
          ctx,
          t.text,
          row.x + t.x,
          row.y + dy + t.y,
          t.font,
          color,
          t.align,
          'middle',
          t.scaleX,
        )
      }
    }
  })
}

/** 段の間の縦罫 */
function drawColumnRules(
  ctx: Ctx,
  area: Rect,
  layout: RowsLayout,
  gap: number,
) {
  if (layout.columns < 2) return
  const colW = (area.w - gap * (layout.columns - 1)) / layout.columns
  ctx.c.fillStyle = rgba(ctx.pal.fg, 0.18)
  for (let i = 1; i < layout.columns; i++) {
    const x = area.x + i * (colW + gap) - gap / 2
    ctx.c.fillRect(
      x,
      area.y + 6 * ctx.u,
      Math.max(1, 1.5 * ctx.u),
      area.h - 12 * ctx.u,
    )
  }
}

function drawCredit(ctx: Ctx, x: number, y: number, align: 'left' | 'right') {
  if (!ctx.display.credit) return
  const f = cssFont(500, 17 * ctx.u, SANS)
  ctx.c.save()
  ctx.c.globalAlpha = 0.7
  drawText(ctx, CREDIT_TEXT, x, y, f, ctx.pal.muted, align)
  ctx.c.restore()
}

// ---------------------------------------------------------------------------
// 見出し（リスト / 段組み）
// ---------------------------------------------------------------------------

/** リストの見出しブロック（1 枚目）。描いた高さを返す */
function drawListHeader(
  ctx: Ctx,
  meta: Meta,
  rect: Rect,
  total: number,
  page: PageSpec,
): number {
  const { u, pal } = ctx
  let y = rect.y
  const w = rect.w
  const eyebrowFont = cssFont(700, 22 * u, MONO)
  withShadow(ctx, () => {
    drawSpaced(
      ctx,
      'SETLIST',
      rect.x,
      y + 22 * u,
      eyebrowFont,
      pal.accent,
      6 * u,
    )
    const right = [meta.date, `${total} TRACKS`, pageLabel(page)]
      .filter(Boolean)
      .join('  /  ')
    drawText(
      ctx,
      ellipsize(right, w * 0.62, eyebrowFont, ctx.measure),
      rect.x + w,
      y + 22 * u,
      eyebrowFont,
      pal.muted,
      'right',
    )
  })
  y += 22 * u + 34 * u

  const heading = meta.event || meta.dj || 'SETLIST'
  const headingText = heading
  const fontAt = (s: number) => cssFont(DISPLAY_WEIGHT, s, DISPLAY)
  const size = fitFontSize(headingText, w, fontAt, ctx.measure, 44 * u, 92 * u)
  const shown = ellipsize(headingText, w, fontAt(size), ctx.measure)
  y += size * 0.86
  drawDisplay(ctx, shown, rect.x, y, fontAt(size), pal.fg)
  y += size * 0.3

  const sub = meta.event ? meta.dj : ''
  if (sub) {
    // 長い DJ 名（b2b など）は小さくしてから省略する
    const subAt = (s: number) => cssFont(700, s, SANS)
    const subSize = fitFontSize(
      sub,
      w - 34 * u,
      subAt,
      ctx.measure,
      26 * u,
      40 * u,
    )
    const f = subAt(subSize)
    y += 46 * u
    ctx.c.fillStyle = pal.accent
    ctx.c.fillRect(rect.x, y - 26 * u, 14 * u, 14 * u)
    withShadow(ctx, () =>
      drawText(
        ctx,
        ellipsize(sub, w - 34 * u, f, ctx.measure),
        rect.x + 30 * u,
        y - 4 * u,
        f,
        pal.fg,
      ),
    )
    y += 6 * u
  }
  if (meta.venue) {
    const f = cssFont(500, 27 * u, SANS)
    y += 40 * u
    withShadow(ctx, () =>
      drawText(
        ctx,
        ellipsize(`@ ${meta.venue}`, w, f, ctx.measure),
        rect.x,
        y - 6 * u,
        f,
        pal.muted,
      ),
    )
  }
  y += 30 * u
  ctx.c.fillStyle = pal.accent
  ctx.c.fillRect(rect.x, y, w, 5 * u)
  y += 5 * u
  return y - rect.y
}

/** 2 枚目以降の小さな見出し（イベント名 / DJ 名とページ番号）。高さを返す */
function drawCompactHeader(
  ctx: Ctx,
  meta: Meta,
  rect: Rect,
  total: number,
  page: PageSpec,
): number {
  const { u, pal } = ctx
  const label = `${page.index + 1} / ${page.count}`
  const labelFont = cssFont(800, 40 * u, MONO)
  const labelW = ctx.measure(label, labelFont)
  const eyebrowFont = cssFont(700, 20 * u, MONO)
  const y0 = rect.y
  withShadow(ctx, () => {
    drawSpaced(
      ctx,
      `SETLIST · ${total} TRACKS`,
      rect.x,
      y0 + 20 * u,
      eyebrowFont,
      pal.accent,
      4 * u,
    )
    drawText(
      ctx,
      label,
      rect.x + rect.w,
      y0 + 40 * u,
      labelFont,
      pal.accent,
      'right',
    )
  })
  const heading = [meta.event, meta.dj].filter(Boolean).join(' — ') || 'SETLIST'
  const headAt = (s: number) => cssFont(800, s, SANS)
  const room = rect.w - labelW - 30 * u
  const size = fitFontSize(heading, room, headAt, ctx.measure, 26 * u, 40 * u)
  withShadow(ctx, () =>
    drawText(
      ctx,
      ellipsize(heading, room, headAt(size), ctx.measure),
      rect.x,
      y0 + 20 * u + 22 * u + size * 0.8,
      headAt(size),
      pal.fg,
    ),
  )
  const y = y0 + 20 * u + 22 * u + size + 18 * u
  ctx.c.fillStyle = pal.accent
  ctx.c.fillRect(rect.x, y, rect.w, 4 * u)
  return y + 4 * u - y0
}

// ---------------------------------------------------------------------------
// レイアウト: リスト
// ---------------------------------------------------------------------------

function renderList(
  ctx: Ctx,
  meta: Meta,
  items: ReadonlyArray<RowItem>,
  content: Rect,
  plan: PhotoPlan | null,
  page: PageSpec,
  total: number,
  lock: PageLock | undefined,
): LayoutResult {
  const { u, W, H } = ctx
  const p = 64 * u
  const credit = ctx.display.credit
  const rowsFit = (area: Rect) => {
    const layout = fitRowsLayout(rowsInput(ctx, items, area, 0, listFonts()), {
      columnsOptions: [1],
      sizeRange: listSizeRange(ctx),
      lock: lock?.rows,
    })
    drawRowsLayout(ctx, layout, { dividers: true })
    return fromRows(layout)
  }

  if (isLandscape({ width: W, height: H })) {
    // 横長: 見出しは左の柱（写真枠なら写真の下部に重ねる）、曲は右
    let listArea: Rect
    if (plan) {
      const photo = plan.photo
      const g = ctx.c.createLinearGradient(
        0,
        photo.y + photo.h * 0.35,
        0,
        photo.y + photo.h,
      )
      g.addColorStop(0, rgba(ctx.pal.bg, 0))
      g.addColorStop(1, rgba(ctx.pal.bg, 0.92))
      ctx.c.fillStyle = g
      ctx.c.fillRect(photo.x, photo.y, photo.w, photo.h)
      drawListHeader(
        ctx,
        meta,
        {
          x: photo.x + p * 0.8,
          y: photo.y + photo.h * 0.42,
          w: photo.w - p * 1.6,
          h: 0,
        },
        total,
        page,
      )
      listArea = {
        x: content.x + p * 0.8,
        y: content.y + p,
        w: content.w - p * 1.6,
        h: content.h - p * 2 - (credit ? 20 * u : 0),
      }
    } else {
      const sideW = W * 0.38
      ctx.c.fillStyle = rgba(ctx.pal.fg, 0.05)
      ctx.c.fillRect(0, 0, sideW, H)
      ctx.c.fillStyle = ctx.pal.accent
      ctx.c.fillRect(sideW - 6 * u, 0, 6 * u, H)
      drawListHeader(
        ctx,
        meta,
        { x: p, y: p * 1.2, w: sideW - p * 1.8, h: 0 },
        total,
        page,
      )
      listArea = {
        x: sideW + p * 0.8,
        y: p,
        w: W - sideW - p * 1.6,
        h: H - p * 2 - (credit ? 20 * u : 0),
      }
    }
    const result = rowsFit(listArea)
    drawCredit(ctx, W - p * 0.8, H - p * 0.55, 'right')
    return result
  }

  const footer = credit ? 44 * u : 0
  let listArea: Rect
  if (plan) {
    // 写真枠: 見出しは写真の下部に重ねて、曲に高さを回す
    const photo = plan.photo
    const w = photo.w - p * 2
    const headerH = measureHeight(ctx, (dry) =>
      drawListHeader(dry, meta, { x: p, y: 0, w, h: 0 }, total, page),
    )
    const top = photo.y + photo.h - headerH - p * 0.45
    const g = ctx.c.createLinearGradient(0, top - 140 * u, 0, top + 60 * u)
    g.addColorStop(0, rgba(ctx.pal.bg, 0))
    g.addColorStop(1, rgba(ctx.pal.bg, 0.9))
    ctx.c.fillStyle = g
    ctx.c.fillRect(
      photo.x,
      top - 140 * u,
      photo.w,
      photo.y + photo.h - top + 140 * u,
    )
    drawListHeader(ctx, meta, { x: photo.x + p, y: top, w, h: 0 }, total, page)
    listArea = {
      x: content.x + p,
      y: content.y + 22 * u,
      w: content.w - p * 2,
      h: content.h - 22 * u - p * 0.8 - footer,
    }
  } else {
    const inner = {
      x: content.x + p,
      y: content.y + p * (page.index > 0 ? 0.8 : 1),
      w: content.w - p * 2,
      h: 0,
    }
    const headerH =
      page.index > 0
        ? drawCompactHeader(ctx, meta, inner, total, page)
        : drawListHeader(ctx, meta, inner, total, page)
    const top = inner.y + headerH + 14 * u
    listArea = {
      x: inner.x,
      y: top,
      w: inner.w,
      h: content.y + content.h - top - p * 0.8 - footer,
    }
  }
  const result = rowsFit(listArea)
  drawCredit(ctx, content.x + p, H - p * 0.6, 'left')
  return result
}

// ---------------------------------------------------------------------------
// レイアウト: 段組み
// ---------------------------------------------------------------------------

/** 段組みの外側の余白・段の間隔（UI の段数の上限計算と共有） */
function columnsGeometry(size: { width: number; height: number }) {
  const u = Math.min(size.width, size.height) / 1080
  return { p: 56 * u, gap: 44 * u }
}

/** このサイズで選べる段数の上限（UI 用） */
export function columnsLimit(size: { width: number; height: number }): number {
  const { p, gap } = columnsGeometry(size)
  return maxColumnsFor(size, size.width - p * 2, gap)
}

function renderColumns(
  ctx: Ctx,
  meta: Meta,
  items: ReadonlyArray<RowItem>,
  content: Rect,
  page: PageSpec,
  total: number,
  lock: PageLock | undefined,
  columnsSetting: ColumnsSetting,
): LayoutResult {
  const { u, pal, H } = ctx
  const { p, gap } = columnsGeometry({ width: ctx.W, height: ctx.H })
  const c = ctx.c
  // 上端のアクセント帯
  c.fillStyle = pal.accent
  c.fillRect(content.x, content.y, content.w, 12 * u)

  const x = content.x + p
  const w = content.w - p * 2
  let y = content.y + 12 * u + p * 0.75

  if (page.index > 0) {
    y += drawCompactHeader(ctx, meta, { x, y, w, h: 0 }, total, page) + 18 * u
  } else {
    // 右側: DJ / 日付・会場
    const djAt = (s: number) => cssFont(800, s, SANS)
    const subFont = cssFont(500, 22 * u, MONO)
    const subLine = [meta.date, meta.venue].filter(Boolean).join(' / ')
    const heading = meta.event || meta.dj || 'SETLIST'
    const rightDj = meta.event ? meta.dj : ''
    const rightMax = w * 0.42
    const djSize = rightDj
      ? fitFontSize(rightDj, rightMax, djAt, ctx.measure, 22 * u, 32 * u)
      : 32 * u
    const djFont = djAt(djSize)
    const rightW = Math.min(
      rightMax,
      Math.max(ctx.measure(rightDj, djFont), ctx.measure(subLine, subFont)),
    )
    const headW = w - (rightW > 0 ? rightW + 32 * u : 0)
    const fontAt = (s: number) => cssFont(DISPLAY_WEIGHT, s, DISPLAY)
    const headText = heading
    const size = fitFontSize(
      headText,
      headW,
      fontAt,
      ctx.measure,
      34 * u,
      64 * u,
    )
    const eyebrowFont = cssFont(700, 18 * u, MONO)
    const eyebrow = [`SETLIST · ${total} TRACKS`, pageLabel(page)]
      .filter(Boolean)
      .join(' · ')
    withShadow(ctx, () =>
      drawSpaced(ctx, eyebrow, x, y + 18 * u, eyebrowFont, pal.accent, 4 * u),
    )
    y += 18 * u + 14 * u + size * 0.86
    drawDisplay(
      ctx,
      ellipsize(headText, headW, fontAt(size), ctx.measure),
      x,
      y,
      fontAt(size),
      pal.fg,
    )
    withShadow(ctx, () => {
      if (rightDj) {
        drawText(
          ctx,
          ellipsize(rightDj, rightW, djFont, ctx.measure),
          x + w,
          y - 28 * u,
          djFont,
          pal.fg,
          'right',
        )
      }
      if (subLine) {
        drawText(
          ctx,
          ellipsize(subLine, rightW || rightMax, subFont, ctx.measure),
          x + w,
          y,
          subFont,
          pal.muted,
          'right',
        )
      }
    })
    y += size * 0.24 + 22 * u
    c.fillStyle = rgba(pal.fg, 0.85)
    c.fillRect(x, y, w, 3 * u)
    y += 3 * u + 18 * u
  }

  const footer = ctx.display.credit ? 34 * u : 0
  const area = { x, y, w, h: content.y + content.h - y - p * 0.6 - footer }
  const layout = fitRowsLayout(rowsInput(ctx, items, area, gap, listFonts()), {
    columnsOptions: columnOptions(
      columnsSetting,
      maxColumnsFor({ width: ctx.W }, w, gap),
    ),
    sizeRange: listSizeRange(ctx),
    lock: lock?.rows,
  })
  drawColumnRules(ctx, area, layout, gap)
  drawRowsLayout(ctx, layout, { dividers: true })
  drawCredit(ctx, x, H - p * 0.5, 'left')
  return fromRows(layout)
}

// ---------------------------------------------------------------------------
// レイアウト: ポスター
// ---------------------------------------------------------------------------

/** DJ 名を 1〜3 行で最大サイズに組む（語の切れ目で割る） */
function fitHeadline(
  ctx: Ctx,
  text: string,
  width: number,
  maxSize: number,
  minSize: number,
  maxHeight: number,
  maxLines = 3,
): { lines: Array<string>; size: number } {
  const fontAt = (s: number) => cssFont(DISPLAY_WEIGHT, s, DISPLAY)
  const sizeOf = (lines: Array<string>) =>
    Math.min(
      ...lines.map((l) =>
        fitFontSize(l, width, fontAt, ctx.measure, minSize, maxSize),
      ),
      maxHeight / (0.95 * lines.length),
    )
  const overflows = (lines: Array<string>, size: number) =>
    lines.some((l) => ctx.measure(l, fontAt(size)) > width + 0.5)
  let best = { lines: [text], size: sizeOf([text]) }
  const words = text.split(' ').filter(Boolean)
  const splits: Array<Array<string>> = []
  for (let i = 1; i < words.length; i++) {
    if (maxLines >= 2) {
      splits.push([words.slice(0, i).join(' '), words.slice(i).join(' ')])
    }
    if (maxLines < 3) continue
    for (let j = i + 1; j < words.length; j++) {
      splits.push([
        words.slice(0, i).join(' '),
        words.slice(i, j).join(' '),
        words.slice(j).join(' '),
      ])
    }
  }
  for (const lines of splits) {
    const size = sizeOf(lines)
    const bestCut = overflows(best.lines, best.size)
    const cut = overflows(lines, size)
    // 省略せずに済むなら行を増やす。どちらも済むなら 2 割以上大きくなるときだけ
    if (
      (bestCut && !cut) ||
      (bestCut === cut &&
        size > best.size * (lines.length > best.lines.length ? 1.2 : 1))
    ) {
      best = { lines, size }
    }
  }
  return best
}

function posterFonts(): FontFor {
  return (role, size) => {
    switch (role) {
      case 'num':
        return cssFont(700, size * 0.62, MONO)
      case 'artist':
        return cssFont(800, size, SANS)
      case 'title':
      case 'sep':
        return cssFont(400, size * 0.84, SANS)
      case 'meta':
        return cssFont(500, size * 0.5, MONO)
      case 'more':
        return cssFont(700, size * 0.7, SANS)
    }
  }
}

/**
 * ポスター。曲があふれるときは見出しを小さくした組み（tight）も試し、
 * 多く入る方を描く。
 */
function renderPoster(
  ctx: Ctx,
  meta: Meta,
  items: ReadonlyArray<RowItem>,
  plan: PhotoPlan | null,
  hasBackgroundPhoto: boolean,
  page: PageSpec,
  total: number,
  lock: PageLock | undefined,
): LayoutResult {
  const args = [
    ctx,
    meta,
    items,
    plan,
    hasBackgroundPhoto,
    page,
    total,
    lock,
  ] as const
  let tight = lock?.posterTight ?? false
  let chosen = composePoster(...args, tight)
  if (chosen.result.overflow && !lock) {
    const alt = composePoster(...args, true)
    if (alt.result.hidden < chosen.result.hidden) {
      chosen = alt
      tight = true
    }
  }
  chosen.draw()
  // 2 枚目以降（とページ割りの試算）で見出しの大きさをそろえる
  return {
    ...chosen.result,
    lock: { ...chosen.result.lock, posterTight: tight },
  }
}

function composePoster(
  ctx: Ctx,
  meta: Meta,
  items: ReadonlyArray<RowItem>,
  plan: PhotoPlan | null,
  hasBackgroundPhoto: boolean,
  page: PageSpec,
  total: number,
  lock: PageLock | undefined,
  tight: boolean,
): { result: LayoutResult; draw: () => void } {
  const { c, u, W, H, pal } = ctx
  const landscape = isLandscape({ width: W, height: H })
  const p = 60 * u
  const bandH = (landscape ? 84 : 112) * u
  // 文字の領域（写真枠なら写真を除いた側）
  const area: Rect =
    plan && plan.side !== 'top' ? plan.content : { x: 0, y: 0, w: W, h: H }
  // 先に全部の位置を決めてから、最後に文字を描く
  const ops: Array<() => void> = []
  const avoid: Array<Rect> = []

  if (plan && plan.side !== 'top') {
    // 写真の内側の縁にアクセントの柱
    const px =
      plan.side === 'right'
        ? plan.photo.x
        : plan.photo.x + plan.photo.w - 14 * u
    ops.push(() => {
      c.fillStyle = pal.accent
      c.fillRect(px, 0, 14 * u, H)
    })
  }

  // --- 下の帯（日付・会場） ---
  const bandRect: Rect = { x: area.x, y: H - bandH, w: area.w, h: bandH }
  avoid.push({
    x: bandRect.x,
    y: bandRect.y - 20 * u,
    w: bandRect.w,
    h: bandH + 20 * u,
  })
  ops.push(() => {
    c.fillStyle = pal.accent
    c.fillRect(bandRect.x, bandRect.y, bandRect.w, bandRect.h)
    c.fillStyle = pal.fg
    c.fillRect(bandRect.x, bandRect.y - 16 * u, bandRect.w, 4 * u)
    const dateFont = cssFont(800, (landscape ? 34 : 44) * u, MONO)
    const venueFont = cssFont(800, (landscape ? 26 : 34) * u, SANS)
    const bandMid = bandRect.y + bandH / 2
    const dateText = meta.date || `${total} TRACKS`
    drawText(
      ctx,
      dateText,
      bandRect.x + p,
      bandMid,
      dateFont,
      pal.onAccent,
      'left',
      'middle',
    )
    const dateW = ctx.measure(dateText, dateFont)
    if (meta.venue) {
      drawText(
        ctx,
        ellipsize(
          upper(meta.venue),
          bandRect.w - p * 2 - dateW - 40 * u,
          venueFont,
          ctx.measure,
        ),
        bandRect.x + bandRect.w - p,
        bandMid,
        venueFont,
        pal.onAccent,
        'right',
        'middle',
      )
    }
  })

  // --- 見出し ---
  const x = area.x + p
  const w = area.w - p * 2
  // 横長で写真が無いときは左半分が見出し、右半分が曲
  const splitLandscape = landscape && !plan
  const hw = splitLandscape ? W * 0.5 - p - 10 * u : w
  const headline = upper(meta.dj || meta.event || 'SETLIST')
  const sub = meta.dj ? meta.event : ''
  const straddlePlan = plan?.side === 'top' && page.index === 0 ? plan : null
  const straddle = straddlePlan !== null
  let y: number
  if (straddlePlan) {
    // 写真の下端に DJ 名をまたがせる
    y = straddlePlan.photo.h - 20 * u
  } else {
    y = area.y + p
    const eyebrowFont = cssFont(700, (landscape ? 18 : 24) * u, MONO)
    const right = [`${total} TRACKS`, pageLabel(page)]
      .filter(Boolean)
      .join(' · ')
    const top = y
    ops.push(() =>
      withShadow(ctx, () => {
        drawSpaced(
          ctx,
          'SETLIST',
          x,
          top + 24 * u,
          eyebrowFont,
          pal.accent,
          8 * u,
        )
        drawText(
          ctx,
          right,
          x + w,
          top + 24 * u,
          eyebrowFont,
          page.count > 1 ? pal.accent : pal.muted,
          'right',
        )
      }),
    )
    y += 24 * u + 20 * u
    const ruleY = y
    ops.push(() => {
      c.fillStyle = pal.fg
      c.fillRect(x, ruleY, w, 10 * u)
    })
    avoid.push({ x, y: top, w, h: ruleY + 10 * u - top })
    y += 10 * u + (landscape ? 30 : 48) * u * (page.index > 0 ? 0.6 : 1)
  }

  const compactHead = page.index > 0
  const maxHead =
    (compactHead ? 90 * u : landscape ? 150 * u : plan ? 170 * u : 210 * u) *
    (tight ? 0.55 : 1)
  const head = fitHeadline(
    ctx,
    headline,
    hw,
    maxHead,
    (compactHead || tight ? 36 : 56) * u,
    (compactHead ? 0.1 : landscape ? 0.34 : 0.28) * H * (tight ? 0.55 : 1),
    // 2 枚目以降の見出しは 1 行だけ（曲に場所を回す）
    compactHead ? 1 : tight ? 2 : 3,
  )
  const headFont = cssFont(DISPLAY_WEIGHT, head.size, DISPLAY)
  const lineGap = head.size * 0.95
  if (straddle) {
    // 複数行なら上の行を写真側へ持ち上げる
    y -= lineGap * (head.lines.length - 1)
  } else {
    y += head.size * 0.78
  }
  {
    const baseY = y
    const outline = straddle || hasBackgroundPhoto ? pal.bg : undefined
    head.lines.forEach((line, i) => {
      const text = ellipsize(line, hw, headFont, ctx.measure)
      const ly = baseY + i * lineGap
      avoid.push({
        x,
        y: ly - head.size * 0.8,
        w: ctx.measure(text, headFont),
        h: head.size,
      })
      ops.push(() =>
        drawDisplay(ctx, text, x, ly, headFont, pal.fg, { outline }),
      )
    })
  }
  y += lineGap * (head.lines.length - 1) + head.size * 0.22

  // イベント名は傾けた帯に白抜き（1 枚目だけ）
  if (sub && !compactHead) {
    const subSize = fitFontSize(
      sub,
      hw - 56 * u,
      (sz) => cssFont(800, sz, SANS),
      ctx.measure,
      30 * u,
      (landscape ? 40 : 54) * u,
    )
    const subFont = cssFont(800, subSize, SANS)
    const subText = ellipsize(sub, hw - 56 * u, subFont, ctx.measure)
    const boxW = ctx.measure(subText, subFont) + 56 * u
    const boxH = subSize * 1.5
    y += 26 * u
    const by = y
    avoid.push({ x, y: by - 14 * u, w: boxW + 14 * u, h: boxH + 30 * u })
    ops.push(() => {
      c.save()
      c.translate(x, by)
      c.fillStyle = pal.accent
      c.fillRect(0, 0, boxW, boxH)
      drawText(
        ctx,
        subText,
        28 * u,
        boxH / 2 + subSize * 0.04,
        subFont,
        pal.onAccent,
        'left',
        'middle',
      )
      c.restore()
    })
    y += boxH + 8 * u
  }

  // --- 曲 ---
  const credit = ctx.display.credit
  const flowTop = y + (landscape ? 28 : 40) * u
  const flowBottom = bandRect.y - 16 * u - (credit ? 40 * u : 22 * u)
  let flowRect: Rect = { x, y: flowTop, w, h: flowBottom - flowTop }
  if (splitLandscape) {
    const split = W * 0.5
    const top = area.y + p + 90 * u
    flowRect = {
      x: split + 20 * u,
      y: top,
      w: W - split - 20 * u - p,
      h: flowBottom - top,
    }
  }
  const minF = ctx.minFont
  const mode = ctx.text.longText
  const posterItems = items.map((it) => ({
    ...it,
    artist: upper(it.artist),
  }))

  // A: 大きな文字の 2 行組みリスト（曲が少ないとき）
  const fonts = posterFonts()
  const largeRange = [
    Math.max(minF * 1.4, 34 * u),
    Math.max(minF * 1.4, (landscape ? 44 : 60) * u),
  ] as const
  const large = fitRowsLayout(rowsInput(ctx, posterItems, flowRect, 0, fonts), {
    columnsOptions: [1],
    styles: ['double'],
    sizeRange: { double: largeRange, single: largeRange, compact: largeRange },
    lock: lock?.flow?.large ? lock.rows : undefined,
  })

  // B: 流し込み（曲が多いとき）
  const sepRun: Run = { text: ' / ', role: 'sep' }
  const buildSegments = (withMeta: boolean): Array<Array<Run>> =>
    posterItems.map((it) => {
      const runs: Array<Run> = []
      if (ctx.display.number) runs.push({ text: `${it.num} `, role: 'num' })
      if (it.artist) runs.push({ text: it.artist, role: 'artist' })
      if (it.title)
        runs.push({
          text: it.artist ? ` ${it.title}` : it.title,
          role: 'title',
        })
      const metaText = withMeta ? it.meta.filter(Boolean).join(' ') : ''
      if (metaText) runs.push({ text: ` ${metaText}`, role: 'meta' })
      return runs
    })
  const metaCount = items[0]?.meta.length ?? 0
  // 前のページで補足列を外していたら、このページも外す
  let withMeta = !(lock?.flow && lock.flow.metaShown === 0)
  let segments = buildSegments(withMeta)
  const fontFor = (role: Run['role'], size: number) => {
    switch (role) {
      case 'num':
        return cssFont(700, size * 0.72, MONO)
      case 'artist':
        return cssFont(800, size, SANS)
      case 'title':
        return cssFont(400, size, SANS)
      case 'meta':
        return cssFont(500, size * 0.62, MONO)
      case 'sep':
        return cssFont(400, size, SANS)
    }
  }
  const flowMax = Math.max(minF, (landscape ? 40 : 56) * u)
  const flowOpts = {
    segments,
    separator: sepRun,
    width: flowRect.w,
    height: flowRect.h,
    lineHeightRatio: 1.36,
    min: minF,
    max: flowMax,
    fontFor,
    measure: ctx.measure,
    mode,
  }
  const lockedFlow = lock?.flow && !lock.flow.large ? lock.flow : undefined
  let flow = lockedFlow
    ? fitFlow({
        ...flowOpts,
        min: lockedFlow.size,
        max: lockedFlow.size,
        breakEach: lockedFlow.each,
      })
    : fitFlow(flowOpts)
  // 入りきらないときは、補足列（時刻 / BPM / Key）を外すと入るか試す
  if (!lockedFlow && flow.overflow && withMeta && metaCount > 0) {
    const bare = buildSegments(false)
    const bareFlow = fitFlow({ ...flowOpts, segments: bare })
    if (bareFlow.placed > flow.placed) {
      withMeta = false
      segments = bare
      flowOpts.segments = bare
      flow = bareFlow
    }
  }
  let each = lockedFlow?.each ?? false
  // ほとんど 1 行 1 曲になるなら、全部 1 行 1 曲に揃えた方が整って見える
  if (
    !lockedFlow &&
    !flow.overflow &&
    flow.lines.length > 1 &&
    flow.placed / flow.lines.length < 1.6
  ) {
    // 8 割の曲が省略なしで収まるサイズを上限にする（幅は文字サイズにほぼ比例）
    const widths = segments
      .map((runs) =>
        runs.reduce(
          (sum, r) => sum + ctx.measure(r.text, fontFor(r.role, 100)),
          0,
        ),
      )
      .toSorted((a, b) => a - b)
    const p80 =
      widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.8))]
    const cap = p80 > 0 ? (flowRect.w / p80) * 100 : flow.size
    const eachFlow = fitFlow({
      ...flowOpts,
      max: Math.max(minF, Math.min(flow.size, cap)),
      breakEach: true,
    })
    if (!eachFlow.overflow && eachFlow.size >= flow.size * 0.6) {
      flow = eachFlow
      each = true
    }
  }
  if (each) {
    // 余った高さは行間に配る
    const spread = Math.min(
      flowRect.h / Math.max(1, flow.lines.length),
      flow.size * 1.75,
    )
    flow = { ...flow, lineHeight: Math.max(flow.lineHeight, spread) }
  }

  const useLarge = lock?.flow
    ? lock.flow.large
    : !large.overflow && (flow.overflow || large.size >= flow.size * 1.12)

  let result: LayoutResult
  if (useLarge) {
    const used =
      large.rows.reduce((max, r) => Math.max(max, r.y + r.h), flowRect.y) -
      flowRect.y
    // 余白は見出しと帯の間で 4:6 に振り分ける
    const offsetY = Math.max(0, flowRect.h - used) * 0.4
    for (const row of large.rows) {
      const right = Math.max(
        ...row.texts.map((t) =>
          t.align === 'right'
            ? t.x
            : t.x + ctx.measure(t.text, t.font) * t.scaleX,
        ),
      )
      avoid.push({ x: row.x, y: row.y + offsetY, w: right, h: row.h })
    }
    ops.push(() => drawRowsLayout(ctx, large, { dividers: false, offsetY }))
    result = {
      ...fromRows(large),
      lock: {
        rows: fromRows(large).lock.rows,
        flow: {
          size: large.size,
          each: false,
          large: true,
          metaShown: large.metaShown,
        },
      },
    }
  } else {
    const leftover = Math.max(
      0,
      flowRect.h - flow.lines.length * flow.lineHeight,
    )
    const flowY = flowRect.y + leftover * 0.4
    const colorFor = (role: Run['role']) =>
      role === 'num' || role === 'sep'
        ? pal.accent
        : role === 'meta'
          ? pal.muted
          : pal.fg
    flow.lines.forEach((line, i) => {
      const last = line.at(-1)
      if (last) {
        avoid.push({
          x: flowRect.x,
          y: flowY + flow.lineHeight * i,
          w: last.x + last.width,
          h: flow.lineHeight,
        })
      }
    })
    ops.push(() =>
      withShadow(ctx, () => {
        flow.lines.forEach((line, i) => {
          const ly = flowY + flow.lineHeight * (i + 0.5)
          for (const run of line) {
            drawScaled(
              ctx,
              run.text,
              flowRect.x + run.x,
              ly,
              fontFor(run.role, flow.size),
              colorFor(run.role),
              'left',
              'middle',
              run.scaleX ?? 1,
            )
          }
        })
      }),
    )
    const hidden = items.length - flow.placed
    if (hidden > 0) {
      const f = cssFont(700, flow.size * 0.8, SANS)
      ops.push(() =>
        drawText(
          ctx,
          `+ ほか ${hidden} 曲`,
          flowRect.x + flowRect.w,
          flowBottom + 6 * u,
          f,
          pal.accent,
          'right',
          'alphabetic',
        ),
      )
    }
    result = {
      overflow: hidden > 0,
      hidden,
      lock: {
        flow: {
          size: flow.size,
          each,
          large: false,
          metaShown: withMeta ? metaCount : 0,
        },
      },
      textSize: flow.size,
      metaShown: withMeta ? metaCount : 0,
    }
  }

  if (credit) {
    const cx = splitLandscape ? flowRect.x + flowRect.w : x
    const align = splitLandscape ? 'right' : 'left'
    const cy = bandRect.y - 30 * u
    avoid.push({
      x: splitLandscape ? cx - 420 * u : cx,
      y: cy - 20 * u,
      w: 420 * u,
      h: 26 * u,
    })
    ops.push(() => drawCredit(ctx, cx, cy, align))
  }

  const draw = () => {
    for (const op of ops) op()
  }
  return { result, draw }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/** ストーリーズの安全域を除いた枠（旧テンプレートは枠の内側に余白を取る） */
function safeFrame(ctx: Ctx, frame: Rect): Rect {
  const top = frame.y <= 0.5 ? ctx.safe.top * 0.7 : 0
  const bottom = frame.y + frame.h >= ctx.H - 0.5 ? ctx.safe.bottom * 0.7 : 0
  return { x: frame.x, y: frame.y + top, w: frame.w, h: frame.h - top - bottom }
}

export function renderLegacyList(a: TemplateArgs): LayoutResult {
  return renderList(
    a.ctx,
    a.meta,
    a.items,
    safeFrame(a.ctx, a.frame),
    a.plan,
    a.page,
    a.meta.total,
    a.lock,
  )
}

export function renderLegacyColumns(a: TemplateArgs): LayoutResult {
  return renderColumns(
    a.ctx,
    a.meta,
    a.items,
    safeFrame(a.ctx, a.frame),
    a.page,
    a.meta.total,
    a.lock,
    a.columns,
  )
}

export function renderLegacyPoster(a: TemplateArgs): LayoutResult {
  return renderPoster(
    a.ctx,
    a.meta,
    a.items,
    a.plan,
    a.photoBg,
    a.page,
    a.meta.total,
    a.lock,
  )
}
