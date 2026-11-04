/**
 * セトリ画像を Canvas 2D に描く。
 * プレビューも書き出しも同じ関数・同じ解像度で描き、プレビューは CSS で縮めるだけ
 * にしているので、見たものと書き出した PNG が一致する。
 */
import {
  contrastRatio,
  ensureContrast,
  hexToRgb,
  mix,
  readableOn,
  rgbToHex,
  rgba,
} from './color'
import { ellipsize, fitFlow, fitFontSize, fitRows } from './fit'
import { isLandscape, planPhotoBlock } from './layouts'
import { effectiveAverage, processedPhoto } from './photo'
import { formatBpm, formatOffset } from './text'
import { withAccent } from './themes'
import type { RGB } from './color'
import type { Measure, Rect, Run } from './fit'
import type {
  CanvasSize,
  LayoutId,
  PhotoMode,
  PhotoPlan,
  PhotoSettings,
} from './layouts'
import type { LoadedPhoto } from './photo'
import type { Theme } from './themes'
import type { Setlist, Track } from './types'

export type DisplayOptions = {
  number: boolean
  bpm: boolean
  key: boolean
  time: boolean
  credit: boolean
}

export type RenderInput = {
  setlist: Setlist
  layout: LayoutId
  size: CanvasSize
  theme: Theme
  display: DisplayOptions
  photo: { image: LoadedPhoto; settings: PhotoSettings } | null
}

export type RenderInfo = {
  overflow: boolean
  hiddenCount: number
  /** 実際に使った写真の置き方（写真が無ければ null） */
  photoMode: PhotoMode | null
  /** 写真の描画範囲（プレビューでのドラッグ用、書き出し座標） */
  photoRect: Rect | null
  /** 写真枠では曲が入りきらず、全面背景に切り替えたか */
  photoFallback: boolean
}

export const CREDIT_TEXT = 'セトリ画像メーカー · tools.tainakanchu.com'

type Palette = {
  bg: string
  bg2: string
  fg: string
  muted: string
  accent: string
  accent2: string
  onAccent: string
  /** 背景が写真のときは文字に薄い影を付ける */
  textShadow: string | null
}

type Ctx = {
  c: CanvasRenderingContext2D
  W: number
  H: number
  /** 1080px 基準の拡大率 */
  u: number
  theme: Theme
  pal: Palette
  measure: Measure
  display: DisplayOptions
}

type Item = {
  num: string
  artist: string
  title: string
  /** 右寄せの補足列（開始時刻 / BPM / キーの順、無いものは ''） */
  meta: Array<string>
}

const hex = (rgb: RGB) => rgbToHex(rgb)

// ---------------------------------------------------------------------------
// 文字の基本
// ---------------------------------------------------------------------------

function font(weight: number, size: number, family: string): string {
  return `${weight} ${Math.max(1, Math.round(size * 10) / 10)}px ${family}`
}

function createMeasure(c: CanvasRenderingContext2D): Measure {
  const memo = new Map<string, number>()
  return (text, f) => {
    const key = `${f}\u0000${text}`
    const hit = memo.get(key)
    if (hit !== undefined) return hit
    c.font = f
    const width = c.measureText(text).width
    memo.set(key, width)
    return width
  }
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  f: string,
  color: string,
  align: CanvasTextAlign = 'left',
  baseline: CanvasTextBaseline = 'alphabetic',
) {
  if (!text) return
  const { c } = ctx
  c.font = f
  c.fillStyle = color
  c.textAlign = align
  c.textBaseline = baseline
  c.fillText(text, x, y)
}

/** 字間を空けて描く（ctx.letterSpacing はブラウザ差があるので自前で） */
function spacedWidth(ctx: Ctx, text: string, f: string, spacing: number) {
  const chars = Array.from(text)
  return (
    chars.reduce((sum, ch) => sum + ctx.measure(ch, f), 0) +
    spacing * Math.max(0, chars.length - 1)
  )
}

function drawSpaced(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  f: string,
  color: string,
  spacing: number,
  align: 'left' | 'right' = 'left',
) {
  const total = spacedWidth(ctx, text, f, spacing)
  let cx = align === 'right' ? x - total : x
  for (const ch of Array.from(text)) {
    drawText(ctx, ch, cx, y, f, color)
    cx += ctx.measure(ch, f) + spacing
  }
}

function withShadow(ctx: Ctx, fn: () => void) {
  const { c, pal } = ctx
  if (!pal.textShadow) {
    fn()
    return
  }
  c.save()
  c.shadowColor = pal.textShadow
  c.shadowBlur = 10 * ctx.u
  c.shadowOffsetY = 2 * ctx.u
  fn()
  c.restore()
}

/** 見出し用: テーマに応じてネオンのにじみ・版ズレ・縁取りを付けて描く */
function drawDisplay(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  f: string,
  color: string,
  opts: { outline?: string; align?: CanvasTextAlign } = {},
) {
  const { c, theme, u } = ctx
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
  if (theme.misregister) {
    c.save()
    c.globalAlpha = 0.9
    drawText(ctx, text, x + 6 * u, y + 4 * u, f, ctx.pal.accent, align)
    c.restore()
    c.save()
    c.globalCompositeOperation = 'multiply'
    drawText(ctx, text, x, y, f, color, align)
    c.restore()
    return
  }
  if (theme.glow) {
    c.save()
    c.shadowColor = ctx.pal.accent
    c.shadowBlur = 28 * u
    drawText(ctx, text, x, y, f, color, align)
    c.shadowBlur = 8 * u
    drawText(ctx, text, x, y, f, color, align)
    c.restore()
    return
  }
  withShadow(ctx, () => drawText(ctx, text, x, y, f, color, align))
}

