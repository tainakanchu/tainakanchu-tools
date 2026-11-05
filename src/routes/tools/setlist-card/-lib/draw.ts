/**
 * テンプレートが共有する描画の部品（canvas 依存）。
 * - 書体の指定（字間・字幅つき）と計測
 * - 文字を描く・文字の範囲を記録する（写真の上の読みやすさの判定に使う）
 * - 曲の行・罫線・ページ見出し・クレジット・幕・粒子
 */
import { contrastRatio, hexToRgb, rgba } from './color'
import { mulberry32 } from './random'
import {
  font,
  fontSize,
  forScript,
  noteFontUse,
  parseFont,
  withScript,
} from './fonts'
import { detectScript } from './script'
import type { Measure, Rect } from './fit'
import type { FontOpts } from './fonts'
import type { FontFamily } from './layouts'
import type { Palette } from './palettes'
import type { PlacedMark } from './redact'
import type { Role as RowRole, RowsLayout } from './rows'
import type { LongTextMode } from './textfit'

export type DisplayOptions = {
  number: boolean
  bpm: boolean
  key: boolean
  label: boolean
  credit: boolean
}

export type TextOptions = {
  longText: LongTextMode
  stripMix: boolean
  stripFeat: boolean
}

export type SeparatorId = 'slash' | 'dash' | 'dot' | 'space' | 'stack'

export const SEPARATORS: ReadonlyArray<{
  id: SeparatorId
  label: string
  text: string
}> = [
  { id: 'dash', label: '—', text: ' — ' },
  { id: 'slash', label: '／', text: ' ／ ' },
  { id: 'dot', label: '·', text: ' · ' },
  { id: 'space', label: '空白', text: '   ' },
  { id: 'stack', label: '改行', text: ' — ' },
]

export function separatorText(id: SeparatorId): string {
  return SEPARATORS.find((s) => s.id === id)?.text ?? ' — '
}

/** 書体・区切りなどの文字組みの設定（テンプレートを選ぶと既定に戻る） */
export type StyleOptions = {
  family: FontFamily
  /** 番号・補足列を等幅にする */
  monoMeta: boolean
  separator: SeparatorId
  /** 粒子（グレイン） */
  grain: boolean
  /** トラックリストで A1 / A2 … の面ごとの番号にする */
  sideNumbers: boolean
}

/** 描画で使う色（パレットの役割から。写真の上では読みやすさに合わせて補正する） */
export type Colors = {
  bg: string
  fg: string
  muted: string
  accent: string
  accent2: string
  rule: string
  scrim: string
  /** 差し色の上の文字 */
  onAccent: string
  /** 2 つ目の差し色の上の文字 */
  onAccent2: string
}

/** 文字の範囲（zone は写真の幕の区域。負なら不透明な面の上なので判定しない） */
export type TextBox = Rect & { zone: number }

export type Ctx = {
  c: CanvasRenderingContext2D
  /** 論理 px の幅と高さ（書き出しの倍率に関係なく 4:5 なら 1080×1350） */
  W: number
  H: number
  /**
   * 書き出しの倍率（canvas の画素 / 論理 px）。c には scale が掛かっているので、
   * ふだんは論理 px のまま描けばよい。shadowBlur・filter・画素を直接作る加工だけ
   * これで装置の px に直す。
   */
  scale: number
  /** 文字や余白の単位（幅 1080px 基準。横長は高さで抑える） */
  s: number
  /** 読める最小の文字サイズ */
  minFont: number
  pal: Colors
  /** パレットそのままの色（写真の上で補正する前。不透明な面の上の文字に使う） */
  base: Colors
  palette: Palette
  measure: Measure
  display: DisplayOptions
  text: TextOptions
  style: StyleOptions
  /** ストーリーズの UI に隠れる上下の帯（文字を置かない） */
  safe: { top: number; bottom: number }
  /** 文字を描いた範囲を集める（写真の上の判定用の下描きのときだけ） */
  boxes: Array<TextBox> | null
  /** 今描いている文字の幕の区域 */
  zone: number
  /** 写真の上に文字を描くか（全面背景） */
  onPhoto: boolean
}

// ---------------------------------------------------------------------------
// 書体
// ---------------------------------------------------------------------------

export { font, fontSize, forText, withScript }
export type { FontOpts }

/** 文字体系がまだ決まっていない font を、描く・測る文字列から決める */
function forText(f: string, text: string): string {
  return forScript(f, () => detectScript(text))
}

