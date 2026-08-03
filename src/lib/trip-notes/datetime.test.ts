import { describe, expect, it } from 'vitest'
import {
  COMMON_TIMEZONES,
  addDays,
  diffDays,
  formatDateJa,
  formatDualTime,
  formatStamp,
  getDeviceTz,
  isSameOffset,
  isValidISODate,
  isValidTime,
  isValidTz,
  makeAllDayStamp,
  makeStamp,
  parseStamp,
  stampDate,
  stampDateInTz,
  stampToEndEpoch,
  stampToEpoch,
  stampTz,
  tryMakeStamp,
  tryParseStamp,
  weekdayJa,
} from './datetime'
import type { Stamp } from './types'

describe('DST(Temporal を採用した理由そのもの)', () => {
  it('欧州夏時間終了日をまたぐ加算では壁時計時刻が保たれ、オフセットが変わり、経過時間は25時間になる', () => {
    const before = Temporal.ZonedDateTime.from(
      '2026-10-24T23:00:00+02:00[Europe/Paris]',
    )
    const after = before.add({ days: 1 })
    // 素朴な epoch + 86400000ms なら 10/25 22:00 CET になってしまうところ、
    // Temporal は暦日として 1 日進めるので壁時計 23:00 が保たれる。
    expect(after.toString()).toBe('2026-10-25T23:00:00+01:00[Europe/Paris]')
    expect(after.hour).toBe(23)
    expect(after.offset).toBe('+01:00')
    // 10/25 は 3時にCEST(+2)からCET(+1)へ戻るので、暦日としては1日でも実時間は25時間
    const diffMs = after.epochMilliseconds - before.epochMilliseconds
    expect(diffMs).toBe(25 * 60 * 60 * 1000)
  })

  it('addDays は PlainDate ベースなので DST の影響を受けない', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
  })

  it('diffDays は欧州夏時間の切替日(開始 3/29, 終了 10/25)を跨いでも日数がずれない', () => {
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2)
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('stampToEndEpoch は終日予定の「翌日の始まりの1ms前」を返し、DST終了日は25時間-1msになる', () => {
    const normalDay = makeAllDayStamp('2026-06-12', 'Europe/Paris')
    const normalDiff = stampToEndEpoch(normalDay) - stampToEpoch(normalDay)
    expect(normalDiff).toBe(24 * 60 * 60 * 1000 - 1)

    // 2026-10-25 は Europe/Paris で夏時間が終わる日 = 実時間25時間ある日
    const dstEndDay = makeAllDayStamp('2026-10-25', 'Europe/Paris')
    const dstDiff = stampToEndEpoch(dstEndDay) - stampToEpoch(dstEndDay)
    expect(dstDiff).toBe(25 * 60 * 60 * 1000 - 1)
  })
})

describe('タイムゾーン跨ぎ', () => {
  it('欧州夏時間の期間、Europe/Paris 14:20 と Asia/Tokyo 21:20 は同じ epoch になる', () => {
    const paris = makeStamp('2026-06-12', '14:20', 'Europe/Paris')
    const tokyo = makeStamp('2026-06-12', '21:20', 'Asia/Tokyo')
    // 2026-06-12 は EU 夏時間期間(CEST, UTC+2)。14:20 CEST = 12:20 UTC。
    // Asia/Tokyo は DST がなく常に UTC+9。21:20 JST = 12:20 UTC。
    expect(stampToEpoch(paris)).toBe(Date.UTC(2026, 5, 12, 12, 20))
    expect(stampToEpoch(paris)).toBe(stampToEpoch(tokyo))
  })

  it('冬時間では Europe/Paris 14:20 は Asia/Tokyo 22:20 と同じ epoch になる(夏冬で時差が変わる)', () => {
    const paris = makeStamp('2026-01-12', '14:20', 'Europe/Paris')
    const tokyo = makeStamp('2026-01-12', '22:20', 'Asia/Tokyo')
    // 1月は CET(UTC+1)。14:20 CET = 13:20 UTC。22:20 JST(UTC+9) = 13:20 UTC。
    expect(stampToEpoch(paris)).toBe(Date.UTC(2026, 0, 12, 13, 20))
    expect(stampToEpoch(paris)).toBe(stampToEpoch(tokyo))
    // 夏は Tokyo 21:20 で揃うが冬は 22:20 で揃う = 時差そのものが 1 時間変わっている
    const tokyoSummerAligned = makeStamp('2026-01-12', '21:20', 'Asia/Tokyo')
    expect(stampToEpoch(paris)).not.toBe(stampToEpoch(tokyoSummerAligned))
  })

  it('America/New_York のように現地の暦日がずれても epoch は一致する', () => {
    const newYork = makeStamp('2026-06-12', '23:30', 'America/New_York')
    const tokyo = makeStamp('2026-06-13', '12:30', 'Asia/Tokyo')
    // NY は夏時間(EDT, UTC-4)。23:30 EDT = 翌 6/13 03:30 UTC。
    // Tokyo 12:30 JST(UTC+9) = 6/13 03:30 UTC。NY の暦日(6/12)と Tokyo の暦日(6/13)が
    // ずれていても同じ瞬間を指す。
    expect(stampToEpoch(newYork)).toBe(Date.UTC(2026, 5, 13, 3, 30))
    expect(stampToEpoch(newYork)).toBe(stampToEpoch(tokyo))
  })
})

