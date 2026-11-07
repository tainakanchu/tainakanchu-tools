import { describe, expect, it } from 'vitest'
import {
  normalizeDate,
  normalizeTime,
  normalizeTimetable,
  parseTimetableText,
  splitTimeRange,
} from './normalize'
import { SAMPLE_RAW, buildSampleDoc } from './sample'

describe('normalizeTime / splitTimeRange', () => {
  it('全角・漢字・秒付きを HH:MM に揃える', () => {
    expect(normalizeTime('１４：３０')).toBe('14:30')
    expect(normalizeTime('9:05')).toBe('09:05')
    expect(normalizeTime('14時30分')).toBe('14:30')
    expect(normalizeTime('14時')).toBe('14:00')
    expect(normalizeTime('14:30:00')).toBe('14:30')
    expect(normalizeTime('1430')).toBe('14:30')
    expect(normalizeTime('25:30')).toBe('25:30')
    expect(normalizeTime('48:00')).toBeNull()
    expect(normalizeTime('14:75')).toBeNull()
    expect(normalizeTime('昼')).toBeNull()
  })

  it('範囲表記を分ける', () => {
    expect(splitTimeRange('14:00〜14:40')).toEqual({
      start: '14:00',
      end: '14:40',
    })
    expect(splitTimeRange('14:00 - 14:40')).toEqual({
      start: '14:00',
      end: '14:40',
    })
    expect(splitTimeRange('１４：００～１４：４０')).toEqual({
      start: '14:00',
      end: '14:40',
    })
    expect(splitTimeRange('23:30〜')).toEqual({ start: '23:30', end: null })
  })

  it('日付の揺れを吸収する', () => {
    expect(normalizeDate('2026/11/8')).toBe('2026-11-08')
    expect(normalizeDate('2026年11月8日(土)')).toBe('2026-11-08')
    expect(normalizeDate('2026-02-30')).toBeNull()
  })
})