function displayText(ctx: Ctx, text: string): string {
  return ctx.theme.uppercase ? text.toUpperCase() : text
}

// ---------------------------------------------------------------------------
// 背景・質感
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function drawBackground(ctx: Ctx) {
  const { c, W, H, pal } = ctx
  const grad = c.createLinearGradient(0, 0, W * 0.3, H)
  grad.addColorStop(0, pal.bg)
  grad.addColorStop(1, pal.bg2)
  c.fillStyle = grad
  c.fillRect(0, 0, W, H)
}

function drawTexture(ctx: Ctx) {
  const { c, W, H, u, theme } = ctx
  c.save()
  if (theme.texture === 'scanline') {
    c.fillStyle = 'rgba(255,255,255,0.025)'
    for (let y = 0; y < H; y += 6 * u) c.fillRect(0, y, W, 2 * u)
  } else if (theme.texture === 'grain' || theme.texture === 'paper') {
    // 乱数は固定シードにして、毎回同じ粒になるようにする（書き出しの再現性）
    const rand = mulberry32(42)
    const dark =
      theme.texture === 'paper' ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.07)'
    const light = 'rgba(255,255,255,0.05)'
    const count = Math.round((W * H) / 260)
    for (let i = 0; i < count; i++) {
      c.fillStyle = rand() < 0.6 ? dark : light
      const s = (rand() * 1.6 + 0.6) * u
      c.fillRect(rand() * W, rand() * H, s, s)
    }
    if (theme.texture === 'paper') {
      const g = c.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.35,
        W / 2,
        H / 2,
        Math.max(W, H) * 0.75,
      )
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.35)')
      c.fillStyle = g
      c.fillRect(0, 0, W, H)
    }
  }
  c.restore()
}

/** 写真を枠に描く。暗幕は全面背景のときだけ濃く掛ける */
function drawPhoto(
  ctx: Ctx,
  photo: LoadedPhoto,
  settings: PhotoSettings,
  rect: Rect,
  mode: PhotoMode,
) {
  const { c } = ctx
  const canvas = processedPhoto(
    photo,
    rect,
    {
      zoom: settings.zoom,
      posX: settings.posX,
      posY: settings.posY,
      blur: settings.blur,
      tint: settings.tint,
    },
    ctx.theme,
  )
  c.drawImage(canvas, rect.x, rect.y, rect.w, rect.h)
  const dim = mode === 'background' ? settings.dim : settings.dim * 0.5
  if (dim > 0) {
    c.save()
    c.fillStyle = rgba(ctx.theme.bg, dim)
    c.fillRect(rect.x, rect.y, rect.w, rect.h)
    c.restore()
  }
}

// ---------------------------------------------------------------------------
// 曲データ → 表示用
// ---------------------------------------------------------------------------

function toItems(tracks: ReadonlyArray<Track>, display: DisplayOptions) {
  const starts = tracks
    .map((t) => t.startAt)
    .filter((v): v is number => v !== undefined)
  const origin = starts.length > 0 ? Math.min(...starts) : undefined
  const items: Array<Item> = tracks.map((track, index) => ({
    num: String(index + 1).padStart(2, '0'),
    artist: track.artist,
    title: track.title,
    meta: [
      display.time && track.startAt !== undefined && origin !== undefined
        ? formatOffset(track.startAt - origin)
        : '',
      display.bpm && track.bpm !== undefined ? formatBpm(track.bpm) : '',
      display.key && track.key ? track.key : '',
    ],
  }))
  // 1 曲も値が無い列は詰める
  const used = [0, 1, 2].filter((i) => items.some((it) => it.meta[i] !== ''))
  return items.map((it) => ({ ...it, meta: used.map((i) => it.meta[i]) }))
}

function moreLabel(hidden: number): string {
  return `ほか ${hidden} 曲`
}

// ---------------------------------------------------------------------------
// 行（リスト / 2カラム 共通）
// ---------------------------------------------------------------------------

type RowStyle = {
  size: number
  twoLine: boolean
  divider: boolean
}

