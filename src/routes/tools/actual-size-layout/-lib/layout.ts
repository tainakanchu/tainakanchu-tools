export function totalContentHeightMm(params: {
  heightMm: number
  count: number
  gapMm: number
}): number {
  const { heightMm, count, gapMm } = params
  if (count <= 0) return 0
  return heightMm * count + gapMm * (count - 1)
}

export function printableHeightMm(marginMm: number): number {
  return 297 - marginMm * 2
}

export function printableWidthMm(marginMm: number): number {
  return 210 - marginMm * 2
}
