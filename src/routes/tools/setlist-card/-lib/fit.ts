/**
 * 文字の自動フィット・省略の計算。
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