function drawRows(
  ctx: Ctx,
  items: ReadonlyArray<Item>,
  hidden: number,
  area: Rect,
  columns: number,
  gap: number,
  lineHeight: number,
  rowsPerColumn: number,
  style: RowStyle,
) {
  const { theme, pal, u, display } = ctx
  const size = style.size
  const numFont = font(700, size * 0.82, theme.monoFont)
  const artistFont = font(700, size, theme.bodyFont)
  const titleFont = font(400, size, theme.bodyFont)
  // 段が狭いとき（2カラム・2 行組み）は補足列を小さく詰めて、名前に幅を回す
  const narrow = style.twoLine || columns > 1
  const metaFont = font(500, size * (narrow ? 0.68 : 0.78), theme.monoFont)
  const colW = (area.w - gap * (columns - 1)) / columns
  const numW = display.number ? ctx.measure('00', numFont) + size * 0.7 : 0
  const metaCount = items[0]?.meta.length ?? 0
  const metaWidths = Array.from({ length: metaCount }, (_, i) =>
    Math.max(...items.map((it) => ctx.measure(it.meta[i], metaFont)), 0),
  )
  const metaGap = size * (narrow ? 0.45 : 0.8)
  const metaTotal =
    metaWidths.reduce((s, w) => s + w + metaGap, 0) +
    (metaCount ? size * 0.2 : 0)
  const sep = ' — '

  const slots: Array<Item | 'more'> = [...items]
  if (hidden > 0) slots.push('more')

  slots.forEach((slot, index) => {
    const col = Math.floor(index / rowsPerColumn)
    const row = index % rowsPerColumn
    if (col >= columns) return
    const x = area.x + col * (colW + gap)
    const top = area.y + row * lineHeight
    const cy = top + lineHeight / 2
    if (style.divider && row > 0) {
      ctx.c.fillStyle = rgba(pal.fg, 0.12)
      ctx.c.fillRect(x, top, colW, Math.max(1, 1.2 * u))
    }
    if (slot === 'more') {
      drawText(
        ctx,
        moreLabel(hidden),
        x + numW,
        cy,
        titleFont,
        pal.muted,
        'left',
        'middle',
      )
      return
    }
    // 2 行組みでは 1 行目（アーティスト）に番号と補足列を揃える
    const y1 = style.twoLine ? cy - size * 0.62 : cy
    withShadow(ctx, () => {
      if (display.number) {
        drawText(ctx, slot.num, x, y1, numFont, pal.accent, 'left', 'middle')
      }
      // 右の補足列
      let mx = x + colW
      for (let i = metaCount - 1; i >= 0; i--) {
        drawText(
          ctx,
          slot.meta[i],
          mx,
          y1,
          metaFont,
          pal.muted,
          'right',
          'middle',
        )
        mx -= metaWidths[i] + metaGap
      }
      const textX = x + numW
      const avail = colW - numW - metaTotal
      if (style.twoLine) {
        // 2 行目（曲名）は補足列の下まで使える
        const artist = ellipsize(slot.artist, avail, artistFont, ctx.measure)
        const title = ellipsize(slot.title, colW - numW, titleFont, ctx.measure)
        if (artist && title) {
          drawText(
            ctx,
            artist,
            textX,
            cy - size * 0.62,
            artistFont,
            pal.fg,
            'left',
            'middle',
          )
          drawText(
            ctx,
            title,
            textX,
            cy + size * 0.62,
            titleFont,
            pal.muted,
            'left',
            'middle',
          )
        } else {
          drawText(
            ctx,
            artist || title,
            textX,
            y1,
            artist ? artistFont : titleFont,
            pal.fg,
            'left',
            'middle',
          )
        }
        return
      }
      if (!slot.artist || !slot.title) {
        const only = slot.artist || slot.title
        const f = slot.artist ? artistFont : titleFont
        drawText(
          ctx,
          ellipsize(only, avail, f, ctx.measure),
          textX,
          cy,
          f,
          pal.fg,
          'left',
          'middle',
        )
        return
      }
      const sepW = ctx.measure(sep, titleFont)
      const titleW = ctx.measure(slot.title, titleFont)
      const artistW = ctx.measure(slot.artist, artistFont)
      const artistAllowed = Math.min(
        artistW,
        Math.max(avail * 0.5, avail - sepW - titleW),
      )
      const artist = ellipsize(
        slot.artist,
        artistAllowed,
        artistFont,
        ctx.measure,
      )
      const aw = ctx.measure(artist, artistFont)
      const title = ellipsize(
        slot.title,
        avail - aw - sepW,
        titleFont,
        ctx.measure,
      )
      drawText(ctx, artist, textX, cy, artistFont, pal.fg, 'left', 'middle')
      drawText(ctx, sep, textX + aw, cy, titleFont, pal.muted, 'left', 'middle')
      drawText(
        ctx,
        title,
        textX + aw + sepW,
        cy,
        titleFont,
        pal.fg,
        'left',
        'middle',
      )
    })
  })
}

function drawCredit(
  ctx: Ctx,
  x: number,
  y: number,
  align: 'left' | 'right',
  color?: string,
) {
  if (!ctx.display.credit) return
  const f = font(500, 17 * ctx.u, ctx.theme.bodyFont)
  ctx.c.save()
  ctx.c.globalAlpha = 0.7
  drawText(ctx, CREDIT_TEXT, x, y, f, color ?? ctx.pal.muted, align)
  ctx.c.restore()
}

// ---------------------------------------------------------------------------
// 見出し（リスト / 2カラム）
// ---------------------------------------------------------------------------

type Meta = { event: string; dj: string; date: string; venue: string }

function metaOf(setlist: Setlist): Meta {
  return {
    event: setlist.title?.trim() ?? '',
    dj: setlist.djName?.trim() ?? '',
    date: setlist.date?.trim() ?? '',
    venue: setlist.venue?.trim() ?? '',
  }
}

