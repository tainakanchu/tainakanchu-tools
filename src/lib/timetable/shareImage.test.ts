import { describe, expect, it } from 'vitest'
import { systemCanvasFont, systemFontStack } from '../cjk/systemFonts'
import {
  buildShareImageModel,
  ellipsize,
  shareImageFileName,
  wrapText,
} from './shareImage'
import type { TimetableDoc } from './types'

const doc: TimetableDoc = {
  version: 1,
  title: 'CJK Fes 2026',
  timezone: 'Asia/Tokyo',
  days: [
    { id: 'd2', date: '2026-11-08', label: 'DAY2' },
    { id: 'd1', date: '2026-11-07', label: 'DAY1' },
  ],
  venues: [
    { id: 'v1', name: '天空舞台' },
    { id: 'v2', name: '乐队舞台' },
  ],
  travel: [{ from: 'v1', to: 'v2', minutes: 15 }],
  acts: [
    {
      id: 'a',
      dayId: 'd1',
      venueId: 'v1',
      start: '15:00',
      end: '15:40',
      title: 'STOLEN 秘密行动',
    },
    {
      id: 'b',
      dayId: 'd1',
      venueId: 'v2',
      start: '13:00',
      end: '14:30',
      title: 'Dekopon Escaping 丑橘出逃乐队',
      subtitle: 'guest',
    },
    {
      id: 'c',
      dayId: 'd1',
      venueId: 'v1',
      start: '13:20',
      end: '13:50',
      title: '衛柏 Neon',
    },
    {
      id: 'd',
      dayId: 'd1',
      venueId: 'v1',
      start: '14:00',
      end: '14:20',
      title: 'Kangziwon 강지원',
    },
    { id: 'e', dayId: 'd2', venueId: 'v2', start: '12:00', title: 'MAKKURAGE' },
    {
      id: 'f',
      dayId: 'd2',
      venueId: 'v2',
      start: '18:00',
      end: '18:30',
      title: 'not favorite',
    },
  ],
}

describe('buildShareImageModel', () => {
  const favs = new Set(['a', 'b', 'c', 'd', 'e'])
  const model = buildShareImageModel(doc, favs)

  it('日ごとに、日の並び順(doc.days)で分け、お気に入りだけを数える', () => {
    expect(model.days.map((d) => d.dayId)).toEqual(['d2', 'd1'])
    expect(model.total).toBe(5)
    expect(model.dayLabels).toEqual(['11/8(日) DAY2', '11/7(土) DAY1'])
    expect(model.days[0].rows.map((r) => r.actId)).toEqual(['e'])
  })

  it('日の中は開始時刻の順', () => {
    expect(model.days[1].rows.map((r) => r.actId)).toEqual(['b', 'c', 'd', 'a'])
    expect(model.days[1].rows[0]).toMatchObject({
      time: '13:00〜14:30',
      venueName: '乐队舞台',
      venueIndex: 1,
      subtitle: 'guest',
    })
    expect(model.days[0].rows[0].time).toBe('12:00〜')
  })

  it('被りは直前の 1 件だけでなく、その日のすべてと比べて印を付ける', () => {
    const rows = model.days[1].rows
    // b(13:00-14:30) は c と d の両方に重なる。a(15:00) はどれとも重ならない
    expect(rows.map((r) => [r.actId, r.conflict])).toEqual([
      ['b', true],
      ['c', true],
      ['d', true],
      ['a', false],
    ])
    // 見出しの「重なり」は MyView と同じく直前との重なりの数(c→d は同じ会場で空き 10 分)
    expect(model.days[1].overlaps).toBe(1)
    expect(rows[1].gapBefore).toMatchObject({ kind: 'overlap' })
    expect(rows[1].gapBefore?.text).toContain('重なって')
    // c → d は同じ会場で 10 分空き
    expect(rows[2].gapBefore).toMatchObject({ kind: 'stay' })
    expect(rows[0].gapBefore).toBeNull()
  })

  it('移動時間が足りなければ tight', () => {
    // g(乐队舞台 14:50 終) → a(天空舞台 15:00) は空き 10 分、移動 15 分
    const m = buildShareImageModel(
      {
        ...doc,
        acts: [
          ...doc.acts,
          {
            id: 'g',
            dayId: 'd1',
            venueId: 'v2',
            start: '14:40',
            end: '14:50',
            title: 'g',
          },
        ],
      },
      new Set(['g', 'a']),
    )
    expect(m.days[0].rows[1].gapBefore).toMatchObject({ kind: 'tight' })
    expect(m.days[0].tights).toBe(1)
  })

  it('お気に入りが無ければ空', () => {
    const empty = buildShareImageModel(doc, new Set())
    expect(empty.days).toEqual([])
    expect(empty.total).toBe(0)
  })
})

