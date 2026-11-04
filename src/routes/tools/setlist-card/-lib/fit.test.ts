import { describe, expect, it } from 'vitest'
import {
  applyTint,
  contrastRatio,
  ensureContrast,
  hexToRgb,
  readableOn,
  rgbToHex,
} from './color'
import { ellipsize, fitFontSize, fitRows } from './fit'
import {
  CANVAS_SIZES,
  coverCrop,
  getSize,
  panDelta,
  planPhotoBlock,
} from './layouts'
import type { Measure } from './fit'

/** 文字数 × フォントサイズ × 0.5 の等幅もどき（CJK も 1 文字扱い） */
const measure: Measure = (text, font) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10)
  return Array.from(text).length * size * 0.5
}

describe('ellipsize', () => {
  it('収まる文字列はそのまま', () => {
    expect(ellipsize('abc', 100, '10px x', measure)).toBe('abc')
  })

  it('収まらなければ末尾を … で詰める', () => {
    // 1 文字 5px。30px なら … を含めて 6 文字
    expect(ellipsize('abcdefghij', 30, '10px x', measure)).toBe('abcde…')
    expect(ellipsize('夜明けのテーマです', 25, '10px x', measure)).toBe(
      '夜明けの…',
    )
  })

  it('… すら入らなければ空', () => {
    expect(ellipsize('abc', 2, '10px x', measure)).toBe('')
  })
})

const fontAt = (s: number) => `${s}px x`

describe('fitFontSize', () => {
  it('幅に収まる最大サイズを返す', () => {
    // 10 文字 × s × 0.5 <= 200 → s <= 40
    expect(fitFontSize('abcdefghij', 200, fontAt, measure, 10, 80)).toBe(40)
    expect(fitFontSize('ab', 200, fontAt, measure, 10, 80)).toBe(80)
    expect(fitFontSize('a'.repeat(100), 200, fontAt, measure, 10, 80)).toBe(10)
  })
})

describe('fitRows', () => {
  it('高さを等分し、上限で止める', () => {
    expect(
      fitRows({
        count: 10,
        columns: 1,
        areaHeight: 1000,
        minLine: 30,
        maxLine: 80,
      }),
    ).toEqual({ rows: 10, lineHeight: 80, visible: 10, overflow: false })
    expect(
      fitRows({
        count: 20,
        columns: 1,
        areaHeight: 1000,
        minLine: 30,
        maxLine: 80,
      }),
    ).toEqual({ rows: 20, lineHeight: 50, visible: 20, overflow: false })
  })

  it('2 段なら行数は半分', () => {
    const fit = fitRows({
      count: 41,
      columns: 2,
      areaHeight: 1050,
      minLine: 30,
      maxLine: 80,
    })
    expect(fit.rows).toBe(21)
    expect(fit.overflow).toBe(false)
  })

  it('最小の行高でも入らなければ「ほか N 曲」の 1 行を残してあふれ扱い', () => {
    const fit = fitRows({
      count: 50,
      columns: 1,
      areaHeight: 600,
      minLine: 30,
      maxLine: 80,
    })
    expect(fit).toEqual({
      rows: 20,
      lineHeight: 30,
      visible: 19,
      overflow: true,
    })
  })
})

describe('layouts', () => {
  it('cover の切り出しは枠の縦横比を保ち、pos で寄せる', () => {
    const crop = coverCrop(2000, 1000, 500, 500, 1, 0, 0.5)
    expect(crop).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 1000 })
    const right = coverCrop(2000, 1000, 500, 500, 1, 1, 0.5)
    expect(right.sx).toBe(1000)
    const zoomed = coverCrop(2000, 1000, 500, 500, 2, 0.5, 0.5)
    expect(zoomed).toEqual({ sx: 750, sy: 250, sw: 500, sh: 500 })
  })

  it('ドラッグ量は余白の割合に換算する（掴んで動かす向き）', () => {
    // 2000x1000 を 500x500 に cover: 枠 1px = 画像 2px、横の余り 1000px
    const d = panDelta(2000, 1000, 500, 500, 1, 100, 50)
    expect(d.dx).toBeCloseTo(-0.2)
    expect(d.dy).toBe(0)
  })

  it('写真枠は縦長なら上の帯、横長なら横の柱', () => {
    const portrait = planPhotoBlock('minimal', getSize('portrait'))
    expect(portrait?.side).toBe('top')
    expect(portrait?.content.y).toBe(portrait?.photo.h)
    const wide = planPhotoBlock('minimal', getSize('wide'))
    expect(wide?.side).toBe('left')
    // フォトは常に全面背景
    expect(planPhotoBlock('photo', getSize('portrait'))).toBeNull()
    // どの組み合わせでも本文が半分以上残る
    for (const size of CANVAS_SIZES) {
      for (const layout of [
        'minimal',
        'tracklist',
        'center',
        'editorial',
        'copy',
        'y2k',
      ] as const) {
        const plan = planPhotoBlock(layout, size)
        expect(plan).not.toBeNull()
        if (!plan) continue
        expect(plan.content.w * plan.content.h).toBeGreaterThanOrEqual(
          (size.width * size.height) / 2,
        )
      }
    }
  })
})

describe('color', () => {
  it('hex の往復', () => {
    expect(rgbToHex(hexToRgb('#ff2bd6'))).toBe('#ff2bd6')
    expect(hexToRgb('#abc')).toEqual([0xaa, 0xbb, 0xcc])
  })

  it('背景に合わせて白黒の文字色を選ぶ', () => {
    expect(readableOn([10, 10, 10])).toEqual([255, 255, 255])
    expect(readableOn([250, 250, 200])).toEqual([17, 17, 17])
  })

  it('コントラストが足りない色は明度を動かして補う', () => {
    const bg = hexToRgb('#101010')
    const dark = hexToRgb('#301030')
    const fixed = ensureContrast(dark, bg, 3)
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(3)
  })

  it('duotone は暗部 → 明部へ写す', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])
    applyTint(data, 'duotone', [
      [10, 20, 30],
      [100, 100, 100],
      [200, 210, 220],
    ])
    expect(Array.from(data)).toEqual([10, 20, 30, 255, 200, 210, 220, 255])
    const mono = new Uint8ClampedArray([255, 0, 0, 255])
    applyTint(mono, 'mono', [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ])
    expect(mono[0]).toBe(mono[1])
  })
})