const supportsLetterSpacing =
  typeof CanvasRenderingContext2D !== 'undefined' &&
  'letterSpacing' in CanvasRenderingContext2D.prototype
const supportsStretch =
  typeof CanvasRenderingContext2D !== 'undefined' &&
  'fontStretch' in CanvasRenderingContext2D.prototype

const STRETCHES: ReadonlyArray<string> = [
  'normal',
  'semi-condensed',
  'condensed',
]
const isStretch = (v: string): v is CanvasFontStretch => STRETCHES.includes(v)

export function applyFont(c: CanvasRenderingContext2D, f: string): void {
  const p = parseFont(f)
  c.font = p.css
  // font を設定すると字幅は normal に戻るので、その後で設定する
  if (supportsStretch && isStretch(p.stretch)) c.fontStretch = p.stretch
  if (supportsLetterSpacing) {
    c.letterSpacing = p.tracking
      ? `${(p.tracking * fontSize(p.css)).toFixed(2)}px`
      : '0px'
  }
}

let scratch: CanvasRenderingContext2D | null = null

/** 計測と「高さだけ知りたい」下描き用の 1px canvas */
export function scratchContext(): CanvasRenderingContext2D {
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
export const sharedMeasure: Measure = (text, given) => {
  const key = `${given}\u0000${text}`
  const hit = measureMemo.get(key)
  if (hit !== undefined) return hit
  // 描くときと同じく、文字体系の決まっていない font は測る文字列から決める
  const f = forText(given, text)
  const c = scratchContext()
  applyFont(c, f)
  const p = parseFont(f)
  noteFontUse(p.css, text)
  let width = c.measureText(text).width
  // letterSpacing は最後の文字の後ろにも付くので、その分を引く
  if (p.tracking && supportsLetterSpacing && text.length > 0) {
    width -= p.tracking * fontSize(p.css)
  }
  if (measureMemo.size > 60000) measureMemo.clear()
  measureMemo.set(key, width)
  return width
}

/** フォントの読み込みで幅が変わるので、そのときはメモを捨てる */
export function resetMeasureCache(): void {
  measureMemo.clear()
}

// ---------------------------------------------------------------------------
// 文字
// ---------------------------------------------------------------------------

function recordBox(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  f: string,
  align: CanvasTextAlign,
  baseline: CanvasTextBaseline,
  scaleX: number,
) {
  if (!ctx.boxes) return
  const size = fontSize(parseFont(f).css)
  const w = ctx.measure(text, f) * scaleX
  const left =
    align === 'right' || align === 'end'
      ? x - w
      : align === 'center'
        ? x - w / 2
        : x
  const top =
    baseline === 'middle'
      ? y - size * 0.55
      : baseline === 'top'
        ? y
        : y - size * 0.8
  ctx.boxes.push({ x: left, y: top, w, h: size * 1.05, zone: ctx.zone })
}

export function drawText(
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
  recordBox(ctx, text, x, y, f, align, baseline, 1)
  const { c } = ctx
  const resolved = forText(f, text)
  applyFont(c, resolved)
  noteFontUse(parseFont(resolved).css, text)
  c.fillStyle = color
  c.textAlign = align
  c.textBaseline = baseline
  c.fillText(text, x, y)
}

/** 横倍率つきで描く（「縮める」モード） */
export function drawScaled(
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
  recordBox(ctx, text, x, y, f, align, baseline, scaleX)
  const boxes = ctx.boxes
  ctx.boxes = null
  const { c } = ctx
  c.save()
  c.translate(x, y)
  c.scale(scaleX, 1)
  drawText(ctx, text, 0, 0, f, color, align, baseline)
  c.restore()
  ctx.boxes = boxes
}

/** 高さだけ知りたいブロックを 1px canvas に描かせる（文字の範囲は記録しない） */
export function measureHeight(ctx: Ctx, draw: (dry: Ctx) => number): number {
  return draw({ ...ctx, c: scratchContext(), boxes: null })
}

/**
 * 罫線（細線は出力幅 1080px で 1px）。太さも位置の丸めも論理 px なので、
 * 2x では 2 画素の線になり、縮めれば 1x と同じ線になる。
 */
export function hairline(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  color: string,
  weight = 1,
) {
  const t = Math.max(1, Math.round(weight * (ctx.W / 1080)))
  ctx.c.fillStyle = color
  ctx.c.fillRect(Math.round(x), Math.round(y), Math.round(w), t)
}

export function vline(
  ctx: Ctx,
  x: number,
  y: number,
  h: number,
  color: string,
  weight = 1,
) {
  const t = Math.max(1, Math.round(weight * (ctx.W / 1080)))
  ctx.c.fillStyle = color
  ctx.c.fillRect(Math.round(x), Math.round(y), t, Math.round(h))
}

// ---------------------------------------------------------------------------
// 曲の行
// ---------------------------------------------------------------------------

export type RowColors = Record<RowRole | 'mutedTitle', string>

/** 行の役割ごとの色（テンプレートが選ぶ。色そのものはパレットの役割から） */
export function rowColors(
  ctx: Ctx,
  overrides: Partial<RowColors> = {},
): RowColors {
  const { pal } = ctx
  return {
    num: pal.muted,
    artist: pal.fg,
    title: pal.fg,
    mutedTitle: pal.muted,
    sep: pal.muted,
    meta: pal.muted,
    more: pal.muted,
    ...overrides,
  }
}

/**
 * 印の描き方。solid は角のわずかに丸い帯、marker はマーカーで引いたような
 * 端の揺れた帯（コピー向け）。ぐちゃぐちゃはどちらでも同じペンの跡。
 */
export type MarkInk = 'solid' | 'marker'

/** ぐちゃぐちゃの色: 差し色。地の色との差が小さければ文字色 */
export function scribbleColor(ctx: Ctx): string {
  const { pal } = ctx
  const ground = ctx.onPhoto && ctx.zone >= 0 ? pal.scrim : pal.bg
  return contrastRatio(hexToRgb(pal.accent), hexToRgb(ground)) >= 3
    ? pal.accent
    : pal.fg
}

/**
 * 隠した欄の印を描く。x から幅 w、y は文字の縦中央、size は文字の大きさ。
 * 形は mark.seed（曲順）だけで決まり、本当の文字は一切描かない。
 */
export function drawMark(
  ctx: Ctx,
  mark: PlacedMark,
  x: number,
  y: number,
  w: number,
  size: number,
  color: string,
  ink: MarkInk = 'solid',
) {
  if (w <= 0) return
  if (ctx.boxes) {
    ctx.boxes.push({
      x,
      y: y - size * 0.55,
      w,
      h: size * 1.05,
      zone: ctx.zone,
    })
  }
  const { c } = ctx
  const rand = mulberry32(mark.seed * 7907 + 31)
  c.save()
  if (mark.kind === 'scribble') {
    drawScribble(c, rand, x, y, w, size, scribbleColor(ctx))
  } else if (ink === 'marker') {
    drawMarkerBar(c, rand, x, y, w, size, color)
  } else {
    const h = size * 0.74
    const top = y - h * 0.52
    c.fillStyle = color
    c.beginPath()
    if (typeof c.roundRect === 'function')
      c.roundRect(x, top, w, h, size * 0.06)
    else c.rect(x, top, w, h)
    c.fill()
  }
  c.restore()
}

/** マーカーで引いた帯（上下の縁がわずかに波打ち、端は斜めに切れる） */
function drawMarkerBar(
  c: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  y: number,
  w: number,
  size: number,
  color: string,
) {
  const h = size * 0.82
  const top = y - h * 0.54
  const jitter = () => (rand() - 0.5) * size * 0.07
  const steps = Math.max(2, Math.round(w / (size * 0.6)))
  const slant = size * 0.12
  c.fillStyle = color
  c.globalAlpha = 0.94
  c.beginPath()
  c.moveTo(x + slant * rand(), top + jitter())
  for (let i = 1; i <= steps; i++) {
    c.lineTo(
      x + (w * i) / steps - (i === steps ? slant * rand() : 0),
      top + jitter(),
    )
  }
  for (let i = steps; i >= 0; i--) {
    c.lineTo(
      x + (w * i) / steps + (i === 0 ? slant * rand() * 0.6 : 0),
      top + h + jitter(),
    )
  }
  c.closePath()
  c.fill()
}

/**
 * ペンでぐちゃぐちゃに塗りつぶした跡。左右に往復する斜めのジグザグを 3 回重ね
 * （最後は途中まで）、歩幅・振れ幅・位置を揺らして中点を通る曲線でつなぐ
 * （幾何学模様に見えないように）。
 * 線の太さは文字の大きさに比例（書き出しの倍率は ctx の scale で掛かる）。
 */
function drawScribble(
  c: CanvasRenderingContext2D,
  rand: () => number,
  x: number,
  y: number,
  w: number,
  size: number,
  color: string,
) {
  const lw = size * (0.085 + rand() * 0.025)
  const left = x + lw * 0.5
  const right = x + w - lw * 0.5
  if (right - left < size * 0.3) return
  const half = size * 0.5
  const points: Array<[number, number]> = []
  /** 左右どちらかへ 1 往復ぶん。上下に振りながら、ペンを前へ倒して進む */
  const pass = (from: number, to: number, ampK: number, shift: number) => {
    const dir = to > from ? 1 : -1
    let px = from
    let up = rand() < 0.5
    while ((to - px) * dir > 0) {
      const step = size * (0.2 + rand() * 0.18)
      px = Math.min(right, Math.max(left, px + step * dir))
      const amp = half * ampK * (0.7 + rand() * 0.35)
      const lean = (up ? 0.16 : -0.06) * size * dir
      points.push([
        Math.min(right, Math.max(left, px + lean)),
        y + shift + (up ? -amp : amp) + (rand() - 0.5) * size * 0.06,
      ])
      up = !up
    }
  }
  points.push([left, y + (rand() - 0.5) * half])
  pass(left, right, 1, (rand() - 0.5) * size * 0.08)
  pass(
    right,
    left + (right - left) * rand() * 0.12,
    0.9,
    (rand() - 0.5) * size * 0.1,
  )
  // 3 回目は途中まで（手で塗るときの最後のひと塗り）
  pass(
    points[points.length - 1][0],
    left + (right - left) * (0.55 + rand() * 0.45),
    0.75,
    0,
  )
  c.strokeStyle = color
  c.lineWidth = lw
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.globalAlpha = 0.86 + rand() * 0.1
  c.beginPath()
  c.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length - 1; i++) {
    const [cx, cy] = points[i]
    const [nx, ny] = points[i + 1]
    c.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2)
  }
  const last = points[points.length - 1]
  c.lineTo(last[0], last[1])
  c.stroke()
}

