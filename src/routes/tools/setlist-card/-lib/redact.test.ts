// @vitest-environment jsdom
/**
 * 「隠す」の漏れが無いことの確認。
 * 隠した欄の本当の文字だけが違う 2 つのセトリで、行組み・ページ割り・canvas への
 * すべての呼び出し（計測した文字列を含む）が完全に一致し、本当の文字がどこにも
 * 現れないことを確かめる。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fitCentered } from './center'
import { fileBaseName } from './export'
import { toItems } from './items'
import { LAYOUTS, getSize } from './layouts'
import { PRESET_PALETTES } from './palettes'
import {
  DEFAULT_REDACT,
  REDACT_STYLES,
  displayNames,
  hiddenFor,
  markPlaceholder,
  parseRedact,
  parseRedactStyle,
  qmarkText,
} from './redact'
import { planPages, renderPage, resetMeasureCache } from './render'
import { fitRowsLayout } from './rows'
import { createSampleSetlist, createStressSetlist } from './sample'
import { templateStyle } from './tpl-common'
import type { ItemsOptions } from './items'
import type { LayoutId } from './layouts'
import type { RedactOptions, RedactStyle } from './redact'
import type { RenderInput } from './render'
import type { FontFor } from './rows'
import type { LongTextMode } from './textfit'
import type { Setlist, Track } from './types'

// ---------------------------------------------------------------------------
// 2 通りの「本当の文字」
// ---------------------------------------------------------------------------

const SECRETS = [
  { artist: 'Zq', title: 'Qz' },
  {
    artist: 'Xylophonic Secret Collective feat. Mystery Guest',
    title:
      '誰にも言えない未発表のとても長い曲名 (Very Long Secret Remix) [Extended Mix]',
  },
  { artist: '', title: '' },
] as const

const SECRET_WORDS = ['Zq', 'Qz', 'Xylophonic', 'Mystery', '誰にも', 'Secret']

/** 3 曲目は両方、6 曲目はアーティストだけ、10 曲目は曲名だけを隠す */
const HIDES: ReadonlyArray<[number, Track['hidden']]> = [
  [2, hiddenFor('both')],
  [5, hiddenFor('artist')],
  [9, hiddenFor('title')],
]

function withSecret(base: Setlist, secret: (typeof SECRETS)[number]): Setlist {
  const tracks = base.tracks.map((track, i): Track => {
    const hide = HIDES.find(([at]) => at === i)?.[1]
    if (!hide) return track
    return {
      ...track,
      artist: hide.artist ? secret.artist : track.artist,
      title: hide.title ? secret.title : track.title,
      // 隠した曲の BPM・Key・レーベルも本当の値を変えておく
      bpm: secret.artist.length + 100,
      key: secret.title ? 'F#m' : 'C',
      label: `${secret.artist} Records`,
      hidden: hide,
    }
  })
  return { ...base, tracks }
}

const ITEMS_OPTS: ItemsOptions = {
  display: { bpm: true, key: true, label: true },
  text: { stripMix: true, stripFeat: true },
  redact: DEFAULT_REDACT,
  sideNumbers: false,
}

// ---------------------------------------------------------------------------
// 純粋な部分
// ---------------------------------------------------------------------------

const redactOf = (style: RedactStyle): RedactOptions => ({
  ...DEFAULT_REDACT,
  style,
})

