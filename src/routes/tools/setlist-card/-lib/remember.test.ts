// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRESET_PALETTES } from './palettes'
import {
  REMEMBER_KEY,
  loadRemembered,
  parseRemembered,
  saveRemembered,
  serializeRemembered,
} from './remember'
import type { Palette } from './palettes'

const custom: Palette = {
  id: 'custom',
  name: 'カスタム',
  bg: '#101010',
  fg: '#F0F0F0',
  muted: '#a0a0a0',
  accent: '#ff3300',
  rule: '#333333',
  scrim: '#000000',
}

describe('parseRemembered（覚えた設定を読む）', () => {
  it('空・壊れた JSON・配列は何も返さない', () => {
    expect(parseRemembered(null)).toEqual({})
    expect(parseRemembered('')).toEqual({})
    expect(parseRemembered('{oops')).toEqual({})
    expect(parseRemembered('[1,2]')).toEqual({})
    expect(parseRemembered('"minimal"')).toEqual({})
  })

  it('テンプレート・サイズ・プリセットの配色を戻す', () => {
    const r = parseRemembered(
      JSON.stringify({
        layout: 'tracklist',
        size: 'story',
        palette: { id: 'paper' },
      }),
    )
    expect(r.layout).toBe('tracklist')
    expect(r.sizeId).toBe('story')
    expect(r.palette).toBe(PRESET_PALETTES.find((p) => p.id === 'paper'))
  })

  it('知らない ID は捨てる（ほかの項目は読む）', () => {
    expect(
      parseRemembered(
        JSON.stringify({ layout: 'poster', size: 'a4', palette: { id: 'x' } }),
      ),
    ).toEqual({})
    expect(
      parseRemembered(JSON.stringify({ layout: 'nope', size: 'square' })),
    ).toEqual({ sizeId: 'square' })
  })

  it('フォトのテンプレートは戻さない（写真は覚えないので上半分が空く）', () => {
    expect(parseRemembered(JSON.stringify({ layout: 'photo' }))).toEqual({})
  })

  it('写真から作った配色は戻さない', () => {
    const photo = { ...custom, id: 'photo-auto' }
    expect(parseRemembered(JSON.stringify({ palette: photo }))).toEqual({})
  })

  it('自分で作った配色は色ごと戻す。色が壊れていれば捨てる', () => {
    const ok = parseRemembered(JSON.stringify({ palette: custom }))
    expect(ok.palette).toEqual({ ...custom, fg: '#f0f0f0' })
    const broken = parseRemembered(
      JSON.stringify({ palette: { ...custom, accent: 'red' } }),
    )
    expect(broken.palette).toBeUndefined()
  })

  it('serializeRemembered と往復できる（プリセットは ID だけ保存）', () => {
    const preset = PRESET_PALETTES[2]
    const text = serializeRemembered({
      layout: 'copy',
      palette: preset,
      sizeId: 'wide',
    })
    expect(JSON.parse(text)).toEqual({
      layout: 'copy',
      palette: { id: preset.id },
      size: 'wide',
    })
    expect(parseRemembered(text)).toEqual({
      layout: 'copy',
      palette: preset,
      sizeId: 'wide',
    })
  })
})

describe('loadRemembered / saveRemembered', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('写真の配色のときは前に覚えた配色を残す', () => {
    saveRemembered({ layout: 'minimal', palette: PRESET_PALETTES[0] })
    saveRemembered({
      layout: 'copy',
      palette: { ...custom, id: 'photo-auto' },
      sizeId: 'square',
    })
    expect(loadRemembered()).toEqual({
      layout: 'copy',
      palette: PRESET_PALETTES[0],
      sizeId: 'square',
    })
  })

  it('localStorage が使えなくても例外にならない', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(loadRemembered()).toEqual({})
    expect(() => saveRemembered({ layout: 'copy' })).not.toThrow()
    expect(REMEMBER_KEY).toContain('setlist-card')
  })
})
