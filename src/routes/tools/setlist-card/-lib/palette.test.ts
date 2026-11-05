import { describe, expect, it } from 'vitest'
import { fitCentered, layoutCenterAt } from './center'
import { applyTint, contrastRatio, hexToRgb, mix } from './color'
import {
  fixContrast,
  oklabToRgb,
  rgbToOklab,
  rgbToOklch,
  withLightness,
} from './oklab'
import {
  autoCandidate,
  buildCandidates,
  extractSwatches,
} from './palette-extract'
import { assignRoles, parseColorList } from './palette-parse'
import {
  CONTRAST,
  PRESET_PALETTES,
  contrastReport,
  fixPalette,
  isDarkColor,
} from './palettes'
import {
  minScrimAlpha,
  resolvePhotoColors,
  worstContrast,
} from './photo-contrast'
import type { RGB } from './color'
import type { CenterInput } from './center'
import type { Measure } from './fit'
import type { Sample } from './photo-contrast'

const hueDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

describe('oklab', () => {
  it('sRGB と OKLab を往復できる', () => {
    for (const rgb of [
      [0, 0, 0],
      [255, 255, 255],
      [200, 85, 61],
      [12, 120, 240],
    ] as Array<RGB>) {
      const back = oklabToRgb(rgbToOklab(rgb))
      back.forEach((v, i) => expect(v).toBeCloseTo(rgb[i], 0))
    }
  })

  it('コントラストの補正は色相を保って明度だけ動かす', () => {
    const bg = hexToRgb('#101010')
    const color = hexToRgb('#5a1a8a')
    const fixed = fixContrast(color, bg, 4.5)
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(4.5)
    expect(hueDiff(rgbToOklch(fixed)[2], rgbToOklch(color)[2])).toBeLessThan(6)
    expect(rgbToOklch(fixed)[0]).toBeGreaterThan(rgbToOklch(color)[0])
  })

  it('範囲外の明度でも色相を保ったまま sRGB に収める', () => {
    const c = withLightness([255, 0, 0], 0.95)
    c.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    })
    expect(c[0]).toBeGreaterThan(c[1])
  })
})

describe('palettes', () => {
  it('プリセットはどれもコントラストの制約を満たす', () => {
    for (const p of PRESET_PALETTES) {
      const r = contrastReport(p)
      expect(r.fg, p.id).toBeGreaterThanOrEqual(7)
      expect(r.muted, p.id).toBeGreaterThanOrEqual(CONTRAST.muted)
      expect(r.accent, p.id).toBeGreaterThanOrEqual(CONTRAST.accent)
    }
  })

  it('足りないコントラストは明度で補い、背景は変えない', () => {
    const fixed = fixPalette({
      bg: '#202020',
      fg: '#555555',
      muted: '#333333',
      accent: '#401020',
      rule: '#303030',
      scrim: '#000000',
    })
    const r = contrastReport(fixed)
    expect(fixed.bg).toBe('#202020')
    expect(r.fg).toBeGreaterThanOrEqual(7)
    expect(r.muted).toBeGreaterThanOrEqual(4.5)
    expect(r.accent).toBeGreaterThanOrEqual(3)
    // 差し色の色相は保つ
    expect(
      hueDiff(
        rgbToOklch(hexToRgb(fixed.accent))[2],
        rgbToOklch(hexToRgb('#401020'))[2],
      ),
    ).toBeLessThan(8)
  })
})

describe('palette-parse', () => {
  it('カンマ・空白・改行区切りと # 無し・3 桁を読む', () => {
    expect(parseColorList('#0b0b0b #F2EFE9, c8553d\n#abc;zzz')).toEqual([
      '#0b0b0b',
      '#f2efe9',
      '#c8553d',
      '#aabbcc',
    ])
  })

  it('coolors.co の URL を読む', () => {
    expect(parseColorList('https://coolors.co/0b0b0b-f2efe9-c8553d')).toEqual([
      '#0b0b0b',
      '#f2efe9',
      '#c8553d',
    ])
    expect(
      parseColorList('https://coolors.co/palette/264653-2a9d8f-e9c46a'),
    ).toHaveLength(3)
  })

  it('先に書いた方を背景に、彩度の高い色を差し色にして、制約を満たす', () => {
    const p = assignRoles(['#0b0b0b', '#f2efe9', '#c8553d'])
    expect(p).not.toBeNull()
    if (!p) return
    expect(p.bg).toBe('#0b0b0b')
    expect(p.fg).toBe('#f2efe9')
    expect(
      hueDiff(
        rgbToOklch(hexToRgb(p.accent))[2],
        rgbToOklch(hexToRgb('#c8553d'))[2],
      ),
    ).toBeLessThan(8)
    const r = contrastReport(p)
    expect(r.fg).toBeGreaterThanOrEqual(7)
    expect(r.muted).toBeGreaterThanOrEqual(4.5)
    expect(r.accent).toBeGreaterThanOrEqual(3)
    expect(assignRoles([])).toBeNull()
    // 1 色だけでも読める配色にする
    const one = assignRoles(['#1d3b8f'])
    expect(one && contrastReport(one).fg).toBeGreaterThanOrEqual(4.5)
  })
})

