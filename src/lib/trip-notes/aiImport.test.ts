import { describe, expect, it } from 'vitest'
import { parseImportedJson } from './aiImport'
import { FIELD_KEYS } from './storage'

/** 取り込み結果の 1 件目を取り出す。失敗していたら issues を添えて落とす */
function firstBooking(result: ReturnType<typeof parseImportedJson>) {
  expect(result.issues.filter((i) => i.index === null)).toEqual([])
  expect(result.bookings.length).toBeGreaterThan(0)
  return result.bookings[0]
}

const TOKYO = 'Asia/Tokyo'

describe('parseImportedJson: 汚れた入力の許容', () => {
  it('```json フェンスに囲まれた出力を取り込める', () => {
    const text = [
      '```json',
      JSON.stringify([
        {
          kind: 'flight',
          title: 'AF276 HND→CDG',
          start: { date: '2026-09-12', time: '14:20', tz: 'Asia/Tokyo' },
          end: { date: '2026-09-12', time: '20:05', tz: 'Europe/Paris' },
        },
      ]),
      '```',
    ].join('\n')

    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.kind).toBe('flight')
    expect(booking.title).toBe('AF276 HND→CDG')
    expect(booking.start.zdt).toBe('2026-09-12T14:20:00+09:00[Asia/Tokyo]')
    expect(booking.end?.zdt).toBe('2026-09-12T20:05:00+02:00[Europe/Paris]')
  })

  it('言語指定のないフェンスでも取り込める', () => {
    const text = [
      '```',
      '[{"kind":"train","title":"TGV 6203","start":{"date":"2026-09-14","time":"08:12","tz":"Europe/Paris"},"end":null}]',
      '```',
    ].join('\n')
    expect(firstBooking(parseImportedJson(text, TOKYO)).title).toBe('TGV 6203')
  })

  it('前後に散文があっても JSON 部分だけを拾う', () => {
    const text = `はい、予約確認メールから情報を抽出しました！

\`\`\`json
[{"kind":"lodging","title":"Hotel Le Marais","start":{"date":"2026-09-12","time":"15:00","tz":"Europe/Paris"},"end":{"date":"2026-09-15","time":"11:00","tz":"Europe/Paris"}}]
\`\`\`

以上です。ご確認ください。`

    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.title).toBe('Hotel Le Marais')
    expect(booking.end?.zdt).toBe('2026-09-15T11:00:00+02:00[Europe/Paris]')
  })

  it('フェンスが無く散文に埋もれていても拾う', () => {
    const text =
      '抽出結果は以下の通りです。 [{"kind":"activity","title":"ルーヴル美術館","start":{"date":"2026-09-13","time":"10:00","tz":"Europe/Paris"}}] 以上になります。'
    expect(firstBooking(parseImportedJson(text, TOKYO)).title).toBe(
      'ルーヴル美術館',
    )
  })

  it('閉じていないフェンス(出力が途中で切れた場合)でも拾う', () => {
    const text =
      '```json\n[{"kind":"bus","title":"空港バス","start":{"date":"2026-09-12","time":"21:00","tz":"Europe/Paris"}}]'
    expect(firstBooking(parseImportedJson(text, TOKYO)).title).toBe('空港バス')
  })

  it('配列ではなく単一オブジェクトで返ってきたら配列に包む', () => {
    const text =
      '{"kind":"ferry","title":"サントリーニ行きフェリー","start":{"date":"2026-09-18","time":"07:30","tz":"Europe/Athens"}}'
    const result = parseImportedJson(text, TOKYO)
    expect(result.bookings).toHaveLength(1)
    expect(result.bookings[0].kind).toBe('ferry')
  })

  it('末尾カンマがあっても取り込める', () => {
    const text = `\`\`\`json
[
  {
    "kind": "car",
    "title": "レンタカー Hertz",
    "start": { "date": "2026-09-16", "time": "09:00", "tz": "Europe/Paris", },
    "end": null,
  },
]
\`\`\``
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.title).toBe('レンタカー Hertz')
    expect(booking.end).toBeNull()
  })

  it('文字列の中の "," + 閉じ括弧は末尾カンマとして消さない', () => {
    const text =
      '[{"kind":"other","title":"メモ","start":{"date":"2026-09-12","time":"10:00","tz":"Asia/Tokyo"},"note":"配列の書き方は [1,2,] のように書かれていた"}]'
    expect(firstBooking(parseImportedJson(text, TOKYO)).note).toBe(
      '配列の書き方は [1,2,] のように書かれていた',
    )
  })

  it('BOM・全角スペース・スマートクォートが混ざっていても取り込める', () => {
    const text =
      '﻿[{　“kind”:　“activity”,　“title”:　“セーヌ川クルーズ”,　“start”:　{“date”:“2026-09-13”,“time”:“19:00”,“tz”:“Europe/Paris”}}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.title).toBe('セーヌ川クルーズ')
    expect(booking.kind).toBe('activity')
  })

  it('evidence に含まれるスマートクォートは壊さずに保持する', () => {
    const text =
      '[{"kind":"lodging","title":"Hotel Ritz","start":{"date":"2026-09-12","time":"15:00","tz":"Europe/Paris"},"evidence":{"start":"“Check-in: 12 Sep 2026, 3:00 PM”と記載"}}]'
    expect(firstBooking(parseImportedJson(text, TOKYO)).evidence?.start).toBe(
      '“Check-in: 12 Sep 2026, 3:00 PM”と記載',
    )
  })

  it('JSON がまったく含まれないテキストは issues 1 件 / bookings 空', () => {
    const result = parseImportedJson(
      'すみません、この書類からは予約情報を読み取れませんでした。',
      TOKYO,
    )
    expect(result.bookings).toEqual([])
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].index).toBeNull()
    expect(result.issues[0].raw).toBeDefined()
  })

  it('空文字列は issues 1 件 / bookings 空', () => {
    const result = parseImportedJson('   ', TOKYO)
    expect(result.bookings).toEqual([])
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].index).toBeNull()
  })

  it('空の配列は「1 件も無い」として報告する', () => {
    const result = parseImportedJson('```json\n[]\n```', TOKYO)
    expect(result.bookings).toEqual([])
    expect(result.countryInfos).toEqual([])
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].message).toContain('1 件も')
    // この貼り付け口は国情報も受けるので、予約前提の文面にはしない
    expect(result.issues[0].message).not.toContain('予約が')
  })

  it('数値の配列など予約でない JSON は取り込まない', () => {
    const result = parseImportedJson('[1, 2, 3]', TOKYO)
    expect(result.bookings).toEqual([])
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].index).toBeNull()
  })
})

