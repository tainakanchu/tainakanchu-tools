// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseDelimited } from './csv'
import { normalizeKey, traktorKeyToName } from './keys'
import {
  UnsupportedFormatError,
  parseSetlistBuffer,
  parseSetlistText,
} from './parse'
import { decodeTraktorDate } from './parse-traktor-nml'
import {
  cleanArtist,
  decodeText,
  findDate,
  formatOffset,
  parseClockTime,
  parseDuration,
  unwrapMidnight,
} from './text'

function utf16le(text: string, bom = true): ArrayBuffer {
  const bytes = new Uint8Array((bom ? 2 : 0) + text.length * 2)
  let offset = 0
  if (bom) {
    bytes[0] = 0xff
    bytes[1] = 0xfe
    offset = 2
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    bytes[offset + i * 2] = code & 0xff
    bytes[offset + i * 2 + 1] = code >> 8
  }
  return bytes.buffer
}

describe('decodeText', () => {
  it('BOM で UTF-16LE / UTF-8 を判定する', () => {
    expect(decodeText(utf16le('曲名\tA'))).toBe('曲名\tA')
    const utf8 = new TextEncoder().encode('﻿name,artist')
    expect(decodeText(utf8.buffer)).toBe('name,artist')
  })

  it('BOM 無しの UTF-16LE も 0x00 の偏りで判定する', () => {
    expect(decodeText(utf16le('Track Title\tArtist', false))).toBe(
      'Track Title\tArtist',
    )
  })

  it('UTF-16BE の BOM', () => {
    const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x30, 0x42])
    expect(decodeText(bytes.buffer)).toBe('Aあ')
  })
})

describe('text helpers', () => {
  it('時刻を秒にする（12 時間表記・午前午後を含む）', () => {
    expect(parseClockTime('22:01:13')).toBe(22 * 3600 + 60 + 13)
    expect(parseClockTime('10:01:13 PM')).toBe(22 * 3600 + 60 + 13)
    expect(parseClockTime('12:05:00 AM')).toBe(5 * 60)
    expect(parseClockTime('午後10:00')).toBe(22 * 3600)
    expect(parseClockTime('')).toBeUndefined()
  })

  it('再生時間を秒にする', () => {
    expect(parseDuration('5:23')).toBe(323)
    expect(parseDuration('00:04:12')).toBe(252)
    expect(parseDuration('300')).toBe(300)
    expect(parseDuration('abc')).toBeUndefined()
  })

  it('日付またぎで巻き戻った時刻を補正する', () => {
    expect(unwrapMidnight([86000, 86300, 100, undefined, 400])).toEqual([
      86000,
      86300,
      86500,
      undefined,
      86800,
    ])
  })

  it('日付を YYYY.MM.DD にし、曖昧な dd/mm は元のまま返す', () => {
    expect(findDate('HISTORY 2024-05-01 (2)')).toBe('2024.05.01')
    expect(findDate('history_2024y05m01d_22h10m05s.nml')).toBe('2024.05.01')
    expect(findDate('16/10/2021')).toBe('2021.10.16')
    expect(findDate('10/16/2021')).toBe('2021.10.16')
    expect(findDate('03/04/2021')).toBe('03/04/2021')
    expect(findDate('Saturday, 3 Feb 2018')).toBe('2018.02.03')
    expect(findDate('My Session')).toBeUndefined()
  })

  it('相対時刻を HH:MM で表示する', () => {
    expect(formatOffset(0)).toBe('00:00')
    expect(formatOffset(12 * 60 + 20)).toBe('00:12')
    expect(formatOffset(3600 + 5 * 60)).toBe('01:05')
  })

  it('中身の無いアーティスト名は空にする', () => {
    expect(cleanArtist('  Unknown Artist ')).toBe('')
    expect(cleanArtist(' DJ　Foo  ')).toBe('DJ Foo')
  })
})

describe('keys', () => {
  it('Traktor の 0〜23 を標準表記にする', () => {
    expect(traktorKeyToName(0)).toBe('C')
    expect(traktorKeyToName(1)).toBe('Db')
    expect(traktorKeyToName(21)).toBe('Am')
    expect(traktorKeyToName(18)).toBe('F#m')
    expect(traktorKeyToName(24)).toBeUndefined()
  })

  it('表記ゆれを揃える', () => {
    expect(normalizeKey('a minor')).toBe('Am')
    expect(normalizeKey('8a')).toBe('8A')
    expect(normalizeKey('F♯m')).toBe('F#m')
    expect(normalizeKey('')).toBeUndefined()
  })
})

