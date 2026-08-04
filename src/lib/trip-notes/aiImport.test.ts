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
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].message).toContain('1 件も')
  })

  it('数値の配列など予約でない JSON は取り込まない', () => {
    const result = parseImportedJson('[1, 2, 3]', TOKYO)
    expect(result.bookings).toEqual([])
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].index).toBeNull()
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