describe('displayNames', () => {
  const clean = { artist: (s: string) => s, title: (s: string) => s }
  const track = { artist: 'Real Artist', title: 'Real Title' }

  it('既定は黒塗りで、選択肢の先頭（黒塗り / ？？？ / ぐちゃぐちゃ / カスタム）', () => {
    expect(DEFAULT_REDACT.style).toBe('bar')
    expect(REDACT_STYLES.map((o) => o.label)).toEqual([
      '黒塗り',
      '？？？',
      'ぐちゃぐちゃ',
      'カスタム',
    ])
    expect(REDACT_STYLES.map((o) => o.label).join()).not.toContain('ID')
    const both = displayNames(
      { ...track, hidden: hiddenFor('both') },
      3,
      DEFAULT_REDACT,
      clean,
    )
    expect(both.mark).toEqual({ artist: 'bar', title: 'bar', seed: 3 })
    // 置き換えた文字は幅を測るだけの数字（本当の文字でも「ID」でもない）
    expect(both.artist).toMatch(/^0+$/)
    expect(both.title).toMatch(/^0+$/)
    const title = displayNames(
      { ...track, hidden: hiddenFor('title') },
      0,
      DEFAULT_REDACT,
      clean,
    )
    expect(title.artist).toBe('Real Artist')
    expect(title.mark).toEqual({ title: 'bar', seed: 0 })
  })

  it('やめた「ID — ID」（id）や知らない値は黒塗りに読み替える', () => {
    expect(parseRedactStyle('id')).toBe('bar')
    expect(parseRedactStyle('nope')).toBe('bar')
    expect(parseRedactStyle(undefined)).toBe('bar')
    expect(parseRedactStyle('scribble')).toBe('scribble')
    expect(
      parseRedact({ style: 'id', custom: 'Forthcoming', hideMeta: true }),
    ).toEqual({ style: 'bar', custom: 'Forthcoming', hideMeta: true })
    expect(parseRedact(JSON.parse('{"style":"id"}'))).toEqual(DEFAULT_REDACT)
    expect(parseRedact(null)).toEqual(DEFAULT_REDACT)
    expect(parseRedact({ ...DEFAULT_REDACT, style: 'qmark' }).style).toBe(
      'qmark',
    )
  })

  it('カスタムは両方隠すと 1 つだけ、空なら Unreleased', () => {
    const custom = { ...DEFAULT_REDACT, style: 'custom' as const }
    const both = displayNames(
      { ...track, hidden: hiddenFor('both') },
      0,
      { ...custom, custom: '  Forthcoming ' },
      clean,
    )
    expect([both.artist, both.title]).toEqual(['', 'Forthcoming'])
    const artist = displayNames(
      { ...track, hidden: hiddenFor('artist') },
      0,
      { ...custom, custom: '' },
      clean,
    )
    expect([artist.artist, artist.title]).toEqual(['Unreleased', 'Real Title'])
  })

  it('？？？・黒塗り・ぐちゃぐちゃの長さは曲順で決まり、範囲に収まる', () => {
    for (let i = 0; i < 60; i++) {
      const q = Array.from(qmarkText(i, 'title')).length
      expect(q).toBeGreaterThanOrEqual(3)
      expect(q).toBeLessThanOrEqual(8)
      expect(qmarkText(i, 'title')).toBe(qmarkText(i, 'title'))
      const a = markPlaceholder(i, 'artist').length
      expect(a).toBeGreaterThanOrEqual(6)
      expect(a).toBeLessThanOrEqual(10)
    }
    // 曲ごとにばらつく（全部同じ長さにはならない）
    const lengths = new Set(
      Array.from({ length: 20 }, (_, i) => markPlaceholder(i, 'title').length),
    )
    expect(lengths.size).toBeGreaterThan(2)
  })

  it('印で描く欄だけ mark が付く', () => {
    const r = displayNames(
      { ...track, hidden: hiddenFor('artist') },
      4,
      redactOf('scribble'),
      clean,
    )
    expect(r.mark).toEqual({ artist: 'scribble', seed: 4 })
    expect(r.title).toBe('Real Title')
  })

  it('ミックス表記・feat. の省略は見えている欄だけに掛かる', () => {
    const calls: Array<string> = []
    const spy = {
      artist: (s: string) => (calls.push(s), s),
      title: (s: string) => (calls.push(s), s),
    }
    displayNames(
      {
        artist: 'Secret feat. X',
        title: 'Shown (Original Mix)',
        hidden: hiddenFor('artist'),
      },
      0,
      redactOf('qmark'),
      spy,
    )
    expect(calls).toEqual(['Shown (Original Mix)'])
  })
})