describe('parseImportedJson: AI の引用マーカーの除去', () => {
  // ":contentReference[oaicite:1]{index=1}" は ChatGPT がブラウザ上でだけ
  // リンクとして描画する内部マーカーで、コピー時にはレンダリングされず
  // テキストとして漏れてくる。evidence は原文の引用として読むものなので、
  // このマーカーは根拠の説得力を落とすノイズでしかなく取り除く。
  it('実例そのままの文字列からマーカーだけが消え、前後の本文は 1 文字も変わらない', () => {
    const text = JSON.stringify([
      {
        kind: 'flight',
        title: 'AF276',
        start: { date: '2026-09-12', time: '14:20', tz: 'Asia/Tokyo' },
        evidence: {
          checkInClosesMinutesBefore:
            'Norwegian公式の国際線規定では、通常の国際線チェックインは出発45分前に終了。 :contentReference[oaicite:1]{index=1}',
        },
      },
    ])
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.evidence?.checkInClosesMinutesBefore).toBe(
      'Norwegian公式の国際線規定では、通常の国際線チェックインは出発45分前に終了。',
    )
  })

  it('複数のマーカーがあってもすべて消える', () => {
    const text = JSON.stringify([
      {
        kind: 'other',
        title: 'メモ',
        start: { date: '2026-09-12', time: '10:00', tz: 'Asia/Tokyo' },
        note: '出発45分前に終了。 :contentReference[oaicite:1]{index=1}変更の場合は24時間前まで。 :contentReference[oaicite:2]{index=2}',
      },
    ])
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.note).toBe('出発45分前に終了。変更の場合は24時間前まで。')
  })

  it('マーカーだけの値は除去後に空文字になり、値なしとして扱われる', () => {
    const text = JSON.stringify([
      {
        kind: 'other',
        title: 'メモ',
        start: { date: '2026-09-12', time: '10:00', tz: 'Asia/Tokyo' },
        note: ' :contentReference[oaicite:1]{index=1} ',
        evidence: {
          note: ':contentReference[oaicite:2]{index=2}',
        },
      },
    ])
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.note).toBeUndefined()
    expect(booking.evidence).toBeUndefined()
  })

  it('マーカーを含まない普通のテキストは変わらない', () => {
    const text = JSON.stringify([
      {
        kind: 'other',
        title: 'メモ',
        start: { date: '2026-09-12', time: '10:00', tz: 'Asia/Tokyo' },
        note: '{index=1} という記法や oaicite という単語が出てくる資料だった',
      },
    ])
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.note).toBe(
      '{index=1} という記法や oaicite という単語が出てくる資料だった',
    )
  })
})

