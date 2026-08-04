import { describe, expect, it } from 'vitest'
import {
  MIN_PARTIAL_MATCH_LENGTH,
  normalizeName,
  toCityName,
  withoutFacilitySuffix,
} from './placeNames'

describe('normalizeName', () => {
  it('全角/半角・大文字小文字・記号のゆれを潰す', () => {
    expect(normalizeName('ＣＤＧ 空港')).toBe('cdg空港')
    expect(normalizeName('St. Moritz')).toBe('stmoritz')
    expect(normalizeName('サン・ジョセフ')).toBe('サンジョセフ')
  })

  it('長音符は文字なので残る', () => {
    expect(normalizeName('コペンハーゲン')).toBe('コペンハーゲン')
  })
})

describe('withoutFacilitySuffix(正規化済みの形)', () => {
  it('末尾の施設の語を 1 つだけ落とす', () => {
    expect(withoutFacilitySuffix('関西国際空港')).toBe('関西')
    expect(withoutFacilitySuffix('東京駅')).toBe('東京')
    expect(withoutFacilitySuffix('マルタの知人宅')).toBe('マルタ')
  })

  it('施設の語で終わっていなければ null', () => {
    expect(withoutFacilitySuffix('パリ')).toBeNull()
  })

  it('落とすと短くなりすぎる名前からは候補を作らない', () => {
    expect(withoutFacilitySuffix('駅')).toBeNull()
    expect(withoutFacilitySuffix('香港')).toBeNull()
  })
})

describe('toCityName: ターミナルの表記を落とす', () => {
  it('施設名の後ろに付く T2 を落として都市名だけにする', () => {
    expect(toCityName('香港国際空港 T2')).toBe('香港')
    expect(toCityName('台湾桃園国際空港 T2')).toBe('台湾桃園')
  })

  it('「第2ターミナル」「ターミナル1」「Terminal 2」も同じように落とす', () => {
    expect(toCityName('羽田空港 第2ターミナル')).toBe('羽田')
    expect(toCityName('成田国際空港 ターミナル1')).toBe('成田')
    expect(toCityName('Milan Malpensa Airport Terminal 2')).toBe(
      'Milan Malpensa',
    )
  })

  it('全角の表記も落とす', () => {
    expect(toCityName('香港国際空港 Ｔ２')).toBe('香港')
    expect(toCityName('羽田空港 第２ターミナル')).toBe('羽田')
  })

  it('末尾とは限らない位置のターミナル表記も落とす', () => {
    expect(toCityName('T2 香港国際空港')).toBe('香港')
  })

  it('地名や英単語の途中にある t は落とさない', () => {
    // 「T2」を無条件に落とすと St. Moritz のような地名まで削れてしまう
    expect(toCityName('St. Moritz')).toBe('St. Moritz')
    expect(toCityName('Interlaken Ost')).toBe('Interlaken Ost')
  })
})

describe('toCityName: 施設の語を落とす', () => {
  it('落とすのは末尾の 1 語だけ(「国際空港」を「空港」で削らない)', () => {
    expect(toCityName('関西国際空港')).toBe('関西')
  })

  it('元の表記(大文字小文字・空白)を保ったまま落とす', () => {
    expect(toCityName('Zurich Hauptbahnhof Station')).toBe(
      'Zurich Hauptbahnhof',
    )
    expect(toCityName('MILANO CENTRALE STATION')).toBe('MILANO CENTRALE')
  })

  it('落とした跡に区切り記号を残さない', () => {
    // 中黒がぶら下がったままの文字列を検索サイトに渡しても意味がない
    const city = toCityName('コペンハーゲン・カストラップ空港')
    expect(city).toBe('コペンハーゲン・カストラップ')
    expect(city.endsWith('・')).toBe(false)
    expect(toCityName('コペンハーゲン・空港')).toBe('コペンハーゲン')
    expect(toCityName('バルセロナ - 駅')).toBe('バルセロナ')
  })

  it('「〜の」で終わる形は助詞も落とす', () => {
    expect(toCityName('マルタの知人宅')).toBe('マルタ')
  })
})

describe('toCityName: もともと都市名なら変えない', () => {
  it.each(['Milan', 'Interlaken', 'パリ', 'アムステルダム', 'サン・ジョセフ'])(
    '%s はそのまま',
    (name) => {
      expect(toCityName(name)).toBe(name)
    },
  )

  it('前後の空白だけは落とす', () => {
    expect(toCityName('  Milan  ')).toBe('Milan')
  })
})

describe('toCityName: 削りすぎるなら元の文字列に戻す', () => {
  it('施設の語しか無い名前は落とさない', () => {
    expect(toCityName('駅')).toBe('駅')
    expect(toCityName('空港')).toBe('空港')
    expect(toCityName('バスターミナル')).toBe('バスターミナル')
  })

  it('落とすと 1 文字になる地名は落とさない', () => {
    // 「香港」を「香」にして渡すより、施設名のままのほうがまだ解決される見込みがある
    expect(toCityName('香港')).toBe('香港')
  })

  it('ターミナルの表記しか無い名前も落とさない', () => {
    expect(toCityName('T2')).toBe('T2')
  })

  it('しきい値は MIN_PARTIAL_MATCH_LENGTH と同じ', () => {
    // 判定側(itinerary.ts)と同じ「短すぎる地名は当てにならない」という線引きを使う
    expect(MIN_PARTIAL_MATCH_LENGTH).toBe(2)
    expect(toCityName('AB駅')).toBe('AB')
    expect(toCityName('A駅')).toBe('A駅')
  })
})