/** 色の割合を指定した画素列（RGBA） */
function pixels(parts: Array<[RGB, number]>): Uint8ClampedArray {
  const total = parts.reduce((s, [, n]) => s + n, 0)
  const data = new Uint8ClampedArray(total * 4)
  let i = 0
  for (const [rgb, n] of parts) {
    for (let k = 0; k < n; k++) {
      // わずかに揺らして実際の写真に近づける
      data[i++] = rgb[0] + ((k * 7) % 5) - 2
      data[i++] = rgb[1] + ((k * 3) % 5) - 2
      data[i++] = rgb[2] + ((k * 11) % 5) - 2
      data[i++] = 255
    }
  }
  return data
}

describe('palette-extract', () => {
  const club = pixels([
    [[14, 12, 30], 6000],
    [[40, 30, 80], 2400],
    [[230, 40, 120], 900],
    [[40, 200, 230], 500],
    [[250, 240, 230], 200],
    // 2% 未満は捨てる
    [[255, 255, 0], 60],
  ])

  it('同じ入力なら同じ結果（固定シード）で、小さすぎる色は捨てる', () => {
    const a = extractSwatches(club)
    const b = extractSwatches(club)
    expect(a.map((s) => s.hex)).toEqual(b.map((s) => s.hex))
    expect(a.length).toBeGreaterThanOrEqual(4)
    expect(a.length).toBeLessThanOrEqual(8)
    expect(a.some((s) => s.lch[1] > 0.15 && hueDiff(s.lch[2], 0) < 20)).toBe(
      true,
    )
    // 黄色（0.6%）は残らない
    expect(a.some((s) => hueDiff(s.lch[2], 110) < 15 && s.lch[1] > 0.15)).toBe(
      false,
    )
    // 近い色はまとめられている
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        const d = Math.hypot(
          a[i].lab[0] - a[j].lab[0],
          a[i].lab[1] - a[j].lab[1],
          a[i].lab[2] - a[j].lab[2],
        )
        expect(d).toBeGreaterThanOrEqual(0.06)
      }
    }
  })

  it('候補はどれも制約を満たし、ダークの背景は最大クラスタの色相の暗い色', () => {
    const swatches = extractSwatches(club)
    const candidates = buildCandidates(swatches)
    expect(candidates.map((c) => c.candidate)).toEqual([
      'dark',
      'light',
      'vivid',
      'muted',
    ])
    for (const c of candidates) {
      const r = contrastReport(c)
      expect(r.fg, c.id).toBeGreaterThanOrEqual(4.5)
      expect(r.muted, c.id).toBeGreaterThanOrEqual(4.5)
      expect(r.accent, c.id).toBeGreaterThanOrEqual(3)
    }
    const dark = candidates[0]
    const [L, C] = rgbToOklch(hexToRgb(dark.bg))
    expect(L).toBeGreaterThanOrEqual(0.13)
    expect(L).toBeLessThanOrEqual(0.21)
    expect(C).toBeLessThanOrEqual(0.051)
    expect(isDarkColor(hexToRgb(candidates[1].bg))).toBe(false)
    expect(autoCandidate(swatches)).toBe('dark')
  })

  it('無彩色の写真では差し色を文字色にする', () => {
    const gray = extractSwatches(
      pixels([
        [[120, 120, 120], 500],
        [[30, 30, 30], 500],
      ]),
    )
    const [dark] = buildCandidates(gray)
    expect(dark.accent).toBe(dark.fg)
  })
})

