import { describe, expect, it } from 'vitest'
import {
  columnOptions,
  getSize,
  maxColumnsFor,
  minLegibleFont,
  splitEvenly,
} from './layouts'
import { fitRowsLayout, layoutRowsAt, metaShownFor } from './rows'
import type { Measure } from './fit'
import type { FontFor, RowItem, RowsInput } from './rows'

const measure: Measure = (text, font) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10)
  return Array.from(text).length * size * 0.5
}
const fontFor: FontFor = (role, size) =>
  `${role === 'meta' ? size * 0.7 : size}px x`

function items(n: number, artist = 'Artist', title = 'Title'): Array<RowItem> {
  return Array.from({ length: n }, (_, i) => ({
    num: String(i + 1).padStart(2, '0'),
    artist,
    title,
    meta: ['00:00', '128', 'Am'],
  }))
}

function input(
  n: number,
  w = 1000,
  h = 1000,
  extra: Partial<RowsInput> = {},
): RowsInput {
  return {
    items: items(n),
    area: { x: 0, y: 0, w, h },
    gap: 40,
    mode: 'ellipsis',
    showNumber: true,
    fontFor,
    measure,
    ...extra,
  }
}

const RANGE = {
  double: [25, 44],
  single: [20, 38],
  compact: [20, 30],
} as const

describe('layoutRowsAt', () => {
  it('段を上から順に埋め、行の高さは形ごとに違う', () => {
    const one = layoutRowsAt(input(4), {
      columns: 1,
      style: 'single',
      size: 20,
      metaShown: 3,
    })
    const two = layoutRowsAt(input(4), {
      columns: 1,
      style: 'double',
      size: 20,
      metaShown: 3,
    })
    expect(one.rows[1].y - one.rows[0].y).toBeLessThan(
      two.rows[1].y - two.rows[0].y,
    )
    const cols = layoutRowsAt(input(40, 1000, 400), {
      columns: 2,
      style: 'compact',
      size: 20,
      metaShown: 3,
    })
    expect(cols.rows.some((r) => r.col === 1)).toBe(true)
    expect(cols.rows.every((r) => r.y + r.h <= 400.01)).toBe(true)
  })

  it('入りきらなければ最後に「ほか N 曲」', () => {
    const r = layoutRowsAt(input(100, 1000, 300), {
      columns: 1,
      style: 'compact',
      size: 20,
      metaShown: 3,
    })
    expect(r.overflow).toBe(true)
    const last = r.rows[r.rows.length - 1]
    expect(last.texts[0].text).toBe(`ほか ${r.hidden} 曲`)
    expect(r.placed + r.hidden).toBe(100)
    expect(last.y + last.h).toBeLessThanOrEqual(300.01)
  })

  it('折り返しモードでは行の高さが曲ごとに変わる', () => {
    const inp = input(2, 300, 1000, { mode: 'wrap' })
    inp.items = [
      { num: '01', artist: 'A', title: 'short', meta: [] },
      {
        num: '02',
        artist: 'A',
        title: 'a very long title that must wrap around',
        meta: [],
      },
    ]
    const r = layoutRowsAt(inp, {
      columns: 1,
      style: 'single',
      size: 20,
      metaShown: 0,
    })
    expect(r.rows[1].h).toBeGreaterThan(r.rows[0].h)
  })

  it('1 行組みで長い名前同士なら、アーティストは 4 割まで', () => {
    const inp = input(1, 600, 200)
    inp.items = [
      { num: '01', artist: 'A'.repeat(200), title: 'T'.repeat(200), meta: [] },
    ]
    const r = layoutRowsAt(inp, {
      columns: 1,
      style: 'single',
      size: 20,
      metaShown: 0,
    })
    const artist = r.rows[0].texts.find((t) => t.role === 'artist')
    const title = r.rows[0].texts.find((t) => t.role === 'title')
    expect(artist?.text.endsWith('…')).toBe(true)
    expect(title?.text.endsWith('…')).toBe(true)
    expect(measure(artist?.text ?? '', '20px x')).toBeLessThan(
      measure(title?.text ?? '', '20px x'),
    )
  })
})