// 1 字 = 幅 1 として測る
const len = (s: string) => Array.from(s).length

describe('wrapText', () => {
  it('収まればそのまま 1 行', () => {
    expect(wrapText('衛柏 Neon', 20, len)).toEqual(['衛柏 Neon'])
  })

  it('欧文は語の切れ目で折り返す', () => {
    expect(wrapText('Dekopon Escaping Band', 10, len)).toEqual([
      'Dekopon',
      'Escaping…',
    ])
    expect(wrapText('Dekopon Escaping Band', 10, len, 3)).toEqual([
      'Dekopon',
      'Escaping',
      'Band',
    ])
  })

  it('漢字は字の途中でも折り返せる', () => {
    const lines = wrapText('Dekopon 丑橘出逃乐队', 10, len)
    expect(lines).toEqual(['Dekopon 丑橘', '出逃乐队'])
  })

  it('1 語で幅を超えるときは字で割る', () => {
    expect(wrapText('ABCDEFGHIJKLMN', 5, len, 3)).toEqual([
      'ABCDE',
      'FGHIJ',
      'KLMN',
    ])
  })

  it('行数を超えた分は最後の行を … で切る', () => {
    const lines = wrapText('aaaa bbbb cccc dddd', 5, len)
    expect(lines).toEqual(['aaaa', 'bbbb…'])
    const tight = wrapText('aaaaa bbbbb ccccc', 5, len)
    expect(tight).toEqual(['aaaaa', 'bbbb…'])
    expect(tight.every((l) => len(l) <= 5)).toBe(true)
  })

  it('句読点を行頭に置かない', () => {
    const lines = wrapText('ずっと真夜中でいいのに。', 11, len)
    expect(lines.every((l) => !l.startsWith('。'))).toBe(true)
  })

  it('空文字は空配列', () => {
    expect(wrapText('   ', 10, len)).toEqual([])
  })
})

describe('ellipsize', () => {
  it('収まらなければ … を付けて削る', () => {
    expect(ellipsize('abcdef', 10, len)).toBe('abcdef')
    expect(ellipsize('abcdef', 4, len)).toBe('abc…')
  })
})

describe('shareImageFileName', () => {
  it('タイトルを使い、空白や記号は - にする', () => {
    expect(shareImageFileName('CJK Fes 2026')).toBe('CJK-Fes-2026-my.png')
    expect(shareImageFileName('a/b: c')).toBe('a-b-c-my.png')
    expect(shareImageFileName('台北 音樂節')).toBe('台北-音樂節-my.png')
    expect(shareImageFileName('  ')).toBe('timetable-my.png')
  })
})

describe('systemFonts', () => {
  it('文字列ごとに CSS と同じスタックを選ぶ', () => {
    expect(systemFontStack(undefined)).toContain('Hiragino Kaku Gothic ProN')
    expect(systemCanvasFont('丑橘出逃乐队', 30, 700)).toMatch(
      /^700 30px 'Helvetica Neue', Arial, 'PingFang SC'/,
    )
    expect(systemCanvasFont('Kangziwon 강지원', 30)).toContain(
      "'Apple SD Gothic Neo'",
    )
    expect(systemCanvasFont('長渕剛', 30)).toContain('Hiragino')
  })
})
