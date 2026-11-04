/**
 * セトリ画像を Canvas 2D に描く。
 * プレビューも書き出しも同じ関数・同じ解像度で描き、プレビューは CSS で縮めるだけ
 * にしているので、見たものと書き出した PNG が一致する。
 *
 * 曲が多いときは 1 枚を複数ページに分けられる（renderPage を枚数ぶん呼ぶ）。
 * 2 枚目以降は 1 枚目と同じ組み方（段数・行の形・文字サイズ）にそろえる。
 */
import { cleanArtistName, cleanTitle } from './clean'
import {
  contrastRatio,
  ensureContrast,
  hexToRgb,
  mix,
  readableOn,
  rgbToHex,
  rgba,
} from './color'
import { ellipsize, fitFlow, fitFontSize } from './fit'
import {
  MAX_PAGES,
  columnOptions,
  distributePages,
  isLandscape,
  maxColumnsFor,
  minLegibleFont,
  placeDisc,
  planPhotoBlock,
} from './layouts'
import { effectiveAverage, processedPhoto } from './photo'
import { fitRowsLayout } from './rows'
import { formatBpm, formatOffset } from './text'
import { withAccent } from './themes'
import type { RGB } from './color'
import type { Measure, Rect, Run } from './fit'
import type {
  CanvasSize,
  ColumnsSetting,
  LayoutId,
  PhotoMode,
  PhotoPlan,
  PhotoSettings,
} from './layouts'
import type { LoadedPhoto } from './photo'
import type {
  FontFor,
  RowItem,
  RowParams,
  RowStyle,
  RowsInput,
  RowsLayout,
} from './rows'
import type { LongTextMode } from './textfit'
import type { Theme } from './themes'
import type { Setlist, Track } from './types'

export type DisplayOptions = {
  number: boolean
  bpm: boolean
  key: boolean
  time: boolean
  credit: boolean
}

export type TextOptions = {
  longText: LongTextMode
  stripMix: boolean
  stripFeat: boolean
}

export type SplitOptions = {
  enabled: boolean
  mode: 'auto' | 'manual'
  /** 手動のときの枚数 */
  count: number
}

export type RenderInput = {
  setlist: Setlist
  layout: LayoutId
  size: CanvasSize
  theme: Theme
  display: DisplayOptions
  text: TextOptions
  columns: ColumnsSetting
  split: SplitOptions
  photo: { image: LoadedPhoto; settings: PhotoSettings } | null
}

/** 何枚目か（start / end は全曲の中の範囲） */
export type PageSpec = {
  index: number
  count: number
  start: number
  end: number
}

/** 1 枚目の組み方。2 枚目以降をこれにそろえる */
export type PageLock = {
  /** ポスターで見出しを小さくした組みを使ったか */
  posterTight?: boolean
  rows?: RowParams
  flow?: { size: number; each: boolean; large: boolean; metaShown: number }
}

export type MetaKey = 'time' | 'bpm' | 'key'
export const META_LABELS: Record<MetaKey, string> = {
  time: '開始時刻',
  bpm: 'BPM',
  key: 'Key',
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
  /** 幅が足りずに隠した補足列 */
  hiddenMeta: Array<MetaKey>
  lock: PageLock
  /** 曲の文字サイズ（ページ数の自動決定に使う） */
  textSize: number
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
  /** 読める最小の文字サイズ */
  minFont: number
  theme: Theme
  pal: Palette
  measure: Measure
  display: DisplayOptions
  text: TextOptions
}

const hex = (rgb: RGB) => rgbToHex(rgb)

// ---------------------------------------------------------------------------
// 文字の基本
// ---------------------------------------------------------------------------

function font(weight: number, size: number, family: string): string {
  return `${weight} ${Math.max(1, Math.round(size * 10) / 10)}px ${family}`
}

let scratch: CanvasRenderingContext2D | null = null

/** 計測と「高さだけ知りたい」下描き用の 1px canvas */
function scratchContext(): CanvasRenderingContext2D {
  if (!scratch) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    scratch = canvas.getContext('2d')
  }
  if (!scratch)
    throw new Error('canvas の 2D コンテキストを取得できませんでした')
  return scratch
}

const measureMemo = new Map<string, number>()

/** 文字幅の計測（書体 + 文字列でメモ化。ページ数の試算で何度も測るため） */
const sharedMeasure: Measure = (text, f) => {
  const key = `${f}\u0000${text}`
  const hit = measureMemo.get(key)
  if (hit !== undefined) return hit
  const c = scratchContext()
  c.font = f
  const width = c.measureText(text).width
  if (measureMemo.size > 60000) measureMemo.clear()
  measureMemo.set(key, width)
  return width
}

