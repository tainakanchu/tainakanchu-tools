/**
 * 新テンプレートの共通部品: 書体の割り当て・文字サイズの範囲・2 枚目以降の見出し。
 *
 * 文字の大きさは出力幅（W）に対する割合で決めている（幅 1080px での px）:
 *   見出し 7〜10%W（重さ 500〜600、字間 −1.5%）
 *   曲 2.6〜3.2%W（重さ 400）、補足列 1.6〜2.0%W（等幅・控えめな色）
 * 曲が多いときは読める最小（minLegibleFont）まで自動で小さくする。
 */
import { columnOptions, getTemplate, maxColumnsFor } from './layouts'
import { drawText, font, forText, hairline } from './draw'
import { ellipsize, fitFontSize } from './fit'
import { wrapText } from './textfit'
import { pageLabel } from './template-types'
import type { Ctx, StyleOptions } from './draw'
import type { Rect } from './fit'
import type { FontStack } from './fonts'
import type { ColumnsSetting, LayoutId } from './layouts'
import type { FontFor, RowItem, RowStyle, RowsInput } from './rows'
import type { Meta, PageSpec } from './template-types'

/** 見出しの字間 */
export const TITLE_TRACKING = -0.015

/** 本文の書体（ゴシック / 明朝） */
export function bodyStack(ctx: Ctx): FontStack {
  return ctx.style.family === 'serif' ? 'serif' : 'sans'
}

/** 番号・補足列の書体 */
export function metaStack(ctx: Ctx): FontStack {
  return ctx.style.monoMeta ? 'mono' : bodyStack(ctx)
}

/** 補足列の大きさ（1.6〜2.0%W、ただし読める最小の 9 割は下回らない） */
export function metaSize(ctx: Ctx, size: number): number {
  return Math.max(ctx.minFont * 0.9, Math.min(size * 0.7, 21 * ctx.s))
}

/** 小さなラベル（日付・会場など）の大きさ */
export function labelSize(ctx: Ctx): number {
  return Math.max(ctx.minFont * 0.9, 19 * ctx.s)
}

export function trackFonts(
  ctx: Ctx,
  opts: { artistWeight?: number; titleWeight?: number; body?: FontStack } = {},
): FontFor {
  const body = opts.body ?? bodyStack(ctx)
  const serif = body === 'serif'
  // 明朝は 500 / 700 しか読み込まないので、それに合わせる
  const aw = opts.artistWeight ?? (serif ? 700 : 500)
  const tw = opts.titleWeight ?? (serif ? 500 : 400)
  const meta = metaStack(ctx)
  return (role, size) => {
    switch (role) {
      case 'num':
        return font(400, metaSize(ctx, size), meta)
      case 'artist':
        return font(aw, size, body)
      case 'title':
      case 'sep':
        return font(tw, size, body)
      case 'meta':
        return font(400, metaSize(ctx, size), meta)
      case 'more':
        return font(tw, size * 0.9, body)
    }
  }
}

const range = (lo: number, hi: number) => [lo, Math.max(lo, hi)] as const

/** 行の形ごとの文字サイズの範囲（上限は 2.6〜3.2%W） */
export function trackSizeRange(
  ctx: Ctx,
  scale = 1,
): Record<RowStyle, readonly [number, number]> {
  const { s, minFont } = ctx
  return {
    double: range(minFont * 1.15, 34 * s * scale),
    single: range(minFont, 32 * s * scale),
    compact: range(minFont, 28 * s * scale),
  }
}

export function rowsInputFor(
  ctx: Ctx,
  items: ReadonlyArray<RowItem>,
  area: Rect,
  gap: number,
  fonts: FontFor,
  extra: Partial<RowsInput> = {},
): RowsInput {
  return {
    items,
    area,
    gap,
    mode: ctx.text.longText,
    showNumber: ctx.display.number,
    fontFor: fonts,
    measure: ctx.measure,
    separator: ctx.style.separator === 'stack' ? ' — ' : separatorOf(ctx),
    ...extra,
  }
}

export function separatorOf(ctx: Ctx): string {
  switch (ctx.style.separator) {
    case 'slash':
      return ' ／ '
    case 'dot':
      return ' · '
    case 'space':
      return '   '
    default:
      return ' — '
  }
}

/** 段数の候補（max 段まで） */
export function columnsFor(
  ctx: Ctx,
  setting: ColumnsSetting,
  width: number,
  gap: number,
  max = 3,
): Array<number> {
  return columnOptions(
    setting,
    Math.min(max, maxColumnsFor({ width: ctx.W }, width, gap)),
  )
}

/** 段の間隔 */
export function columnGap(ctx: Ctx): number {
  return 48 * ctx.s
}

/**
 * 2 枚目以降の小さな見出し（イベント名 — DJ 名 と ページ番号）。高さを返す。
 * 罫線は rule の色で 1 本だけ。
 */