describe('parseDelimited', () => {
  it('クォート内のカンマ・改行・エスケープを扱う', () => {
    const rows = parseDelimited(
      'name,artist\n"Hello, World","Foo ""Bar"""\r\n"multi\nline",x\n\n',
      ',',
    )
    expect(rows).toEqual([
      ['name', 'artist'],
      ['Hello, World', 'Foo "Bar"'],
      ['multi\nline', 'x'],
    ])
  })
})

const REKORDBOX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.0" Company="AlphaTheta"/>
  <COLLECTION Entries="3">
    <TRACK TrackID="11" Name="Opening Theme " Artist="Alpha" Album="A" Genre="House" AverageBpm="122.00" Tonality="Am" TotalTime="360" Label="Lbl" Location="file://localhost/Music/a.mp3">
      <TEMPO Inizio="0.0" Bpm="122.00"/>
    </TRACK>
    <TRACK TrackID="12" Name="夜明けのテーマ" Artist="ベータ" AverageBpm="124.50" Tonality="8A" TotalTime="300" Location="file://localhost/Music/%E5%A4%9C.mp3"/>
    <TRACK TrackID="13" Name="" Artist="Unknown Artist" AverageBpm="0.00" Location="file://localhost/Music/closing%20track.wav"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="2">
      <NODE Type="1" Name="Favorites" KeyType="0" Entries="1">
        <TRACK Key="13"/>
      </NODE>
      <NODE Type="0" Name="HISTORY" Count="3">
        <NODE Type="1" Name="HISTORY 2024-04-30" KeyType="0" Entries="1"><TRACK Key="11"/></NODE>
        <NODE Type="1" Name="HISTORY 2024-05-01" KeyType="1" Entries="3">
          <TRACK Key="file://localhost/Music/a.mp3"/>
          <TRACK Key="file://localhost/Music/%E5%A4%9C.mp3"/>
          <TRACK Key="file://localhost/Music/closing%20track.wav"/>
        </NODE>
        <NODE Type="1" Name="Empty" KeyType="0" Entries="0"/>
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`

describe('rekordbox XML', () => {
  it('プレイリスト候補を階層つきで返し、最新の HISTORY を既定にする', () => {
    const result = parseSetlistText(REKORDBOX_XML)
    expect(result.format).toBe('rekordbox-xml')
    expect(result.playlists.map((p) => p.name)).toEqual([
      'Favorites',
      'HISTORY 2024-04-30',
      'HISTORY 2024-05-01',
    ])
    expect(result.playlists[2].path).toEqual(['HISTORY'])
    expect(result.playlists[2].isHistory).toBe(true)
    expect(result.playlists[0].isHistory).toBe(false)
    expect(result.defaultIndex).toBe(2)
  })

  it('KeyType=1 (Location) で曲を引き、値を正規化する', () => {
    const result = parseSetlistText(REKORDBOX_XML)
    const { setlist } = result.playlists[2]
    expect(setlist.date).toBe('2024.05.01')
    expect(setlist.tracks.map((t) => [t.artist, t.title])).toEqual([
      ['Alpha', 'Opening Theme'],
      ['ベータ', '夜明けのテーマ'],
      ['', 'closing track'],
    ])
    expect(setlist.tracks[0]).toMatchObject({
      bpm: 122,
      key: 'Am',
      durationSec: 360,
      genre: 'House',
      label: 'Lbl',
    })
    expect(setlist.tracks[1]).toMatchObject({ bpm: 124.5, key: '8A' })
    expect(setlist.tracks[2].bpm).toBeUndefined()
  })
})

describe('rekordbox TXT', () => {
  it('UTF-16LE の英語ヘッダー', () => {
    const text = [
      '#\tArtwork\tTrack Title\tArtist\tAlbum\tGenre\tBPM\tRating\tTime\tKey\tDate Added',
      '1\t\tFirst Song\tArtist One\tAlb\tTechno\t130.00\t\t06:12\t5A\t2024-01-01',
      '2\t\tSecond Song \t\tAlb\t\t128.00\t\t5:00\tF#m\t2024-01-01',
    ].join('\r\n')
    const result = parseSetlistBuffer(utf16le(text), 'HISTORY 2024-05-03.txt')
    expect(result.format).toBe('rekordbox-txt')
    const { setlist } = result.playlists[0]
    expect(setlist.date).toBe('2024.05.03')
    expect(setlist.tracks).toHaveLength(2)
    expect(setlist.tracks[0]).toMatchObject({
      title: 'First Song',
      artist: 'Artist One',
      bpm: 130,
      key: '5A',
      durationSec: 372,
      genre: 'Techno',
    })
    expect(setlist.tracks[1]).toMatchObject({
      title: 'Second Song',
      artist: '',
      key: 'F#m',
    })
  })

  it('日本語ヘッダー', () => {
    const text = [
      '#\tトラックタイトル\tアーティスト\tBPM\tキー\t時間',
      '1\t夜の街\tかんちゅ\t125.00\tAm\t04:30',
    ].join('\n')
    const result = parseSetlistBuffer(utf16le(text))
    expect(result.playlists[0].setlist.tracks[0]).toMatchObject({
      title: '夜の街',
      artist: 'かんちゅ',
      bpm: 125,
      key: 'Am',
      durationSec: 270,
    })
  })
})

const TRAKTOR_NML = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<NML VERSION="19"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>
<MUSICFOLDERS></MUSICFOLDERS>
<COLLECTION ENTRIES="3">
<ENTRY TITLE="Track A" ARTIST="Artist A"><LOCATION DIR="/:Music/:" FILE="a.mp3" VOLUME="Mac" VOLUMEID="x"></LOCATION>
<INFO GENRE="Techno" LABEL="L1" PLAYTIME="300"></INFO><TEMPO BPM="128.000061" BPM_QUALITY="100"></TEMPO><MUSICAL_KEY VALUE="21"></MUSICAL_KEY></ENTRY>
<ENTRY ARTIST="Artist B"><LOCATION DIR="/:Music/:" FILE="b-track.flac" VOLUME="Mac"></LOCATION><TEMPO BPM="130"></TEMPO><MUSICAL_KEY VALUE="1"></MUSICAL_KEY></ENTRY>
<ENTRY TITLE="Cue Only" ARTIST="Artist C"><LOCATION DIR="/:Music/:" FILE="c.mp3" VOLUME="Mac"></LOCATION></ENTRY>
</COLLECTION>
<SETS ENTRIES="0"></SETS>
<PLAYLISTS><NODE TYPE="FOLDER" NAME="$ROOT"><SUBNODES COUNT="1">
<NODE TYPE="PLAYLIST" NAME="HistoryPlaylist"><PLAYLIST ENTRIES="3" TYPE="LIST" UUID="u">
<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="Mac/:Music/:a.mp3"></PRIMARYKEY><EXTENDEDDATA DECK="0" DURATION="200" EXTENDEDTYPE="HistoryData" PLAYEDPUBLIC="1" STARTDATE="${(2024 << 16) | (5 << 8) | 1}" STARTTIME="${23 * 3600 + 58 * 60}"></EXTENDEDDATA></ENTRY>
<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="Mac/:Music/:c.mp3"></PRIMARYKEY><EXTENDEDDATA DECK="1" PLAYEDPUBLIC="0" STARTDATE="${(2024 << 16) | (5 << 8) | 1}" STARTTIME="${23 * 3600 + 59 * 60}"></EXTENDEDDATA></ENTRY>
<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="Mac/:Music/:b-track.flac"></PRIMARYKEY><EXTENDEDDATA DECK="1" PLAYEDPUBLIC="1" STARTDATE="${(2024 << 16) | (5 << 8) | 2}" STARTTIME="${3 * 60}"></EXTENDEDDATA></ENTRY>
</PLAYLIST></NODE></SUBNODES></NODE></PLAYLISTS>
</NML>`

