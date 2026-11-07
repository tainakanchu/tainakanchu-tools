/**
 * 写真が主役のテンプレート: フォト / コピー。
 *
 * フォト: 写真を全面に敷き、上に小さな見出し、下に曲をキャプションのように組む。
 *   曲が多いときは、曲の領域を下から高くしていき、それでも窮屈なら段を増やす
 *   （fitRowsLayout に任せる）。曲が少なく余白があるときは、曲のリストを高さの半分まで
 *   に抑えたまま、見出しと曲を一回り大きくする（写真が主役のまま、小さすぎない）。
 *   幕は下（横長は左）からの滑らかなグラデーションで、濃さは render 側で文字の後ろの
 *   画素から決める。
 * コピー: コピー機で刷ったジン。写真はモノクロに潰し、文字は 1 色だけ。
 *   見出しだけインクがかすれたような質感を付ける。写真を全面に敷いたときは、
 *   文字を紙の切れ端（背景色の面）に載せる。
 */
import {
  drawCredit,
  drawRows,
  drawText,
  font,
  hairline,
  innerOf,
  isWide,
  measureHeight,
  mulberry32,
  rowColors,
} from './draw'
import { fitRowsLayout } from './rows'
import { fromRows } from './tpl-simple'
import {
  TITLE_TRACKING,
  bodyStack,
  columnGap,
  columnsFor,
  drawPageHeader,
  fitLabel,
  fitTitle,
  labelSize,
  rowsInputFor,
  trackCountText,
  trackFonts,
  trackSizeRange,
} from './tpl-common'
import type { Ctx, ScrimZone } from './draw'
import type { Rect } from './fit'
import type { FontFor, RowsLayout } from './rows'
import type {
  LayoutResult,
  Meta,
  PageLock,
  TemplateArgs,
} from './template-types'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** 曲が少ないときに大きくする上限（幅 1080px での px）: 曲 3.4%W・見出し 7%W */
const BOOST_TRACK_MAX = 0.034 * 1080
const BOOST_TITLE_MAX = 0.07 * 1080
/** 大きくするときの段階（1 が上限。0 は大きくしない既定の上限） */
const BOOST_STEPS = [1, 0.75, 0.5, 0.25, 0]
/**
 * 大きくしたときに曲のリスト（曲数の行を含む）が使ってよい高さの割合。
 * 写真が主役なので半分前後まで（縦に長い 9:16 は 50%、ほかは 55%）。
 */
function boostListShare(ctx: Ctx): number {
  return ctx.H > ctx.W * 1.5 ? 0.5 : 0.55
}

/** 名前を省略した・縮めた曲の数（大きくして名前が切れるなら大きくしない） */
function clippedCount(layout: RowsLayout): number {
  let n = 0
  for (const row of layout.rows) {
    if (
      row.texts.some(
        (t) =>
          (t.role === 'artist' || t.role === 'title') &&
          (t.scaleX < 0.999 || t.text.endsWith('…')),
      )
    )
      n += 1
  }
  return n
}

/**
 * 見出し（左にイベント名と DJ 名、右に日付と会場）。高さを返す。
 * boost（0..1）で見出しを大きくする（曲が少なく余白があるとき）。
 */
function drawPhotoHeader(ctx: Ctx, meta: Meta, rect: Rect, boost = 0): number {
  const { s, pal } = ctx
  const lf = font(400, labelSize(ctx), 'mono')
  const ls = labelSize(ctx)
  const right = [meta.date, meta.venue].filter(Boolean)
  const rightW = Math.min(
    rect.w * 0.4,
    Math.max(0, ...right.map((t) => ctx.measure(t, lf))),
  )
  const leftW = rect.w - (rightW > 0 ? rightW + 40 * s : 0)
  const body = bodyStack(ctx)
  const heading = meta.event || meta.dj || 'Setlist'
  const titleAt = (size: number) =>
    font(body === 'serif' ? 700 : 500, size, body, { tracking: TITLE_TRACKING })
  const t = fitTitle(
    ctx,
    heading,
    leftW,
    titleAt,
    32 * s,
    lerp(52, BOOST_TITLE_MAX, boost) * s,
    2,
  )
  const lh = t.size * 1.08
  t.lines.forEach((line, i) =>
    drawText(ctx, line, rect.x, rect.y + t.size * 0.8 + i * lh, t.font, pal.fg),
  )
  let y = rect.y + t.size * 0.8 + lh * (t.lines.length - 1) + t.size * 0.2
  const sub = meta.event ? meta.dj : ''
  if (sub) {
    const k = lerp(1, 1.25, boost)
    const f = fitLabel(ctx, sub, leftW, font(400, 28 * s * k, body))
    drawText(ctx, f.text, rect.x, y + 36 * s * k, f.font, pal.fg)
    y += 44 * s * k
  }
  right.forEach((text, i) => {
    const f = fitLabel(ctx, text, rightW, lf)
    drawText(
      ctx,
      f.text,
      rect.x + rect.w,
      rect.y + ls * 0.9 + i * ls * 1.5,
      f.font,
      pal.muted,
      'right',
    )
  })
  return Math.max(
    y - rect.y,
    ls * 0.9 + (right.length - 1) * ls * 1.5 + ls * 0.3,
  )
}