/** リストの見出しブロック。描いた高さを返す */
function drawListHeader(
  ctx: Ctx,
  meta: Meta,
  rect: Rect,
  count: number,
): number {
  const { u, theme, pal } = ctx
  let y = rect.y
  const w = rect.w
  const eyebrowFont = font(700, 22 * u, theme.monoFont)
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
    const right = [meta.date, `${count} TRACKS`].filter(Boolean).join('  /  ')
    drawText(
      ctx,
      ellipsize(right, w * 0.6, eyebrowFont, ctx.measure),
      rect.x + w,
      y + 22 * u,
      eyebrowFont,
      pal.muted,
      'right',
    )
  })
  y += 22 * u + 34 * u

  const heading = meta.event || meta.dj || 'SETLIST'
  const headingText = displayText(ctx, heading)
  const fontAt = (s: number) => font(theme.displayWeight, s, theme.displayFont)
  const size = fitFontSize(headingText, w, fontAt, ctx.measure, 44 * u, 92 * u)
  const shown = ellipsize(headingText, w, fontAt(size), ctx.measure)
  y += size * 0.86
  drawDisplay(ctx, shown, rect.x, y, fontAt(size), pal.fg)
  y += size * 0.3

  const sub = meta.event ? meta.dj : ''
  if (sub) {
    const f = font(700, 40 * u, theme.bodyFont)
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
    const f = font(500, 27 * u, theme.bodyFont)
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

// ---------------------------------------------------------------------------
// レイアウト: リスト
// ---------------------------------------------------------------------------

let scratch: CanvasRenderingContext2D | null = null

/**
 * 描く前に高さだけ知りたいブロック用。使い捨ての 1px canvas に描かせて、
 * 返ってきた高さだけを使う（文字幅の計測は本物の canvas のまま）。
 */
function measureHeight(ctx: Ctx, draw: (dry: Ctx) => number): number {
  if (!scratch) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    scratch = canvas.getContext('2d')
  }
  if (!scratch) return 0
  return draw({ ...ctx, c: scratch })
}

type RowFitOptions = { maxLine: number; minLine: number; maxFont: number }

/**
 * 曲の行を組む。double（アーティスト / 曲名の 2 行組み）が入るならそれを優先し、
 * 入らなければ「Artist — Title」の 1 行組みに落とす。
 */
function listRows(
  ctx: Ctx,
  items: ReadonlyArray<Item>,
  area: Rect,
  columns: number,
  gap: number,
  opts: { single: RowFitOptions; double?: RowFitOptions },
) {
  const { u } = ctx
  const fitWith = (o: RowFitOptions) =>
    fitRows({
      count: items.length,
      columns,
      areaHeight: area.h,
      minLine: o.minLine * u,
      maxLine: o.maxLine * u,
    })
  let twoLine = false
  let fit = fitWith(opts.single)
  let size = Math.min(fit.lineHeight * 0.5, opts.single.maxFont * u)
  if (opts.double) {
    const doubleFit = fitWith(opts.double)
    if (!doubleFit.overflow) {
      twoLine = true
      fit = doubleFit
      size = Math.min(fit.lineHeight * 0.32, opts.double.maxFont * u)
    }
  }
  const visible = items.slice(0, fit.visible)
  const hidden = items.length - visible.length
  drawRows(ctx, visible, hidden, area, columns, gap, fit.lineHeight, fit.rows, {
    size,
    twoLine,
    divider: true,
  })
  return { overflow: fit.overflow, hidden }
}

function renderList(
  ctx: Ctx,
  meta: Meta,
  items: ReadonlyArray<Item>,
  content: Rect,
  plan: PhotoPlan | null,
) {
  const { u, W, H } = ctx
  const p = 64 * u
  const credit = ctx.display.credit
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
      const headerRect = {
        x: photo.x + p * 0.8,
        y: photo.y + photo.h * 0.42,
        w: photo.w - p * 1.6,
        h: 0,
      }
      drawListHeader(ctx, meta, headerRect, items.length)
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
        items.length,
      )
      listArea = {
        x: sideW + p * 0.8,
        y: p,
        w: W - sideW - p * 1.6,
        h: H - p * 2 - (credit ? 20 * u : 0),
      }
    }
    const result = listRows(ctx, items, listArea, 1, 0, {
      single: { maxLine: 76, minLine: 34, maxFont: 36 },
      double: { maxLine: 130, minLine: 104, maxFont: 40 },
    })
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
      drawListHeader(dry, meta, { x: p, y: 0, w, h: 0 }, items.length),
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
    drawListHeader(ctx, meta, { x: photo.x + p, y: top, w, h: 0 }, items.length)
    listArea = {
      x: content.x + p,
      y: content.y + 22 * u,
      w: content.w - p * 2,
      h: content.h - 22 * u - p * 0.8 - footer,
    }
  } else {
    const inner = {
      x: content.x + p,
      y: content.y + p,
      w: content.w - p * 2,
      h: 0,
    }
    const headerH = drawListHeader(ctx, meta, inner, items.length)
    listArea = {
      x: inner.x,
      y: inner.y + headerH + 14 * u,
      w: inner.w,
      h:
        content.y + content.h - (inner.y + headerH + 14 * u) - p * 0.8 - footer,
    }
  }
  const result = listRows(ctx, items, listArea, 1, 0, {
    single: { maxLine: 78, minLine: 34, maxFont: 36 },
    double: { maxLine: 132, minLine: 104, maxFont: 42 },
  })
  drawCredit(ctx, content.x + p, H - p * 0.6, 'left')
  return result
}