describe('Traktor NML', () => {
  it('STARTDATE のビット詰めを読む', () => {
    expect(decodeTraktorDate((2024 << 16) | (5 << 8) | 1)).toEqual({
      year: 2024,
      month: 5,
      day: 1,
    })
    expect(decodeTraktorDate(0)).toBeUndefined()
  })

  it('PRIMARYKEY でコレクションを引き、試聴を除き、開始時刻を出す', () => {
    const result = parseSetlistText(TRAKTOR_NML, 'history_2024y05m01d.nml')
    expect(result.format).toBe('traktor-nml')
    const { setlist } = result.playlists[0]
    expect(setlist.date).toBe('2024.05.01')
    expect(setlist.tracks.map((t) => t.title)).toEqual(['Track A', 'b-track'])
    expect(setlist.tracks[0]).toMatchObject({
      artist: 'Artist A',
      bpm: 128,
      key: 'Am',
      genre: 'Techno',
      label: 'L1',
      // INFO PLAYTIME はファイルの長さ、EXTENDEDDATA DURATION は実際にかけた秒数
      durationSec: 300,
      playedSec: 200,
    })
    expect(setlist.tracks[1].key).toBe('Db')
    // DURATION が無ければ、かけた長さはわからない
    expect(setlist.tracks[1].playedSec).toBeUndefined()
    const [a, b] = setlist.tracks
    expect((b.startAt ?? 0) - (a.startAt ?? 0)).toBe(5 * 60)
  })

  it('プレイリストが無ければコレクション順を使う', () => {
    const noPlaylist = TRAKTOR_NML.replace(
      /<PLAYLISTS>[\s\S]*<\/PLAYLISTS>/,
      '',
    )
    const result = parseSetlistText(noPlaylist)
    expect(result.playlists[0].setlist.tracks.map((t) => t.title)).toEqual([
      'Track A',
      'b-track',
      'Cue Only',
    ])
  })
})