/** 曲の領域の高さの候補（下から、使える高さに対する割合） */
const PHOTO_FRACTIONS = [0.42, 0.5, 0.58, 0.66, 0.76, 0.88, 1]

/**
 * 下寄せの曲リスト。領域の高さを少しずつ上げ、読みやすい大きさで全曲入る
 * いちばん低い領域を使う（写真をなるべく隠さない）。
 */
function fitBottomList(
  ctx: Ctx,
  a: TemplateArgs,
  column: { x: number; w: number; top: number; bottom: number },
  fonts: FontFor,
  fractions: ReadonlyArray<number>,
  opts: { maxColumns: number; spread: number; scale?: number },
): BottomFit {
  const gap = columnGap(ctx)
  const avail = Math.max(0, column.bottom - column.top)
  const build = (fraction: number, lock: PageLock | undefined) => {
    const h = avail * fraction
    const area: Rect = { x: column.x, y: column.bottom - h, w: column.w, h }
    const layout = fitRowsLayout(
      rowsInputFor(ctx, a.items, area, gap, fonts, { spread: opts.spread }),
      {
        columnsOptions: columnsFor(
          ctx,
          a.columns,
          column.w,
          gap,
          opts.maxColumns,
        ),
        sizeRange: trackSizeRange(ctx, opts.scale ?? 1),
        lock: lock?.rows,
      },
    )
    return { layout, area, fraction }
  }
  if (a.lock?.variant !== undefined) return build(a.lock.variant, a.lock)
  const comfortable = Math.max(ctx.minFont * 1.3, 27 * ctx.s)
  let firstFit: ReturnType<typeof build> | undefined
  let last: ReturnType<typeof build> | undefined
  for (const fraction of fractions) {
    const trial = build(fraction, undefined)
    last = trial
    if (trial.layout.overflow) continue
    firstFit ??= trial
    if (trial.layout.size >= comfortable) return trial
  }
  return firstFit ?? last ?? build(1, undefined)
}

type BottomFit = { layout: RowsLayout; area: Rect; fraction: number }

/**
 * 曲が少なく余白があるときの組み方。曲の領域を高さの半分前後（boostListShare）までに
 * 抑え、文字をちょうど上限の大きさ（boost の段階ごと）で組めるいちばん大きい段階を選ぶ。
 * いつもの組み方（normal）より名前が切れる曲が増える段階は使わない。
 * どの段階でも入らなければ null（いつもの fitBottomList に任せる。曲が多いときの
 * 組み方は変わらない）。
 */
function fitBoostedList(
  ctx: Ctx,
  a: TemplateArgs,
  column: { x: number; w: number; bottom: number },
  /** その段階の見出しの下端（曲のキャプションの行を含めた、曲を置ける上端） */
  topFor: (boost: number) => number,
  fonts: FontFor,
  normal: () => BottomFit,
): { fit: BottomFit; boost: number } | null {
  const { s, H } = ctx
  const gap = columnGap(ctx)
  const labelH = 52 * s
  const build = (boost: number, lock: PageLock | undefined) => {
    const avail = column.bottom - topFor(boost)
    const h = Math.min(avail, H * boostListShare(ctx) - labelH)
    if (h <= 0) return null
    const area: Rect = { x: column.x, y: column.bottom - h, w: column.w, h }
    const size = lerp(32, BOOST_TRACK_MAX, boost) * s
    const exact = [size, size] as const
    const layout = fitRowsLayout(
      // 行間は広げすぎない（余った高さは写真に残す）
      rowsInputFor(ctx, a.items, area, gap, fonts, { spread: 0.12 }),
      {
        // キャプションらしく 1 段だけ（2 段で大きくすると名前が切れやすい）
        columnsOptions: [1],
        // 大きさは固定（詰めた組みは使わない）。入らなければこの段階は諦める
        styles: ['double', 'single'],
        sizeRange: { double: exact, single: exact, compact: exact },
        lock: lock?.rows,
      },
    )
    return { fit: { layout, area, fraction: 1 }, boost }
  }
  if (a.lock) {
    const boost = a.lock.boost
    return boost === undefined ? null : build(boost, a.lock)
  }
  let limit: number | undefined
  for (const boost of BOOST_STEPS) {
    const trial = build(boost, undefined)
    if (!trial || trial.fit.layout.overflow) continue
    const base = normal().layout
    // いつもの組み方の方が大きければ（曲がごく少ないとき）大きくしない
    if (base.size >= trial.fit.layout.size) return null
    limit ??= clippedCount(base)
    if (clippedCount(trial.fit.layout) <= limit) return trial
  }
  return null
}