describe('parseImportedJson: 部分成功', () => {
  it('3 件中 1 件が壊れていても残り 2 件は取り込む', () => {
    const text = `\`\`\`json
[
  {"kind":"flight","title":"AF276 HND→CDG","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"}},
  {"kind":"lodging","title":"日付が読めない宿","start":{"date":"来週の火曜日","time":"15:00","tz":"Europe/Paris"}},
  {"kind":"train","title":"TGV 6203","start":{"date":"2026-09-14","time":"08:12","tz":"Europe/Paris"}}
]
\`\`\``
    const result = parseImportedJson(text, TOKYO)
    expect(result.bookings).toHaveLength(2)
    expect(result.bookings.map((b) => b.title)).toEqual([
      'AF276 HND→CDG',
      'TGV 6203',
    ])

    const failures = result.issues.filter((issue) => issue.index === 1)
    expect(failures.length).toBeGreaterThan(0)
    // 原因を追えるように、失敗した要素の生データが残っている
    expect(failures.some((issue) => issue.raw !== undefined)).toBe(true)
  })

  it('title が無い要素は落として issues に残す', () => {
    const text =
      '[{"kind":"flight","title":null,"start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"}},{"kind":"train","title":"TGV 6203","start":{"date":"2026-09-14","time":"08:12","tz":"Europe/Paris"}}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.bookings).toHaveLength(1)
    expect(result.issues.some((issue) => issue.message.includes('title'))).toBe(
      true,
    )
  })

  it('end だけが壊れていても予約自体は残り、end は null になる', () => {
    const text =
      '[{"kind":"lodging","title":"Hotel Le Marais","start":{"date":"2026-09-12","time":"15:00","tz":"Europe/Paris"},"end":{"date":"チェックアウト日は未定","time":null,"tz":null}}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.bookings).toHaveLength(1)
    expect(result.bookings[0].end).toBeNull()
    expect(result.issues.some((issue) => issue.message.includes('end'))).toBe(
      true,
    )
  })
})

