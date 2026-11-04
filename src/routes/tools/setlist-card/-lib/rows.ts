/**
 * 曲の行を組む（リスト / 段組み / ポスターの大きな文字のリスト）。
 *
 * 密度に応じて行の形を切り替える:
 *   double  … 1 行目アーティスト・2 行目曲名（ゆったり）
 *   single  … 「Artist — Title」の 1 行
 *   compact … 1 行・行間を詰め、補足列（時刻 / BPM / Key）を小さくする
 * 補足列が段の幅を食いすぎるときは右から順に隠す（呼び出し側で UI に注記する）。
 *
 * 文字幅は注入した measure で測るだけで描画はしない純粋な計算なので、単体テストできる。
 */
import {
  CONDENSE_MIN,
  fitLine,
  splitWidths,
  wrapRuns,
  wrapText,
} from './textfit'
import type { Measure, Rect } from './fit'
import type { LongTextMode } from './textfit'

export type RowStyle = 'double' | 'single' | 'compact'
export const ROW_STYLES: ReadonlyArray<RowStyle> = [
  'double',
  'single',
  'compact',
]

export type Role = 'num' | 'artist' | 'title' | 'sep' | 'meta' | 'more'

export type RowItem = {
  num: string
  artist: string
  title: string
  /** 補足列（左から 時刻 / BPM / Key のうち表示するもの） */
  meta: Array<string>
}

export type FontFor = (role: Role, size: number, style: RowStyle) => string

export type PlacedText = {
  text: string
  role: Role
  /** 行の左上からの位置（y は文字の縦中央） */
  x: number
  y: number
  scaleX: number
  align: 'left' | 'right'
  font: string
  /** 2 行組みの曲名など、控えめな色で描くもの */
  muted: boolean
}

export type PlacedRow = {
  col: number
  /** 絶対座標 */
  x: number
  y: number
  w: number
  h: number
  texts: Array<PlacedText>
}

export type RowParams = {
  columns: number
  style: RowStyle
  size: number
  /** 表示する補足列の数（左から） */
  metaShown: number
}

export type RowsLayout = RowParams & {
  rows: Array<PlacedRow>
  placed: number
  overflow: boolean
  /** 「ほか N 曲」にまとめた曲数 */
  hidden: number
}

export type RowsInput = {
  items: ReadonlyArray<RowItem>
  area: Rect
  gap: number
  mode: LongTextMode
  showNumber: boolean
  fontFor: FontFor
  measure: Measure
  /** 区切り（既定 " — "） */
  separator?: string
}

/** 補足列が段の幅に占めてよい割合 */
const META_SHARE: Record<RowStyle, number> = {
  double: 0.36,
  single: 0.34,
  compact: 0.26,
}

function geometry(style: RowStyle, size: number) {
  switch (style) {
    case 'double':
      return { lineH: size * 1.2, pad: size * 0.62 }
    case 'single':
      return { lineH: size * 1.26, pad: size * 0.5 }
    case 'compact':
      return { lineH: size * 1.18, pad: size * 0.2 }
  }
}

/** 1 段の幅 */
export function columnWidth(area: Rect, columns: number, gap: number): number {
  return (area.w - gap * (columns - 1)) / columns
}

function metaMetrics(
  input: RowsInput,
  style: RowStyle,
  size: number,
  shown: number,
) {
  const font = input.fontFor('meta', size, style)
  const widths = Array.from({ length: shown }, (_, i) =>
    Math.max(
      0,
      ...input.items.map((it) => input.measure(it.meta[i] ?? '', font)),
    ),
  )
  const gap = size * (style === 'compact' ? 0.45 : 0.7)
  const total = widths.reduce((sum, w) => sum + w + gap, 0)
  return { font, widths, gap, total }
}

/**
 * 名前の欄に最低限ほしい幅（文字サイズ × この値）。
 * 1 行組みは「Artist — Title」で全角 17 文字・半角 34 文字くらい、
 * 2 行組みはアーティストの行（補足列と同じ行）で半角 16 文字くらい。
 */
