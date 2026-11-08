import { describe, expect, it } from 'vitest'
import { SPOT_CATEGORY_IDS } from '../../../../lib/taiwan-map/types'
import { CATEGORY_COLORS, CATEGORY_COLORS_DARK } from './categoryColors'
import {
  DARK_BASEMAP,
  DARK_BASEMAP_PAINT,
  SPOT_LAYER_COLORS,
  basemapPaintPlan,
} from './mapTheme'

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`not #rrggbb: ${hex}`)
  const n = Number.parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function hue(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

describe('ダークのベース地図', () => {
  const labels = Object.entries(DARK_BASEMAP_PAINT).flatMap(([id, paint]) =>
    paint && 'text-color' in paint ? [[id, paint] as const] : [],
  )

  it('地名・道路名の文字は縁取りと陸の色の両方に 4.5:1 以上', () => {
    expect(labels.length).toBeGreaterThan(5)
    for (const [id, paint] of labels) {
      const text = String(paint['text-color'])
      const halo = String(paint['text-halo-color'])
      expect(contrast(text, halo), id).toBeGreaterThanOrEqual(4.5)
      expect(contrast(text, DARK_BASEMAP.land), id).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('海・川の名前は海の上でも 4.5:1 以上', () => {
    expect(
      contrast(DARK_BASEMAP.waterLabel, DARK_BASEMAP.water),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('海と陸は見分けられる明るさの差がある', () => {
    expect(luminance(DARK_BASEMAP.water)).toBeLessThan(
      luminance(DARK_BASEMAP.land),
    )
  })
})

describe('basemapPaintPlan', () => {
  it('表にある id はその色、無い id は種類ごとの色、自前のレイヤーは飛ばす', () => {
    const plan = basemapPaintPlan(
      [
        { id: 'water', type: 'fill' },
        { id: 'new_fill_layer', type: 'fill' },
        { id: 'hillshade', type: 'hillshade' },
        { id: 'tw-spot-pins', type: 'circle' },
        { id: 'tw-spot-labels', type: 'symbol' },
      ],
      new Set(['tw-spot-labels']),
    )
    expect(plan).toEqual([
      { layerId: 'water', property: 'fill-color', dark: DARK_BASEMAP.water },
      {
        layerId: 'new_fill_layer',
        property: 'fill-color',
        dark: DARK_BASEMAP.residential,
      },
    ])
  })
})

describe('ピンの色（ダーク）', () => {
  const dark = SPOT_LAYER_COLORS.dark

  it('ジャンル色は全カテゴリで別々で、ライトと同じ色相のまま', () => {
    const colors = SPOT_CATEGORY_IDS.map((id) => CATEGORY_COLORS_DARK[id])
    expect(new Set(colors).size).toBe(SPOT_CATEGORY_IDS.length)
    for (const id of SPOT_CATEGORY_IDS) {
      if (id === 'other') continue // 灰色は色相を持たない
      const diff = Math.abs(
        hue(CATEGORY_COLORS[id]) - hue(CATEGORY_COLORS_DARK[id]),
      )
      expect(Math.min(diff, 360 - diff), id).toBeLessThan(20)
    }
  })

  it('ジャンル色は暗い陸と未訪問のピンの中の色に 3:1 以上', () => {
    for (const id of SPOT_CATEGORY_IDS) {
      const c = CATEGORY_COLORS_DARK[id]
      expect(contrast(c, DARK_BASEMAP.land), id).toBeGreaterThanOrEqual(3)
      expect(contrast(c, dark.hollowFill), id).toBeGreaterThanOrEqual(3)
    }
  })

  it('ピンの名前は縁取りに対して 4.5:1 以上（ライト・ダークとも）', () => {
    for (const c of Object.values(SPOT_LAYER_COLORS)) {
      expect(contrast(c.label, c.labelHalo)).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast(dark.label, DARK_BASEMAP.land)).toBeGreaterThanOrEqual(4.5)
  })

  it('選択の輪は暗い陸の上でも 3:1 以上', () => {
    expect(contrast(dark.select, DARK_BASEMAP.land)).toBeGreaterThanOrEqual(3)
  })
})
