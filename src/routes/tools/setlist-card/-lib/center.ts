/**
 * センター（フライヤーのラインナップ風）の行組み。純粋な計算なので単体テストできる。
 *
 * 1 曲を中央揃えの 1 行「Artist ／ Title」か、2 行（アーティストの行と曲名の行）で組む。
 * 曲が多いときは段を増やし、全曲が入る最大の文字サイズを探す。入らなければ
 * 最後に「ほか N 曲」。長い名前は省略 / 縮める / 折り返し（最大 2 行）に従う。
 */
import {
  CONDENSE_MIN,
  fitLine,
  splitWidths,
  wrapRuns,
  wrapText,
} from './textfit'
import type { Measure } from './fit'
import type { LongTextMode } from './textfit'

export type CenterRole = 'num' | 'artist' | 'sep' | 'title' | 'more'

export type CenterItem = { num: string; artist: string; title: string }

export type CenterParams = { columns: number; size: number }

export type CenterRun = {
  text: string
  role: CenterRole
  /** 行の左端からの位置 */
  x: number
  width: number
  scaleX: number
}

export type CenterLine = { runs: Array<CenterRun>; width: number }

export type CenterBlock = {
  col: number
  /** 領域の上端からの位置 */
  y: number
  h: number
  lines: Array<CenterLine>
}

export type CenterInput = {
  items: ReadonlyArray<CenterItem>
  width: number
  height: number
  /** 段の間隔 */
  gap: number
  separator: string
  /** アーティストと曲名を 2 行に分ける */
  stack: boolean
  showNumber: boolean
  mode: LongTextMode
  fontFor: (role: CenterRole, size: number) => string
  measure: Measure
}

export type CenterLayout = CenterParams & {
  blocks: Array<CenterBlock>
  colWidth: number
  lineHeight: number
  placed: number
  overflow: boolean
  hidden: number
  /** 一番高い段の高さ */
  usedHeight: number
}

/** 行の高さ（文字サイズの倍率）と曲の間の空き */
function metrics(size: number, stack: boolean) {
  return stack
    ? { lineH: size * 1.24, itemGap: size * 0.62 }
    : { lineH: size * 1.36, itemGap: size * 0.3 }
}

export function centerColumnWidth(input: CenterInput, columns: number): number {
  return (input.width - input.gap * (columns - 1)) / columns
}

function buildItem(
  input: CenterInput,
  item: CenterItem,
  colW: number,
  size: number,
): Array<CenterLine> {
  const { measure, mode } = input
  const fontOf = (role: CenterRole) => input.fontFor(role, size)
  const place = (
    parts: Array<{ text: string; role: CenterRole; scaleX?: number }>,
  ): CenterLine => {
    let x = 0
    const runs: Array<CenterRun> = []
    for (const p of parts) {
      if (!p.text) continue
      const scaleX = p.scaleX ?? 1
      const width = measure(p.text, fontOf(p.role)) * scaleX
      runs.push({ text: p.text, role: p.role, x, width, scaleX })
      x += width
    }
    return { runs, width: x }
  }
  const num = input.showNumber && item.num ? `${item.num}  ` : ''
  const numW = num ? measure(num, fontOf('num')) : 0

  const fitOrWrap = (
    text: string,
    role: CenterRole,
    width: number,
  ): Array<{ text: string; scaleX: number }> => {
    if (!text) return []
    if (mode === 'wrap') {
      return wrapText(text, width, 2, fontOf(role), measure).map((t) => ({
        text: t,
        scaleX: 1,
      }))
    }
    const f = fitLine(text, width, fontOf(role), measure, mode)
    return [{ text: f.text, scaleX: f.scaleX }]
  }

  if (input.stack || !item.artist || !item.title) {
    const lines: Array<CenterLine> = []
    const artist = fitOrWrap(item.artist, 'artist', colW - numW)
    artist.forEach((l, i) =>
      lines.push(
        place([
          { text: i === 0 ? num : '', role: 'num' },
          { text: l.text, role: 'artist', scaleX: l.scaleX },
        ]),
      ),
    )
    const title = fitOrWrap(
      item.title,
      'title',
      item.artist ? colW : colW - numW,
    )
    title.forEach((l, i) =>
      lines.push(
        place([
          { text: !item.artist && i === 0 ? num : '', role: 'num' },
          { text: l.text, role: 'title', scaleX: l.scaleX },
        ]),
      ),
    )
    return lines.length > 0 ? lines : [place([{ text: num, role: 'num' }])]
  }

  const sep = input.separator
  const sepW = measure(sep, fontOf('sep'))
  const avail = colW - numW
  if (mode === 'wrap') {
    const runs: Array<{ text: string; role: 'artist' | 'sep' | 'title' }> = [
      { text: item.artist, role: 'artist' },
      { text: sep, role: 'sep' },
      { text: item.title, role: 'title' },
    ]
    const wrapped = wrapRuns(runs, avail, 2, (r) => fontOf(r), measure)
    return wrapped.map((line, i) =>
      place([
        { text: i === 0 ? num : '', role: 'num' },
        ...line.map((r) => ({ text: r.text, role: r.role })),
      ]),
    )
  }
  const budget = splitWidths(
    measure(item.artist, fontOf('artist')),
    measure(item.title, fontOf('title')),
    avail - sepW,
    mode === 'condense' ? CONDENSE_MIN : 1,
  )
  const artist = fitLine(
    item.artist,
    budget.artist,
    fontOf('artist'),
    measure,
    mode,
  )
  const title = fitLine(
    item.title,
    avail - sepW - artist.width,
    fontOf('title'),
    measure,
    mode,
  )
  return [
    place([
      { text: num, role: 'num' },
      { text: artist.text, role: 'artist', scaleX: artist.scaleX },
      { text: sep, role: 'sep' },
      { text: title.text, role: 'title', scaleX: title.scaleX },
    ]),
  ]
}

