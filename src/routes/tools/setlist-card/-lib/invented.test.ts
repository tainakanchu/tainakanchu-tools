// @vitest-environment jsdom
/**
 * 入力に無い値・確かでない値（セットの長さ、品番、ファイル名など）は画像に描かない。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { LAYOUTS, getSize } from './layouts'
import { PRESET_PALETTES } from './palettes'
import { DEFAULT_REDACT } from './redact'
import { renderPage, resetMeasureCache } from './render'
import { createSampleSetlist } from './sample'
import { templateStyle } from './tpl-common'
import type { LayoutId } from './layouts'
import type { RenderInput } from './render'
import type { Setlist } from './types'

// ---------------------------------------------------------------------------
// 画像に描く文字（fillText を記録する偽の canvas）
// ---------------------------------------------------------------------------

let drawn: Array<string> = []

function fakeContext(): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {
    font: '10px sans-serif',
    canvas: { width: 1080, height: 1350 },
  }
  const special: Record<string, (...args: Array<never>) => unknown> = {
    measureText: (text: string) => {
      const size = Number(/([\d.]+)px/.exec(String(state.font))?.[1] ?? 10)
      return { width: Array.from(text).length * size * 0.55 }
    },
    fillText: (text: string) => {
      drawn.push(text)
    },
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => ({}),
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- テスト用の偽の 2D コンテキスト。描画で呼ばれるメソッドはすべて Proxy が受ける
  return new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop]
      if (typeof prop === 'symbol') return undefined
      if (prop in special) return special[prop]
      return () => undefined
    },
    set(target, prop, value) {
      target[prop] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

const inputFor = (setlist: Setlist, layout: LayoutId): RenderInput => ({
  setlist,
  layout,
  size: getSize('portrait'),
  palette: PRESET_PALETTES[0],
  style: templateStyle(layout),
  display: {
    number: true,
    bpm: true,
    key: true,
    label: true,
    credit: false,
  },
  text: { longText: 'ellipsis', stripMix: false, stripFeat: false },
  columns: 'auto',
  split: { enabled: false, mode: 'auto', count: 2 },
  redact: DEFAULT_REDACT,
  photo: null,
})

const textOf = (setlist: Setlist, layout: LayoutId) => {
  resetMeasureCache()
  drawn = []
  renderPage(fakeContext(), inputFor(setlist, layout), {
    index: 0,
    count: 1,
    start: 0,
    end: setlist.tracks.length,
  })
  return drawn
}

/** 入力に無い、作った値（以前は描いていたもの） */
const INVENTED = [
  /KAN-/,
  /\.m3u/,
  /LOADING/i,
  /\bSides? [A-Z]/i,
  /\d+h \d+m/,
  /\d+ min/,
]

describe('どのテンプレートも作った値を描かない', () => {
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() =>
      fakeContext(),
    )
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  for (const { id } of LAYOUTS) {
    it(`${id}: サンプルは曲数だけで、長さ・品番・ファイル名を書かない`, () => {
      const text = textOf(createSampleSetlist(), id).join('\n')
      for (const pattern of INVENTED) expect(text).not.toMatch(pattern)
      // 曲数のあとに区切りだけが残らない
      expect(text).not.toMatch(/tracks? ·\s*$/im)
      expect(text).not.toMatch(/TRACKS? \/\s*$/m)
    })
  }

  it('再生記録に終わりの時刻があっても、セットの長さは描かない', () => {
    const sample = createSampleSetlist()
    const logged: Setlist = {
      ...sample,
      tracks: sample.tracks.map((t) =>
        t.startAt === undefined
          ? t
          : { ...t, endAt: t.startAt + 6 * 60, playedSec: 6 * 60 },
      ),
    }
    for (const { id } of LAYOUTS) {
      const text = textOf(logged, id).join('\n')
      expect(text).not.toMatch(/\d+h \d+m/i)
      expect(text).not.toMatch(/\d+ min/i)
      expect(text).not.toMatch(/LENGTH/)
    }
  })

  it('BPM・Key はある曲にだけ描き、無い曲に仮の値を置かない', () => {
    const sample = createSampleSetlist()
    const partial: Setlist = {
      ...sample,
      tracks: sample.tracks.map((t, i) =>
        i === 1
          ? { ...t, bpm: undefined, key: undefined, startAt: undefined }
          : t,
      ),
    }
    const text = textOf(partial, 'tracklist')
    // 2 曲目の行の補足列は空（「--」「0」「00:00」のような埋め草は出さない）
    for (const placeholder of ['--', '—:—', 'N/A', '???']) {
      expect(text).not.toContain(placeholder)
    }
    expect(text.filter((t) => t === '120')).toHaveLength(1)
    // 再生時刻（00:00 のような経過時間）は描かない
    expect(text.some((t) => /^\d{2}:\d{2}$/.test(t))).toBe(false)
  })
})
