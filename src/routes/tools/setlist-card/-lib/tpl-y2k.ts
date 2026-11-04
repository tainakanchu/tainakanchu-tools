/**
 * Y2K（Y2K がテーマのイベント向け。シンプルなテンプレートの後ろに置く）。
 * - 見出しは Unbounded のクローム: 縦のグラデーションに 0.48〜0.52 の暗い地平線、
 *   上端に 1px の白いハイライト、暗いずらし影を 1 つだけ
 * - 光（glow）はセットの長さのバー 1 か所だけ。重ねない
 * - 曲は昔の OS のウィンドウ風の枠に入れる
 * 色はすべてパレットの役割から（クロームの段はパレットに指定があればそれを使う）。
 */
import { hexToRgb, mix, rgbToHex } from './color'
import {
  applyFont,
  drawCredit,
  drawRows,
  drawText,
  font,
  hairline,
  innerOf,
  isWide,
  rowColors,
} from './draw'
import { devicePx } from './export'
import { ellipsize } from './fit'
import { isDarkPalette } from './palettes'
import { fitRowsLayout } from './rows'
import { fromRows, tallSpread } from './tpl-simple'
import {
  columnGap,
  drawPageHeader,
  fitTitle,
  rowsInputFor,
  setLengthText,
  trackCountText,
  trackSizeRange,
} from './tpl-common'
import type { Ctx } from './draw'
import type { Rect } from './fit'
import type { ChromeStop } from './palettes'
import type { FontFor } from './rows'
import { pageLabel } from './template-types'
import type {
  LayoutResult,
  Meta,
  PageSpec,
  TemplateArgs,
} from './template-types'

function chromeStops(ctx: Ctx): ReadonlyArray<ChromeStop> {
  if (ctx.palette.chrome) return ctx.palette.chrome
  const fg = hexToRgb(ctx.pal.fg)
  const bg = hexToRgb(ctx.pal.bg)
  const at = (t: number) => rgbToHex(mix(fg, bg, t))
  return [
    [0, at(0)],
    [0.45, at(0.3)],
    [0.5, at(0.78)],
    [0.56, at(0.12)],
    [1, at(0.45)],
  ]
}

/** クロームの見出しを描く（影 → ハイライト → グラデーション） */
function drawChrome(
  ctx: Ctx,
  lines: Array<string>,
  x: number,
  y: number,
  size: number,
  f: string,
  lh: number,
) {
  const { c, s, pal } = ctx
  const dark = isDarkPalette(ctx.palette)
  // 明るい配色では文字色の影でクロームの輪郭を立たせる
  const shadow = dark ? '#000000' : pal.fg
  lines.forEach((line, i) => {
    const by = y + i * lh
    // 暗いずらし影（1 つだけ・ぼかさない）
    drawText(ctx, line, x + 5 * s, by + 5 * s, f, shadow)
    // 上端の白いハイライト（1px 上にずらして下に敷く）。ずらし幅は論理 px なので
    // 2x では 3 画素ぶんずれ、縮めれば 1x と同じ太さになる
    const boxes = ctx.boxes
    ctx.boxes = null
    drawText(ctx, line, x, by - Math.max(1, 1.5 * s), f, '#ffffff')
    ctx.boxes = boxes
    const top = by - size * 0.74
    const g = c.createLinearGradient(0, top, 0, by + size * 0.04)
    for (const [offset, color] of chromeStops(ctx))
      g.addColorStop(offset, color)
    applyFont(c, f)
    c.textAlign = 'left'
    c.textBaseline = 'alphabetic'
    c.fillStyle = g
    c.fillText(line, x, by)
  })
}

function y2kFonts(ctx: Ctx): FontFor {
  return (role, size) => {
    switch (role) {
      case 'num':
      case 'meta':
        return font(400, Math.max(ctx.minFont * 0.9, size * 0.74), 'pixel')
      case 'artist':
        return font(600, size, 'sans')
      case 'more':
        return font(400, size * 0.9, 'sans')
      default:
        return font(400, size, 'sans')
    }
  }
}

