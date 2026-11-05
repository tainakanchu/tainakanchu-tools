// @vitest-environment jsdom
/**
 * セットの長さは「再生記録に実際の終わりがあるときだけ」出す。
 * ファイルの長さや曲間の平均から推した長さは書かない。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { LAYOUTS, getSize } from './layouts'
import { PRESET_PALETTES } from './palettes'
import { parseSetlistBuffer, parseSetlistText } from './parse'
import { DEFAULT_REDACT } from './redact'
import { metaOf, renderPage, resetMeasureCache } from './render'
import { createSampleSetlist, createStressSetlist } from './sample'
import { knownEndAt, knownSetLength } from './set-length'
import { setLengthText, templateStyle, trackCountText } from './tpl-common'
import type { LayoutId } from './layouts'
import type { RenderInput } from './render'
import type { Setlist } from './types'

const footer = (setlist: Setlist) => {
  const meta = metaOf(setlist)
  return [trackCountText(meta), setLengthText(meta)].filter(Boolean).join(' · ')
}

describe('knownSetLength', () => {
  it('最後の曲の実際の終わり（endAt）があれば、最初の開始からそこまで', () => {
    expect(
      knownSetLength([
        { startAt: 100 },
        { startAt: 400 },
        { startAt: 700, endAt: 1000 },
      ]),
    ).toBe(900)
  })

  it('終わりが無ければ、開始 + 実際にかけた秒数（playedSec）', () => {
    expect(
      knownSetLength([{ startAt: 0 }, { startAt: 300, playedSec: 240 }]),
    ).toBe(540)
    expect(knownEndAt({ startAt: 10, playedSec: 5 })).toBe(15)
  })

  it('ファイルの長さ（durationSec）しか無ければ出さない', () => {
    expect(
      knownSetLength([
        { startAt: 0, durationSec: 360 },
        { startAt: 300, durationSec: 420 },
      ]),
    ).toBeUndefined()
  })

  it('開始時刻だけでは出さない（曲間の平均から推さない）', () => {
    expect(
      knownSetLength([{ startAt: 0 }, { startAt: 300 }, { startAt: 600 }]),
    ).toBeUndefined()
  })

  it('最後の曲の終わりがわからなければ出さない（途中の曲の終わりだけでは足りない）', () => {
    expect(
      knownSetLength([{ startAt: 0, endAt: 290 }, { startAt: 300 }]),
    ).toBeUndefined()
    // 手で足した最後の曲（時刻なし）
    expect(knownSetLength([{ startAt: 0, endAt: 290 }, {}])).toBeUndefined()
    expect(knownSetLength([])).toBeUndefined()
  })

  it('前の曲の方が後まで鳴っていれば、そちらの終わりまで', () => {
    expect(
      knownSetLength([
        { startAt: 0, endAt: 500 },
        { startAt: 300, endAt: 450 },
      ]),
    ).toBe(500)
  })
})

describe('形式ごとのセットの長さ', () => {
  it('Serato: end time があれば出す', () => {
    const csv = [
      'name,artist,start time,end time,playtime,deck',
      'Track 1,A,22:00:00,22:05:00,00:05:00,1',
      'Track 2,B,22:04:00,22:41:00,00:37:00,2',
    ].join('\n')
    const { setlist } = parseSetlistText(csv).playlists[0]
    expect(knownSetLength(setlist.tracks)).toBe(41 * 60)
    expect(footer(setlist)).toBe('2 tracks · 41 min')
  })

  it('Serato: end time が無くても playtime があれば出す', () => {
    const csv = [
      'name,artist,start time,playtime,deck',
      'Track 1,A,23:30:00,00:05:00,1',
      'Track 2,B,0:20:00,01:01:00,2',
    ].join('\n')
    const { setlist } = parseSetlistText(csv).playlists[0]
    // 23:30 → 0:20 は日またぎ。0:20 + 61 分 = 1:21 → 1h 51m
    expect(footer(setlist)).toBe('2 tracks · 1h 51m')
  })

  it('Serato: ファイルの長さ（length）しか無ければ出さない', () => {
    const csv = [
      'name,artist,start time,length,deck',
      'Track 1,A,22:00:00,06:00,1',
      'Track 2,B,22:04:00,07:00,2',
    ].join('\n')
    const { setlist } = parseSetlistText(csv).playlists[0]
    expect(setlist.tracks[1]).toMatchObject({ durationSec: 420 })
    expect(setlist.tracks[1].playedSec).toBeUndefined()
    expect(knownSetLength(setlist.tracks)).toBeUndefined()
    expect(footer(setlist)).toBe('2 tracks')
  })

  it('Traktor: EXTENDEDDATA の DURATION（実際にかけた秒数）があれば出す', () => {
    const day = (2024 << 16) | (5 << 8) | 1
    const nml = `<?xml version="1.0" encoding="UTF-8"?>
<NML VERSION="19"><COLLECTION ENTRIES="2">
<ENTRY TITLE="A" ARTIST="X"><LOCATION DIR="/:M/:" FILE="a.mp3" VOLUME="V"></LOCATION><INFO PLAYTIME="400"></INFO></ENTRY>
<ENTRY TITLE="B" ARTIST="Y"><LOCATION DIR="/:M/:" FILE="b.mp3" VOLUME="V"></LOCATION><INFO PLAYTIME="500"></INFO></ENTRY>
</COLLECTION><PLAYLISTS><NODE TYPE="FOLDER" NAME="$ROOT"><SUBNODES COUNT="1">
<NODE TYPE="PLAYLIST" NAME="History"><PLAYLIST ENTRIES="2" TYPE="LIST">
<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="V/:M/:a.mp3"></PRIMARYKEY><EXTENDEDDATA DECK="0" DURATION="250.5" PLAYEDPUBLIC="1" STARTDATE="${day}" STARTTIME="${22 * 3600}"></EXTENDEDDATA></ENTRY>
<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="V/:M/:b.mp3"></PRIMARYKEY><EXTENDEDDATA DECK="1" DURATION="300" PLAYEDPUBLIC="1" STARTDATE="${day}" STARTTIME="${22 * 3600 + 240}"></EXTENDEDDATA></ENTRY>
</PLAYLIST></NODE></SUBNODES></NODE></PLAYLISTS></NML>`
    const { setlist } = parseSetlistText(nml).playlists[0]
    expect(knownSetLength(setlist.tracks)).toBe(540)
    expect(footer(setlist)).toBe('2 tracks · 9 min')
    // DURATION が無い（ファイルの長さ PLAYTIME だけ）なら出さない
    const noDuration = parseSetlistText(nml.replace(/ DURATION="[^"]*"/g, ''))
      .playlists[0].setlist
    expect(knownSetLength(noDuration.tracks)).toBeUndefined()
    expect(footer(noDuration)).toBe('2 tracks')
  })

  it('rekordbox XML: ファイルの長さ（TotalTime）しか無いので出さない', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="2">
<TRACK TrackID="1" Name="A" Artist="X" TotalTime="360"/>
<TRACK TrackID="2" Name="B" Artist="Y" TotalTime="420"/>
</COLLECTION><PLAYLISTS><NODE Type="0" Name="ROOT" Count="1">
<NODE Type="1" Name="HISTORY 2024-05-01" KeyType="0" Entries="2"><TRACK Key="1"/><TRACK Key="2"/></NODE>
</NODE></PLAYLISTS></DJ_PLAYLISTS>`
    const result = parseSetlistText(xml)
    const { setlist } = result.playlists[result.defaultIndex]
    expect(setlist.tracks[0].durationSec).toBe(360)
    expect(knownSetLength(setlist.tracks)).toBeUndefined()
    expect(footer(setlist)).toBe('2 tracks')
  })

  it('rekordbox TXT: 再生時刻と曲の長さがあっても出さない', () => {
    const text = [
      'Track Title\tArtist\tTime\tPlayed Time',
      'A\tX\t06:00\t22:00:00',
      'B\tY\t07:00\t22:05:00',
    ].join('\n')
    const bytes = new TextEncoder().encode(text)
    const { setlist } = parseSetlistBuffer(bytes.buffer).playlists[0]
    expect(setlist.tracks[1].startAt).toBeDefined()
    expect(setlist.tracks[1].durationSec).toBe(420)
    expect(knownSetLength(setlist.tracks)).toBeUndefined()
    expect(footer(setlist)).toBe('2 tracks')
  })

  it('サンプルも同じ決まり（開始時刻だけなので長さは出さない）', () => {
    expect(metaOf(createSampleSetlist()).setLength).toBeUndefined()
    expect(footer(createSampleSetlist())).toBe('14 tracks')
    expect(metaOf(createStressSetlist(50)).setLength).toBeUndefined()
  })
})

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
    time: true,
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

  it('最後の曲の終わりが記録にあれば、長さを描く（トラックリスト・Y2K）', () => {
    const sample = createSampleSetlist()
    const last = sample.tracks.at(-1)
    if (!last?.startAt) throw new Error('サンプルに開始時刻が無い')
    // 最後の曲は 75 分目に始まり、6 分かけた → 81 分
    const logged: Setlist = {
      ...sample,
      tracks: [
        ...sample.tracks.slice(0, -1),
        { ...last, endAt: last.startAt + 6 * 60 },
      ],
    }
    expect(textOf(logged, 'tracklist').join('\n')).toContain(
      '14 TRACKS · 1H 21M',
    )
    expect(textOf(logged, 'y2k').join('\n')).toContain('14 TRACKS / 1H 21M')
    expect(textOf(logged, 'minimal').join('\n')).toContain('14 tracks · 1h 21m')
  })

  it('BPM・Key・時刻はある曲にだけ描き、無い曲に仮の値を置かない', () => {
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
    // 時刻は 00:00 の最初の曲だけ（2 曲目に 00:00 を置かない）
    expect(text.filter((t) => t === '00:00')).toHaveLength(1)
  })
})
