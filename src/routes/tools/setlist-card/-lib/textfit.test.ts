import { describe, expect, it } from 'vitest'
import { cleanArtistName, cleanTitle, stripFeat, stripMixSuffix } from './clean'
import {
  CONDENSE_MIN,
  fitLine,
  splitWidths,
  tokenize,
  wrapRuns,
  wrapText,
} from './textfit'
import type { Measure } from './fit'

/** 1 文字 = フォントサイズ × 0.5（CJK も同じ扱い） */
const measure: Measure = (text, font) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10)
  return Array.from(text).length * size * 0.5
}
const F = '10px x'

describe('stripMixSuffix', () => {
  it('汎用のバージョン表記だけを外し、人名入りのリミックス表記は残す', () => {
    expect(
      stripMixSuffix(
        'Something Beautiful (Artist X Remix) [Extended Mix] - 2024 Remaster',
      ),
    ).toBe('Something Beautiful (Artist X Remix)')
    expect(stripMixSuffix('Glass Pavilion (Original Mix)')).toBe(
      'Glass Pavilion',
    )
    expect(stripMixSuffix('Second Wind - Extended Version')).toBe('Second Wind')
    expect(stripMixSuffix('Heat (Radio Edit)')).toBe('Heat')
    expect(stripMixSuffix('Undercurrent (Rin Dub) [Remastered 2019]')).toBe(
      'Undercurrent (Rin Dub)',
    )
    expect(stripMixSuffix('Afterglow [Kenta Shiraishi Edit]')).toBe(
      'Afterglow [Kenta Shiraishi Edit]',
    )
    expect(stripMixSuffix('Song - Someone Remix')).toBe('Song - Someone Remix')
    expect(stripMixSuffix('Song (Dub Mix)')).toBe('Song (Dub Mix)')
  })

  it('途中に挟まった汎用表記も外す', () => {
    expect(stripMixSuffix('Tidal Memory (Club Mix) (feat. Hana)')).toBe(
      'Tidal Memory (feat. Hana)',
    )
  })

  it('全部消えてしまう曲名は元のまま', () => {
    expect(stripMixSuffix('(Original Mix)')).toBe('(Original Mix)')
  })
})

describe('stripFeat', () => {
  it('アーティスト名の末尾の feat. 以降を外す', () => {
    expect(stripFeat('Artist A, Artist B & Artist C feat. Artist D')).toBe(
      'Artist A, Artist B & Artist C',
    )
    expect(stripFeat('Someone ft. Other')).toBe('Someone')
    expect(stripFeat('Someone Featuring Other')).toBe('Someone')
  })

  it('曲名中の (feat. X) や括弧前の feat. を外し、後ろのリミックス表記は残す', () => {
    expect(stripFeat('Tidal Memory (feat. Hana Okada) (Club Mix)')).toBe(
      'Tidal Memory (Club Mix)',
    )
    expect(stripFeat('Tidal Memory feat. Hana Okada (X Remix)')).toBe(
      'Tidal Memory (X Remix)',
    )
    expect(stripFeat('Left Feet')).toBe('Left Feet')
    expect(stripFeat('Craft Beer')).toBe('Craft Beer')
  })

  it('トグルの組み合わせ', () => {
    const opts = { stripMix: true, stripFeat: true }
    expect(cleanTitle('Tidal Memory feat. Hana (Club Mix)', opts)).toBe(
      'Tidal Memory',
    )
    expect(cleanArtistName('A feat. B', { ...opts, stripFeat: false })).toBe(
      'A feat. B',
    )
  })
})

describe('fitLine', () => {
  it('ellipsis は省略だけ', () => {
    expect(fitLine('abcdefghij', 30, F, measure, 'ellipsis')).toEqual({
      text: 'abcde…',
      scaleX: 1,
      width: 30,
    })
  })

  it('condense は 75% まで縮め、それでも入らなければ縮めたまま省略', () => {
    const a = fitLine('abcdefgh', 32, F, measure, 'condense') // 40 → 0.8
    expect(a.text).toBe('abcdefgh')
    expect(a.scaleX).toBeCloseTo(0.8)
    const b = fitLine('abcdefghijklmnop', 30, F, measure, 'condense')
    expect(b.scaleX).toBe(CONDENSE_MIN)
    expect(b.text.endsWith('…')).toBe(true)
    expect(b.width).toBeLessThanOrEqual(30)
  })
})

describe('splitWidths', () => {
  it('両方入るならそのまま', () => {
    expect(splitWidths(30, 50, 100, 1)).toEqual({ artist: 30, title: 50 })
  })

  it('縮めれば入るなら同じ倍率', () => {
    const r = splitWidths(40, 80, 100, 0.75)
    expect(r.artist + r.title).toBeCloseTo(100)
    expect(r.artist / r.title).toBeCloseTo(0.5)
  })

  it('両方あふれたらアーティストは最大 40%', () => {
    expect(splitWidths(300, 300, 100, 1)).toEqual({ artist: 40, title: 60 })
  })

  it('片方が短ければ余りをもう片方へ回す', () => {
    expect(splitWidths(20, 300, 100, 1)).toEqual({ artist: 20, title: 80 })
    expect(splitWidths(300, 30, 100, 1)).toEqual({ artist: 70, title: 30 })
  })
})

describe('wrap', () => {
  it('ラテン文字は空白で、CJK は 1 文字で区切る', () => {
    expect(tokenize('ab cd')).toEqual(['ab', ' ', 'cd'])
    expect(tokenize('夜の街')).toEqual(['夜', 'の', '街'])
    // 閉じ記号は前にくっつく
    expect(tokenize('あ、い')).toEqual(['あ、', 'い'])
  })

  it('単語単位で折り返し、行末の空白は捨てる', () => {
    // 1 文字 5px、幅 50px = 10 文字
    expect(wrapText('hello world again', 50, 3, F, measure)).toEqual([
      'hello',
      'world',
      'again',
    ])
  })

  it('CJK は 1 文字単位で詰める', () => {
    expect(wrapText('あいうえおかきくけこさしす', 25, 3, F, measure)).toEqual([
      'あいうえお',
      'かきくけこ',
      'さしす',
    ])
  })

  it('長すぎる単語は 1 文字単位に崩す', () => {
    expect(wrapText('abcdefghijklmno', 25, 3, F, measure)).toEqual([
      'abcde',
      'fghij',
      'klmno',
    ])
  })

  it('maxLines を超えたら最終行を … で省略', () => {
    const lines = wrapText('aaaa bbbb cccc dddd', 25, 2, F, measure)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
    expect(measure(lines[1], F)).toBeLessThanOrEqual(25)
  })

  it('書体の違う run を混ぜて折り返し、x 座標を返す', () => {
    const lines = wrapRuns(
      [
        { text: 'AB', role: 'artist' },
        { text: ' — ', role: 'sep' },
        { text: 'cd ef', role: 'title' },
      ],
      40,
      2,
      () => F,
      measure,
    )
    expect(lines.map((l) => l.map((r) => r.text).join(''))).toEqual([
      'AB — cd',
      'ef',
    ])
    expect(lines[0][1]).toMatchObject({ role: 'sep', x: 10 })
  })
})
