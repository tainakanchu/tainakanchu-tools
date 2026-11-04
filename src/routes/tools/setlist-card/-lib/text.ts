/**
 * 文字コード判定・文字列の掃除・数値/時刻の読み取りなど、各パーサーで共有する小物。
 */

/**
 * BOM を見て UTF-16LE / UTF-16BE / UTF-8 を判定して文字列にする。
 * rekordbox のテキスト書き出しは BOM 付き UTF-16LE なので、BOM が無くても
 * 偶数/奇数バイトに 0x00 が偏っていれば UTF-16 とみなす。
 */
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 512))
  let evenZeros = 0
  let oddZeros = 0
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] !== 0) continue
    if (i % 2 === 0) evenZeros++
    else oddZeros++
  }
  const half = sample.length / 2
  if (half > 0 && oddZeros > half * 0.3 && evenZeros < half * 0.05) {
    return new TextDecoder('utf-16le').decode(bytes)
  }
  if (half > 0 && evenZeros > half * 0.3 && oddZeros < half * 0.05) {
    return new TextDecoder('utf-16be').decode(bytes)
  }
  return new TextDecoder('utf-8').decode(bytes)
}

/** 制御文字の除去・空白の正規化・前後 trim */
export function cleanText(value: string | null | undefined): string {
  if (!value) return ''
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/[\s　]+/g, ' ')
      .trim()
  )
}

/** 「Unknown Artist」等の中身の無いアーティスト名は空にする */
export function cleanArtist(value: string | null | undefined): string {
  const text = cleanText(value)
  if (/^(unknown( artist)?|不明なアーティスト|n\/a|-+|—)$/i.test(text)) {
    return ''
  }
  return text
}

/** 拡張子つきのファイル名からタイトルの代わりを作る */
export function titleFromFileName(fileName: string): string {
  return cleanText(fileName.replace(/\.[a-z0-9]{2,5}$/i, ''))
}

/** "128.00" / "128,0" → 128（BPM 0 は不明扱い） */
export function parseBpm(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const num = Number.parseFloat(value.replace(',', '.'))
  if (!Number.isFinite(num) || num <= 0 || num > 999) return undefined
  return Math.round(num * 10) / 10
}

/**
 * "5:23" / "05:23" / "1:02:03" / "323" → 秒。
 * 時刻ではなく長さ（再生時間）を読む用途。
 */
export function parseDuration(
  value: string | null | undefined,
): number | undefined {
  if (!value) return undefined
  const text = value.trim()
  if (/^\d+(\.\d+)?$/.test(text)) {
    const num = Number.parseFloat(text)
    return num > 0 ? num : undefined
  }
  const match = /^(\d+):(\d{1,2})(?::(\d{1,2}))?(?:\.\d+)?$/.exec(text)
  if (!match) return undefined
  const [, a, b, c] = match
  // 未マッチのグループは実行時 undefined（型上は string なので真偽で判定する）
  const seconds = !c
    ? Number(a) * 60 + Number(b)
    : Number(a) * 3600 + Number(b) * 60 + Number(c)
  return seconds > 0 ? seconds : undefined
}

/**
 * 時刻文字列を「その日の 0 時からの秒」にする。
 * "22:01:13" / "10:01:13 PM" / "午後10:01:13" / 日付つき "2024/05/01 22:01:13" に対応。
 */
export function parseClockTime(
  value: string | null | undefined,
): number | undefined {
  if (!value) return undefined
  const text = value.trim()
  const match =
    /(午前|午後)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM|am|pm)?/.exec(
      text,
    )
  if (!match) return undefined
  const [, jpMeridiem, h, m, s, meridiem] = match
  let hours = Number(h)
  const ampm = (meridiem || '').toLowerCase()
  const isPm = ampm === 'pm' || jpMeridiem === '午後'
  const isAm = ampm === 'am' || jpMeridiem === '午前'
  if (isPm && hours < 12) hours += 12
  if (isAm && hours === 12) hours = 0
  if (hours > 23) return undefined
  return hours * 3600 + Number(m) * 60 + Number(s || 0)
}

/**
 * 時刻の列が日付をまたいで巻き戻ったら 24h を足して単調増加にする。
 * 深夜のパーティーで 23:58 → 0:03 となるのを正しく 5 分後として扱うため。
 */
export function unwrapMidnight(
  times: ReadonlyArray<number | undefined>,
): Array<number | undefined> {
  let offset = 0
  let prev: number | undefined
  return times.map((time) => {
    if (time === undefined) return undefined
    let value = time + offset
    if (prev !== undefined && value < prev - 60) {
      offset += 86400
      value += 86400
    }
    prev = value
    return value
  })
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatDate(year: number, month: number, day: number): string {
  return `${year}.${pad2(month)}.${pad2(day)}`
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

/**
 * 文字列に含まれる日付を表示用 "YYYY.MM.DD" にする。
 * dd/mm と mm/dd の区別が付かないものは元の文字列を返す（勝手に入れ替えない）。
 * 日付が見つからなければ undefined。
 */
export function findDate(text: string | null | undefined): string | undefined {
  if (!text) return undefined
  const iso = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/.exec(text)
  if (iso) return formatDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const traktor = /(\d{4})y(\d{1,2})m(\d{1,2})d/.exec(text)
  if (traktor) {
    return formatDate(
      Number(traktor[1]),
      Number(traktor[2]),
      Number(traktor[3]),
    )
  }

  const named =
    /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(text)
  if (named) {
    const month = MONTHS[named[2].toLowerCase()] as number | undefined
    if (month) return formatDate(Number(named[3]), month, Number(named[1]))
  }
  const namedUs =
    /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(text)
  if (namedUs) {
    const month = MONTHS[namedUs[1].toLowerCase()] as number | undefined
    if (month) return formatDate(Number(namedUs[3]), month, Number(namedUs[2]))
  }

  const slash = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(text)
  if (slash) {
    const a = Number(slash[1])
    const b = Number(slash[2])
    let year = Number(slash[3])
    if (year < 100) year += 2000
    if (a > 12 && b <= 12) return formatDate(year, b, a)
    if (b > 12 && a <= 12) return formatDate(year, a, b)
    return slash[0]
  }
  return undefined
}

/** 秒 → "HH:MM"（セット開始からの相対時刻の表示用） */
export function formatOffset(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60))
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
}

/** BPM の表示（整数に丸める） */
export function formatBpm(bpm: number): string {
  return String(Math.round(bpm))
}