export function drawRows(
  ctx: Ctx,
  layout: RowsLayout,
  colors: RowColors,
  opts: {
    dividers?: string | null
    offsetY?: number
    /** 隠した欄の帯の描き方 */
    ink?: MarkInk
  } = {},
) {
  const dy = opts.offsetY ?? 0
  if (opts.dividers) {
    layout.rows.forEach((row, i) => {
      const prev = layout.rows[i - 1] as
        (typeof layout.rows)[number] | undefined
      if (prev && prev.col === row.col) {
        hairline(ctx, row.x, row.y + dy, row.w, opts.dividers ?? '')
      }
    })
  }
  for (const row of layout.rows) {
    for (const t of row.texts) {
      const color =
        t.role === 'title' && t.muted ? colors.mutedTitle : colors[t.role]
      if (t.mark) {
        drawMark(
          ctx,
          t.mark,
          row.x + t.x,
          row.y + dy + t.y,
          ctx.measure(t.text, t.font) * t.scaleX,
          fontSize(parseFont(t.font).css),
          // 帯は名前の欄の色（曲名が控えめな色のテンプレートでは帯も控えめに）
          color,
          opts.ink,
        )
        continue
      }
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
}

/** 組んだ行の下端（area.y からの高さ） */
export function rowsUsedHeight(layout: RowsLayout, top: number): number {
  return layout.rows.reduce((m, r) => Math.max(m, r.y + r.h), top) - top
}

// ---------------------------------------------------------------------------
// 幕・粒子
// ---------------------------------------------------------------------------

/**
 * 写真に敷く幕の区域。all は全面に一様、それ以外は端（edge）から
 * full までは濃さ 1、start で 0 になる滑らかなグラデーション。
 */
export type ScrimZone =
  | { edge: 'all' }
  | { edge: 'top' | 'bottom' | 'left' | 'right'; start: number; full: number }

const smoothstep = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/** その位置での幕の効き 0..1 */
export function scrimWeight(zone: ScrimZone, x: number, y: number): number {
  if (zone.edge === 'all') return 1
  const v = zone.edge === 'top' || zone.edge === 'bottom' ? y : x
  if (zone.full === zone.start) return v >= zone.full ? 1 : 0
  return smoothstep((v - zone.start) / (zone.full - zone.start))
}

/** 幕を描く（グラデーションは smoothstep を 9 段で近似して帯が出ないようにする） */
export function drawScrim(
  ctx: Ctx,
  zone: ScrimZone,
  color: string,
  alpha: number,
) {
  const { c, W, H } = ctx
  if (alpha <= 0) return
  c.save()
  if (zone.edge === 'all') {
    c.fillStyle = rgba(color, alpha)
    c.fillRect(0, 0, W, H)
    c.restore()
    return
  }
  const vertical = zone.edge === 'top' || zone.edge === 'bottom'
  const g = vertical
    ? c.createLinearGradient(0, zone.start, 0, zone.full)
    : c.createLinearGradient(zone.start, 0, zone.full, 0)
  const STEPS = 9
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1)
    g.addColorStop(t, rgba(color, alpha * smoothstep(t)))
  }
  c.fillStyle = g
  if (vertical) {
    const y0 = Math.min(zone.start, zone.full)
    const y1 = Math.max(zone.start, zone.full)
    // グラデーションの外側（端の側）は濃さ 1 で塗る
    if (zone.edge === 'bottom') c.fillRect(0, y0, W, H - y0)
    else c.fillRect(0, 0, W, y1)
  } else {
    const x0 = Math.min(zone.start, zone.full)
    const x1 = Math.max(zone.start, zone.full)
    if (zone.edge === 'right') c.fillRect(x0, 0, W - x0, H)
    else c.fillRect(0, 0, x1, H)
  }
  c.restore()
}