describe('metaShownFor', () => {
  it('狭い段では補足列を右から隠す', () => {
    expect(metaShownFor(input(3), 'single', 20, 1000)).toBe(3)
    expect(metaShownFor(input(3), 'compact', 20, 200)).toBeLessThan(3)
  })
})

describe('fitRowsLayout', () => {
  it('少ない曲は 2 行組みの大きな文字', () => {
    const r = fitRowsLayout(input(8), { columnsOptions: [1], sizeRange: RANGE })
    expect(r.style).toBe('double')
    expect(r.size).toBeGreaterThan(38)
    expect(r.overflow).toBe(false)
  })

  it('曲が増えると 1 行組み → 詰めた組みへ下がり、最小サイズは割らない', () => {
    const mid = fitRowsLayout(input(30), {
      columnsOptions: [1],
      sizeRange: RANGE,
    })
    expect(mid.overflow).toBe(false)
    expect(mid.style).not.toBe('double')
    const many = fitRowsLayout(input(60), {
      columnsOptions: [1],
      sizeRange: RANGE,
    })
    expect(many.size).toBeGreaterThanOrEqual(20)
    expect(many.overflow).toBe(true)
  })

  it('自動の段数は、文字が大きくなるときだけ段を増やす', () => {
    const few = fitRowsLayout(input(6), {
      columnsOptions: [1, 2, 3],
      sizeRange: RANGE,
    })
    expect(few.columns).toBe(1)
    const many = fitRowsLayout(input(60, 1100), {
      columnsOptions: [1, 2, 3],
      sizeRange: RANGE,
    })
    expect(many.columns).toBeGreaterThan(1)
    expect(many.overflow).toBe(false)
  })

  it('lock で前のページと同じ組みにそろえる', () => {
    const lock = {
      columns: 2,
      style: 'single' as const,
      size: 22,
      metaShown: 3,
    }
    const r = fitRowsLayout(input(10), {
      columnsOptions: [1],
      sizeRange: RANGE,
      lock,
    })
    expect(r).toMatchObject({ columns: 2, style: 'single', size: 22 })
  })
})

describe('density helpers', () => {
  it('最小文字サイズは出力幅に比例', () => {
    expect(minLegibleFont(getSize('portrait'))).toBe(20)
    expect(minLegibleFont(getSize('wide'))).toBeCloseTo(22.22, 1)
  })

  it('3 段は横長だけ', () => {
    expect(maxColumnsFor(getSize('wide'), 1130, 40)).toBe(3)
    expect(maxColumnsFor(getSize('portrait'), 968, 40)).toBe(2)
    expect(columnOptions('auto', 2)).toEqual([1, 2])
    expect(columnOptions(3, 2)).toEqual([2])
  })

  it('均等に分けて先頭ページを 1 曲多くする', () => {
    expect(splitEvenly(80, 3)).toEqual([
      { start: 0, end: 27 },
      { start: 27, end: 54 },
      { start: 54, end: 80 },
    ])
    expect(splitEvenly(5, 10)).toHaveLength(5)
    expect(splitEvenly(0, 2)).toEqual([{ start: 0, end: 0 }])
  })
})

describe('placeDisc', () => {
  it('文字の領域を避けて、入る中でいちばん大きな盤を置く', async () => {
    const { placeDisc } = await import('./layouts')
    const avoid = [
      { x: 0, y: 0, w: 1080, h: 300 },
      { x: 0, y: 300, w: 600, h: 1050 },
    ]
    const disc = placeDisc({
      width: 1080,
      height: 1350,
      avoid,
      radii: [600, 300, 200],
      margin: 10,
      step: 20,
    })
    expect(disc).not.toBeNull()
    if (!disc) return
    expect(disc.r).toBe(300)
    // 避ける領域と重ならない
    expect(disc.cy - disc.r).toBeGreaterThanOrEqual(300)
    expect(disc.cx - disc.r).toBeGreaterThanOrEqual(600)
    expect(
      placeDisc({
        width: 1080,
        height: 1350,
        avoid: [{ x: 0, y: 0, w: 1080, h: 1350 }],
        radii: [100],
        margin: 0,
        step: 20,
      }),
    ).toBeNull()
  })
})