const MIN_TEXT_EMS: Record<RowStyle, number> = {
  double: 8,
  single: 17,
  compact: 16,
}

function numberWidth(input: RowsInput, style: RowStyle, size: number): number {
  if (!input.showNumber) return 0
  const widest = input.items.reduce(
    (a, it) => (it.num.length > a.length ? it.num : a),
    '00',
  )
  return (
    input.measure(
      widest.replace(/\d/g, '0'),
      input.fontFor('num', size, style),
    ) +
    size * 0.6
  )
}

/**
 * 補足列を出す数（右から隠す）。段の幅に占める割合が大きすぎるときと、
 * 名前の欄が MIN_TEXT_EMS を割るときに隠す。
 */
export function metaShownFor(
  input: RowsInput,
  style: RowStyle,
  size: number,
  colW: number,
): number {
  const all = input.items[0]?.meta.length ?? 0
  const room = colW - numberWidth(input, style, size)
  for (let k = all; k > 0; k--) {
    const total = metaMetrics(input, style, size, k).total
    if (
      total <= colW * META_SHARE[style] &&
      room - total >= MIN_TEXT_EMS[style] * size
    ) {
      return k
    }
  }
  return 0
}

/**
 * 名前の欄が MIN_TEXT_EMS を保てる最大の文字サイズ（補足列は隠せるので数えない）。
 * 幅は文字サイズに比例するので 100px で測って割り戻す。
 */
function sizeCapForText(
  input: RowsInput,
  style: RowStyle,
  colW: number,
): number {
  const perPx = numberWidth(input, style, 100) / 100 + MIN_TEXT_EMS[style]
  return colW / perPx
}

type Built = { h: number; texts: Array<PlacedText> }

