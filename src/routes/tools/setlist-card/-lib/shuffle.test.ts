import { describe, expect, it } from 'vitest'
import { LAYOUTS } from './layouts'
import { PRESET_PALETTES } from './palettes'
import { mulberry32 } from './random'
import {
  EMPTY_HISTORY,
  HISTORY_MAX,
  RECENT_MAX,
  afterShuffle,
  canGoBack,
  canGoForward,
  comboKey,
  goBack,
  goForward,
  pushRecent,
  randomLayouts,
  randomStyle,
  sameDesign,
  shuffleDesign,
} from './shuffle'
import { templateStyle } from './tpl-common'
import type { Design, ShuffleOptions } from './shuffle'
import type { Palette } from './palettes'

const LAYOUT_IDS = LAYOUTS.map((l) => l.id)
const start: Design = {
  layout: 'minimal',
  palette: PRESET_PALETTES[0],
  style: templateStyle('minimal'),
}
const photoPalettes: Array<Palette> = ['dark', 'light', 'vivid', 'muted'].map(
  (c, i) => ({
    ...PRESET_PALETTES[1],
    bg: `#10203${i}`,
    id: `photo-${c}`,
    name: c,
  }),
)

function opts(extra: Partial<ShuffleOptions> = {}): ShuffleOptions {
  return {
    locks: { layout: false, palette: false },
    layouts: LAYOUT_IDS,
    presets: PRESET_PALETTES,
    photoPalettes: [],
    recent: [],
    rng: mulberry32(1),
    ...extra,
  }
}

/** 押し続けたときの結果（直近の組み合わせを覚えながら） */
function run(n: number, extra: Partial<ShuffleOptions> = {}): Array<Design> {
  const rng = extra.rng ?? mulberry32(42)
  let current = start
  let recent: Array<string> = []
  const out: Array<Design> = []
  for (let i = 0; i < n; i++) {
    const next = shuffleDesign(current, opts({ ...extra, rng, recent }))
    if (!next) break
    recent = pushRecent(
      recent,
      comboKey(current.layout, current.palette),
      comboKey(next.layout, next.palette),
    )
    out.push(next)
    current = next
  }
  return out
}

describe('shuffleDesign', () => {
  it('同じ乱数なら同じ結果（種で再現できる）', () => {
    expect(run(10, { rng: mulberry32(7) })).toEqual(
      run(10, { rng: mulberry32(7) }),
    )
  })

  it('今と同じ組み合わせ・直近 5 回の組み合わせには戻らない', () => {
    const seq = [start, ...run(300)]
    for (let i = 1; i < seq.length; i++) {
      const key = comboKey(seq[i].layout, seq[i].palette)
      const earlier = seq
        .slice(Math.max(0, i - RECENT_MAX), i)
        .map((d) => comboKey(d.layout, d.palette))
      expect(earlier).not.toContain(key)
    }
  })

  it('テンプレート固定ならテンプレートと文字組みはそのまま、パレットだけ変わる', () => {
    const seq = run(40, { locks: { layout: true, palette: false } })
    expect(seq).toHaveLength(40)
    for (const [i, d] of seq.entries()) {
      expect(d.layout).toBe('minimal')
      expect(d.style).toEqual(start.style)
      const prev = i === 0 ? start : seq[i - 1]
      expect(d.palette.id).not.toBe(prev.palette.id)
    }
  })

  it('パレット固定ならパレットはそのまま、テンプレートが変わる', () => {
    const seq = run(40, { locks: { layout: false, palette: true } })
    for (const [i, d] of seq.entries()) {
      expect(d.palette).toBe(start.palette)
      const prev = i === 0 ? start : seq[i - 1]
      expect(d.layout).not.toBe(prev.layout)
    }
  })

  it('両方固定なら選び直さない', () => {
    expect(
      shuffleDesign(start, opts({ locks: { layout: true, palette: true } })),
    ).toBeNull()
  })

  it('候補が直近の組み合わせだけでも、今と違うものは選ぶ', () => {
    const next = shuffleDesign(
      start,
      opts({
        layouts: ['minimal', 'center'],
        presets: [PRESET_PALETTES[0]],
        recent: ['center|' + PRESET_PALETTES[0].id],
      }),
    )
    expect(next?.layout).toBe('center')
  })

  it('除外した組み合わせは選ばない', () => {
    const excluded = PRESET_PALETTES.slice(1).map(
      (p) => ['center', p.id] as const,
    )
    for (const d of run(80, { excluded })) {
      if (d.layout === 'center')
        expect(d.palette.id).toBe(PRESET_PALETTES[0].id)
    }
  })

  it('「写真から自動」のときは、同じ色の写真の配色を同じテンプレートで選ばない', () => {
    const auto: Design = {
      ...start,
      palette: { ...photoPalettes[0], id: 'photo-auto', name: '写真から自動' },
    }
    const rng = mulberry32(11)
    for (let i = 0; i < 200; i++) {
      const next = shuffleDesign(
        auto,
        opts({ rng, photoPalettes, locks: { layout: true, palette: false } }),
      )
      expect(next?.palette.id).not.toBe(photoPalettes[0].id)
      expect(next?.palette.id).not.toBe('photo-auto')
    }
  })

  it('写真が無ければ写真の配色は選ばない', () => {
    for (const d of run(100)) expect(d.palette.id).not.toMatch(/^photo-/)
  })

  it('テンプレート固定でも、パレット固定でも、今と同じ組み合わせにはならない', () => {
    const rng = mulberry32(5)
    for (const locks of [
      { layout: true, palette: false },
      { layout: false, palette: true },
    ]) {
      for (let i = 0; i < 100; i++) {
        const next = shuffleDesign(start, opts({ rng, locks }))
        expect(next).not.toBeNull()
        if (!next) continue
        expect(comboKey(next.layout, next.palette)).not.toBe(
          comboKey(start.layout, start.palette),
        )
      }
    }
  })

  it('写真があるときは、写真の配色を半分ほど選ぶ', () => {
    const seq = run(400, { photoPalettes })
    const share =
      seq.filter((d) => d.palette.id.startsWith('photo-')).length / seq.length
    expect(share).toBeGreaterThan(0.38)
    expect(share).toBeLessThan(0.62)
  })
})