describe('normalizeTimetable', () => {
  it('サンプル(time 文字列・会場名指定・id なし)を取り込める', () => {
    const { doc, issues } = normalizeTimetable(SAMPLE_RAW)
    expect(doc).not.toBeNull()
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
    expect(doc!.days.map((d) => d.date)).toEqual(['2025-11-29', '2025-11-30'])
    expect(doc!.venues).toHaveLength(5)
    expect(doc!.acts.length).toBe(SAMPLE_RAW.acts.length)
    expect(doc!.travel).toHaveLength(6)
    const first = doc!.acts.find((a) => a.title === '9m88')!
    expect(first).toMatchObject({
      dayId: 'd1',
      venueId: 'sky',
      start: '14:40',
      end: '15:30',
      subtitle: 'This Temporary Ensemble Vol.2',
    })
    expect(first.kind).toBeUndefined()
    expect(doc!.acts.find((a) => a.title === '【復展開幕】DJ BENN')!.kind).toBe(
      'dj',
    )
  })

  it('id は中身から安定して作られ、正規化は冪等', () => {
    const a = buildSampleDoc()
    const b = buildSampleDoc()
    expect(a.acts.map((x) => x.id)).toEqual(b.acts.map((x) => x.id))
    expect(new Set(a.acts.map((x) => x.id)).size).toBe(a.acts.length)
    const again = normalizeTimetable(a)
    expect(again.doc).toEqual(a)
    expect(again.issues).toEqual([])
  })

  it('出演の追加で既存の id がずれない', () => {
    const before = buildSampleDoc()
    const raw = structuredClone(SAMPLE_RAW)
    raw.acts.unshift({
      dayId: 'd1',
      venue: '天空舞台',
      time: '12:00-12:30',
      title: '追加',
    })
    const after = normalizeTimetable(raw).doc!
    const ids = new Set(after.acts.map((x) => x.id))
    for (const act of before.acts) expect(ids.has(act.id)).toBe(true)
  })

  it('エラーは出演単位で、他の出演は取り込む', () => {
    const { doc, issues } = normalizeTimetable({
      title: 'T',
      days: [
        { id: 'd1', date: '2026-11-08' },
        { id: 'd2', date: '2026-11-09' },
      ],
      venues: [{ id: 'a', name: 'O-EAST' }],
      acts: [
        {
          id: 'x',
          dayId: 'd1',
          venueId: 'a',
          start: '14:00',
          end: '14:30',
          title: 'OK',
        },
        { id: 'x', dayId: 'd1', venueId: 'a', start: '15:00', title: '重複' },
        { dayId: 'd9', venueId: 'a', start: '15:00', title: '日付なし' },
        { dayId: 'd1', venueId: 'zz', start: '15:00', title: '会場なし' },
        {
          dayId: 'd1',
          venueId: 'a',
          start: '14:00',
          end: '13:00',
          title: '逆転',
        },
        { dayId: 'd1', venueId: 'a', start: 'ひる', title: '時刻不明' },
        { dayId: 'd1', venueId: 'a', start: '16:00', end: '16:30' },
        { venueId: 'a', start: '16:00', title: '日付指定なし' },
        { dayId: 'd2', venue: 'WWW X', start: '13:00', title: '名前で会場' },
      ],
    })
    expect(doc!.acts.map((a) => a.title)).toEqual(['OK', '名前で会場'])
    const errors = issues.filter((i) => i.level === 'error')
    expect(errors.map((e) => e.actIndex)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(errors[0].where).toBe('出演 2「重複」')
    expect(errors[3].message).toContain('25:00')
    // 名前で指定された未知の会場は追加して警告
    expect(doc!.venues.map((v) => v.name)).toEqual(['O-EAST', 'WWW X'])
    expect(
      issues.some((i) => i.level === 'warning' && i.message.includes('WWW X')),
    ).toBe(true)
    // end 欠落は警告
    expect(issues.some((i) => i.level === 'warning' && i.actIndex === 8)).toBe(
      true,
    )
  })

  it('1 日だけなら dayId を省略できる。25 時表記を許す', () => {
    const { doc, issues } = normalizeTimetable({
      title: 'オールナイト',
      days: ['2026/11/08'],
      venues: ['contact'],
      acts: [
        {
          venue: 'contact',
          time: '２４：３０〜２６：００',
          title: 'DJ A',
          kind: 'DJ',
        },
      ],
    })
    expect(issues).toEqual([])
    expect(doc!.acts[0]).toMatchObject({
      dayId: '2026-11-08',
      start: '24:30',
      end: '26:00',
      kind: 'dj',
    })
  })

  it('days が無くても出演の date から日付を作る', () => {
    const { doc } = normalizeTimetable([
      { date: '2026-11-08', venue: 'A', start: '12:00', title: 'x' },
      { date: '2026-11-09', venue: 'A', start: '12:00', title: 'y' },
    ])
    expect(doc!.days.map((d) => d.date)).toEqual(['2026-11-08', '2026-11-09'])
  })

  it('出演が無ければ doc は null', () => {
    expect(normalizeTimetable({}).doc).toBeNull()
    expect(normalizeTimetable('x').doc).toBeNull()
  })
})

describe('parseTimetableText', () => {
  it('前置き・フェンス・末尾カンマを許す', () => {
    const text = `はい、読み取りました！\n\n\`\`\`json\n{"title":"T","days":[{"id":"d1","date":"2026-11-08"}],"venues":[{"id":"v1","name":"A"}],"acts":[{"dayId":"d1","venueId":"v1","start":"12:00","end":"12:30","title":"x",},],}\n\`\`\`\n以上です。`
    const { doc, issues } = parseTimetableText(text)
    expect(issues).toEqual([])
    expect(doc!.acts[0].title).toBe('x')
  })

  it('JSON が無ければ次にすることを書いたエラー', () => {
    const { doc, issues } =
      parseTimetableText('タイムテーブルの画像を貼ってください')
    expect(doc).toBeNull()
    expect(issues[0].message).toContain('JSON')
  })
})
