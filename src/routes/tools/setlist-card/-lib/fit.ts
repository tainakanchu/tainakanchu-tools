/**
 * 文字の自動フィット・省略・流し込みの計算。
 * 文字幅の測り方（canvas の measureText）は外から注入するので、
 * canvas の無いテスト環境でも同じロジックを検証できる。
 */

export type Measure = (text: string, font: string) => number

export type Rect = { x: number; y: number; w: number; h: number }

/** 末尾を「…」で詰めて maxWidth に収める（収まるならそのまま） */
export function ellipsize(
  text: string,
  maxWidth: number,
  font: string,
  measure: Measure,
): string {
  if (maxWidth <= 0) return ''
  if (measure(text, font) <= maxWidth) return text
  const chars = Array.from(text)
  const ellipsis = '…'
  if (measure(ellipsis, font) > maxWidth) return ''
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = chars.slice(0, mid).join('').trimEnd() + ellipsis
    if (measure(candidate, font) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return chars.slice(0, lo).join('').trimEnd() + ellipsis
}

/** 1 行に収まる最大のフォントサイズ（min を下回るなら min） */
export function fitFontSize(
  text: string,
  maxWidth: number,
  fontAt: (size: number) => string,
  measure: Measure,
  min: number,
  max: number,
): number {
  if (!text) return max
  const width = measure(text, fontAt(max))
  if (width <= maxWidth) return max
  // 幅はサイズにほぼ比例するので一発で当ててから微調整する
  let size = Math.max(min, Math.floor((max * maxWidth) / width))
  while (size > min && measure(text, fontAt(size)) > maxWidth) size -= 1
  return size
}

export type RowFit = {
  /** 1 段あたりの行数 */
  rows: number
  lineHeight: number
  /** 実際に描く曲数（あふれたら「ほか N 曲」の 1 行ぶん減る） */
  visible: number
  overflow: boolean
}

/**
 * count 曲を columns 段に流したときの行の高さ。
 * maxLine を上限に areaHeight を等分し、minLine を割るなら入る分だけにする。
 */
export function fitRows(opts: {
  count: number
  columns: number
  areaHeight: number
  minLine: number
  maxLine: number
}): RowFit {
  const { count, columns, areaHeight, minLine, maxLine } = opts
  const rows = Math.max(1, Math.ceil(count / columns))
  const ideal = areaHeight / rows
  if (ideal >= minLine) {
    return {
      rows,
      lineHeight: Math.min(maxLine, ideal),
      visible: count,
      overflow: false,
    }
  }
  const fitRowsCount = Math.max(1, Math.floor(areaHeight / minLine))
  const capacity = fitRowsCount * columns
  return {
    rows: fitRowsCount,
    lineHeight: minLine,
    visible: Math.max(0, capacity - 1),
    overflow: true,
  }
}

/** 流し込みテキストの最小単位 */
export type Run = {
  text: string
  role: 'num' | 'artist' | 'title' | 'sep' | 'meta'
}

export type PlacedRun = Run & { x: number; width: number }
export type FlowLine = Array<PlacedRun>

export type FlowResult = {
  lines: Array<FlowLine>
  /** 入りきった曲数 */
  placed: number
}

/**
 * 曲（Run の並び）を区切り文字を挟みながら行へ流し込む。
 * 曲は途中で改行しない。1 行に入らない長い曲は title → artist の順に省略する。
 */
export function flowSegments(opts: {
  segments: ReadonlyArray<ReadonlyArray<Run>>
  separator: Run
  width: number
  maxLines: number
  fontFor: (role: Run['role']) => string
  measure: Measure
  /** true なら 1 曲 1 行（区切り文字なし） */
  breakEach?: boolean
}): FlowResult {
  const { segments, separator, width, maxLines, fontFor, measure } = opts
  const widthOf = (run: Run) => measure(run.text, fontFor(run.role))
  const sepWidth = widthOf(separator)
  const lines: Array<FlowLine> = []
  let line: FlowLine = []
  let x = 0
  let placed = 0

  const fitSegment = (segment: ReadonlyArray<Run>): Array<Run> => {
    const runs = segment.map((r) => ({ ...r }))
    const total = () => runs.reduce((sum, r) => sum + widthOf(r), 0)
    for (const role of ['title', 'artist'] as const) {
      const over = total() - width
      if (over <= 0) break
      const run = runs.find((r) => r.role === role)
      if (!run) continue
      const allowed = Math.max(0, widthOf(run) - over)
      run.text = ellipsize(run.text, allowed, fontFor(role), measure)
    }
    return runs.filter((r) => r.text !== '')
  }

  for (const segment of segments) {
    const runs = fitSegment(segment)
    const segWidth = runs.reduce((sum, r) => sum + widthOf(r), 0)
    const needsSep = line.length > 0
    const required = segWidth + (needsSep ? sepWidth : 0)
    if (needsSep && (opts.breakEach === true || x + required > width)) {
      lines.push(line)
      line = []
      x = 0
      if (lines.length >= maxLines) break
    }
    if (line.length > 0) {
      line.push({ ...separator, x, width: sepWidth })
      x += sepWidth
    }
    for (const run of runs) {
      const w = widthOf(run)
      line.push({ ...run, x, width: w })
      x += w
    }
    placed += 1
  }
  if (line.length > 0 && lines.length < maxLines) lines.push(line)
  return { lines, placed }
}

/**
 * 流し込みが高さに収まる最大のフォントサイズを二分探索する。
 * 全曲入らないなら min サイズで入るところまで。
 */
export function fitFlow(opts: {
  segments: ReadonlyArray<ReadonlyArray<Run>>
  separator: Run
  width: number
  height: number
  lineHeightRatio: number
  min: number
  max: number
  fontFor: (role: Run['role'], size: number) => string
  measure: Measure
  breakEach?: boolean
}): FlowResult & { size: number; lineHeight: number; overflow: boolean } {
  const { segments, height, lineHeightRatio, min, max } = opts
  const run = (size: number) => {
    const lineHeight = size * lineHeightRatio
    const maxLines = Math.max(1, Math.floor(height / lineHeight))
    const result = flowSegments({
      segments,
      separator: opts.separator,
      width: opts.width,
      maxLines,
      fontFor: (role) => opts.fontFor(role, size),
      measure: opts.measure,
      breakEach: opts.breakEach,
    })
    return { ...result, size, lineHeight }
  }
  let lo = min
  let hi = max
  let best: ReturnType<typeof run> | undefined
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2
    const result = run(mid)
    if (result.placed >= segments.length) {
      best = result
      lo = mid
    } else {
      hi = mid
    }
  }
  const top = run(max)
  if (top.placed >= segments.length) return { ...top, overflow: false }
  if (best) return { ...best, overflow: false }
  const fallback = run(min)
  return { ...fallback, overflow: fallback.placed < segments.length }
}
