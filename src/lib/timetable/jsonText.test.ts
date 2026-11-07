import { describe, expect, it } from 'vitest'
import { extractJson } from './jsonText'
import { parseTimetableText } from './normalize'

/** ChatGPT が JSON を本文として出し、それをコピーしたときの形(行末の \ と &#x20;) */
const RICH_TEXT_PASTE = String.raw`{\
&#x20; "version": 1,\
&#x20; "title": "BiKN shibuya 2026",\
&#x20; "days": [\
&#x20;   {\
&#x20;     "id": "d1",\
&#x20;     "date": "2026-11-08",\
&#x20;     "label": "11月8日（日）"\
&#x20;   }\
&#x20; ],\
&#x20; "venues": [\
&#x20;   { "id": "v1", "name": "WWW X" }\
&#x20; ],\
&#x20; "acts": [\
&#x20;   {\
&#x20;     "dayId": "d1",\
&#x20;     "venueId": "v1",\
&#x20;     "start": "12:50",\
&#x20;     "end": "13:40",\
&#x20;     "title": "Teh (HALLEY)"\
&#x20;   }\
&#x20; ]\
}`

describe('extractJson: リッチテキストとしてコピーされた JSON', () => {
  it('行末の \\ と &#x20; を戻して読む', () => {
    const r = extractJson(RICH_TEXT_PASTE)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toEqual({
      version: 1,
      title: 'BiKN shibuya 2026',
      days: [{ id: 'd1', date: '2026-11-08', label: '11月8日（日）' }],
      venues: [{ id: 'v1', name: 'WWW X' }],
      acts: [
        {
          dayId: 'd1',
          venueId: 'v1',
          start: '12:50',
          end: '13:40',
          title: 'Teh (HALLEY)',
        },
      ],
    })
  })

  it('CRLF・&#32;・&nbsp;・NBSP・前後の説明文が混ざっていても読む', () => {
    const text =
      '以下が結果です。\r\n{\\\r\n&#32;"title": "フェス&amp;サーキット",\\\r\n&nbsp;"days":\u00a0[]\\\r\n}\r\nご確認ください。'
    const r = extractJson(text)
    expect(r).toEqual({
      ok: true,
      value: { title: 'フェス&サーキット', days: [] },
    })
  })

  it('取り込み全体(parseTimetableText)まで通る', () => {
    const { doc, issues } = parseTimetableText(RICH_TEXT_PASTE)
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
    expect(doc!.title).toBe('BiKN shibuya 2026')
    expect(doc!.acts.map((a) => a.title)).toEqual(['Teh (HALLEY)'])
  })

  it('Markdown のエスケープ(\\_ \\*)は、読めないときだけ戻す', () => {
    const text = String.raw`{\
&#x20; "title": "fes\_2026 \*special\*",\
&#x20; "note": "C:\\dir\\"\
}`
    expect(extractJson(text)).toEqual({
      ok: true,
      value: { title: 'fes_2026 *special*', note: 'C:\\dir\\' },
    })
  })

  it('文字列の中の全角スペースは残す', () => {
    const text = '{\\\n&#x20;"title":\u3000"A\u3000B"\\\n}'
    expect(extractJson(text)).toEqual({
      ok: true,
      value: { title: 'A\u3000B' },
    })
  })
})

describe('extractJson: 正しい JSON は変えない', () => {
  it('行末近くに \\\\ や \\" を含む文字列も JSON.parse と同じ結果', () => {
    const text = [
      '{',
      '  "title": "say \\"hi\\"",',
      '  "path": "C:\\\\dir\\\\",',
      '  "note": "a\\\\",',
      '  "esc": "\\\\_\\\\*",',
      '  "url": "https://example.com/a_b"',
      '}',
    ].join('\n')
    const expected = JSON.parse(text) as unknown
    expect(expected).toEqual({
      title: 'say "hi"',
      path: 'C:\\dir\\',
      note: 'a\\',
      esc: '\\_\\*',
      url: 'https://example.com/a_b',
    })
    expect(extractJson(text)).toEqual({ ok: true, value: expected })
  })

  it('値に &amp; や &#x20; を含む正しい JSON はそのまま', () => {
    const text = '{"title":"A &amp; B&#x20;","memo":"x\\\\"}'
    expect(extractJson(text)).toEqual({
      ok: true,
      value: { title: 'A &amp; B&#x20;', memo: 'x\\' },
    })
  })

  it('値の中のスマートクォートは正しい JSON なら変えない', () => {
    const text = '{"title":"“新曲”披露, “A”","x":1}'
    expect(extractJson(text)).toEqual({
      ok: true,
      value: { title: '“新曲”披露, “A”', x: 1 },
    })
  })
})

describe('extractJson: スマートクォート', () => {
  it('構造の位置にあるスマートクォートを " に戻し、値の中の引用符は残す', () => {
    const text = `{
  “title”: “BiKN shibuya 2026”,
  “days”: [{ “id”: “d1”, “label”: “11月8日（日）” }],
  “acts”: [{ “title”: ““新曲”披露ライブ” }]
}`
    expect(extractJson(text)).toEqual({
      ok: true,
      value: {
        title: 'BiKN shibuya 2026',
        days: [{ id: 'd1', label: '11月8日（日）' }],
        acts: [{ title: '“新曲”披露ライブ' }],
      },
    })
  })

  it('リッチテキストの崩れとスマートクォートが重なっていても読む', () => {
    const text = '{\\\n&#x20; “title”: “Teh (HALLEY)”\\\n}'
    expect(extractJson(text)).toEqual({
      ok: true,
      value: { title: 'Teh (HALLEY)' },
    })
  })
})