/** セットの長さのバー（ここだけ光らせる）。高さを返す */
function drawLoadingBar(
  ctx: Ctx,
  meta: Meta,
  rect: Rect,
  page: PageSpec,
): number {
  const { c, s, pal, palette } = ctx
  const lf = font(400, Math.max(ctx.minFont * 0.9, 20 * s), 'pixel')
  const left = 'LOADING SET...'
  const right = [trackCountText(meta), setLengthText(meta), pageLabel(page)]
    .filter(Boolean)
    .join(' / ')
    .toUpperCase()
  drawText(ctx, left, rect.x, rect.y + 18 * s, lf, pal.muted)
  drawText(ctx, right, rect.x + rect.w, rect.y + 18 * s, lf, pal.muted, 'right')
  const by = rect.y + 34 * s
  const bh = 22 * s
  c.strokeStyle = pal.muted
  c.lineWidth = Math.max(1, s * 1.5)
  c.strokeRect(rect.x, by, rect.w, bh)
  // ブロック状の進捗（満タン）。光はここだけ
  const glow = palette.glow ?? { color: pal.accent, alpha: 0.4 }
  c.save()
  c.shadowColor = `rgba(${hexToRgb(glow.color).map(Math.round).join(',')},${glow.alpha})`
  // shadowBlur は ctx.scale が効かないので、倍率を掛けて装置の px にする
  c.shadowBlur = devicePx(0.008 * ctx.W, ctx.scale)
  c.fillStyle = pal.accent
  const inset = 4 * s
  const blockW = 14 * s
  const gap = 4 * s
  for (
    let x = rect.x + inset;
    x + blockW <= rect.x + rect.w - inset + 0.5;
    x += blockW + gap
  ) {
    c.fillRect(x, by + inset, blockW, bh - inset * 2)
  }
  c.restore()
  return 34 * s + bh
}

/** ウィンドウ枠（タイトルバー + ボタン）。中身の領域を返す */
function drawWindow(ctx: Ctx, rect: Rect, title: string, tight: boolean): Rect {
  const { c, s, pal } = ctx
  const bar = (tight ? 38 : 46) * s
  const accent2 = pal.accent2
  const onBar = pal.onAccent2
  c.fillStyle = pal.bg
  c.fillRect(rect.x, rect.y, rect.w, rect.h)
  c.fillStyle = accent2
  c.fillRect(rect.x, rect.y, rect.w, bar)
  const lw = Math.max(1, 1.5 * s)
  c.strokeStyle = pal.muted
  c.lineWidth = lw
  c.strokeRect(rect.x + lw / 2, rect.y + lw / 2, rect.w - lw, rect.h - lw)
  const tf = font(400, Math.max(ctx.minFont * 0.9, 20 * s), 'pixel')
  drawText(
    ctx,
    ellipsize(title, rect.w - 160 * s, tf, ctx.measure),
    rect.x + 18 * s,
    rect.y + bar / 2 + 1 * s,
    tf,
    onBar,
    'left',
    'middle',
  )
  // ボタン 3 つ（_ □ ×）は線だけ
  const bs = 20 * s
  for (let i = 0; i < 3; i++) {
    const bx = rect.x + rect.w - 18 * s - bs - i * (bs + 8 * s)
    const byy = rect.y + (bar - bs) / 2
    c.strokeStyle = onBar
    c.lineWidth = Math.max(1, 1.5 * s)
    c.strokeRect(bx, byy, bs, bs)
    if (i === 0) {
      c.beginPath()
      c.moveTo(bx + 5 * s, byy + 5 * s)
      c.lineTo(bx + bs - 5 * s, byy + bs - 5 * s)
      c.moveTo(bx + bs - 5 * s, byy + 5 * s)
      c.lineTo(bx + 5 * s, byy + bs - 5 * s)
      c.stroke()
    } else if (i === 2) {
      c.fillStyle = onBar
      c.fillRect(bx + 5 * s, byy + bs - 8 * s, bs - 10 * s, Math.max(1, 2 * s))
    }
  }
  hairline(ctx, rect.x, rect.y + bar, rect.w, pal.muted, 1.5)
  const pad = (tight ? 16 : 26) * s
  return {
    x: rect.x + pad,
    y: rect.y + bar + pad * 0.8,
    w: rect.w - pad * 2,
    h: rect.h - bar - pad * 1.6,
  }
}