describe('toItems', () => {
  it('隠した欄の本当の文字・BPM・Key・レーベルは items に入らない', () => {
    for (const style of REDACT_STYLES.map((s) => s.id)) {
      for (const hideMeta of [false, true]) {
        const opts = {
          ...ITEMS_OPTS,
          redact: { ...DEFAULT_REDACT, style, hideMeta },
        }
        const results = SECRETS.map((secret) =>
          toItems(withSecret(createSampleSetlist(), secret).tracks, opts),
        )
        // BPM・Key は hideMeta のときだけ伏せる（伏せないなら本当の値が出るのが正しい）
        const strip = (r: (typeof results)[number]) =>
          hideMeta
            ? r
            : {
                ...r,
                items: r.items.map((item, i) =>
                  HIDES.some(([at]) => at === i)
                    ? { ...item, meta: item.meta.slice(2) }
                    : item,
                ),
              }
        expect(strip(results[1])).toEqual(strip(results[0]))
        expect(strip(results[2])).toEqual(strip(results[0]))
        const text = JSON.stringify(results.map((r) => r.items))
        for (const word of SECRET_WORDS) expect(text).not.toContain(word)
      }
    }
  })

  it('隠した曲も曲数・番号は残る', () => {
    const setlist = withSecret(createSampleSetlist(), SECRETS[1])
    const { items } = toItems(setlist.tracks, ITEMS_OPTS)
    expect(items).toHaveLength(14)
    expect(items[2].num).toBe('03')
    // 既定（黒塗り）は両方の欄に帯の印。名前の欄は幅を測る数字だけ
    expect(items[2].mark).toEqual({ artist: 'bar', title: 'bar', seed: 2 })
    expect(items[2].artist).toMatch(/^0+$/)
    expect(items[2].title).toMatch(/^0+$/)
  })
})

// ---------------------------------------------------------------------------
// 行組み（純粋な計算）
// ---------------------------------------------------------------------------

const measure = (text: string, f: string) =>
  Array.from(text).length * Number(/([\d.]+)px/.exec(f)?.[1] ?? 10) * 0.55
const fontFor: FontFor = (role, size) =>
  `${role === 'meta' || role === 'num' ? size * 0.7 : size}px x`

