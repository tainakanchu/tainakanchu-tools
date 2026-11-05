// @vitest-environment jsdom
/**
 * M3U / M3U8 の読み取り（rekordbox の書き出しの実ファイルと、手で作った小さな例）。
 */
import { describe, expect, it } from 'vitest'
import { parseSetlistBuffer, parseSetlistText } from './parse'
import { looksLikeM3u, parseM3u, titleFromPath } from './parse-m3u'
import { pairScripts } from './script'
import m3u8 from './__fixtures__/rekordbox-playlist.m3u8?raw'

const tracksOf = (text: string, fileName?: string) =>
  parseSetlistText(text, fileName).playlists[0].setlist.tracks

describe('rekordbox の M3U8（実ファイル）', () => {
  const result = parseSetlistText(m3u8, 'playlist.m3u8')
  const tracks = result.playlists[0].setlist.tracks
  const pairs = tracks.map((t) => [t.artist, t.title])

  it('形式と曲数（#EXTINF の 27 曲）', () => {
    expect(result.format).toBe('m3u')
    expect(m3u8).toContain('\r\n')
    expect(tracks).toHaveLength(27)
    expect(result.playlists[0].setlist.date).toBeUndefined()
    expect(result.playlists[0].setlist.title).toBeUndefined()
  })

  it('最初の " - " でアーティストと曲名に分ける', () => {
    expect(pairs[0]).toEqual(['靜芳, EAERAN', 'Sweetless'])
    expect(pairs).toContainEqual([
      '砂糖协会 奶油熊子炖菜KUMAKO ANK',
      'tape/stop/night',
    ])
    expect(pairs).toContainEqual([
      '永彬Ryan.B feat, 花澤香菜',
      '风筝 (feat.花泽香菜)',
    ])
    expect(pairs).toContainEqual(['饭卡/白鲨JAWS', 'THE TIDES'])
    expect(pairs).toContainEqual(['黄星侨', '生于 1999'])
    expect(pairs).toContainEqual(['PiA吳蓓雅, T-AK', '無你的日子 (T-AK Remix)'])
    expect(pairs).toContainEqual(['そらこ', '魔法'])
    expect(pairs).toContainEqual(['桃子A1J', 'Netflix & Chill'])
    expect(pairs.at(-1)).toEqual(['甜約翰', '敏感話題 (FANG Remix)'])
  })

  it('秒数（ファイルの長さ）・BPM・Key・時刻は持たない', () => {
    for (const t of tracks) {
      expect(t.durationSec).toBeUndefined()
      expect(t.playedSec).toBeUndefined()
      expect(t.startAt).toBeUndefined()
      expect(t.bpm).toBeUndefined()
      expect(t.key).toBeUndefined()
    }
  })

  it('簡体字の曲は SC、繁体字は TC、日本語は JP。1 つの文字列の中では切り替えない', () => {
    const scriptOf = (title: string) => {
      const t = tracks.find((x) => x.title === title)
      if (!t) throw new Error(title)
      return pairScripts(t.artist, t.title)
    }
    expect(scriptOf('自由的风')).toEqual(['zh-hans', 'zh-hans'])
    expect(scriptOf('夏日延长战 feat.熊子')).toEqual(['zh-hans', 'zh-hans'])
    expect(scriptOf('万一对了呢')).toEqual(['latin', 'zh-hans'])
    expect(scriptOf('不出門')).toEqual(['zh-hant', 'zh-hant'])
    expect(scriptOf('敏感話題 (FANG Remix)')).toEqual(['zh-hant', 'zh-hant'])
    expect(scriptOf('魔法')).toEqual(['ja', 'ja'])
    // 簡体字の曲名に日本の名前（花泽香菜）が入っていても、曲名ぜんぶを SC で描く。
    // アーティストの欄（花澤香菜）は繁体字の字があるので TC
    expect(scriptOf('风筝 (feat.花泽香菜)')).toEqual(['zh-hant', 'zh-hans'])
    expect(scriptOf('生于 1999')).toEqual(['zh-hans', 'zh-hans'])
  })
})