/** Y2K の見出し（Unbounded） */
const titleAt = (size: number) => font(800, size, 'wide', { tracking: -0.02 })

export function renderY2k(a: TemplateArgs): LayoutResult {
  const { ctx, meta, items, frame, page, lock } = a
  const { s, pal } = ctx
  const inner = innerOf(ctx, frame)
  const wide = isWide(frame)
  let windowRect: Rect
  if (page.index > 0 && !wide) {
    const h = drawPageHeader(ctx, meta, inner, page, { rule: false })
    windowRect = {
      x: inner.x,
      y: inner.y + h + 30 * s,
      w: inner.w,
      h:
        inner.y +
        inner.h -
        (inner.y + h + 30 * s) -
        (ctx.display.credit ? 40 * s : 0),
    }
  } else {
    const headW = wide ? inner.w * 0.42 : inner.w
    const lf = font(400, Math.max(ctx.minFont * 0.9, 20 * s), 'pixel')
    drawText(ctx, meta.date, inner.x, inner.y + 16 * s, lf, pal.muted)
    if (meta.venue && !wide) {
      drawText(
        ctx,
        ellipsize(meta.venue, headW * 0.6, lf, ctx.measure),
        inner.x + headW,
        inner.y + 16 * s,
        lf,
        pal.muted,
        'right',
      )
    }
    const heading = meta.event || meta.dj || 'Setlist'
    const t = fitTitle(
      ctx,
      heading,
      headW - 8 * s,
      titleAt,
      44 * s,
      (wide ? 72 : 100) * s,
      2,
    )
    const lh = t.size * 1.02
    const ty = inner.y + 46 * s + t.size * 0.78
    drawChrome(ctx, t.lines, inner.x, ty, t.size, titleAt(t.size), lh)
    let y = ty + lh * (t.lines.length - 1) + t.size * 0.3
    const sub = meta.event ? meta.dj : ''
    if (sub) {
      const f = font(500, 30 * s, 'sans')
      drawText(
        ctx,
        ellipsize(sub, headW, f, ctx.measure),
        inner.x,
        y + 34 * s,
        f,
        pal.fg,
      )
      y += 46 * s
    }
    if (wide && meta.venue) {
      drawText(
        ctx,
        ellipsize(meta.venue, headW, lf, ctx.measure),
        inner.x,
        y + 30 * s,
        lf,
        pal.muted,
      )
      y += 40 * s
    }
    y += 30 * s
    y += drawLoadingBar(ctx, meta, { x: inner.x, y, w: headW, h: 0 }, page)
    if (wide) {
      const x = inner.x + headW + 48 * s
      windowRect = { x, y: inner.y, w: inner.x + inner.w - x, h: inner.h }
    } else {
      const top = y + 40 * s
      windowRect = {
        x: inner.x,
        y: top,
        w: inner.w,
        h: inner.y + inner.h - top - (ctx.display.credit ? 40 * s : 0),
      }
    }
  }
  const title = `${(meta.event || 'setlist').toLowerCase().replace(/\s+/g, '_').slice(0, 28)}.m3u`
  // ウィンドウの中は不透明な面なので、写真の上の判定から外す（zone -1）
  // 写真の上で文字色を補正していても、窓の中はパレットそのままの色で描く
  ctx.zone = -1
  const photoPal = ctx.pal
  ctx.pal = ctx.base
  const area = drawWindow(ctx, windowRect, title, wide)
  const gap = columnGap(ctx)
  const layout = fitRowsLayout(
    rowsInputFor(ctx, items, area, gap, y2kFonts(ctx), {
      spread: tallSpread(ctx),
    }),
    {
      columnsOptions: [1],
      sizeRange: trackSizeRange(ctx, 0.94),
      lock: lock?.rows,
    },
  )
  drawRows(
    ctx,
    layout,
    rowColors(ctx, { num: ctx.base.accent, title: ctx.base.muted }),
    { dividers: null },
  )
  ctx.pal = photoPal
  ctx.zone = 0
  drawCredit(ctx, inner.x, inner.y + inner.h, 'left')
  return fromRows(layout)
}