describe('parseImportedJson: タイムゾーンの補完', () => {
  it('tz が欠けていたら fallbackTz を使い、その旨を issues に残す', () => {
    const text =
      '[{"kind":"activity","title":"寿司ディナー","start":{"date":"2026-09-12","time":"19:00","tz":null}}]'
    const result = parseImportedJson(text, 'Asia/Tokyo')
    expect(result.bookings).toHaveLength(1)
    expect(result.bookings[0].start.zdt).toBe(
      '2026-09-12T19:00:00+09:00[Asia/Tokyo]',
    )

    const notes = result.issues.filter((issue) => issue.index === 0)
    expect(notes).toHaveLength(1)
    expect(notes[0].message).toContain('Asia/Tokyo')
  })

  it('存在しない IANA 名も fallbackTz に寄せて issues に残す', () => {
    const text =
      '[{"kind":"other","title":"火星旅行","start":{"date":"2026-09-12","time":"19:00","tz":"Mars/Olympus"}}]'
    const result = parseImportedJson(text, 'Europe/Paris')
    expect(result.bookings[0].start.zdt).toBe(
      '2026-09-12T19:00:00+02:00[Europe/Paris]',
    )
    expect(result.issues[0].message).toContain('Europe/Paris')
  })

  it('end の tz が無いときはデバイスではなく start の tz を使う', () => {
    const text =
      '[{"kind":"lodging","title":"Hotel Le Marais","start":{"date":"2026-09-12","time":"15:00","tz":"Europe/Paris"},"end":{"date":"2026-09-15","time":"11:00","tz":null}}]'
    const result = parseImportedJson(text, 'Asia/Tokyo')
    expect(result.bookings[0].end?.zdt).toBe(
      '2026-09-15T11:00:00+02:00[Europe/Paris]',
    )
    expect(
      result.issues.some((issue) => issue.message.includes('Europe/Paris')),
    ).toBe(true)
  })

  it('tz を補完した予約の id だけが tzFallbackIds に載る', () => {
    // レビュー画面が「一括承認するにしても、ここだけは見て」を出すための印。
    // issues の文章からは、どの予約が危ういかを機械的に引けない
    const text = [
      '[',
      '{"kind":"lodging","title":"tz あり","start":{"date":"2026-09-12","time":"15:00","tz":"Europe/Paris"}},',
      '{"kind":"train","title":"tz なし","start":{"date":"2026-09-13","time":"09:00"}}',
      ']',
    ].join('')
    const result = parseImportedJson(text, TOKYO)
    expect(result.bookings).toHaveLength(2)
    expect(result.tzFallbackIds).toEqual([result.bookings[1].id])
  })

  it('end の tz だけを補完した予約も tzFallbackIds に載る', () => {
    const text =
      '[{"kind":"lodging","title":"Hotel Le Marais","start":{"date":"2026-09-12","time":"15:00","tz":"Europe/Paris"},"end":{"date":"2026-09-15","time":"11:00"}}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.tzFallbackIds).toEqual([result.bookings[0].id])
  })

  it('全件の tz が読めていれば tzFallbackIds は空になる', () => {
    const text =
      '[{"kind":"lodging","title":"Hotel Le Marais","start":{"date":"2026-09-12","time":"15:00","tz":"Europe/Paris"},"end":{"date":"2026-09-15","time":"11:00","tz":"Europe/Paris"}}]'
    expect(parseImportedJson(text, TOKYO).tzFallbackIds).toEqual([])
  })

  it('fallbackTz 自体が不正でも Asia/Tokyo に退避して取り込みは続く', () => {
    const text =
      '[{"kind":"other","title":"打ち合わせ","start":{"date":"2026-09-12","time":"19:00","tz":null}}]'
    const result = parseImportedJson(text, 'Mars/Olympus')
    expect(result.bookings[0].start.zdt).toBe(
      '2026-09-12T19:00:00+09:00[Asia/Tokyo]',
    )
  })
})