/** 下寄せにしたときの行のずらし量（曲の塊の下端を領域の下端にそろえる） */
function bottomOffset(layout: RowsLayout, area: Rect): number {
  const used =
    layout.rows.reduce((m, r) => Math.max(m, r.y + r.h), area.y) - area.y
  return Math.max(0, area.h - used)
}

export function renderPhoto(a: TemplateArgs): LayoutResult {
  const { ctx, meta, frame, page } = a
  const { s, pal, H } = ctx
  const inner = innerOf(ctx, frame)
  const wide = isWide(frame)
  const fonts = trackFonts(ctx)

  const header = (target: Ctx, boost: number) =>
    page.index > 0
      ? drawPageHeader(target, meta, inner, page, { rule: false })
      : drawPhotoHeader(
          target,
          meta,
          wide ? { ...inner, w: inner.w * 0.72 } : inner,
          boost,
        )
  const footer = ctx.display.credit ? 44 * s : 0
  const labelH = 52 * s
  const headerGap = (wide ? 36 : 120) * s
  // 横長は左の 7 割強に組む（2 段にできる幅）
  const colW = wide ? Math.round(inner.w * 0.72) : inner.w
  const bottom = inner.y + inner.h - footer

  const topFor = (boost: number) =>
    inner.y +
    measureHeight(ctx, (dry) => header(dry, boost)) +
    headerGap +
    labelH
  const fractions = a.photoBg ? PHOTO_FRACTIONS : PHOTO_FRACTIONS.slice(2)
  // いつもの組み方: 読める大きさで全曲入る、いちばん低い曲の領域
  let normalFit: BottomFit | undefined
  const normal = () =>
    (normalFit ??= fitBottomList(
      ctx,
      a,
      { x: inner.x, w: colW, top: topFor(0), bottom },
      fonts,
      fractions,
      { maxColumns: 2, spread: 0.3 },
    ))

  // 曲が少なければ、見出しと曲を一回り大きくする（横長は高さが無いのでしない）
  const boosted = wide
    ? null
    : fitBoostedList(
        ctx,
        a,
        { x: inner.x, w: colW, bottom },
        topFor,
        fonts,
        normal,
      )
  const boost = boosted?.boost

  // 見出し（幕の区域 0）
  ctx.zone = 0
  const headerH = header(ctx, boost ?? 0)
  const headerBottom = inner.y + headerH

  // 曲（幕の区域 1）
  const fit = boosted?.fit ?? normal()
  const dy = bottomOffset(fit.layout, fit.area)
  const listTop = fit.area.y + dy
  ctx.zone = wide ? 0 : 1
  // 曲の上の小さなキャプション（曲数）と細い罫線
  const lf = font(400, labelSize(ctx), 'mono')
  const caption = trackCountText(meta)
  drawText(ctx, caption, inner.x, listTop - 30 * s, lf, pal.muted)
  hairline(ctx, inner.x, listTop - 14 * s, colW, pal.rule)
  drawRows(ctx, fit.layout, rowColors(ctx, { title: pal.muted }), {
    offsetY: dy,
  })
  drawCredit(ctx, inner.x, inner.y + inner.h, 'left')

  // 幕: 下（横長は左）からの滑らかなグラデーション。見出しの側にも薄い幕
  const textTop = listTop - 30 * s - labelSize(ctx)
  const scrim: Array<ScrimZone> = wide
    ? [
        {
          edge: 'left',
          full: inner.x + colW * 0.7,
          start: Math.min(ctx.W, inner.x + colW + 0.22 * ctx.W),
        },
      ]
    : [
        { edge: 'top', full: inner.y * 0.4, start: headerBottom + 0.12 * H },
        {
          edge: 'bottom',
          full: textTop + 0.05 * H,
          start: Math.max(headerBottom, Math.min(textTop - 0.16 * H, 0.55 * H)),
        },
      ]
  const result = fromRows(fit.layout, { scrim })
  return {
    ...result,
    lock: { ...result.lock, variant: fit.fraction, boost },
  }
}