describe('行組みは本当の文字によらない', () => {
  const modes: ReadonlyArray<LongTextMode> = ['ellipsis', 'condense', 'wrap']
  for (const mode of modes) {
    for (const { id: style } of REDACT_STYLES) {
      it(`${mode} / ${style}`, () => {
        const opts = {
          ...ITEMS_OPTS,
          redact: { ...DEFAULT_REDACT, style, hideMeta: true },
        }
        const plan = (secret: (typeof SECRETS)[number]) => {
          const { items } = toItems(
            withSecret(createStressSetlist(30), secret).tracks,
            opts,
          )
          const rows = fitRowsLayout(
            {
              items,
              area: { x: 0, y: 0, w: 940, h: 1000 },
              gap: 48,
              mode,
              showNumber: true,
              fontFor,
              measure,
            },
            {
              columnsOptions: [1, 2],
              sizeRange: {
                double: [16, 34],
                single: [14, 32],
                compact: [14, 28],
              },
            },
          )
          const center = fitCentered(
            {
              items,
              width: 940,
              height: 1000,
              gap: 60,
              separator: ' ／ ',
              stack: false,
              showNumber: true,
              mode,
              fontFor: (role, size) => `${size}px ${role}`,
              measure,
            },
            { columnsOptions: [1, 2], sizeRange: [14, 34] },
          )
          return { rows, center }
        }
        const [a, b, c] = SECRETS.map(plan)
        expect(b).toEqual(a)
        expect(c).toEqual(a)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// canvas まで通した確認（getContext を記録係に差し替える）
// ---------------------------------------------------------------------------

let log: Array<string> = []

const fmt = (v: unknown): string =>
  typeof v === 'number'
    ? v.toFixed(3)
    : typeof v === 'string'
      ? JSON.stringify(v)
      : typeof v

function fakeContext(): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {
    font: '10px sans-serif',
    canvas: { width: 1080, height: 1350 },
  }
  const special: Record<string, (...args: Array<never>) => unknown> = {
    measureText: (text: string) => {
      log.push(`measureText(${fmt(state.font)},${fmt(text)})`)
      const size = Number(/([\d.]+)px/.exec(String(state.font))?.[1] ?? 10)
      return { width: Array.from(text).length * size * 0.55 }
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
      return (...args: Array<unknown>) => {
        log.push(`${prop}(${args.map(fmt).join(',')})`)
      }
    },
    set(target, prop, value) {
      target[prop] = value
      log.push(`${String(prop)}=${fmt(value)}`)
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

const inputFor = (
  setlist: Setlist,
  layout: LayoutId,
  redact: RedactOptions,
  longText: LongTextMode,
  split: boolean,
): RenderInput => ({
  setlist,
  layout,
  size: getSize('portrait'),
  palette: PRESET_PALETTES[1],
  style: { ...templateStyle(layout), sideNumbers: layout === 'tracklist' },
  display: {
    number: true,
    bpm: true,
    key: true,
    label: true,
    credit: true,
  },
  text: { longText, stripMix: true, stripFeat: true },
  columns: 'auto',
  split: { enabled: split, mode: 'auto', count: 2 },
  redact,
  photo: null,
})

describe('canvas に届くものは本当の文字によらない', () => {
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      // jsdom の canvas は描けないので、呼び出しを記録するだけの偽物を返す
      () => fakeContext(),
    )
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  /** ページ割りを決めて全ページを描き、canvas への呼び出しをすべて記録する */
  const record = (input: RenderInput) => {
    resetMeasureCache()
    log = []
    const plan = planPages(input)
    const out: Array<string> = [JSON.stringify(plan)]
    const c = fakeContext()
    let lock = plan.lock
    for (const page of plan.pages) {
      const info = renderPage(c, input, page, lock)
      lock ??= info.lock
      out.push(JSON.stringify(info))
    }
    // 粒子のタイルは最初の 1 回だけ作る（キャッシュの有無で差が出るので外す）
    out.push(...log.filter((line) => !line.startsWith('putImageData(')))
    return out
  }

  const cases: Array<{
    count: number
    longText: LongTextMode
    split: boolean
    hideMeta: boolean
  }> = [
    { count: 14, longText: 'ellipsis', split: false, hideMeta: false },
    { count: 50, longText: 'ellipsis', split: true, hideMeta: true },
    { count: 30, longText: 'wrap', split: false, hideMeta: true },
    { count: 30, longText: 'condense', split: false, hideMeta: false },
  ]

  for (const { id: layout } of LAYOUTS) {
    for (const { id: style } of REDACT_STYLES) {
      it(`${layout} / ${style}`, () => {
        for (const c of cases) {
          const base =
            c.count === 14
              ? createSampleSetlist()
              : createStressSetlist(c.count)
          // 開始時刻・曲の ID 以外が同じになるよう、同じ元から作る
          const redact: RedactOptions = {
            style,
            custom: 'Forthcoming',
            hideMeta: c.hideMeta,
          }
          const runs = SECRETS.map((secret) => {
            const setlist = withSecret(base, secret)
            // hideMeta でないときは BPM・Key が出るのが正しいので、本当の値をそろえる
            const fixed = c.hideMeta
              ? setlist
              : {
                  ...setlist,
                  tracks: setlist.tracks.map((t, i) =>
                    HIDES.some(([at]) => at === i)
                      ? { ...t, bpm: 128, key: 'Am' }
                      : t,
                  ),
                }
            return record(inputFor(fixed, layout, redact, c.longText, c.split))
          })
          expect(runs[1]).toEqual(runs[0])
          expect(runs[2]).toEqual(runs[0])
          const all = runs.flat().join('\n')
          for (const word of SECRET_WORDS) expect(all).not.toContain(word)
        }
      })
    }
  }
})

describe('やめた見せ方（id）は黒塗りと同じ絵になる', () => {
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() =>
      fakeContext(),
    )
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  const draw = (redact: RedactOptions) => {
    resetMeasureCache()
    log = []
    const setlist = withSecret(createSampleSetlist(), SECRETS[1])
    const input = inputFor(setlist, 'minimal', redact, 'ellipsis', false)
    renderPage(fakeContext(), input, {
      index: 0,
      count: 1,
      start: 0,
      end: setlist.tracks.length,
    })
    // 粒子のタイルは最初の 1 回だけ作るので外す
    return log.filter((line) => !line.startsWith('putImageData('))
  }

  it('minimal', () => {
    const legacy = parseRedact({ style: 'id', custom: 'x', hideMeta: true })
    const bar = draw({ style: 'bar', custom: 'x', hideMeta: true })
    expect(draw(legacy)).toEqual(bar)
    const all = bar.join('\n')
    expect(all).not.toContain('"ID"')
    for (const word of SECRET_WORDS) expect(all).not.toContain(word)
  })
})

describe('fileBaseName', () => {
  it('イベント名と日付だけから作る', () => {
    expect(
      fileBaseName({ title: 'NIGHT DRIVE vol.12', date: '2026.11.03' }),
    ).toBe('setlist-NIGHT-DRIVE-vol.12-2026.11.03')
    expect(fileBaseName({})).toBe('setlist')
  })
})