describe('Stamp の組み立てと解釈', () => {
  it('makeStamp は zdt に "日付Tオフセット[tz]" 形式の文字列を持つ', () => {
    const stamp = makeStamp('2026-06-12', '14:20', 'Europe/Paris')
    expect(stamp.zdt).toBe('2026-06-12T14:20:00+02:00[Europe/Paris]')
    expect(stamp.allDay).toBe(false)
  })

  it('makeAllDayStamp は allDay: true かつ現地 00:00 になる', () => {
    const stamp = makeAllDayStamp('2026-06-12', 'Europe/Paris')
    expect(stamp.allDay).toBe(true)
    expect(stamp.zdt).toBe('2026-06-12T00:00:00+02:00[Europe/Paris]')
  })

  it('parseStamp は不正な文字列で例外を投げ、tryParseStamp は null を返す', () => {
    const invalidTz: Stamp = {
      zdt: '2026-06-12T14:20:00+02:00[Mars/Olympus]',
      allDay: false,
    }
    const noAnnotation: Stamp = { zdt: '2026-06-12T14:20:00', allDay: false }
    const garbage: Stamp = { zdt: 'not-a-zdt', allDay: false }

    expect(() => parseStamp(invalidTz)).toThrow()
    expect(() => parseStamp(noAnnotation)).toThrow()
    expect(() => parseStamp(garbage)).toThrow()

    expect(tryParseStamp(invalidTz)).toBe(null)
    expect(tryParseStamp(noAnnotation)).toBe(null)
    expect(tryParseStamp(garbage)).toBe(null)
  })

  it('tryMakeStamp は不正な入力で null を返す', () => {
    expect(tryMakeStamp('2026-06-12', '14:20', 'Mars/Olympus')).toBe(null)
    expect(tryMakeStamp('not-a-date', '14:20', 'Europe/Paris')).toBe(null)
    expect(tryMakeStamp('2026-06-12', '25:99', 'Europe/Paris')).toBe(null)
  })

  it('tryMakeStamp は time が null なら終日として組み立てる', () => {
    const stamp = tryMakeStamp('2026-06-12', null, 'Europe/Paris')
    expect(stamp?.allDay).toBe(true)
    expect(stamp?.zdt).toBe('2026-06-12T00:00:00+02:00[Europe/Paris]')
  })

  it('stampTz / stampDate は現地タイムゾーン基準の値を返す', () => {
    const stamp = makeStamp('2026-06-12', '23:30', 'Europe/Paris')
    expect(stampTz(stamp)).toBe('Europe/Paris')
    expect(stampDate(stamp)).toBe('2026-06-12')
  })

  it("parseStamp は offset: 'prefer' により、格納済みオフセットが IANA ルールと食い違っても壁時計時刻を正として解釈する", () => {
    // Europe/Paris の 6月は本来 +02:00(CEST)だが、意図的に +09:00 を焼き込む
    const mismatched: Stamp = {
      zdt: '2026-06-12T14:20:00+09:00[Europe/Paris]',
      allDay: false,
    }
    expect(() => parseStamp(mismatched)).not.toThrow()
    const zdt = parseStamp(mismatched)
    // 焼き込まれたオフセット(+09:00)ではなく、壁時計時刻 14:20 と
    // Europe/Paris の実際のオフセット(+02:00)が優先される
    expect(zdt.hour).toBe(14)
    expect(zdt.minute).toBe(20)
    expect(zdt.offset).toBe('+02:00')
    expect(stampToEpoch(mismatched)).toBe(Date.UTC(2026, 5, 12, 12, 20))
  })
})