describe('photo-contrast', () => {
  const bright: Array<Sample> = Array.from({ length: 50 }, (_, i) => ({
    rgb: [200 + (i % 50), 190, 180] as RGB,
    w: 1,
  }))

  it('いちばん低い画素が目標に届く最小の濃さ', () => {
    const white: RGB = [245, 245, 245]
    const scrim: RGB = [5, 5, 10]
    const { alpha, reached } = minScrimAlpha(
      bright,
      white,
      scrim,
      4.5,
      0.35,
      0.9,
    )
    expect(reached).toBe(true)
    expect(worstContrast(bright, white, scrim, alpha)).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(worstContrast(bright, white, scrim, alpha - 0.02)).toBeLessThan(4.5)
    // 暗い写真なら下限で足りる
    const dark = bright.map((s) => ({ ...s, rgb: [20, 20, 20] as RGB }))
    expect(minScrimAlpha(dark, white, scrim, 4.5, 0.35, 0.9).alpha).toBe(0.35)
  })

  it('グラデーションの効きが弱い画素ほど濃さが要る', () => {
    const half = bright.map((s) => ({ ...s, w: 0.5 }))
    const white: RGB = [245, 245, 245]
    const scrim: RGB = [5, 5, 10]
    const full = minScrimAlpha(bright, white, scrim, 4.5, 0, 1).alpha
    const partial = minScrimAlpha(half, white, scrim, 4.5, 0, 1).alpha
    expect(partial).toBeGreaterThan(full)
  })

  it('写真の上でも文字・補助・差し色が読めるようにする', () => {
    const ink = PRESET_PALETTES.find((p) => p.id === 'ink')
    if (!ink) throw new Error('no preset')
    const result = resolvePhotoColors(ink, [bright])
    const eff = bright.map((s) => ({
      rgb: mix(s.rgb, hexToRgb(result.scrim), result.alphas[0] * s.w),
      w: 0,
    }))
    const scrim = hexToRgb(result.scrim)
    expect(
      worstContrast(eff, hexToRgb(result.fg), scrim, 0),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      worstContrast(eff, hexToRgb(result.muted), scrim, 0),
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      worstContrast(eff, hexToRgb(result.accent), scrim, 0),
    ).toBeGreaterThanOrEqual(3)
    expect(result.alphas[0]).toBeGreaterThanOrEqual(0.35)
    expect(result.alphas[0]).toBeLessThanOrEqual(ink.scrimMax ?? 0.75)
  })

  it('明るい配色でも暗い写真なら文字を反転して幕を薄くする', () => {
    const paper = PRESET_PALETTES.find((p) => p.id === 'paper')
    if (!paper) throw new Error('no preset')
    const night = Array.from({ length: 40 }, () => ({
      rgb: [18, 14, 30] as RGB,
      w: 1,
    }))
    const result = resolvePhotoColors(paper, [night])
    expect(result.flipped).toBe(true)
    expect(isDarkColor(hexToRgb(result.fg))).toBe(false)
    // 幕は真っ黒ではなく、背景の色相の暗い色
    expect(result.scrim).not.toBe('#000000')
  })
})

describe('applyTint', () => {
  it('コピーは暗部を潰してインクと紙の 2 色の間に写す', () => {
    const data = new Uint8ClampedArray([10, 10, 10, 255, 250, 250, 250, 255])
    applyTint(data, 'xerox', [
      [20, 20, 20],
      [128, 0, 0],
      [240, 235, 225],
    ])
    expect(Array.from(data.slice(0, 3))).toEqual([20, 20, 20])
    expect(Array.from(data.slice(4, 7))).toEqual([240, 235, 225])
  })

  it('ドットは 3 色 + 中間の 5 段だけを使う', () => {
    const w = 8
    const data = new Uint8ClampedArray(w * w * 4)
    for (let i = 0; i < w * w; i++) data.set([100, 100, 100, 255], i * 4)
    const stops: [RGB, RGB, RGB] = [
      [0, 0, 0],
      [100, 0, 200],
      [255, 255, 255],
    ]
    applyTint(data, 'dither', stops, { width: w, cell: 1 })
    const colors = new Set<string>()
    for (let i = 0; i < w * w; i++)
      colors.add(data.slice(i * 4, i * 4 + 3).join(','))
    expect(colors.size).toBeGreaterThanOrEqual(2)
    expect(colors.size).toBeLessThanOrEqual(3)
  })
})

const measure: Measure = (text, font) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10)
  return Array.from(text).length * size * 0.5
}

function centerInput(n: number, extra: Partial<CenterInput> = {}): CenterInput {
  return {
    items: Array.from({ length: n }, (_, i) => ({
      num: String(i + 1).padStart(2, '0'),
      artist:
        i % 5 === 0
          ? 'A Very Long Artist Name Collective feat. Somebody'
          : 'Rin',
      title: 'Heat',
    })),
    width: 900,
    height: 900,
    gap: 60,
    separator: ' ／ ',
    stack: false,
    showNumber: false,
    mode: 'ellipsis',
    fontFor: (_role, size) => `${size}px x`,
    measure,
    ...extra,
  }
}

describe('center', () => {
  it('全曲が入る最大のサイズで組み、段の幅を超えない', () => {
    const input = centerInput(14)
    const layout = fitCentered(input, {
      columnsOptions: [1, 2],
      sizeRange: [20, 40],
    })
    expect(layout.overflow).toBe(false)
    expect(layout.placed).toBe(14)
    for (const b of layout.blocks) {
      for (const line of b.lines)
        expect(line.width).toBeLessThanOrEqual(layout.colWidth + 0.5)
      expect(b.y + b.h).toBeLessThanOrEqual(900 + 0.5)
    }
  })

  it('2 行組みは曲ごとに 2 行、入らなければ「ほか N 曲」', () => {
    const stacked = layoutCenterAt(centerInput(4, { stack: true }), {
      columns: 1,
      size: 30,
    })
    expect(stacked.blocks.every((b) => b.lines.length === 2)).toBe(true)
    const tight = layoutCenterAt(centerInput(80, { height: 300 }), {
      columns: 1,
      size: 30,
    })
    expect(tight.overflow).toBe(true)
    expect(tight.hidden).toBe(80 - tight.placed)
    expect(tight.blocks.at(-1)?.lines[0].runs[0].text).toBe(
      `ほか ${tight.hidden} 曲`,
    )
  })
})