// ---------------------------------------------------------------------------
// コピー
// ---------------------------------------------------------------------------

/**
 * かすれた見出し: 別の canvas に描いてから、固定シードの細かな点と横の筋を
 * 抜いて（destination-out）インクが乗りきらない感じにする。見出しだけに掛ける。
 */
function drawInkStarved(
  ctx: Ctx,
  lines: Array<string>,
  x: number,
  y: number,
  size: number,
  f: string,
  lh: number,
  color: string,
) {
  const { c } = ctx
  // 文字の範囲は記録しておく（写真の上の判定・下描き用）
  if (ctx.boxes || c.canvas.width <= 1) {
    lines.forEach((line, i) => drawText(ctx, line, x, y + i * lh, f, color))
    return
  }
  const widths = lines.map((l) => ctx.measure(l, f))
  const w = Math.ceil(Math.max(1, ...widths) + size * 0.2)
  const h = Math.ceil(lh * (lines.length - 1) + size * 1.3)
  // 下描きの canvas は書き出しの倍率で作る（点と筋の数・位置は論理 px で決めるので、
  // 縮めれば 1x と同じかすれになる）
  const k = ctx.scale
  const off = document.createElement('canvas')
  off.width = Math.ceil(w * k)
  off.height = Math.ceil(h * k)
  const oc = off.getContext('2d')
  if (!oc) {
    lines.forEach((line, i) => drawText(ctx, line, x, y + i * lh, f, color))
    return
  }
  oc.scale(k, k)
  const octx: Ctx = { ...ctx, c: oc, boxes: null }
  lines.forEach((line, i) =>
    drawText(octx, line, 0, size * 0.95 + i * lh, f, color),
  )
  oc.globalCompositeOperation = 'destination-out'
  const rand = mulberry32(1103)
  const dots = Math.round((w * h) / 320)
  for (let i = 0; i < dots; i++) {
    const r = (rand() * 1.1 + 0.3) * (ctx.W / 1080)
    oc.globalAlpha = 0.25 + rand() * 0.5
    oc.beginPath()
    oc.arc(rand() * w, rand() * h, r, 0, Math.PI * 2)
    oc.fill()
  }
  // 横の筋（ローラーのかすれ）
  for (let i = 0; i < 5; i++) {
    oc.globalAlpha = 0.08 + rand() * 0.12
    oc.fillRect(0, rand() * h, w, (0.6 + rand() * 1.6) * (ctx.W / 1080))
  }
  c.drawImage(off, x, y - size * 0.95, off.width / k, off.height / k)
}

/** コピーの見出し（幅を詰めた太いグロテスク） */
const copyHeadFont = (size: number) =>
  font(800, size, 'condensed', { stretch: 'semi-condensed', tracking: -0.02 })