describe('formatStamp', () => {
  const stamp = makeStamp('2026-06-12', '14:20', 'Europe/Paris')

  it('既定では時刻だけを返す', () => {
    expect(formatStamp(stamp, 'Asia/Tokyo')).toBe('14:20')
  })

  it('withDate で日付付きになる', () => {
    expect(formatStamp(stamp, 'Asia/Tokyo', { withDate: true })).toBe(
      '6/12(金) 14:20',
    )
  })

  it('inDisplayTz で表示タイムゾーンの時刻に変換される', () => {
    // 14:20 CEST(UTC+2) = 21:20 JST(UTC+9)
    expect(formatStamp(stamp, 'Asia/Tokyo', { inDisplayTz: true })).toBe(
      '21:20',
    )
  })

  it('inDisplayTz かつ withDate で日付がタイムゾーンをまたいでずれる', () => {
    const late = makeStamp('2026-06-12', '23:30', 'Europe/Paris')
    // 23:30 CEST(UTC+2) = 21:30 UTC = 翌 6/13 06:30 JST(UTC+9)
    expect(
      formatStamp(late, 'Asia/Tokyo', { withDate: true, inDisplayTz: true }),
    ).toBe('6/13(土) 06:30')
  })

  it('終日は allDayLabel を返す', () => {
    const allDay = makeAllDayStamp('2026-06-12', 'Europe/Paris')
    expect(formatStamp(allDay, 'Asia/Tokyo')).toBe('終日')
    expect(formatStamp(allDay, 'Asia/Tokyo', { withDate: true })).toBe(
      '6/12(金) 終日',
    )
  })

  it('終日は inDisplayTz: true でもタイムゾーン変換で日付がずれない', () => {
    const allDay = makeAllDayStamp('2026-06-12', 'Europe/Paris')
    expect(
      formatStamp(allDay, 'Asia/Tokyo', { withDate: true, inDisplayTz: true }),
    ).toBe('6/12(金) 終日')
  })

  it('allDayLabel をカスタマイズできる', () => {
    const allDay = makeAllDayStamp('2026-06-12', 'Europe/Paris')
    expect(formatStamp(allDay, 'Asia/Tokyo', { allDayLabel: '全日' })).toBe(
      '全日',
    )
  })
})

describe('formatDualTime', () => {
  it("夏時間なら '14:20 現地 / 21:20 JST' を返す", () => {
    const stamp = makeStamp('2026-06-12', '14:20', 'Europe/Paris')
    expect(formatDualTime(stamp, 'Asia/Tokyo')).toBe('14:20 現地 / 21:20 JST')
  })

  it("冬時間では '14:20 現地 / 22:20 JST' になる", () => {
    const stamp = makeStamp('2026-01-12', '14:20', 'Europe/Paris')
    expect(formatDualTime(stamp, 'Asia/Tokyo')).toBe('14:20 現地 / 22:20 JST')
  })

  it('現地が Asia/Tokyo(時差ゼロ)なら併記しない', () => {
    const stamp = makeStamp('2026-06-12', '14:20', 'Asia/Tokyo')
    expect(formatDualTime(stamp, 'Asia/Tokyo')).toBe('14:20')
  })

  it('表示タイムゾーンが日本時間でなければ、現地と時差があっても併記しない', () => {
    const stamp = makeStamp('2026-06-12', '14:20', 'America/New_York')
    expect(formatDualTime(stamp, 'Europe/Paris')).toBe('14:20')
  })

  it('終日は formatStamp と同じ(終日ラベルのみ)になる', () => {
    const stamp = makeAllDayStamp('2026-06-12', 'Europe/Paris')
    expect(formatDualTime(stamp, 'Asia/Tokyo')).toBe('終日')
  })
})

