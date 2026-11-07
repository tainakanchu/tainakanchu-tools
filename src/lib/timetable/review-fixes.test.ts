/**
 * レビューで見つかった取りこぼしの回帰テスト(取り込みの寛容さ・ics・移動の判定・プロンプト)。
 */
import { describe, expect, it } from 'vitest'
import { buildMyTimeline } from './derive'
import { buildFavoritesIcs } from './ics'
import { extractJson } from './jsonText'
import {
  normalizeTime,
  normalizeTimetable,
  parseTimetableText,
} from './normalize'
import { buildTimetablePrompt } from './prompt'

const base = {
  title: 't',
  days: [
    { id: 'd1', date: '2026-11-07', label: 'DAY1' },
    { id: 'd2', date: '2026-11-08', label: 'DAY2' },
  ],
}

describe('normalizeTimetable の寛容な読み', () => {
  it('「14時半」を読む', () => {
    expect(normalizeTime('１４時半')).toBe('14:30')
  })

  it('0 時跨ぎ(差が 6 時間以内)は 24 時以降に直して警告で残す', () => {
    const { doc, issues } = normalizeTimetable({
      ...base,
      venues: ['A'],
      acts: [
        { dayId: 'd1', venue: 'A', start: '23:30', end: '00:30', title: 'x' },
        {
          dayId: 'd1',
          venue: 'A',
          start: '22:00',
          end: '05:00',
          title: '長い',
        },
      ],
    })
    expect(doc!.acts.map((a) => [a.title, a.end])).toEqual([['x', '24:30']])
    expect(issues.find((i) => i.actIndex === 0)?.level).toBe('warning')
    expect(issues.find((i) => i.actIndex === 1)?.level).toBe('error')
  })

  it('開始と終了が同じなら警告 1 件で end を省く', () => {
    const { doc, issues } = normalizeTimetable({
      ...base,
      venues: ['A'],
      acts: [
        { dayId: 'd1', venue: 'A', start: '12:00', end: '12:00', title: 'x' },
      ],
    })
    expect(doc!.acts[0].end).toBeUndefined()
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('同じ')
  })

  it('day: 1 のような通し番号を days[n-1] に解決する', () => {
    const { doc } = normalizeTimetable({
      ...base,
      venues: ['A'],
      acts: [
        { day: 1, venue: 'A', start: '12:00', title: 'one' },
        { day: 2, venue: 'A', start: '12:00', title: 'two' },
        { day: 'DAY2', venue: 'A', start: '13:00', title: 'label' },
      ],
    })
    expect(doc!.acts.map((a) => a.dayId)).toEqual(['d1', 'd2', 'd2'])
  })

  it('venueId は id として、venue は名前として先に引く', () => {
    const { doc } = normalizeTimetable({
      title: 't',
      days: ['2026-11-07'],
      venues: [
        { id: 'WWW', name: 'WWW X' },
        { id: 'v2', name: 'WWW' },
      ],
      acts: [
        { venueId: 'WWW', start: '12:00', title: 'a' },
        { venue: 'WWW', start: '12:00', title: 'b' },
        { venueId: 'www x', start: '13:00', title: 'c' },
      ],
    })
    expect(doc!.acts.map((a) => a.venueId)).toEqual(['WWW', 'v2', 'WWW'])
  })
})

describe('extractJson / parseTimetableText', () => {
  it('// コメントは消して読む。文字列内の https:// は残す', () => {
    const text = `{"title":"T", // イベント名
"sourceUrl":"https://example.com/tt",
"days":[{"id":"d1","date":"2026-11-08"}],"venues":[{"id":"v1","name":"A"}],
"acts":[{"dayId":"d1","venueId":"v1","start":"12:00","end":"12:30","title":"x"} // 1組目
]}`
    const { doc, issues } = parseTimetableText(text)
    expect(issues).toEqual([])
    expect(doc!.sourceUrl).toBe('https://example.com/tt')
  })

  it('省略記号で壊れたオブジェクトは、中の配列に逃げず専用のエラー', () => {
    const text =
      '{"title":"x","days":[{"id":"d1","date":"2026-11-08"}],"venues":[{"id":"v1","name":"A"}],"acts":[{"dayId":"d1","venueId":"v1","start":"12:00","title":"a"}, ... 以下同様 ]}'
    expect(extractJson(text)).toEqual({ ok: false, reason: 'broken' })
    const { doc, issues } = parseTimetableText(text)
    expect(doc).toBeNull()
    expect(issues[0].message).toContain('省略せず全件')
  })

  it('出演の配列だけなら配列として読む。オブジェクトの配列でなければ読まない', () => {
    const r = extractJson(
      '結果です\n[{"date":"2026-11-08","venue":"A","start":"12:00","title":"x"}]',
    )
    expect(r.ok).toBe(true)
    expect(extractJson('[1, 2, 3]')).toEqual({ ok: false, reason: 'none' })
  })
})

describe('buildFavoritesIcs のエスケープ', () => {
  it('; , 改行 バックスラッシュをエスケープし、UID を安全にする', () => {
    const { doc } = normalizeTimetable({
      title: 'Fes; A, B',
      days: ['2026-11-07'],
      venues: ['A; B'],
      acts: [
        {
          id: 'my id/1',
          venue: 'A; B',
          start: '12:00',
          end: '12:30',
          title: 'X; Y, Z \\ W',
          note: 'line1\nline2',
        },
      ],
    })
    const ics = buildFavoritesIcs(doc!, new Set(['my id/1']), 0)
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain('SUMMARY:X\\; Y\\, Z \\\\ W')
    expect(unfolded).toContain('LOCATION:A\\; B')
    expect(unfolded).toContain('line1\\nline2')
    expect(unfolded).toContain('X-WR-CALNAME:Fes\\; A\\, B')
    expect(unfolded).toContain('UID:my%20id%2F1@timetable.tainakanchu-tools')
  })
})

describe('buildMyTimeline: 移動時間が未登録', () => {
  const { doc } = normalizeTimetable({
    title: 't',
    days: ['2026-11-07'],
    venues: ['A', 'B'],
    acts: [
      { venue: 'A', start: '12:00', end: '12:30', title: 'a' },
      { venue: 'B', start: '12:35', end: '13:00', title: 'b' },
      { venue: 'A', start: '13:10', end: '13:40', title: 'c' },
    ],
  })
  it('空き 10 分未満なら tight、10 分以上なら move', () => {
    const [day] = buildMyTimeline(doc!, new Set(doc!.acts.map((a) => a.id)))
    expect(day.items[1].gapBefore).toMatchObject({
      kind: 'tight',
      freeMinutes: 5,
      travelMinutes: null,
    })
    expect(day.items[2].gapBefore).toMatchObject({
      kind: 'move',
      freeMinutes: 10,
    })
  })
})

describe('プロンプト', () => {
  it('省略禁止とサーキットフェスの読み方を含む', () => {
    const prompt = buildTimetablePrompt('new')
    expect(prompt).toContain('省略せず、全件を書く')
    expect(prompt).toContain('以下同様')
    expect(prompt).toContain('帯の上端を start、下端を end')
    expect(prompt).toContain('各組 30 分')
    expect(prompt).toContain('出演数を資料と数え合わせ')
    expect(prompt).toContain('画像(スクリーンショット)か文字起こし')
  })
})