export function renderCopy(a: TemplateArgs): LayoutResult {
  const { ctx, meta, items, frame, page, lock, photoBg } = a
  // 文字は 1 色だけ（補助の文字も罫線もインクの色）
  const ink = ctx.pal.fg
  ctx.pal = { ...ctx.pal, muted: ink, rule: ink }
  const { s, pal } = ctx
  const inner = innerOf(ctx, frame)
  const wide = isWide(frame)
  const pad = 26 * s
  const mono = 'mono' as const
  const body = bodyStack(ctx)
  // 曲はタイプライターのような等幅（和文はゴシック / 明朝へ落ちる）
  const fonts: FontFor = (role, size) => {
    switch (role) {
      case 'num':
      case 'meta':
        return font(400, Math.max(ctx.minFont * 0.9, size * 0.72), mono)
      case 'artist':
        return font(500, size * 0.92, mono)
      default:
        return font(400, size * 0.92, mono)
    }
  }
  const lf = font(500, labelSize(ctx), mono, { tracking: 0.04 })
  const ls = labelSize(ctx)
  /** 紙の切れ端（写真の上に文字を載せる面） */
  const slip = (r: Rect) => {
    if (!photoBg) return
    ctx.c.fillStyle = pal.bg
    ctx.c.fillRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2)
  }

  // 見出しの組み（先に寸法を決めてから、切れ端 → 文字の順に描く）
  const headW = wide ? inner.w * 0.42 : inner.w
  const heading = meta.event || meta.dj || 'Setlist'
  let headerBottom: number
  if (page.index > 0) {
    const h = measureHeight(ctx, (dry) =>
      drawPageHeader(dry, meta, inner, page, { rule: false }),
    )
    slip({ x: inner.x, y: inner.y, w: inner.w, h })
    drawPageHeader(ctx, meta, inner, page, { rule: false })
    headerBottom = inner.y + h
  } else {
    const t = fitTitle(
      ctx,
      heading,
      headW,
      copyHeadFont,
      56 * s,
      (wide ? 110 : 156) * s,
      2,
    )
    const lh = t.size * 0.94
    const titleTop = inner.y + ls + 30 * s
    const sub = meta.event ? meta.dj : ''
    const subF = font(700, 30 * s, body)
    const titleBottom = titleTop + t.size * 0.78 + lh * (t.lines.length - 1)
    const h = titleBottom + (sub ? 70 * s : 18 * s) - inner.y
    slip({ x: inner.x, y: inner.y, w: headW, h })
    const top = [meta.date, meta.venue].filter(Boolean)
    drawText(ctx, top[0] ?? '', inner.x, inner.y + ls * 0.8, lf, ink)
    if (top[1]) {
      const f = fitLabel(
        ctx,
        top[1],
        headW - ctx.measure(top[0] ?? '', lf) - 30 * s,
        lf,
      )
      drawText(
        ctx,
        f.text,
        inner.x + headW,
        inner.y + ls * 0.8,
        f.font,
        ink,
        'right',
      )
    }
    drawInkStarved(
      ctx,
      t.lines,
      inner.x,
      titleTop + t.size * 0.78,
      t.size,
      t.font,
      lh,
      ink,
    )
    if (sub) {
      const f = fitLabel(ctx, sub, headW, subF)
      drawText(ctx, f.text, inner.x, titleBottom + 58 * s, f.font, ink)
    }
    headerBottom = inner.y + h
  }

  // 曲
  const footer = 44 * s
  const column = wide
    ? {
        x: inner.x + headW + 64 * s,
        w: inner.w - headW - 64 * s,
        top: inner.y + 30 * s,
        bottom: inner.y + inner.h - footer,
      }
    : {
        x: inner.x,
        w: inner.w,
        top: headerBottom + (photoBg ? 120 : 64) * s,
        bottom: inner.y + inner.h - footer,
      }
  const fractions = photoBg ? PHOTO_FRACTIONS : [1]
  const gap = columnGap(ctx)
  let layout: RowsLayout
  let area: Rect
  let fraction = 1
  if (photoBg || lock?.variant !== undefined) {
    const fit = fitBottomList(ctx, a, column, fonts, fractions, {
      maxColumns: 2,
      spread: 0.3,
    })
    layout = fit.layout
    area = fit.area
    fraction = fit.fraction
  } else {
    area = {
      x: column.x,
      y: column.top,
      w: column.w,
      h: column.bottom - column.top,
    }
    layout = fitRowsLayout(rowsInputFor(ctx, items, area, gap, fonts), {
      columnsOptions: columnsFor(ctx, a.columns, column.w, gap, 2),
      sizeRange: trackSizeRange(ctx),
      lock: lock?.rows,
    })
  }
  const dy = photoBg ? bottomOffset(layout, area) : 0
  const listTop = area.y + dy
  const used =
    layout.rows.reduce((m, r) => Math.max(m, r.y + r.h), area.y) - area.y
  slip({
    x: column.x,
    y: listTop - 24 * s,
    w: column.w,
    h: used + 24 * s + footer,
  })
  // 太い罫線（インク 1 色）
  hairline(ctx, column.x, listTop - 18 * s, column.w, ink, 3)
  drawRows(ctx, layout, rowColors(ctx), {
    offsetY: dy,
    dividers: null,
    ink: 'marker',
  })
  const footY = Math.min(inner.y + inner.h, listTop + used + footer)
  const count = trackCountText(meta).toUpperCase()
  drawText(ctx, count, column.x, footY - 6 * s, lf, ink)
  if (ctx.display.credit)
    drawCredit(ctx, column.x + column.w, footY - 6 * s, 'right')
  const result = fromRows(layout, { solidText: true })
  return {
    ...result,
    lock: { ...result.lock, variant: photoBg ? fraction : undefined },
  }
}