describe('Serato CSV', () => {
  it('セッション行をタイトル・日付に使って曲から外す', () => {
    const csv = [
      'name,artist,start time,end time,playtime,deck,notes,bpm,key',
      '"16/10/2021",,"9:57:46 PM","1:21:36 AM","3:23:49",,,,',
      '"Song, With Comma","Artist 1","9:57:46 PM","10:02:10 PM","00:04:24",1,,"124","Am"',
      '"真夜中","アーティスト","11:59:00 PM","12:04:00 AM","00:05:00",2,,"126.5","8a"',
      '"After Midnight","Artist 3","12:04:00 AM","12:09:00 AM","00:05:00",1,,"",""',
    ].join('\n')
    const result = parseSetlistText(csv, 'session.csv')
    expect(result.format).toBe('serato-csv')
    const { setlist } = result.playlists[0]
    expect(setlist.date).toBe('2021.10.16')
    expect(setlist.title).toBeUndefined()
    expect(setlist.tracks).toHaveLength(3)
    expect(setlist.tracks[0]).toMatchObject({
      title: 'Song, With Comma',
      artist: 'Artist 1',
      bpm: 124,
      key: 'Am',
      // playtime は実際にかけていた長さ（ファイルの長さではない）
      playedSec: 264,
      durationSec: undefined,
    })
    expect(setlist.tracks[1].key).toBe('8A')
    // end time は実際に終わった時刻。日をまたいでも開始より後になる
    const ends = setlist.tracks.map(
      (t) => (t.endAt ?? 0) - (setlist.tracks[0].startAt ?? 0),
    )
    expect(ends).toEqual([264, 7574, 7874])
    const offsets = setlist.tracks.map(
      (t) => (t.startAt ?? 0) - (setlist.tracks[0].startAt ?? 0),
    )
    expect(offsets).toEqual([0, 7274, 7574])
  })

  it('列順が違っても名前で探し、日付でないセッション名はタイトルにする', () => {
    const csv = [
      'Name,Start Time,End Time,Playtime,Deck,Notes,Artist',
      'Friday Night,21:00:00,23:00:00,02:00:00,,,',
      'Track 1,21:00:00,21:05:00,00:05:00,1,,Someone',
    ].join('\n')
    const { setlist } = parseSetlistText(csv).playlists[0]
    expect(setlist.title).toBe('Friday Night')
    expect(setlist.tracks).toEqual([
      expect.objectContaining({ title: 'Track 1', artist: 'Someone' }),
    ])
  })
})

describe('format detection', () => {
  it('未対応の形式はエラー', () => {
    expect(() => parseSetlistText('hello world')).toThrow(
      UnsupportedFormatError,
    )
  })
})