function buildRow(
  input: RowsInput,
  item: RowItem,
  colW: number,
  style: RowStyle,
  size: number,
  numW: number,
  meta: ReturnType<typeof metaMetrics>,
): Built {
  const { measure, mode, fontFor } = input
  const { lineH, pad } = geometry(style, size)
  const artistFont = fontFor('artist', size, style)
  const titleFont = fontFor('title', size, style)
  const texts: Array<PlacedText> = []
  const firstY = pad / 2 + lineH / 2
  const put = (
    text: string,
    role: Role,
    x: number,
    y: number,
    font: string,
    extra: Partial<PlacedText> = {},
  ) => {
    if (!text) return
    texts.push({
      text,
      role,
      x,
      y,
      font,
      scaleX: 1,
      align: 'left',
      muted: false,
      ...extra,
    })
  }

  // 番号と補足列は 1 行目の高さに揃える
  if (input.showNumber) {
    put(item.num, 'num', 0, firstY, fontFor('num', size, style))
  }
  let mx = colW
  for (let i = meta.widths.length - 1; i >= 0; i--) {
    put(item.meta[i] ?? '', 'meta', mx, firstY, meta.font, { align: 'right' })
    mx -= meta.widths[i] + meta.gap
  }

  const textX = numW
  const lineAvail = colW - numW - meta.total

  const fitOrWrap = (
    text: string,
    width: number,
    font: string,
  ): Array<{ text: string; scaleX: number }> => {
    if (!text) return []
    if (mode === 'wrap') {
      return wrapText(text, width, 2, font, measure).map((t) => ({
        text: t,
        scaleX: 1,
      }))
    }
    const fitted = fitLine(text, width, font, measure, mode)
    return [{ text: fitted.text, scaleX: fitted.scaleX }]
  }

  if (style === 'double') {
    const artistLines = fitOrWrap(item.artist, lineAvail, artistFont)
    // 曲名の行は補足列の下まで使える
    const titleLines = fitOrWrap(
      item.title,
      artistLines.length > 0 ? colW - numW : lineAvail,
      titleFont,
    )
    let y = firstY
    for (const line of artistLines) {
      put(line.text, 'artist', textX, y, artistFont, { scaleX: line.scaleX })
      y += lineH
    }
    for (const line of titleLines) {
      put(line.text, 'title', textX, y, titleFont, {
        scaleX: line.scaleX,
        muted: artistLines.length > 0,
      })
      y += lineH
    }
    const lines = Math.max(1, artistLines.length + titleLines.length)
    return { h: pad + lines * lineH, texts }
  }

  // single / compact: 「Artist — Title」
  const sep = input.separator ?? ' — '
  const sepFont = fontFor('sep', size, style)
  if (mode === 'wrap') {
    const runs: Array<{ text: string; role: 'artist' | 'sep' | 'title' }> = []
    if (item.artist) runs.push({ text: item.artist, role: 'artist' })
    if (item.artist && item.title) runs.push({ text: sep, role: 'sep' })
    if (item.title) runs.push({ text: item.title, role: 'title' })
    const fontOf = (role: 'artist' | 'sep' | 'title') =>
      role === 'artist' ? artistFont : role === 'sep' ? sepFont : titleFont
    const lines = wrapRuns(
      runs,
      lineAvail,
      style === 'single' ? 3 : 2,
      fontOf,
      measure,
    )
    lines.forEach((line, i) => {
      for (const run of line) {
        put(
          run.text,
          run.role,
          textX + run.x,
          firstY + i * lineH,
          fontOf(run.role),
        )
      }
    })
    return { h: pad + Math.max(1, lines.length) * lineH, texts }
  }

  if (!item.artist || !item.title) {
    const only = item.artist || item.title
    const font = item.artist ? artistFont : titleFont
    const fitted = fitLine(only, lineAvail, font, measure, mode)
    put(fitted.text, item.artist ? 'artist' : 'title', textX, firstY, font, {
      scaleX: fitted.scaleX,
    })
    return { h: pad + lineH, texts }
  }
  const sepW = measure(sep, sepFont)
  const budget = splitWidths(
    measure(item.artist, artistFont),
    measure(item.title, titleFont),
    lineAvail - sepW,
    mode === 'condense' ? CONDENSE_MIN : 1,
  )
  const artist = fitLine(item.artist, budget.artist, artistFont, measure, mode)
  // アーティストが使わなかった幅は曲名へ回す
  const title = fitLine(
    item.title,
    lineAvail - sepW - artist.width,
    titleFont,
    measure,
    mode,
  )
  put(artist.text, 'artist', textX, firstY, artistFont, {
    scaleX: artist.scaleX,
  })
  put(sep, 'sep', textX + artist.width, firstY, sepFont)
  put(title.text, 'title', textX + artist.width + sepW, firstY, titleFont, {
    scaleX: title.scaleX,
  })
  return { h: pad + lineH, texts }
}