describe('parseImportedJson: 夏時間', () => {
  // LLM にオフセットを書かせず date/time/tz で受け取る方針が効いているかの検証。
  // Europe/Paris の 2026 年の夏時間は 3/29 に始まり 10/25 に終わる。
  it('夏時間の期間内は +02:00 になる', () => {
    const text =
      '[{"kind":"train","title":"夏時間中のTGV","start":{"date":"2026-09-12","time":"14:20","tz":"Europe/Paris"}}]'
    expect(firstBooking(parseImportedJson(text, TOKYO)).start.zdt).toBe(
      '2026-09-12T14:20:00+02:00[Europe/Paris]',
    )
  })

  it('夏時間が終わった当日の午後は +01:00 になる', () => {
    const text =
      '[{"kind":"train","title":"冬時間のTGV","start":{"date":"2026-10-25","time":"14:20","tz":"Europe/Paris"}}]'
    expect(firstBooking(parseImportedJson(text, TOKYO)).start.zdt).toBe(
      '2026-10-25T14:20:00+01:00[Europe/Paris]',
    )
  })

  it('夏時間の切り替わりを跨ぐ宿泊は start と end でオフセットが変わる', () => {
    const text =
      '[{"kind":"lodging","title":"切替日を挟む宿","start":{"date":"2026-10-24","time":"15:00","tz":"Europe/Paris"},"end":{"date":"2026-10-26","time":"11:00","tz":"Europe/Paris"}}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.start.zdt).toBe('2026-10-24T15:00:00+02:00[Europe/Paris]')
    expect(booking.end?.zdt).toBe('2026-10-26T11:00:00+01:00[Europe/Paris]')
  })
})

describe('parseImportedJson: フィールドの正規化', () => {
  it('time が無ければ終日として扱う', () => {
    const text =
      '[{"kind":"activity","title":"モンサンミッシェル日帰り","start":{"date":"2026-09-15","time":null,"tz":"Europe/Paris"}}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.start.allDay).toBe(true)
    expect(booking.start.zdt).toBe('2026-09-15T00:00:00+02:00[Europe/Paris]')
  })

  it("'H:mm' や 'HH:mm:ss' のような時刻の揺れを吸収する", () => {
    const text =
      '[{"kind":"train","title":"朝の列車","start":{"date":"2026-09-15","time":"9:05","tz":"Europe/Paris"}},{"kind":"train","title":"夜の列車","start":{"date":"2026-09-15","time":"21:30:00","tz":"Europe/Paris"}}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.bookings[0].start.zdt).toBe(
      '2026-09-15T09:05:00+02:00[Europe/Paris]',
    )
    expect(result.bookings[1].start.zdt).toBe(
      '2026-09-15T21:30:00+02:00[Europe/Paris]',
    )
  })

  it('status / payment が未指定なら idea / unpaid を既定にする', () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"}}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.status).toBe('idea')
    expect(booking.payment).toBe('unpaid')
  })

  it('未知の kind / status は既定値に寄せて issues に残す', () => {
    const text =
      '[{"kind":"hotel","title":"Hotel Le Marais","status":"booked","start":{"date":"2026-09-12","time":"15:00","tz":"Europe/Paris"}}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.bookings[0].kind).toBe('other')
    expect(result.bookings[0].status).toBe('idea')
    expect(result.issues.filter((issue) => issue.index === 0)).toHaveLength(2)
  })

  it('id は LLM が返した値を使わず必ず採番し直す', () => {
    const text =
      '[{"id":"booking-1","kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"}},{"id":"booking-1","kind":"train","title":"TGV","start":{"date":"2026-09-14","time":"08:12","tz":"Europe/Paris"}}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.bookings[0].id).not.toBe('booking-1')
    expect(result.bookings[0].id).not.toBe(result.bookings[1].id)
  })

  it('場所が文字列 1 本でも Place として拾う', () => {
    const text =
      '[{"kind":"lodging","title":"Hotel Le Marais","place":"12 Rue de Rivoli","start":{"date":"2026-09-12","time":"15:00","tz":"Europe/Paris"}}]'
    expect(firstBooking(parseImportedJson(text, TOKYO)).place).toEqual({
      name: '12 Rue de Rivoli',
    })
  })

  it('金額が文字列でも数値として拾う', () => {
    const text =
      '[{"kind":"lodging","title":"Hotel Le Marais","price":{"amount":"1,234.50","currency":"EUR"},"start":{"date":"2026-09-12","time":"15:00","tz":"Europe/Paris"}}]'
    expect(firstBooking(parseImportedJson(text, TOKYO)).price).toEqual({
      amount: 1234.5,
      currency: 'EUR',
    })
  })

  it('null の任意フィールドはキーごと落とす', () => {
    const text =
      '[{"kind":"flight","title":"AF276","confirmationNumber":null,"provider":null,"price":null,"note":null,"place":null,"start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"}}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.confirmationNumber).toBeUndefined()
    expect(booking.provider).toBeUndefined()
    expect(booking.price).toBeUndefined()
    expect(booking.note).toBeUndefined()
    expect(booking.place).toBeUndefined()
  })
})