describe('randomLayouts', () => {
  it('写真が無ければフォトは選ばない', () => {
    expect(randomLayouts(false)).not.toContain('photo')
    expect(randomLayouts(true)).toContain('photo')
    expect(randomLayouts(false)).toContain('center')
    for (const d of run(60, { layouts: randomLayouts(false) })) {
      expect(d.layout).not.toBe('photo')
    }
  })
})

describe('randomLayouts（写真枠）', () => {
  it('写真を枠で置いているときはセンターを選ばない（全面背景なら選ぶ）', () => {
    expect(randomLayouts(true, true)).not.toContain('center')
    expect(randomLayouts(true, false)).toContain('center')
    expect(randomLayouts(false, true)).toContain('center')
  })
})

describe('randomStyle', () => {
  it('テンプレートに合う値だけを選ぶ', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 200; i++) {
      const y2k = randomStyle('y2k', start.style, rng)
      expect(y2k.grain).toBe(false)
      expect(y2k.family).toBe('sans')
      expect(y2k.separator).not.toBe('stack')
      expect(y2k.monoMeta).toBe(start.style.monoMeta)
      expect(randomStyle('editorial', start.style, rng).family).toBe('serif')
      expect(randomStyle('copy', start.style, rng).family).toBe('sans')
      expect(['dash', 'slash', 'dot']).toContain(
        randomStyle('minimal', start.style, rng).separator,
      )
      // 空白・改行は選ばない（改行は字が小さくなりすぎる）
      expect(['dash', 'slash', 'dot']).toContain(
        randomStyle('center', start.style, rng).separator,
      )
      expect(randomStyle('minimal', start.style, rng).sideNumbers).toBe(
        start.style.sideNumbers,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// 履歴
// ---------------------------------------------------------------------------

const design = (i: number): Design => ({
  ...start,
  palette: { ...PRESET_PALETTES[0], id: `p${i}` },
})

describe('history', () => {
  it('選び直した結果を順に戻れ、進める', () => {
    let h = EMPTY_HISTORY
    let current = design(0)
    for (let i = 1; i <= 3; i++) {
      h = afterShuffle(h, current, design(i))
      current = design(i)
    }
    expect(canGoForward(h, current)).toBe(false)
    const back1 = goBack(h, current)
    expect(back1?.design).toEqual(design(2))
    const back2 = back1 && goBack(back1.history, back1.design)
    expect(back2?.design).toEqual(design(1))
    const fwd = back2 && goForward(back2.history, back2.design)
    expect(fwd?.design).toEqual(design(2))
  })

  it('戻ってから選び直しても、先の結果は 進む で取り戻せる（消えない）', () => {
    let h = EMPTY_HISTORY
    h = afterShuffle(h, design(0), design(1))
    h = afterShuffle(h, design(1), design(2))
    const back = goBack(h, design(2))
    expect(back?.design).toEqual(design(1))
    if (!back) return
    h = afterShuffle(back.history, design(1), design(9))
    // 今は 9。先に 2 が残っている
    expect(canGoForward(h, design(9))).toBe(true)
    expect(goForward(h, design(9))?.design).toEqual(design(2))
    // 戻れば 1 → 0
    const b1 = goBack(h, design(9))
    expect(b1?.design).toEqual(design(1))
  })

  it('手で変えた状態も消えない（戻る → 選んだ結果、進む → 手で変えた状態）', () => {
    let h = EMPTY_HISTORY
    h = afterShuffle(h, design(0), design(1))
    const manual = design(5)
    expect(canGoBack(h, manual)).toBe(true)
    const back = goBack(h, manual)
    expect(back?.design).toEqual(design(1))
    if (!back) return
    expect(goForward(back.history, back.design)?.design).toEqual(manual)
  })

  it(`戻れるのは ${HISTORY_MAX} 個前まで`, () => {
    let h = EMPTY_HISTORY
    let current = design(0)
    for (let i = 1; i <= HISTORY_MAX + 10; i++) {
      h = afterShuffle(h, current, design(i))
      current = design(i)
    }
    expect(h.entries).toHaveLength(HISTORY_MAX + 1)
    let steps = 0
    let state = { history: h, design: current }
    for (;;) {
      const next = goBack(state.history, state.design)
      if (!next) break
      state = next
      steps += 1
    }
    expect(steps).toBe(HISTORY_MAX)
    expect(sameDesign(state.design, design(10))).toBe(true)
  })
})