export function drawPageHeader(
  ctx: Ctx,
  meta: Meta,
  rect: Rect,
  page: PageSpec,
  opts: { align?: 'left' | 'center'; rule?: boolean; color?: string } = {},
): number {
  const { s, pal } = ctx
  const align = opts.align ?? 'left'
  const label = pageLabel(page)
  const labelFont = font(400, labelSize(ctx), 'mono')
  const labelW = label ? ctx.measure(label, labelFont) + 24 * s : 0
  const heading = meta.event || meta.dj || 'Setlist'
  const sub = meta.event ? meta.dj : ''
  const headAt = (size: number) =>
    forText(font(500, size, bodyStack(ctx), { tracking: -0.01 }), heading)
  const room = align === 'center' ? rect.w - labelW * 2 : rect.w - labelW
  const subFont = forText(font(400, 26 * s, bodyStack(ctx)), `   ${sub}`)
  const subW = sub ? ctx.measure(`   ${sub}`, subFont) : 0
  const size = fitFontSize(
    heading,
    Math.max(room * 0.5, room - subW),
    headAt,
    ctx.measure,
    24 * s,
    32 * s,
  )
  const head = ellipsize(
    heading,
    room - Math.min(subW, room * 0.45),
    headAt(size),
    ctx.measure,
  )
  const headW = ctx.measure(head, headAt(size))
  const baseY = rect.y + size * 0.8
  const color = opts.color ?? pal.fg
  if (align === 'center') {
    const subShown = sub
      ? ellipsize(`   ${sub}`, room - headW, subFont, ctx.measure)
      : ''
    const total = headW + ctx.measure(subShown, subFont)
    const x0 = rect.x + rect.w / 2 - total / 2
    drawText(ctx, head, x0, baseY, headAt(size), color)
    drawText(ctx, subShown, x0 + headW, baseY, subFont, pal.muted)
  } else {
    drawText(ctx, head, rect.x, baseY, headAt(size), color)
    if (sub) {
      drawText(
        ctx,
        ellipsize(`   ${sub}`, room - headW, subFont, ctx.measure),
        rect.x + headW,
        baseY,
        subFont,
        pal.muted,
      )
    }
  }
  if (label) {
    drawText(ctx, label, rect.x + rect.w, baseY, labelFont, pal.muted, 'right')
  }
  let y = baseY + size * 0.45
  if (opts.rule !== false) {
    y += 14 * s
    hairline(ctx, rect.x, y, rect.w, pal.rule)
  }
  return y - rect.y
}

/** 「14 tracks」「1:17」などのフッター用の文字 */
export function trackCountText(meta: Meta): string {
  return `${meta.total} ${meta.total === 1 ? 'track' : 'tracks'}`
}

const squash = (t: string) => t.replace(/\s+/g, '')

/**
 * 見出しを maxLines 行までで、できるだけ大きく組む（語の切れ目・和文は 1 文字単位で折る）。
 * min でも入らなければ min で最後の行を省略する。
 */
export function fitTitle(
  ctx: Ctx,
  text: string,
  width: number,
  givenFontAt: (size: number) => string,
  min: number,
  max: number,
  maxLines: number,
): { lines: Array<string>; size: number; font: string } {
  // 書体（文字体系）は見出しの文字列全体で決める。折り返した行も同じ書体で描く
  const fontAt = (size: number) => forText(givenFontAt(size), text)
  const done = (lines: Array<string>, size: number) => ({
    lines,
    size,
    font: fontAt(size),
  })
  // 1 行で max の 7 割以上に組めるなら 1 行にする（「50」だけが次の行に落ちる、を避ける）
  const oneLine = fitFontSize(text, width, fontAt, ctx.measure, min, max)
  if (
    ctx.measure(text, fontAt(oneLine)) <= width + 0.5 &&
    (maxLines < 2 || oneLine >= max * 0.7)
  ) {
    return done([text], oneLine)
  }
  const step = Math.max(1, (max - min) / 24)
  for (let size = max; size >= min - 0.01; size -= step) {
    const f = fontAt(size)
    if (ctx.measure(text, f) <= width) return done([text], size)
    if (maxLines < 2) continue
    const lines = wrapText(text, width, maxLines, f, ctx.measure)
    const last = lines.at(-1) ?? ''
    // 最後の行が短すぎる（1 語だけ落ちる）組みは、もう少し小さくして避ける
    const orphan =
      lines.length > 1 &&
      ctx.measure(last, f) < width * 0.22 &&
      size > min + step
    if (squash(lines.join('')) === squash(text) && !orphan) {
      return done(lines, size)
    }
  }
  const f = fontAt(min)
  if (maxLines < 2) return done([ellipsize(text, width, f, ctx.measure)], min)
  return done(wrapText(text, width, maxLines, f, ctx.measure), min)
}

/**
 * 1 行に収まらなければ末尾を省略する。書体（文字体系）は省略する前の文字列で決め、
 * 返した font で描く（省略した後の文字から決め直すと書体が変わることがあるため）。
 */
export function fitLabel(
  ctx: Ctx,
  text: string,
  width: number,
  f: string,
): { text: string; font: string } {
  const resolved = forText(f, text)
  return { text: ellipsize(text, width, resolved, ctx.measure), font: resolved }
}

/**
 * テンプレートを選んだときの文字組みの既定（書体・粒子・区切りはテンプレートに合わせ、
 * 等幅・面番号はそのまま）。
 */
export function templateStyle(
  layout: LayoutId,
  prev?: StyleOptions,
): StyleOptions {
  const t = getTemplate(layout)
  const separator =
    layout === 'center'
      ? 'slash'
      : prev && prev.separator !== 'stack'
        ? prev.separator
        : 'dash'
  return {
    family: t.family,
    monoMeta: prev?.monoMeta ?? true,
    separator,
    grain: t.grain,
    sideNumbers: prev?.sideNumbers ?? false,
  }
}