describe('parseImportedJson: 場所のラテン文字表記(latinName)', () => {
  it('from / to / place の latinName を取り込む', () => {
    const text =
      '[{"kind":"train","title":"移動","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Hong_Kong"},"from":{"name":"香港国際空港 T2","latinName":"Hong Kong"},"to":{"name":"台湾桃園国際空港 T2","latinName":"Taipei"}}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.from?.name).toBe('香港国際空港 T2')
    expect(booking.from?.latinName).toBe('Hong Kong')
    expect(booking.to?.latinName).toBe('Taipei')
  })

  it('前後の空白は落とし、null・空文字ならキーごと付けない', () => {
    const text =
      '[{"kind":"lodging","title":"ホテル","start":{"date":"2026-09-12","time":"15:00","tz":"Europe/Paris"},"place":{"name":"パリのホテル","latinName":"  Paris  "},"from":null,"to":{"name":"パリ","latinName":null}}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.place?.latinName).toBe('Paris')
    expect(booking.to).not.toHaveProperty('latinName')
  })

  it('latinName を返してこない AI の出力でも今までどおり取り込める', () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"from":{"name":"HND"},"to":{"name":"CDG"}}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.from).toEqual({ name: 'HND' })
    expect(booking.to).toEqual({ name: 'CDG' })
  })
})

describe('parseImportedJson: unverified', () => {
  it('値の入ったフィールドがすべて unverified に入る', () => {
    const text = `\`\`\`json
[
  {
    "kind": "lodging",
    "title": "Hotel Le Marais",
    "start": { "date": "2026-09-12", "time": "15:00", "tz": "Europe/Paris" },
    "end": { "date": "2026-09-15", "time": "11:00", "tz": "Europe/Paris" },
    "from": { "name": "CDG", "localName": null, "address": null },
    "to": { "name": "Paris", "localName": null, "address": null },
    "place": { "name": "Hotel Le Marais", "localName": "オテル・ル・マレ", "address": "12 Rue de Rivoli" },
    "status": "confirmed",
    "payment": "paid",
    "confirmationNumber": "ABC123",
    "provider": "Booking.com",
    "price": { "amount": 45000, "currency": "JPY" },
    "freeCancelUntil": "2026-09-01",
    "onlineCheckInOpensMinutesBefore": 2880,
    "checkInClosesMinutesBefore": 45,
    "bagDropClosesMinutesBefore": 60,
    "note": "エレベーターなし",
    "evidence": { "start": "Check-in: 12 Sep 2026 15:00" }
  }
]
\`\`\``
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    // FIELD_KEYS の全量が並ぶ = 値が入ったフィールドは 1 つ残らず未確認扱い
    expect(booking.unverified).toEqual(FIELD_KEYS)
    expect(booking.evidence).toEqual({ start: 'Check-in: 12 Sep 2026 15:00' })
  })

  it('値の無いフィールドは unverified に入らない', () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"}}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.unverified).toEqual([
      'kind',
      'title',
      'start',
      'status',
      'payment',
    ])
    expect(booking.unverified).not.toContain('end')
  })
})