/** 指定の段数・行の形・文字サイズで組む（入りきらなければ「ほか N 曲」） */
export function layoutRowsAt(input: RowsInput, params: RowParams): RowsLayout {
  const { items, area, gap } = input
  const { columns, style, size, metaShown } = params
  const colW = columnWidth(area, columns, gap)
  const numFont = input.fontFor('num', size, style)
  const widestNum = items.reduce(
    (a, it) => (it.num.length > a.length ? it.num : a),
    '00',
  )
  const numW = input.showNumber
    ? input.measure(widestNum.replace(/\d/g, '0'), numFont) + size * 0.6
    : 0
  const meta = metaMetrics(input, style, size, metaShown)
  const built = items.map((item) =>
    buildRow(input, item, colW, style, size, numW, meta),
  )

  /** 段の高さの上限 limit で、上の段から順に詰める */
  const place = (count: number, limit = area.h) => {
    const rows: Array<PlacedRow> = []
    let col = 0
    let y = 0
    let placed = 0
    for (let i = 0; i < count; i++) {
      const { h, texts } = built[i]
      if (y + h > limit + 0.01) {
        col += 1
        y = 0
        if (col >= columns || h > area.h) break
      }
      rows.push({
        col,
        x: area.x + col * (colW + gap),
        y: area.y + y,
        w: colW,
        h,
        texts,
      })
      y += h
      placed += 1
    }
    return { rows, placed, col, y }
  }

  const all = place(items.length)
  if (all.placed === items.length) {
    // 全部入るなら、段の高さがそろうように上限を下げて詰め直す（最後の段だけ短い、を避ける）
    let balanced = all
    if (columns > 1) {
      let lo = Math.max(0, ...built.map((b) => b.h))
      let hi = area.h
      for (let i = 0; i < 16 && hi - lo > 0.5; i++) {
        const mid = (lo + hi) / 2
        if (place(items.length, mid).placed === items.length) hi = mid
        else lo = mid
      }
      balanced = place(items.length, hi)
    }
    return {
      ...params,
      rows: spreadRows(balanced.rows, area.h, size),
      placed: all.placed,
      overflow: false,
      hidden: 0,
    }
  }
  // 入りきらない: 最後の段に「ほか N 曲」の 1 行ぶんの余地を作る
  const { lineH, pad } = geometry(style, size)
  const moreH = pad + lineH
  let count = all.placed
  for (; count >= 0; count--) {
    const trial = place(count)
    const lastFull = trial.col >= columns
    if (!lastFull && trial.y + moreH <= area.h + 0.01) {
      const hidden = items.length - count
      const moreFont = input.fontFor('more', size, style)
      trial.rows.push({
        col: trial.col,
        x: area.x + trial.col * (colW + gap),
        y: area.y + trial.y,
        w: colW,
        h: moreH,
        texts: [
          {
            text: `ほか ${hidden} 曲`,
            role: 'more',
            x: numW,
            y: pad / 2 + lineH / 2,
            scaleX: 1,
            align: 'left',
            font: moreFont,
            muted: true,
          },
        ],
      })
      return {
        ...params,
        rows: trial.rows,
        placed: count,
        overflow: true,
        hidden,
      }
    }
  }
  return {
    ...params,
    rows: [],
    placed: 0,
    overflow: true,
    hidden: items.length,
  }
}

/**
 * 名前の欄の広さによる減点。文字が大きくても名前が数文字で切れるなら読めないので、
 * 欄が 24em を下回るほど評価を下げる（段を増やして文字だけ大きくなるのを防ぐ）。
 */
function textRoomFactor(input: RowsInput, params: RowParams): number {
  const colW = columnWidth(input.area, params.columns, input.gap)
  const meta = metaMetrics(input, params.style, params.size, params.metaShown)
  const room = colW - numberWidth(input, params.style, params.size) - meta.total
  const ems = room / params.size
  return Math.min(1, ems / 24) ** 0.7
}

/**
 * 全部入って高さが余るときは、行の上下の余白を少し広げて段の下に空きを残さない
 * （1 行あたり文字サイズの 0.8 倍まで）。
 */
function spreadRows(
  rows: Array<PlacedRow>,
  areaH: number,
  size: number,
): Array<PlacedRow> {
  const byCol = new Map<number, Array<PlacedRow>>()
  for (const row of rows) {
    const list = byCol.get(row.col)
    if (list) list.push(row)
    else byCol.set(row.col, [row])
  }
  let extra = size * 0.8
  for (const list of byCol.values()) {
    const used = list.reduce((sum, r) => sum + r.h, 0)
    extra = Math.min(extra, (areaH - used) / list.length)
  }
  if (extra < 0.5) return rows
  return Array.from(byCol.values()).flatMap((list) =>
    list.map((row, i) => ({
      ...row,
      y: row.y + extra * i,
      h: row.h + extra,
      // 文字は広げた行の縦中央へ
      texts: row.texts.map((t) => ({ ...t, y: t.y + extra / 2 })),
    })),
  )
}