describe('M3U の細かい場合', () => {
  it('判定（#EXTM3U か #EXTINF）', () => {
    expect(looksLikeM3u('#EXTM3U\n')).toBe(true)
    expect(looksLikeM3u('#EXTINF:12,a - b\nfile.mp3')).toBe(true)
    expect(looksLikeM3u('Artist\tTitle\n')).toBe(false)
  })

  it('#EXTINF に " - " が無ければ、ファイル名を曲名にする（アーティストは空）', () => {
    const text = [
      '#EXTM3U',
      '#EXTINF:200,Sweetless',
      'C:\\Users\\dj\\Music\\靜芳\\靜芳專輯\\1-07 Sweetless.mp3',
      '#EXTINF:150,',
      '/Users/dj/Music/03 夜に駆ける.m4a',
    ].join('\n')
    expect(tracksOf(text).map((t) => [t.artist, t.title])).toEqual([
      ['', 'Sweetless'],
      ['', '夜に駆ける'],
    ])
  })

  it('#EXTINF の無い、パスだけの M3U もファイル名から曲名を作る', () => {
    const text = [
      'C:\\Music\\Mandark\\BADA88\\02 8ODY.mp3',
      'D:\\Music\\1-01 THE TIDES.flac',
      '',
      // 曲名が数字で始まっても、先頭の曲番号だけを外す
      '03 15 mins (feat. NinjaWenWen).mp3',
    ].join('\r\n')
    const tracks = tracksOf(text, 'paths-only.m3u')
    expect(tracks.map((t) => [t.artist, t.title])).toEqual([
      ['', '8ODY'],
      ['', 'THE TIDES'],
      ['', '15 mins (feat. NinjaWenWen)'],
    ])
  })

  it('CRLF・CR の改行と、BOM 付きの UTF-8', () => {
    const crlf = '#EXTM3U\r\n#EXTINF:1,熊子 - 夏日延长战\r\nC:\\a\\01 x.mp3\r\n'
    expect(tracksOf(crlf).map((t) => [t.artist, t.title])).toEqual([
      ['熊子', '夏日延长战'],
    ])
    const cr = '#EXTM3U\r#EXTINF:1,A - B\rC:\\a.mp3\r'
    expect(tracksOf(cr).map((t) => t.title)).toEqual(['B'])
    const bom = new TextEncoder().encode(`\ufeff${crlf}`)
    expect(
      parseSetlistBuffer(bom.buffer, 'x.m3u8').playlists[0].setlist.tracks[0]
        .title,
    ).toBe('夏日延长战')
  })

  it('古い .m3u の Shift_JIS と CP1252', () => {
    // 「#EXTINF:1,そらこ - 魔法」を Shift_JIS で
    const sjis = new Uint8Array([
      ...new TextEncoder().encode('#EXTM3U\r\n#EXTINF:1,'),
      0x82,
      0xbb,
      0x82,
      0xe7,
      0x82,
      0xb1,
      0x20,
      0x2d,
      0x20,
      0x96,
      0x82,
      0x96,
      0x40,
      ...new TextEncoder().encode('\r\nC:\\a.mp3\r\n'),
    ])
    const [a] = parseSetlistBuffer(sjis.buffer, 'old.m3u').playlists[0].setlist
      .tracks
    expect([a.artist, a.title]).toEqual(['そらこ', '魔法'])
    // 「#EXTINF:1,Beyoncé - Café」を CP1252 で
    const cp1252 = new Uint8Array([
      ...new TextEncoder().encode('#EXTM3U\r\n#EXTINF:1,Beyonc'),
      0xe9,
      ...new TextEncoder().encode(' - Caf'),
      0xe9,
      ...new TextEncoder().encode('\r\nC:\\a.mp3\r\n'),
    ])
    const [b] = parseSetlistBuffer(cp1252.buffer, 'old.m3u').playlists[0]
      .setlist.tracks
    expect([b.artist, b.title]).toEqual(['Beyoncé', 'Café'])
  })

  it('最後の #EXTINF にパスが無くても曲として残す。曲が無ければエラー', () => {
    expect(tracksOf('#EXTM3U\n#EXTINF:1,A - B').map((t) => t.title)).toEqual([
      'B',
    ])
    expect(() => parseM3u('#EXTM3U\n')).toThrow()
  })

  it('titleFromPath', () => {
    expect(titleFromPath('C:\\x\\1-07 Sweetless.mp3')).toBe('Sweetless')
    expect(titleFromPath('/x/03 - Song.flac')).toBe('Song')
    expect(titleFromPath('/x/1999.mp3')).toBe('1999')
    expect(titleFromPath('8ODY.mp3')).toBe('8ODY')
  })
})