describe('stampDateInTz', () => {
  it('終日は日付をずらさない', () => {
    const stamp = makeAllDayStamp('2026-06-12', 'Asia/Tokyo')
    expect(stampDateInTz(stamp, 'Europe/Paris')).toBe('2026-06-12')
  })

  it('時刻ありはタイムゾーン基準の日付を返す(日付が進む/戻るケース)', () => {
    const morning = makeStamp('2026-06-12', '07:00', 'Asia/Tokyo')
    const lateNight = makeStamp('2026-06-12', '01:00', 'Asia/Tokyo')
    // Tokyo 07:00 JST(UTC+9) = 6/11 22:00 UTC = Paris 6/12 00:00 CEST(UTC+2) → 同じ日付
    expect(stampDateInTz(morning, 'Europe/Paris')).toBe('2026-06-12')
    // Tokyo 01:00 JST(UTC+9) = 6/11 16:00 UTC = Paris 6/11 18:00 CEST(UTC+2) → 前日
    expect(stampDateInTz(lateNight, 'Europe/Paris')).toBe('2026-06-11')
  })
})

describe('検証系', () => {
  it('isValidTz', () => {
    expect(isValidTz('Asia/Tokyo')).toBe(true)
    expect(isValidTz('Europe/Paris')).toBe(true)
    expect(isValidTz('Mars/Olympus')).toBe(false)
    expect(isValidTz('')).toBe(false)
    expect(isValidTz(123)).toBe(false)
    expect(isValidTz(null)).toBe(false)
    expect(isValidTz(undefined)).toBe(false)
  })

  it('isValidISODate', () => {
    expect(isValidISODate('2026-06-12')).toBe(true)
    expect(isValidISODate('2026-6-12')).toBe(false)
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('')).toBe(false)
    expect(isValidISODate('not-a-date')).toBe(false)
  })

  it('isValidTime', () => {
    expect(isValidTime('14:20')).toBe(true)
    expect(isValidTime('25:00')).toBe(false)
    expect(isValidTime('14:5')).toBe(false)
    expect(isValidTime('99:99')).toBe(false)
  })

  it('isSameOffset', () => {
    const at = Date.UTC(2026, 5, 12, 12, 0) // 夏
    expect(isSameOffset('Europe/Paris', 'Europe/Paris', at)).toBe(true)
    // Paris と Berlin は夏冬とも同じ CET/CEST 圏で時差ゼロ
    expect(isSameOffset('Europe/Paris', 'Europe/Berlin', at)).toBe(true)
    // Paris(+2) と Tokyo(+9) は夏でも時差がある
    expect(isSameOffset('Europe/Paris', 'Asia/Tokyo', at)).toBe(false)
  })
})

describe('日付ユーティリティ', () => {
  it('addDays / diffDays は月跨ぎ・年跨ぎ・うるう年を扱える', () => {
    expect(addDays('2026-06-28', 5)).toBe('2026-07-03')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29') // うるう年
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02') // 年跨ぎ
    expect(diffDays('2026-06-12', '2026-06-26')).toBe(14)
    expect(diffDays('2026-12-28', '2027-01-03')).toBe(6) // 年跨ぎ
    expect(diffDays('2028-02-27', '2028-03-01')).toBe(3) // うるう年
  })

  it('weekdayJa / formatDateJa', () => {
    expect(weekdayJa('2026-06-12')).toBe('金')
    expect(formatDateJa('2026-06-12')).toBe('6/12(金)')
  })
})

describe('COMMON_TIMEZONES', () => {
  it('すべての要素の tz が isValidTz を満たす(タイポ検出)', () => {
    for (const option of COMMON_TIMEZONES) {
      expect(isValidTz(option.tz)).toBe(true)
    }
  })

  it('tz に重複がない', () => {
    const tzs = COMMON_TIMEZONES.map((option) => option.tz)
    expect(new Set(tzs).size).toBe(tzs.length)
  })
})

describe('getDeviceTz', () => {
  it('isValidTz を満たす文字列を返す', () => {
    expect(isValidTz(getDeviceTz())).toBe(true)
  })
})