describe('parseImportedJson: 締切(checkInClosesMinutesBefore / bagDropClosesMinutesBefore)', () => {
  it('AI の JSON に締切があれば取り込まれる', () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"checkInClosesMinutesBefore":45,"bagDropClosesMinutesBefore":60}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.checkInClosesMinutesBefore).toBe(45)
    expect(booking.bagDropClosesMinutesBefore).toBe(60)
  })

  it("'60' のような数字だけの文字列でも取り込まれる", () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"checkInClosesMinutesBefore":"45","bagDropClosesMinutesBefore":"60"}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.checkInClosesMinutesBefore).toBe(45)
    expect(booking.bagDropClosesMinutesBefore).toBe(60)
  })

  it("'60分前' のような単位付きの文字列は落ちるが、予約自体は取り込まれる", () => {
    // toMinutesBefore が数字だけの文字列しか受けないので undefined になり、
    // その先の parseBooking では「フィールドが無い」として扱われる
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"checkInClosesMinutesBefore":"60分前"}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.checkInClosesMinutesBefore).toBeUndefined()
  })

  it('小数の締切は落ちるが、予約自体は取り込まれる', () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"checkInClosesMinutesBefore":45.5}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.checkInClosesMinutesBefore).toBeUndefined()
  })

  it('負の数の締切は落ちるが、予約自体は取り込まれる', () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"checkInClosesMinutesBefore":-10}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.checkInClosesMinutesBefore).toBeUndefined()
  })

  it('大きすぎる値(1441以上)の締切は落ちるが、予約自体は取り込まれる', () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"bagDropClosesMinutesBefore":1441}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.bagDropClosesMinutesBefore).toBeUndefined()
  })

  it('取り込んだ締切は unverified に入る', () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"checkInClosesMinutesBefore":45,"bagDropClosesMinutesBefore":60}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.unverified).toContain('checkInClosesMinutesBefore')
    expect(booking.unverified).toContain('bagDropClosesMinutesBefore')
  })
})

describe('parseImportedJson: オンラインチェックインの開放(onlineCheckInOpensMinutesBefore)', () => {
  it('AI の JSON に開放時刻があれば取り込まれ、unverified に入る', () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"onlineCheckInOpensMinutesBefore":2880}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.onlineCheckInOpensMinutesBefore).toBe(2880)
    expect(booking.unverified).toContain('onlineCheckInOpensMinutesBefore')
  })

  it('締切なら弾かれる 72 時間前(4320)も、開放としてなら取り込まれる', () => {
    // 上限が項目ごとに違う(storage.ts の MAX_CHECK_IN_OPENS_MINUTES_BEFORE)ことが、
    // 取り込みの側でもそのまま効いていることの確認
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"onlineCheckInOpensMinutesBefore":4320,"checkInClosesMinutesBefore":4320}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.onlineCheckInOpensMinutesBefore).toBe(4320)
    expect(booking.checkInClosesMinutesBefore).toBeUndefined()
  })

  it('72 時間より前(4321以上)の開放は落ちるが、予約自体は取り込まれる', () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"onlineCheckInOpensMinutesBefore":4321}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.onlineCheckInOpensMinutesBefore).toBeUndefined()
  })

  it("'2880' のような数字だけの文字列でも取り込まれる", () => {
    const text =
      '[{"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"onlineCheckInOpensMinutesBefore":"2880"}]'
    const booking = firstBooking(parseImportedJson(text, TOKYO))
    expect(booking.onlineCheckInOpensMinutesBefore).toBe(2880)
  })
})