export type FitOptions = {
  columnsOptions: ReadonlyArray<number>
  /** 行の形ごとの文字サイズの範囲 [最小, 最大] */
  sizeRange: Record<RowStyle, readonly [number, number]>
  styles?: ReadonlyArray<RowStyle>
  /** 前のページと同じ組み方に揃える */
  lock?: RowParams
}

/** 2 行組みは名前を省略せずに済むので少しひいきする */
const STYLE_WEIGHT: Record<RowStyle, number> = {
  double: 1.08,
  single: 1,
  compact: 0.94,
}

/**
 * 全曲が入る中で、いちばん大きな文字で組める段数・行の形・サイズを探す。
 * 段を増やすのは、文字が 8% 以上大きくなるときだけ（段は少ない方が読みやすい）。
 * どれでも入らなければ、最小サイズで入るだけ入れて「ほか N 曲」にする。
 */
export function fitRowsLayout(input: RowsInput, opts: FitOptions): RowsLayout {
  if (opts.lock) {
    const lock = opts.lock
    const colW = columnWidth(input.area, lock.columns, input.gap)
    const locked = layoutRowsAt(input, {
      ...lock,
      metaShown: Math.min(
        lock.metaShown,
        metaShownFor(input, lock.style, lock.size, colW),
      ),
    })
    // 入らない分はページ分割の側で次のページへ送る（組み方は 1 枚目にそろえたまま）
    return locked
  }
  const styles = opts.styles ?? ROW_STYLES
  type Candidate = RowParams & { score: number }
  let best: Candidate | undefined
  const paramsAt = (
    columns: number,
    style: RowStyle,
    size: number,
  ): RowParams => ({
    columns,
    style,
    size,
    metaShown: metaShownFor(
      input,
      style,
      size,
      columnWidth(input.area, columns, input.gap),
    ),
  })
  const fits = (p: RowParams) => !layoutRowsAt(input, p).overflow

  for (const columns of opts.columnsOptions) {
    for (const style of styles) {
      const [lo, hiRange] = opts.sizeRange[style]
      if (lo > hiRange) continue
      // 段が狭いと名前が切れてばかりになるので、名前の欄の幅で上限を抑える
      const hi = Math.max(
        lo,
        Math.min(
          hiRange,
          sizeCapForText(
            input,
            style,
            columnWidth(input.area, columns, input.gap),
          ),
        ),
      )
      let size: number | undefined
      if (fits(paramsAt(columns, style, hi))) {
        size = hi
      } else if (fits(paramsAt(columns, style, lo))) {
        let a = lo
        let b = hi
        for (let i = 0; i < 12 && b - a > 0.25; i++) {
          const mid = (a + b) / 2
          if (fits(paramsAt(columns, style, mid))) a = mid
          else b = mid
        }
        size = a
      }
      if (size === undefined) continue
      const params = paramsAt(columns, style, size)
      const candidate = {
        ...params,
        score: size * STYLE_WEIGHT[style] * textRoomFactor(input, params),
      }
      if (!best) {
        best = candidate
      } else if (candidate.columns === best.columns) {
        if (candidate.score > best.score) best = candidate
      } else if (candidate.score > best.score * 1.08) {
        best = candidate
      }
    }
  }
  if (best) return layoutRowsAt(input, best)

  // 入りきらない: 最小サイズの詰めた組みで、入る曲数が最大の段数を使う
  let fallback: RowsLayout | undefined
  for (const columns of opts.columnsOptions) {
    const lastStyle = styles[styles.length - 1]
    const layout = layoutRowsAt(
      input,
      paramsAt(columns, lastStyle, opts.sizeRange[lastStyle][0]),
    )
    if (!fallback || layout.placed > fallback.placed) fallback = layout
  }
  return (
    fallback ??
    layoutRowsAt(input, paramsAt(1, 'compact', opts.sizeRange.compact[0]))
  )
}
