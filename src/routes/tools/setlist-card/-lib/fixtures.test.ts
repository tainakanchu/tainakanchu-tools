// @vitest-environment jsdom
/**
 * 実際の書き出しファイル（個人の情報を除いたもの。__fixtures__）での読み取り。
 * 曲名・アーティスト名は公開されているリリース情報なので、元のまま。
 */
import { describe, expect, it } from 'vitest'
import { parseSetlistText } from './parse'
import historyNml from './__fixtures__/traktor-history.nml?raw'
import playlistNml from './__fixtures__/traktor-playlist.nml?raw'
import type { ParseResult } from './types'

const pairs = (result: ParseResult) =>
  result.playlists[result.defaultIndex].setlist.tracks.map((t) => [
    t.artist,
    t.title,
  ])

describe('Traktor Pro 4 の History（26 曲）', () => {
  const result = parseSetlistText(
    historyNml,
    'history_2026y06m07d_16h01m21s.nml',
  )
  const playlist = result.playlists[result.defaultIndex]

  it('形式・曲数・日付（ファイル名から）', () => {
    expect(result.format).toBe('traktor-nml')
    expect(result.playlists).toHaveLength(1)
    expect(playlist.name).toBe('history_2026y06m07d_16h01m21s')
    expect(playlist.setlist.tracks).toHaveLength(26)
    expect(playlist.setlist.date).toBe('2026.06.07')
    expect(playlist.setlist.title).toBeUndefined()
  })

  it('プレイリストの順に、アーティストと曲名をそのまま読む', () => {
    const got = pairs(result)
    expect(got[0]).toEqual(['李映霏 Moonrize', '海王星'])
    expect(got[3]).toEqual(['dropp', '我是一片雲 / cloud of romance [rework]'])
    expect(got[7]).toEqual(['李映霏 Moonrize', '浪潮 Ebb & Flow'])
    expect(got[12]).toEqual(['甜約翰', '追逐，然後跳舞'])
    expect(got[15]).toEqual([
      '阿布絲、陳祺方 (Abus.tamapima、2-Chi)',
      'muskung kata 讓我們一起',
    ])
    expect(got[16]).toEqual([
      '打底音樂',
      'Uyas mseupu mqqaras‧kasaupu‧謝聚之歌',
    ])
    expect(got[17]).toEqual([
      'Kumu Basaw 姑慕·巴紹',
      'Nasi Su Kuxul O Asi Rngaw 愛要說出口',
    ])
    expect(got[21]).toEqual([
      'Blue candy, 剎那Setsuna',
      '我兄弟x了我最愛的女人',
    ])
    expect(got[24]).toEqual(['家家 Feat. ØZI', 'House Party'])
    expect(got[25]).toEqual(['蚊子', "I Don't Mind. feat. Mandark"])
  })

  it('開始時刻（EXTENDEDDATA）が無いので startAt は無い', () => {
    for (const t of playlist.setlist.tracks) expect(t.startAt).toBeUndefined()
  })

  it('BPM・Key はコレクションから読む', () => {
    expect(playlist.setlist.tracks[0]).toMatchObject({ bpm: 128, key: 'D' })
  })
})

describe('Traktor Pro 4 のプレイリスト（32 曲）', () => {
  const result = parseSetlistText(playlistNml, '261102 ゆらぎとは。.nml')
  const playlist = result.playlists[result.defaultIndex]

  it('形式・曲数。プレイリスト名から日付・イベント名を作らない', () => {
    expect(result.format).toBe('traktor-nml')
    expect(playlist.name).toBe('261102 ゆらぎとは。')
    expect(playlist.setlist.tracks).toHaveLength(32)
    expect(playlist.setlist.date).toBeUndefined()
    expect(playlist.setlist.title).toBeUndefined()
  })

  it('キリル文字・声調記号・∞ をそのまま読む', () => {
    const got = pairs(result)
    expect(got[0]).toEqual(['163 braces', 'O I K'])
    expect(got[7]).toEqual([
      '丹丹貓貓 = aDAN薛詒丹 x Miao Miao Flow',
      'GARDEN OF MINE',
    ])
    expect(got[12]).toEqual(['鎌野愛 and 菅原一樹', '光'])
    expect(got[13]).toEqual(['鹿比 ∞ 吠陀', 'Antinomy'])
    expect(got[16]).toEqual(['fuvva', '世紀暈船大王'])
    expect(got[21]).toEqual(['拍謝少年 Feat. 余佩真 (Û Puē-tsin)', '踅夜市'])
    // м・т はキリル文字（見た目はラテン文字と同じでも別の字）
    expect(got[25]).toEqual(['I Mean Us', 'Søulмaтe'])
    expect(got[25][1]).toContain('м')
    expect(got[27]).toEqual(['toe,Cheer Chen,OOG', 'Looonely'])
    expect(got[31]).toEqual(['13月終了', '頭骨拗拗'])
  })

  it('開始時刻は無い', () => {
    for (const t of playlist.setlist.tracks) expect(t.startAt).toBeUndefined()
  })
})