describe('parseImportedJson: 国情報の振り分け', () => {
  it('国のパッチだけの JSON は countryInfos に入る', () => {
    const text = `\`\`\`json
[
  {
    "name": "マルタ",
    "latinName": "Malta",
    "plugTypes": "G",
    "voltage": "230V 50Hz",
    "tipping": "不要。高級店では10%",
    "emergencyPolice": "112",
    "emergencyAmbulance": "112",
    "note": "水道水は飲用可"
  }
]
\`\`\``
    const result = parseImportedJson(text, TOKYO)
    expect(result.bookings).toEqual([])
    expect(result.issues).toEqual([])
    expect(result.countryInfos).toHaveLength(1)
    const [country] = result.countryInfos
    expect(country.name).toBe('マルタ')
    expect(country.latinName).toBe('Malta')
    expect(country.plugTypes).toBe('G')
    expect(country.voltage).toBe('230V 50Hz')
    expect(country.tipping).toBe('不要。高級店では10%')
    expect(country.emergencyPolice).toBe('112')
    expect(country.emergencyAmbulance).toBe('112')
    expect(country.note).toBe('水道水は飲用可')
  })

  it('予約のパッチと国のパッチが混ざっていても振り分けられる', () => {
    const text = `\`\`\`json
[
  {"kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"},"onlineCheckInOpensMinutesBefore":2880},
  {"name":"マルタ","plugTypes":"G"},
  {"kind":"train","title":"TGV 6203","start":{"date":"2026-09-14","time":"08:12","tz":"Europe/Paris"}},
  {"name":"フランス","emergencyPolice":"17"}
]
\`\`\``
    const result = parseImportedJson(text, TOKYO)
    expect(result.bookings.map((b) => b.title)).toEqual(['AF276', 'TGV 6203'])
    expect(result.countryInfos.map((c) => c.name)).toEqual([
      'マルタ',
      'フランス',
    ])
    expect(result.issues).toEqual([])
  })

  it('name があっても title や start を持つ要素は予約として扱う', () => {
    // AI が予約の見出しを name で返してきても、予約が国情報に化けないことの確認。
    // 判別は「予約の必須項目が無いこと」を根拠にしている
    const text =
      '[{"name":"AF276 の予約","kind":"flight","title":"AF276","start":{"date":"2026-09-12","time":"14:20","tz":"Asia/Tokyo"}}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.countryInfos).toEqual([])
    expect(result.bookings).toHaveLength(1)
    expect(result.bookings[0].title).toBe('AF276')
  })

  it('start しか持たない要素も、name があるだけでは国情報にしない', () => {
    const text =
      '[{"name":"マルタ","start":{"date":"2026-09-12","time":"14:20","tz":"Europe/Malta"}}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.countryInfos).toEqual([])
    // 予約として扱われ、title が無いので落ちて issues に残る
    expect(result.bookings).toEqual([])
    expect(result.issues.some((issue) => issue.message.includes('title'))).toBe(
      true,
    )
  })

  it('name が無い / 空白だけの要素は国情報にならず、予約として issues に落ちる', () => {
    const text = '[{"plugTypes":"G"},{"name":"   ","voltage":"230V"}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.countryInfos).toEqual([])
    expect(result.bookings).toEqual([])
    expect(result.issues.filter((issue) => issue.index !== null)).toHaveLength(
      2,
    )
  })

  it('title / kind が null で返ってきても、name があれば国情報として扱う', () => {
    // AI は空欄を null で返す。null は「欄が無い」と同じ扱いにする
    const text =
      '[{"kind":null,"title":null,"name":"台湾","plugTypes":"A / B"}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.countryInfos).toHaveLength(1)
    expect(result.countryInfos[0].name).toBe('台湾')
    expect(result.issues).toEqual([])
  })

  it('国情報の id は LLM が返した値を使わず必ず採番し直す', () => {
    const text =
      '[{"id":"ci-1","name":"マルタ","plugTypes":"G"},{"id":"ci-1","name":"フランス","plugTypes":"C / E"}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.countryInfos[0].id).not.toBe('ci-1')
    expect(result.countryInfos[0].id).not.toBe(result.countryInfos[1].id)
  })

  it('国のパッチの値は前後の空白を落とし、空文字ならキーごと付けない', () => {
    // 空文字のまま通すと、マージ側で既存の値を空で潰しにいく形になる
    const text = '[{"name":"  マルタ  ","plugTypes":"","voltage":"  230V  "}]'
    const result = parseImportedJson(text, TOKYO)
    expect(result.countryInfos).toHaveLength(1)
    expect(result.countryInfos[0].name).toBe('マルタ')
    expect(result.countryInfos[0].voltage).toBe('230V')
    expect(result.countryInfos[0]).not.toHaveProperty('plugTypes')
  })
})