export { mulberry32 }

let grainTile: HTMLCanvasElement | null = null

/** 1px の白黒ノイズのタイル（固定シードなので書き出すたびに同じ粒になる） */
function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return canvas
  const image = g.createImageData(size, size)
  const rand = mulberry32(7)
  for (let i = 0; i < image.data.length; i += 4) {
    const v = rand() < 0.5 ? 0 : 255
    image.data[i] = v
    image.data[i + 1] = v
    image.data[i + 2] = v
    image.data[i + 3] = Math.round(rand() * 255)
  }
  g.putImageData(image, 0, 0)
  grainTile = canvas
  return canvas
}

/**
 * 粒子を全体（文字の上にも）に重ねる。opacity は 0.06〜0.12 程度。
 * 粒は論理 1px（2x なら 2×2 画素）を補間せずに敷く。装置の 1px にすると、縮めたときに
 * 4 粒が平均されて粒立ちが半分になり、1x と見え方が変わってしまうため。
 */
export function drawGrain(ctx: Ctx, opacity: number) {
  const { c, W, H } = ctx
  const pattern = c.createPattern(getGrainTile(), 'repeat')
  if (!pattern) return
  c.save()
  c.imageSmoothingEnabled = false
  c.globalAlpha = opacity
  c.fillStyle = pattern
  c.fillRect(0, 0, W, H)
  c.restore()
}