const usedOf = (blocks: ReadonlyArray<CenterBlock>) =>
  blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0)

/** 指定の段数・文字サイズで組む */
export function layoutCenterAt(
  input: CenterInput,
  params: CenterParams,
): CenterLayout {
  const { items, height } = input
  const { columns, size } = params
  const colW = centerColumnWidth(input, columns)
  const { lineH, itemGap } = metrics(size, input.stack)
  const built = items.map((item) => buildItem(input, item, colW, size))
  const heightOf = (lines: Array<CenterLine>) => lines.length * lineH

  const place = (count: number, limit: number) => {
    const blocks: Array<CenterBlock> = []
    let col = 0
    let y = 0
    let placed = 0
    for (let i = 0; i < count; i++) {
      const h = heightOf(built[i])
      const need = (y > 0 ? itemGap : 0) + h
      if (y + need > limit + 0.01) {
        col += 1
        y = 0
        if (col >= columns || h > height) break
      }
      const top = y > 0 ? y + itemGap : 0
      blocks.push({ col, y: top, h, lines: built[i] })
      y = top + h
      placed += 1
    }
    return { blocks, placed, col, y }
  }

  const all = place(items.length, height)
  if (all.placed === items.length) {
    let balanced = all
    if (columns > 1) {
      let lo = Math.max(0, ...built.map(heightOf))
      let hi = height
      for (let i = 0; i < 16 && hi - lo > 0.5; i++) {
        const mid = (lo + hi) / 2
        if (place(items.length, mid).placed === items.length) hi = mid
        else lo = mid
      }
      balanced = place(items.length, hi)
    }
    return {
      ...params,
      blocks: balanced.blocks,
      colWidth: colW,
      lineHeight: lineH,
      placed: items.length,
      overflow: false,
      hidden: 0,
      usedHeight: usedOf(balanced.blocks),
    }
  }
  // 入りきらない: 最後の段に「ほか N 曲」の 1 行ぶんを空ける
  for (let count = all.placed; count >= 0; count--) {
    const trial = place(count, height)
    const room =
      trial.col < columns && trial.y + itemGap + lineH <= height + 0.01
    if (!room) continue
    const hidden = items.length - count
    const text = `ほか ${hidden} 曲`
    const width = input.measure(text, input.fontFor('more', size))
    trial.blocks.push({
      col: trial.col,
      y: trial.y > 0 ? trial.y + itemGap : 0,
      h: lineH,
      lines: [
        { runs: [{ text, role: 'more', x: 0, width, scaleX: 1 }], width },
      ],
    })
    return {
      ...params,
      blocks: trial.blocks,
      colWidth: colW,
      lineHeight: lineH,
      placed: count,
      overflow: true,
      hidden,
      usedHeight: usedOf(trial.blocks),
    }
  }
  return {
    ...params,
    blocks: [],
    colWidth: colW,
    lineHeight: lineH,
    placed: 0,
    overflow: true,
    hidden: items.length,
    usedHeight: 0,
  }
}

/**
 * 全曲が入る最大の文字サイズと段数を探す。段を増やすのは文字が 2 割以上
 * 大きくなり、段の幅も足りるときだけ。どれでも入らなければ最小サイズで入る分だけ。
 */
export function fitCentered(
  input: CenterInput,
  opts: {
    columnsOptions: ReadonlyArray<number>
    sizeRange: readonly [number, number]
    lock?: CenterParams
  },
): CenterLayout {
  if (opts.lock) return layoutCenterAt(input, opts.lock)
  const [lo, hi] = opts.sizeRange
  let best: CenterLayout | undefined
  for (const columns of opts.columnsOptions) {
    const fits = (size: number) =>
      !layoutCenterAt(input, { columns, size }).overflow
    let size: number | undefined
    if (fits(hi)) size = hi
    else if (fits(lo)) {
      let a = lo
      let b = hi
      for (let i = 0; i < 12 && b - a > 0.25; i++) {
        const mid = (a + b) / 2
        if (fits(mid)) a = mid
        else b = mid
      }
      size = a
    }
    if (size === undefined) continue
    const layout = layoutCenterAt(input, { columns, size })
    // 段を増やすのは、文字が 2 割以上大きくなり、かつ 1 段が文字 18 個ぶん以上あるときだけ
    // （中央揃えで名前が「…」だらけになるのを避ける）
    const roomy = layout.colWidth >= layout.size * 18
    if (!best || (roomy && layout.size > best.size * 1.2)) best = layout
  }
  if (best) return best
  let fallback: CenterLayout | undefined
  for (const columns of opts.columnsOptions) {
    const layout = layoutCenterAt(input, { columns, size: lo })
    if (!fallback || layout.placed > fallback.placed) fallback = layout
  }
  return fallback ?? layoutCenterAt(input, { columns: 1, size: lo })
}