// ---------------------------------------------------------------------------
// レイアウト: 2カラム
// ---------------------------------------------------------------------------

function renderColumns(
  ctx: Ctx,
  meta: Meta,
  items: ReadonlyArray<Item>,
  content: Rect,
  plan: PhotoPlan | null,
) {
  const { u, theme, pal, H } = ctx
  const p = 56 * u
  const c = ctx.c
  // 上端のアクセント帯
  c.fillStyle = pal.accent
  c.fillRect(content.x, content.y, content.w, 12 * u)
  if (plan?.side === 'top') {
    c.fillRect(content.x, content.y - 4 * u, content.w, 4 * u)
  }

  const x = content.x + p
  const w = content.w - p * 2
  let y = content.y + 12 * u + p * 0.75

  // 右側: DJ / 日付・会場
  const djFont = font(800, 32 * u, theme.bodyFont)
  const subFont = font(500, 22 * u, theme.monoFont)
  const subLine = [meta.date, meta.venue].filter(Boolean).join(' / ')
  const heading = meta.event || meta.dj || 'SETLIST'
  const rightDj = meta.event ? meta.dj : ''
  const rightW = Math.min(
    w * 0.42,
    Math.max(ctx.measure(rightDj, djFont), ctx.measure(subLine, subFont)),
  )
  const headW = w - (rightW > 0 ? rightW + 32 * u : 0)
  const fontAt = (s: number) => font(theme.displayWeight, s, theme.displayFont)
  const headText = displayText(ctx, heading)
  const size = fitFontSize(headText, headW, fontAt, ctx.measure, 34 * u, 64 * u)
  const eyebrowFont = font(700, 18 * u, theme.monoFont)
  withShadow(ctx, () =>
    drawSpaced(
      ctx,
      `SETLIST · ${items.length} TRACKS`,
      x,
      y + 18 * u,
      eyebrowFont,
      pal.accent,
      4 * u,
    ),
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
        ellipsize(subLine, rightW || w * 0.42, subFont, ctx.measure),
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

  const footer = ctx.display.credit ? 34 * u : 0
  const area = { x, y, w, h: content.y + content.h - y - p * 0.6 - footer }
  const gap = 44 * u
  // 段の間の縦罫
  c.fillStyle = rgba(pal.fg, 0.18)
  c.fillRect(
    x + (w - gap) / 2 + gap / 2,
    area.y + 6 * u,
    Math.max(1, 1.5 * u),
    area.h - 12 * u,
  )
  const result = listRows(ctx, items, area, 2, gap, {
    single: { maxLine: 58, minLine: 28, maxFont: 26 },
    double: { maxLine: 170, minLine: 66, maxFont: 32 },
  })
  drawCredit(ctx, x, H - p * 0.5, 'left')
  return result
}

// ---------------------------------------------------------------------------
// レイアウト: ポスター
// ---------------------------------------------------------------------------

/** レコード盤のグラフィック */
function drawRecord(ctx: Ctx, cx: number, cy: number, r: number) {
  const { c, pal, u } = ctx
  c.save()
  c.fillStyle = rgba(pal.accent2, 0.14)
  c.beginPath()
  c.arc(cx, cy, r, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = rgba(pal.fg, 0.1)
  c.lineWidth = 1.6 * u
  for (let rr = r * 0.4; rr < r * 0.97; rr += 9 * u) {
    c.beginPath()
    c.arc(cx, cy, rr, 0, Math.PI * 2)
    c.stroke()
  }
  c.fillStyle = pal.accent
  c.beginPath()
  c.arc(cx, cy, r * 0.3, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = pal.bg
  c.beginPath()
  c.arc(cx, cy, Math.max(4 * u, r * 0.035), 0, Math.PI * 2)
  c.fill()
  // ラベルのハイライト（扇形）
  c.fillStyle = rgba(pal.onAccent, 0.18)
  c.beginPath()
  c.moveTo(cx, cy)
  c.arc(cx, cy, r * 0.3, -Math.PI * 0.85, -Math.PI * 0.55)
  c.closePath()
  c.fill()
  c.restore()
}

/** DJ 名を 1〜2 行で最大サイズに組む */
function fitHeadline(
  ctx: Ctx,
  text: string,
  width: number,
  maxSize: number,
  minSize: number,
  maxHeight: number,
): { lines: Array<string>; size: number } {
  const { theme } = ctx
  const fontAt = (s: number) => font(theme.displayWeight, s, theme.displayFont)
  const single = Math.min(
    fitFontSize(text, width, fontAt, ctx.measure, minSize, maxSize),
    maxHeight / 0.95,
  )
  let best = { lines: [text], size: single }
  const words = text.split(' ')
  if (words.length >= 2) {
    // 2 行に割ったときの最大サイズ（最も長い行で決まる）
    let bestSplit: { lines: Array<string>; size: number } | undefined
    for (let i = 1; i < words.length; i++) {
      const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')]
      const sizes = lines.map((l) =>
        fitFontSize(l, width, fontAt, ctx.measure, minSize, maxSize),
      )
      const size = Math.min(...sizes, maxHeight / (0.95 * 2))
      if (!bestSplit || size > bestSplit.size) bestSplit = { lines, size }
    }
    if (bestSplit && bestSplit.size > single * 1.25) best = bestSplit
  }
  return best
}

function renderPoster(
  ctx: Ctx,
  meta: Meta,
  items: ReadonlyArray<Item>,
  plan: PhotoPlan | null,
  hasBackgroundPhoto: boolean,
) {
  const { c, u, W, H, theme, pal } = ctx
  const landscape = isLandscape({ width: W, height: H })
  const p = 60 * u
  const bandH = (landscape ? 84 : 112) * u
  // テキストを置く領域（写真枠なら写真を除いた側）
  const area: Rect = plan
    ? plan.side === 'top'
      ? { x: 0, y: 0, w: W, h: H }
      : plan.content
    : { x: 0, y: 0, w: W, h: H }

  // --- グラフィック ---
  // 縦長・正方形のレコード盤は見出しの位置が決まってから置く（下の drawPortraitRecord）
  if (!plan && !hasBackgroundPhoto && landscape) {
    drawRecord(ctx, W * 0.36, H * 0.78, H * 0.62)
  } else if (plan && plan.side !== 'top') {
    // 写真の内側の縁にアクセントの柱
    const px =
      plan.side === 'right'
        ? plan.photo.x
        : plan.photo.x + plan.photo.w - 14 * u
    c.fillStyle = pal.accent
    c.fillRect(px, 0, 14 * u, H)
  }

  // --- 下の帯（日付・会場） ---
  const bandRect: Rect = { x: area.x, y: H - bandH, w: area.w, h: bandH }
  c.fillStyle = pal.accent
  c.fillRect(bandRect.x, bandRect.y, bandRect.w, bandRect.h)
  // 帯の上に細い 2 本線
  c.fillStyle = pal.fg
  c.fillRect(bandRect.x, bandRect.y - 16 * u, bandRect.w, 4 * u)
  const dateFont = font(800, (landscape ? 34 : 44) * u, theme.monoFont)
  const venueFont = font(800, (landscape ? 26 : 34) * u, theme.bodyFont)
  const bandMid = bandRect.y + bandH / 2
  const dateText = meta.date || `${items.length} TRACKS`
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
    const venueText = displayText(ctx, meta.venue)
    drawText(
      ctx,
      ellipsize(
        venueText,
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

  // --- 見出し ---
  const x = area.x + p
  const w = area.w - p * 2
  let y: number
  if (plan?.side === 'top') {
    // 写真の下端に DJ 名をまたがせる
    y = plan.photo.h - 20 * u
  } else {
    y = area.y + p
    const eyebrowFont = font(700, (landscape ? 18 : 24) * u, theme.monoFont)
    withShadow(ctx, () => {
      drawSpaced(ctx, 'SETLIST', x, y + 24 * u, eyebrowFont, pal.accent, 8 * u)
      drawText(
        ctx,
        `${items.length} TRACKS`,
        x + w,
        y + 24 * u,
        eyebrowFont,
        pal.muted,
        'right',
      )
    })
    y += 24 * u + 20 * u
    c.fillStyle = pal.fg
    c.fillRect(x, y, w, 10 * u)
    y += 10 * u + (landscape ? 30 : 48) * u
  }

  // 横長で写真が無いときは左半分が見出し、右半分が曲
  const splitLandscape = landscape && !plan
  const hw = splitLandscape ? W * 0.5 - p - 10 * u : w
  const headline = displayText(ctx, meta.dj || meta.event || 'SETLIST')
  const sub = meta.dj ? meta.event : ''
  const maxHead = landscape ? 150 * u : plan ? 170 * u : 210 * u
  const head = fitHeadline(
    ctx,
    headline,
    hw,
    maxHead,
    60 * u,
    landscape ? H * 0.34 : H * 0.28,
  )
  const headFont = font(theme.displayWeight, head.size, theme.displayFont)
  const lineGap = head.size * 0.95
  if (plan?.side === 'top') {
    // 2 行なら上の行を写真側へ持ち上げる
    y -= lineGap * (head.lines.length - 1)
  } else {
    y += head.size * 0.78
  }
  const subBox = (() => {
    if (!sub) return null
    const size = fitFontSize(
      sub,
      hw - 56 * u,
      (sz) => font(800, sz, theme.bodyFont),
      ctx.measure,
      30 * u,
      (landscape ? 40 : 54) * u,
    )
    const f = font(800, size, theme.bodyFont)
    const text = ellipsize(sub, hw - 56 * u, f, ctx.measure)
    return {
      size,
      font: f,
      text,
      w: ctx.measure(text, f) + 56 * u,
      h: size * 1.5,
    }
  })()

  // レコード盤: ラベルが見出しに重ならないよう、イベント名の帯の右隣に置く
  if (!plan && !hasBackgroundPhoto && !landscape) {
    const headBottom = y + lineGap * (head.lines.length - 1) + head.size * 0.22
    const r = 250 * u
    const cy = subBox ? headBottom + 26 * u + subBox.h / 2 : headBottom + 70 * u
    const labelR = r * 0.3
    const minX = x + (subBox ? subBox.w : 0) + labelR + 40 * u
    drawRecord(ctx, Math.max(minX, W - p - labelR - 20 * u), cy, r)
  }

  head.lines.forEach((line, i) => {
    drawDisplay(
      ctx,
      ellipsize(line, hw, headFont, ctx.measure),
      x,
      y + i * lineGap,
      headFont,
      pal.fg,
      {
        outline:
          plan?.side === 'top' || hasBackgroundPhoto ? pal.bg : undefined,
      },
    )
  })
  y += lineGap * (head.lines.length - 1) + head.size * 0.22

  // イベント名は傾けた帯に白抜き
  if (subBox) {
    const {
      size: subSize,
      font: subFont,
      text: subText,
      w: boxW,
      h: boxH,
    } = subBox
    y += 26 * u
    c.save()
    c.translate(x, y)
    c.rotate((-2.2 * Math.PI) / 180)
    if (theme.misregister) {
      c.fillStyle = rgba(pal.fg, 0.9)
      c.fillRect(8 * u, 6 * u, boxW, boxH)
    }
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
    y += boxH + 8 * u
  }

  // --- 曲（流し込み） ---
  const flowTop = y + (landscape ? 28 : 40) * u
  const credit = ctx.display.credit
  const flowBottom = bandRect.y - 16 * u - (credit ? 40 * u : 22 * u)
  let flowRect: Rect = { x, y: flowTop, w, h: flowBottom - flowTop }
  if (splitLandscape) {
    // 横長で写真が無いときは右半分に曲を流す（見出しは左）
    const split = W * 0.5
    flowRect = {
      x: split + 20 * u,
      y: area.y + p + 90 * u,
      w: W - split - 20 * u - p,
      h: flowBottom - (area.y + p + 90 * u),
    }
  }
  const sepRun: Run = { text: ' / ', role: 'sep' }
  const segments: Array<Array<Run>> = items.map((it) => {
    const runs: Array<Run> = []
    if (ctx.display.number) runs.push({ text: `${it.num} `, role: 'num' })
    if (it.artist)
      runs.push({ text: displayText(ctx, it.artist), role: 'artist' })
    if (it.title)
      runs.push({ text: it.artist ? ` ${it.title}` : it.title, role: 'title' })
    const metaText = it.meta.filter(Boolean).join(' ')
    if (metaText) runs.push({ text: ` ${metaText}`, role: 'meta' })
    return runs
  })
  const fontFor = (role: Run['role'], size: number) => {
    switch (role) {
      case 'num':
        return font(700, size * 0.72, theme.monoFont)
      case 'artist':
        return font(800, size, theme.bodyFont)
      case 'title':
        return font(400, size, theme.bodyFont)
      case 'meta':
        return font(500, size * 0.62, theme.monoFont)
      case 'sep':
        return font(400, size, theme.bodyFont)
    }
  }
  const flowOpts = {
    segments,
    separator: sepRun,
    width: flowRect.w,
    height: flowRect.h,
    lineHeightRatio: 1.36,
    min: 19 * u,
    max: (landscape ? 40 : 56) * u,
    fontFor,
    measure: ctx.measure,
  }
  let flow = fitFlow(flowOpts)
  // ほとんど 1 行 1 曲になるなら、ときどき 2 曲並ぶ行が混ざるより
  // 全部 1 行 1 曲に揃えた方が整って見える
  if (
    !flow.overflow &&
    flow.lines.length > 1 &&
    flow.placed / flow.lines.length < 1.6
  ) {
    // 1 行 1 曲では、8 割の曲が省略なしで収まるサイズを上限にする
    // （幅は文字サイズにほぼ比例するので 100px で測って割り戻す）
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
    const each = fitFlow({
      ...flowOpts,
      max: Math.min(flow.size, cap),
      breakEach: true,
    })
    if (!each.overflow && each.size >= flow.size * 0.6) {
      // 余った高さは行間に配って、下に大きな空きを残さない
      const spread = Math.min(
        flowRect.h / Math.max(1, each.lines.length),
        each.size * 1.75,
      )
      flow = { ...each, lineHeight: Math.max(each.lineHeight, spread) }
    }
  }
  const colorFor = (role: Run['role']) =>
    role === 'num' || role === 'sep'
      ? pal.accent
      : role === 'meta'
        ? pal.muted
        : pal.fg
  // 余白が残るときは曲のブロックを上下中央に置いて、見出しと帯の間で釣り合わせる
  const leftover = Math.max(0, flowRect.h - flow.lines.length * flow.lineHeight)
  const flowY = flowRect.y + leftover / 2
  withShadow(ctx, () => {
    flow.lines.forEach((line, i) => {
      const ly = flowY + flow.lineHeight * (i + 0.5)
      for (const run of line) {
        drawText(
          ctx,
          run.text,
          flowRect.x + run.x,
          ly,
          fontFor(run.role, flow.size),
          colorFor(run.role),
          'left',
          'middle',
        )
      }
    })
  })
  const hidden = items.length - flow.placed
  if (hidden > 0) {
    const f = font(700, flow.size * 0.8, theme.bodyFont)
    drawText(
      ctx,
      `+ ${moreLabel(hidden)}`,
      flowRect.x + flowRect.w,
      flowBottom + 6 * u,
      f,
      pal.accent,
      'right',
      'alphabetic',
    )
  }
  if (credit) {
    if (splitLandscape) {
      drawCredit(ctx, flowRect.x + flowRect.w, bandRect.y - 30 * u, 'right')
    } else {
      drawCredit(ctx, x, bandRect.y - 30 * u, 'left')
    }
  }
  return { overflow: hidden > 0, hidden }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

function resolvePalette(
  theme: Theme,
  photo: RenderInput['photo'],
  mode: PhotoMode | null,
): Palette {
  const bgRgb = hexToRgb(theme.bg)
  let fg = theme.fg
  let muted = theme.muted
  let accent = hexToRgb(theme.accent)
  let textShadow: string | null = null
  let effectiveBg = bgRgb
  if (photo && mode === 'background') {
    const avg = effectiveAverage(photo.image, photo.settings.tint, theme)
    effectiveBg = mix(avg, bgRgb, photo.settings.dim)
    const fgRgb = hexToRgb(fg)
    if (contrastRatio(fgRgb, effectiveBg) < 4.5) {
      const readable = readableOn(effectiveBg)
      fg = hex(readable)
      muted = hex(mix(readable, effectiveBg, 0.28))
    } else if (contrastRatio(hexToRgb(muted), effectiveBg) < 3) {
      muted = hex(mix(fgRgb, effectiveBg, 0.25))
    }
    accent = ensureContrast(accent, effectiveBg, 3)
    textShadow = rgba(hex(readableOn(hexToRgb(fg))), 0.45)
  } else if (photo?.settings.useImageAccent) {
    accent = ensureContrast(accent, bgRgb, 2.6)
  }
  return {
    bg: theme.bg,
    bg2: theme.bg2,
    fg,
    muted,
    accent: hex(accent),
    accent2: theme.accent2,
    onAccent: hex(readableOn(accent)),
    textShadow,
  }
}

function setupCtx(
  c: CanvasRenderingContext2D,
  input: RenderInput,
  theme: Theme,
  mode: PhotoMode | null,
): Ctx {
  const { width: W, height: H } = input.size
  return {
    c,
    W,
    H,
    u: Math.min(W, H) / 1080,
    theme,
    pal: resolvePalette(theme, input.photo, mode),
    measure: createMeasure(c),
    display: input.display,
  }
}

function paint(
  c: CanvasRenderingContext2D,
  input: RenderInput,
  theme: Theme,
  mode: PhotoMode | null,
): { overflow: boolean; hidden: number; photoRect: Rect | null } {
  const ctx = setupCtx(c, input, theme, mode)
  const { W, H } = ctx
  c.save()
  c.clearRect(0, 0, W, H)
  drawBackground(ctx)
  const plan =
    mode === 'block' ? planPhotoBlock(input.layout, input.size) : null
  let photoRect: Rect | null = null
  if (input.photo && mode === 'background') {
    photoRect = { x: 0, y: 0, w: W, h: H }
    drawPhoto(
      ctx,
      input.photo.image,
      input.photo.settings,
      photoRect,
      'background',
    )
  }
  drawTexture(ctx)
  if (input.photo && plan) {
    photoRect = plan.photo
    drawPhoto(ctx, input.photo.image, input.photo.settings, plan.photo, 'block')
  }
  const meta = metaOf(input.setlist)
  const items = toItems(input.setlist.tracks, input.display)
  const content = plan ? plan.content : { x: 0, y: 0, w: W, h: H }
  let result: { overflow: boolean; hidden: number }
  switch (input.layout) {
    case 'list':
      result = renderList(ctx, meta, items, content, plan)
      break
    case 'columns':
      result = renderColumns(ctx, meta, items, content, plan)
      break
    case 'poster':
      result = renderPoster(ctx, meta, items, plan, mode === 'background')
      break
  }
  if (items.length === 0) {
    // まだ曲が無いときの案内（書き出す前提ではないプレビュー用）
    drawText(
      ctx,
      '履歴ファイルを読み込むと、ここに曲が並びます',
      W / 2,
      H * 0.6,
      font(500, 30 * ctx.u, input.theme.bodyFont),
      ctx.pal.muted,
      'center',
      'middle',
    )
  }
  c.restore()
  return { ...result, photoRect }
}

/**
 * 1 枚描く。写真枠で曲があふれるときは、全面背景なら入るか試して切り替える
 * （写真のために曲が欠けるより、背景に回して全部載せる方を優先する）。
 */
export function renderSetlist(
  c: CanvasRenderingContext2D,
  input: RenderInput,
): RenderInfo {
  const baseTheme = input.theme
  const theme =
    input.photo?.settings.useImageAccent === true
      ? withAccent(baseTheme, input.photo.image.accent)
      : baseTheme
  if (!input.photo) {
    const r = paint(c, input, theme, null)
    return {
      overflow: r.overflow,
      hiddenCount: r.hidden,
      photoMode: null,
      photoRect: null,
      photoFallback: false,
    }
  }
  let mode = input.photo.settings.mode
  let fallback = false
  if (mode === 'block' && !planPhotoBlock(input.layout, input.size)) {
    mode = 'background'
    fallback = true
  }
  let r = paint(c, input, theme, mode)
  if (mode === 'block' && r.overflow) {
    const alt = paint(c, input, theme, 'background')
    if (alt.overflow) {
      // 背景にしても入らないなら、写真枠のまま描き直す（ユーザーの選択を尊重）
      r = paint(c, input, theme, 'block')
    } else {
      r = alt
      mode = 'background'
      fallback = true
    }
  }
  return {
    overflow: r.overflow,
    hiddenCount: r.hidden,
    photoMode: mode,
    photoRect: r.photoRect,
    photoFallback: fallback,
  }
}