// ---------------------------------------------------------------------------
// 共通の小物
// ---------------------------------------------------------------------------

export const CREDIT_TEXT = 'セトリ画像メーカー · tools.tainakanchu.com'

export function drawCredit(
  ctx: Ctx,
  x: number,
  y: number,
  align: CanvasTextAlign,
  color = ctx.pal.muted,
) {
  if (!ctx.display.credit) return
  const f = font(400, Math.max(15 * ctx.s, ctx.minFont * 0.75), 'mono')
  drawText(ctx, CREDIT_TEXT, x, y, f, color, align)
}

/** 新テンプレートの外側の余白（出力幅の 7%、横長は 6%） */
export function marginOf(ctx: Ctx): number {
  return Math.round((ctx.W > ctx.H * 1.3 ? 0.06 : 0.07) * ctx.W)
}

/**
 * 枠の内側（余白とストーリーズの安全域を除いた、文字を置いてよい範囲）。
 * 枠が画面の上端 / 下端に接しているときだけ安全域を効かせる。
 */
export function innerOf(ctx: Ctx, frame: Rect, margin = marginOf(ctx)): Rect {
  const top = frame.y <= 0.5 ? Math.max(margin, ctx.safe.top) : margin
  const bottom =
    frame.y + frame.h >= ctx.H - 0.5
      ? Math.max(margin, ctx.safe.bottom)
      : margin
  return {
    x: frame.x + margin,
    y: frame.y + top,
    w: frame.w - margin * 2,
    h: frame.h - top - bottom,
  }
}

export function isWide(rect: { w: number; h: number }): boolean {
  return rect.w > rect.h * 1.3
}