/** フォントの読み込みで幅が変わるので、そのときはメモを捨てる */
export function resetMeasureCache(): void {
  measureMemo.clear()
}

/** 横倍率つきで描く（「縮める」モード） */
function drawScaled(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  f: string,
  color: string,
  align: CanvasTextAlign,
  baseline: CanvasTextBaseline,
  scaleX: number,
) {
  if (scaleX >= 0.999) {
    drawText(ctx, text, x, y, f, color, align, baseline)
    return
  }
  const { c } = ctx
  c.save()
  c.translate(x, y)
  c.scale(scaleX, 1)
  drawText(ctx, text, 0, 0, f, color, align, baseline)
  c.restore()
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
// 飾り
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

// ---------------------------------------------------------------------------
// 曲データ → 表示用
// ---------------------------------------------------------------------------

function toItems(
  tracks: ReadonlyArray<Track>,
  display: DisplayOptions,
  text: TextOptions,
): { items: Array<RowItem>; metaKeys: Array<MetaKey> } {
  const starts = tracks
    .map((t) => t.startAt)
    .filter((v): v is number => v !== undefined)
  const origin = starts.length > 0 ? Math.min(...starts) : undefined
  const keys: Array<MetaKey> = ['time', 'bpm', 'key']
  const raw = tracks.map((track) => ({
    time:
      display.time && track.startAt !== undefined && origin !== undefined
        ? formatOffset(track.startAt - origin)
        : '',
    bpm: display.bpm && track.bpm !== undefined ? formatBpm(track.bpm) : '',
    key: display.key && track.key ? track.key : '',
  }))
  // 1 曲も値が無い列は詰める
  const metaKeys = keys.filter((k) => raw.some((r) => r[k] !== ''))
  const items = tracks.map((track, index) => ({
    num: String(index + 1).padStart(2, '0'),
    artist: cleanArtistName(track.artist, text),
    title: cleanTitle(track.title, text),
    meta: metaKeys.map((k) => raw[index][k]),
  }))
  return { items, metaKeys }
}

// ---------------------------------------------------------------------------
// 行（リスト / 段組み / ポスターの大きな文字）
// ---------------------------------------------------------------------------

function listFonts(ctx: Ctx): FontFor {
  const { theme } = ctx
  return (role, size, style) => {
    switch (role) {
      case 'num':
        return font(700, size * 0.8, theme.monoFont)
      case 'artist':
        return font(700, size, theme.bodyFont)
      case 'title':
      case 'sep':
        return font(400, size, theme.bodyFont)
      case 'meta':
        return font(
          500,
          size * (style === 'compact' ? 0.66 : 0.74),
          theme.monoFont,
        )
      case 'more':
        return font(600, size * 0.9, theme.bodyFont)
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
  const f = font(500, 17 * ctx.u, ctx.theme.bodyFont)
  ctx.c.save()
  ctx.c.globalAlpha = 0.7
  drawText(ctx, CREDIT_TEXT, x, y, f, ctx.pal.muted, align)
  ctx.c.restore()
}

// ---------------------------------------------------------------------------
// 見出し（リスト / 段組み）
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

function pageLabel(page: PageSpec): string {
  return page.count > 1 ? `${page.index + 1}/${page.count}` : ''
}

/** 高さだけ知りたいブロックを 1px canvas に描かせる */
function measureHeight(ctx: Ctx, draw: (dry: Ctx) => number): number {
  return draw({ ...ctx, c: scratchContext() })
}

/** リストの見出しブロック（1 枚目）。描いた高さを返す */
function drawListHeader(
  ctx: Ctx,
  meta: Meta,
  rect: Rect,
  total: number,
  page: PageSpec,
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
  const headingText = displayText(ctx, heading)
  const fontAt = (s: number) => font(theme.displayWeight, s, theme.displayFont)
  const size = fitFontSize(headingText, w, fontAt, ctx.measure, 44 * u, 92 * u)
  const shown = ellipsize(headingText, w, fontAt(size), ctx.measure)
  y += size * 0.86
  drawDisplay(ctx, shown, rect.x, y, fontAt(size), pal.fg)
  y += size * 0.3

  const sub = meta.event ? meta.dj : ''
  if (sub) {
    // 長い DJ 名（b2b など）は小さくしてから省略する
    const subAt = (s: number) => font(700, s, theme.bodyFont)
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

/** 2 枚目以降の小さな見出し（イベント名 / DJ 名とページ番号）。高さを返す */
function drawCompactHeader(
  ctx: Ctx,
  meta: Meta,
  rect: Rect,
  total: number,
  page: PageSpec,
): number {
  const { u, theme, pal } = ctx
  const label = `${page.index + 1} / ${page.count}`
  const labelFont = font(800, 40 * u, theme.monoFont)
  const labelW = ctx.measure(label, labelFont)
  const eyebrowFont = font(700, 20 * u, theme.monoFont)
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
  const headAt = (s: number) => font(800, s, theme.bodyFont)
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

type LayoutResult = {
  overflow: boolean
  hidden: number
  lock: PageLock
  textSize: number
  metaShown: number
}

function fromRows(layout: RowsLayout): LayoutResult {
  return {
    overflow: layout.overflow,
    hidden: layout.hidden,
    lock: {
      rows: {
        columns: layout.columns,
        style: layout.style,
        size: layout.size,
        metaShown: layout.metaShown,
      },
    },
    textSize: layout.size,
    metaShown: layout.metaShown,
  }
}

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
    const layout = fitRowsLayout(
      rowsInput(ctx, items, area, 0, listFonts(ctx)),
      {
        columnsOptions: [1],
        sizeRange: listSizeRange(ctx),
        lock: lock?.rows,
      },
    )
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
  const { u, theme, pal, H } = ctx
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
    const djAt = (s: number) => font(800, s, theme.bodyFont)
    const subFont = font(500, 22 * u, theme.monoFont)
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
    const fontAt = (s: number) =>
      font(theme.displayWeight, s, theme.displayFont)
    const headText = displayText(ctx, heading)
    const size = fitFontSize(
      headText,
      headW,
      fontAt,
      ctx.measure,
      34 * u,
      64 * u,
    )
    const eyebrowFont = font(700, 18 * u, theme.monoFont)
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
  const layout = fitRowsLayout(
    rowsInput(ctx, items, area, gap, listFonts(ctx)),
    {
      columnsOptions: columnOptions(
        columnsSetting,
        maxColumnsFor({ width: ctx.W }, w, gap),
      ),
      sizeRange: listSizeRange(ctx),
      lock: lock?.rows,
    },
  )
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
  const { theme } = ctx
  const fontAt = (s: number) => font(theme.displayWeight, s, theme.displayFont)
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

function posterFonts(ctx: Ctx): FontFor {
  const { theme } = ctx
  return (role, size) => {
    switch (role) {
      case 'num':
        return font(700, size * 0.62, theme.monoFont)
      case 'artist':
        return font(800, size, theme.bodyFont)
      case 'title':
      case 'sep':
        return font(400, size * 0.84, theme.bodyFont)
      case 'meta':
        return font(500, size * 0.5, theme.monoFont)
      case 'more':
        return font(700, size * 0.7, theme.bodyFont)
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
  const { c, u, W, H, theme, pal } = ctx
  const landscape = isLandscape({ width: W, height: H })
  const p = 60 * u
  const bandH = (landscape ? 84 : 112) * u
  // 文字の領域（写真枠なら写真を除いた側）
  const area: Rect =
    plan && plan.side !== 'top' ? plan.content : { x: 0, y: 0, w: W, h: H }
  // 先に全部の位置を決めてから、文字を避けてレコード盤を置き、最後に文字を描く
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
    const dateFont = font(800, (landscape ? 34 : 44) * u, theme.monoFont)
    const venueFont = font(800, (landscape ? 26 : 34) * u, theme.bodyFont)
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
          displayText(ctx, meta.venue),
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
  const headline = displayText(ctx, meta.dj || meta.event || 'SETLIST')
  const sub = meta.dj ? meta.event : ''
  const straddlePlan = plan?.side === 'top' && page.index === 0 ? plan : null
  const straddle = straddlePlan !== null
  let y: number
  if (straddlePlan) {
    // 写真の下端に DJ 名をまたがせる
    y = straddlePlan.photo.h - 20 * u
  } else {
    y = area.y + p
    const eyebrowFont = font(700, (landscape ? 18 : 24) * u, theme.monoFont)
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
  const headFont = font(theme.displayWeight, head.size, theme.displayFont)
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
      (sz) => font(800, sz, theme.bodyFont),
      ctx.measure,
      30 * u,
      (landscape ? 40 : 54) * u,
    )
    const subFont = font(800, subSize, theme.bodyFont)
    const subText = ellipsize(sub, hw - 56 * u, subFont, ctx.measure)
    const boxW = ctx.measure(subText, subFont) + 56 * u
    const boxH = subSize * 1.5
    y += 26 * u
    const by = y
    avoid.push({ x, y: by - 14 * u, w: boxW + 14 * u, h: boxH + 30 * u })
    ops.push(() => {
      c.save()
      c.translate(x, by)
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
    artist: displayText(ctx, it.artist),
  }))

  // A: 大きな文字の 2 行組みリスト（曲が少ないとき）
  const fonts = posterFonts(ctx)
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
      const f = font(700, flow.size * 0.8, theme.bodyFont)
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
    // レコード盤: 文字と重ならない場所が見つかったときだけ、文字の後ろに置く
    if (!plan && !hasBackgroundPhoto) {
      const disc = placeDisc({
        width: W,
        height: H,
        avoid,
        radii: [340, 300, 260, 230, 200, 170, 140].map((r) => r * u),
        margin: 20 * u,
        step: 16 * u,
      })
      if (disc) drawRecord(ctx, disc.cx, disc.cy, disc.r)
    }
    for (const op of ops) op()
  }
  return { result, draw }
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
    minFont: minLegibleFont(input.size),
    theme,
    pal: resolvePalette(theme, input.photo, mode),
    measure: sharedMeasure,
    display: input.display,
    text: input.text,
  }
}

type PaintResult = LayoutResult & { photoRect: Rect | null }

function paint(
  c: CanvasRenderingContext2D,
  input: RenderInput,
  theme: Theme,
  mode: PhotoMode | null,
  page: PageSpec,
  lock: PageLock | undefined,
  dry: boolean,
): PaintResult {
  const ctx = setupCtx(c, input, theme, mode)
  const { W, H } = ctx
  // 写真枠は 1 枚目だけ（2 枚目以降は曲に場所を回す）
  const plan =
    mode === 'block' && page.index === 0
      ? planPhotoBlock(input.layout, input.size)
      : null
  c.save()
  let photoRect: Rect | null = null
  if (!dry) {
    c.clearRect(0, 0, W, H)
    drawBackground(ctx)
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
      drawPhoto(
        ctx,
        input.photo.image,
        input.photo.settings,
        plan.photo,
        'block',
      )
    }
  }
  const meta = metaOf(input.setlist)
  const { items: all } = toItems(
    input.setlist.tracks,
    input.display,
    input.text,
  )
  const items = all.slice(page.start, page.end)
  const total = all.length
  const content = plan ? plan.content : { x: 0, y: 0, w: W, h: H }
  let result: LayoutResult
  switch (input.layout) {
    case 'list':
      result = renderList(ctx, meta, items, content, plan, page, total, lock)
      break
    case 'columns':
      result = renderColumns(
        ctx,
        meta,
        items,
        content,
        page,
        total,
        lock,
        input.columns,
      )
      break
    case 'poster':
      result = renderPoster(
        ctx,
        meta,
        items,
        plan,
        mode === 'background',
        page,
        total,
        lock,
      )
      break
  }
  if (all.length === 0) {
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

function themeFor(input: RenderInput): Theme {
  return input.photo?.settings.useImageAccent === true
    ? withAccent(input.theme, input.photo.image.accent)
    : input.theme
}

function hiddenMetaOf(input: RenderInput, shown: number): Array<MetaKey> {
  const { metaKeys } = toItems(input.setlist.tracks, input.display, input.text)
  return metaKeys.slice(shown)
}

/**
 * 1 枚描く。写真枠で曲があふれるときは、全面背景なら入るか試して切り替える
 * （複数枚に分ける設定のときはページで解決するので切り替えない）。
 * dry なら背景や写真を描かずに組み方だけ計算する（ページ数の試算用）。
 */
export function renderPage(
  c: CanvasRenderingContext2D,
  input: RenderInput,
  page: PageSpec,
  lock?: PageLock,
  dry = false,
): RenderInfo {
  const theme = themeFor(input)
  const info = (
    r: PaintResult,
    mode: PhotoMode | null,
    fallback: boolean,
  ): RenderInfo => ({
    overflow: r.overflow,
    hiddenCount: r.hidden,
    photoMode: mode,
    photoRect: r.photoRect,
    photoFallback: fallback,
    hiddenMeta: hiddenMetaOf(input, r.metaShown),
    lock: r.lock,
    textSize: r.textSize,
  })
  if (!input.photo)
    return info(paint(c, input, theme, null, page, lock, dry), null, false)

  let mode = input.photo.settings.mode
  let fallback = false
  if (mode === 'block' && !planPhotoBlock(input.layout, input.size)) {
    mode = 'background'
    fallback = true
  }
  let r = paint(c, input, theme, mode, page, lock, dry)
  if (
    mode === 'block' &&
    r.overflow &&
    !input.split.enabled &&
    page.index === 0
  ) {
    const alt = paint(c, input, theme, 'background', page, lock, dry)
    if (alt.overflow) {
      // 背景にしても入らないなら、写真枠のまま描き直す（ユーザーの選択を尊重）
      r = paint(c, input, theme, 'block', page, lock, dry)
    } else {
      r = alt
      mode = 'background'
      fallback = true
    }
  }
  return info(r, mode, fallback)
}

export type PagePlan = {
  pages: Array<PageSpec>
  auto: boolean
  /** 全ページをそろえる組み方（分割しないときは無し） */
  lock?: PageLock
  /** 最後のページに入りきらない曲があるか */
  overflow: boolean
}

function toSpecs(
  ranges: Array<{ start: number; end: number }>,
): Array<PageSpec> {
  return ranges.map((r, index) => ({
    index,
    count: ranges.length,
    start: r.start,
    end: r.end,
  }))
}

/**
 * count 枚に割り付ける。1 枚目に均等割りぶんの曲を入れて組み方（lock）を決め、
 * 以降は全ページをその組み方で、実際に入る曲数を測りながら詰める。
 * 入りきらない曲は次のページへ送り、「ほか N 曲」は最後のページにしか出ない。
 */
function planWith(
  input: RenderInput,
  count: number,
): { plan: PagePlan; textSize: number } {
  const n = input.setlist.tracks.length
  const c = scratchContext()
  const spec = (index: number, start: number, end: number): PageSpec => ({
    index,
    count,
    start,
    end,
  })
  const first = renderPage(
    c,
    input,
    spec(0, 0, Math.ceil(n / count)),
    undefined,
    true,
  )
  const lock = first.lock
  const fits = (index: number, start: number, k: number) =>
    !renderPage(c, input, spec(index, start, start + k), lock, true).overflow
  const capacity = (index: number, start: number, want: number) => {
    if (fits(index, start, want)) return want
    let lo = 0
    let hi = want
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      if (fits(index, start, mid)) lo = mid
      else hi = mid
    }
    return lo
  }
  const { ranges, overflow } = distributePages(n, count, capacity)
  return {
    plan: { pages: toSpecs(ranges), auto: false, lock, overflow },
    textSize: first.textSize,
  }
}

/**
 * 何枚に分けるか決める。
 * 自動なら、全曲が入り、かつ 1 枚目の文字が「最小サイズの 1.15 倍以上」（ポスターは
 * 最小サイズ以上）になる最小の枚数。届かなければ全曲が入る最小の枚数。
 * 手動なら指定の枚数で割り付け、入りきらなければ最後のページで「ほか N 曲」。
 */
export function planPages(input: RenderInput): PagePlan {
  const n = input.setlist.tracks.length
  if (!input.split.enabled || n === 0) {
    return {
      pages: toSpecs([{ start: 0, end: n }]),
      auto: false,
      overflow: false,
    }
  }
  const limit = Math.min(MAX_PAGES, Math.max(1, n))
  if (input.split.mode === 'manual') {
    return planWith(input, Math.min(limit, Math.max(1, input.split.count))).plan
  }
  // リスト系は最小サイズより一回り大きく読めるまで枚数を増やす。ポスターは
  // 流し込みの密度そのものが見せ方なので、最小サイズで入れば増やさない
  const comfortable =
    minLegibleFont(input.size) * (input.layout === 'poster' ? 1 : 1.15)
  let firstFit: PagePlan | undefined
  let last: PagePlan | undefined
  for (let count = 1; count <= limit; count++) {
    const { plan, textSize } = planWith(input, count)
    last = plan
    if (plan.overflow) continue
    firstFit ??= plan
    if (textSize >= comfortable) return { ...plan, auto: true }
  }
  const chosen = firstFit ?? last
  return chosen
    ? { ...chosen, auto: true }
    : { pages: toSpecs([{ start: 0, end: n }]), auto: true, overflow: true }
}
