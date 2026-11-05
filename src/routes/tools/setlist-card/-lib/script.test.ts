import { describe, expect, it } from 'vitest'
import {
  JAPANESE_ONLY,
  SIMPLIFIED_ONLY,
  TRADITIONAL_ONLY,
  detectScript,
  guessScript,
  isCjkChar,
  pairScripts,
} from './script'
import { font, fontStack, parseFont, webFamilies, withScript } from './fonts'
import type { Script } from './script'

describe('字の表', () => {
  it('簡体字・繁体字・新字体の表は重ならない', () => {
    for (const ch of SIMPLIFIED_ONLY) {
      expect(TRADITIONAL_ONLY.has(ch), ch).toBe(false)
      expect(JAPANESE_ONLY.has(ch), ch).toBe(false)
    }
    for (const ch of TRADITIONAL_ONLY) {
      expect(JAPANESE_ONLY.has(ch), ch).toBe(false)
    }
  })

  it('例に挙げた字が入っている', () => {
    for (const ch of '苹树侨忆倾这们为国说个') {
      expect(SIMPLIFIED_ONLY.has(ch), ch).toBe(true)
    }
    for (const ch of '這們為國說個愛載寧靜詒瓊') {
      expect(TRADITIONAL_ONLY.has(ch), ch).toBe(true)
    }
    // 臻は簡体字でも同じ字なので、どちらの決め手にもしない
    expect(SIMPLIFIED_ONLY.has('臻')).toBe(false)
    expect(TRADITIONAL_ONLY.has('臻')).toBe(false)
  })
})

/** 実際のセトリの「アーティスト / 曲名」と、それぞれに選ぶ体系 */
const REAL: ReadonlyArray<[string, Script, string, Script]> = [
  // 依頼の例
  ['完美倒立', 'zh-hant', '薄荷夏日(Mint Summer Day)', 'zh-hant'],
  ['黄星侨', 'zh-hans', '苹果树', 'zh-hans'],
  ['', 'latin', '刺鳗', 'zh-hans'],
  ['曹雅雯', 'zh-hant', '若是明仔載 (feat. ?te 壞特)', 'zh-hant'],
  // 潘高峰 だけでは決め手が無いので、曲名の簡体字にそろえる
  ['潘高峰', 'zh-hans', '失忆', 'zh-hans'],
  ['卡奇社', 'zh-hans', '日光倾城', 'zh-hans'],
  ['脆弱少女組 - Fragile girls', 'zh-hant', '失去尼歐', 'zh-hant'],
  ['薛詒丹', 'zh-hant', 'Summer Café', 'latin'],
  ['吾橋有水 FloodingBridge', 'zh-hant', '迷迷糊糊', 'zh-hant'],
  ['fuvva', 'latin', '世紀暈船大王', 'zh-hant'],
  ['エロ紳士', 'ja', '寂靜凌晨', 'zh-hant'],
  ['陳梓童 Feat. Q.luv', 'zh-hant', 'Track', 'latin'],
  ['徐佳瑩 Feat. 阿爆 & Brandy', 'zh-hant', 'Track', 'latin'],
  ['UJay Huang, 許瓊文 feat. 林宜臻', 'zh-hant', 'Track', 'latin'],
  // 韓国語
  ['아이유', 'ko', '밤편지', 'ko'],
  ['NewJeans', 'latin', '디토', 'ko'],
  ['잔나비', 'ko', '주저하는 연인들을 위해', 'ko'],
  ['BIGBANG', 'latin', '봄여름가을겨울 (Still Life)', 'ko'],
  // Traktor の History / プレイリスト（台湾の曲が中心）
  ['羅莎莎', 'zh-hant', '沖昏頭', 'zh-hant'],
  ['打底音樂', 'zh-hant', 'Uyas mseupu mqqaras‧kasaupu‧謝聚之歌', 'zh-hant'],
  [
    'Kumu Basaw 姑慕·巴紹',
    'zh-hant',
    'Nasi Su Kuxul O Asi Rngaw 愛要說出口',
    'zh-hant',
  ],
  ['拍謝少年 Feat. 余佩真 (Û Puē-tsin)', 'zh-hant', '踅夜市', 'zh-hant'],
  ['I Mean Us', 'latin', 'Søulмaтe', 'latin'],
  ['鎌野愛 and 菅原一樹', 'zh-hant', '光', 'zh-hant'],
  ['鹿比 ∞ 吠陀', 'zh-hant', 'Hue', 'latin'],
  ['甜約翰', 'zh-hant', '追逐，然後跳舞', 'zh-hant'],
  ['Blue candy, 剎那Setsuna', 'zh-hant', '我兄弟x了我最愛的女人', 'zh-hant'],
  // rekordbox の M3U8（簡体字が中心で、繁体字・日本語が混ざる）
  ['林洁心', 'zh-hans', '自由的风', 'zh-hans'],
  ['熊子', 'zh-hans', '夏日延长战 feat.熊子', 'zh-hans'],
  ['ChiliChill', 'latin', '万一对了呢', 'zh-hans'],
  ['砂糖协会 奶油熊子炖菜KUMAKO ANK', 'zh-hans', 'tape/stop/night', 'latin'],
  ['饭卡/白鲨JAWS', 'zh-hans', 'THE TIDES', 'latin'],
  ['永彬Ryan.B feat, 花澤香菜', 'zh-hant', '风筝 (feat.花泽香菜)', 'zh-hans'],
  ['黄星侨', 'zh-hans', '生于 1999', 'zh-hans'],
  ['靜芳, EAERAN', 'zh-hant', 'Sweetless', 'latin'],
  ['PiA吳蓓雅, T-AK', 'zh-hant', '無你的日子 (T-AK Remix)', 'zh-hant'],
  ['甜約翰', 'zh-hant', '敏感話題 (FANG Remix)', 'zh-hant'],
  ['蔣卓嘉/魏如萱', 'zh-hant', 'EY', 'latin'],
  ['そらこ', 'ja', '魔法', 'ja'],
  // 決め手の無い漢字だけの文字列は繁体字（深夜便利店は簡体字の曲だが字形は同じ）
  ['小野道ono/早木旋子', 'zh-hant', '深夜便利店', 'zh-hant'],
  // 日本語
  ['宇多田ヒカル', 'ja', 'First Love', 'latin'],
  // 漢字だけの日本の名前は見分けられない（字形が繁体字と同じなので、繁体字の書体でも崩れない）
  ['米津玄師', 'zh-hant', 'Lemon', 'latin'],
  ['YOASOBI', 'latin', '夜に駆ける', 'ja'],
]

describe('pairScripts（実際のセトリ）', () => {
  for (const [artist, as, title, ts] of REAL) {
    it(`${artist} / ${title}`, () => {
      expect(pairScripts(artist, title)).toEqual([as, ts])
    })
  }
})

describe('detectScript', () => {
  it('ハングルがあれば韓国語（漢字・かながあっても）', () => {
    expect(detectScript('아이유 - 밤편지')).toBe('ko')
    expect(detectScript('NewJeans - 디토')).toBe('ko')
    expect(detectScript('잔나비 - 주저하는 연인들을 위해')).toBe('ko')
    expect(detectScript('사랑 愛 あい')).toBe('ko')
  })

  it('かながあれば日本語', () => {
    expect(detectScript('エロ紳士')).toBe('ja')
    expect(detectScript('苹果のうた')).toBe('ja')
    expect(detectScript('佐々木')).toBe('ja')
  })

  it('長音記号・中点だけでは日本語にしない', () => {
    expect(detectScript('姑慕・巴紹')).toBe('zh-hant')
  })

  it('漢字だけなら簡体字 / 繁体字の字の数で決め、決め手が無ければ繁体字', () => {
    expect(guessScript('苹果树')).toEqual({
      script: 'zh-hans',
      ambiguous: false,
    })
    expect(guessScript('寂靜凌晨')).toEqual({
      script: 'zh-hant',
      ambiguous: false,
    })
    expect(guessScript('刺鳗')).toEqual({ script: 'zh-hans', ambiguous: false })
    expect(guessScript('深夜便利店')).toEqual({
      script: 'zh-hant',
      ambiguous: true,
    })
    // 同じ数なら繁体字
    expect(detectScript('这這')).toBe('zh-hant')
  })

  it('新字体（日本だけの字形）が多ければ日本語', () => {
    expect(detectScript('東京駅')).toBe('ja')
    expect(detectScript('桜')).toBe('ja')
  })

  it('漢字・かな・ハングルが無ければ latin（キリル文字・ベトナム語・タイ文字も）', () => {
    for (const t of [
      'Summer Café',
      'Søulмaтe',
      'Û Puē-tsin',
      'Mưa',
      'Ελλάδα',
      'สวัสดี',
      '',
    ]) {
      expect(detectScript(t), t).toBe('latin')
    }
  })

  it('isCjkChar', () => {
    expect(isCjkChar('漢')).toBe(true)
    expect(isCjkChar('밤')).toBe(true)
    expect(isCjkChar('，')).toBe(true)
    expect(isCjkChar('a')).toBe(false)
    expect(isCjkChar('‧')).toBe(false)
    expect(isCjkChar('м')).toBe(false)
  })
})

const firstCjk = (stack: Parameters<typeof webFamilies>[0], s: Script) =>
  webFamilies(stack, s).find(
    (f) => f !== 'Geist' && f !== 'Noto Sans' && f !== 'Noto Serif',
  )

describe('文字列ごとのスタック', () => {
  it('選んだ体系の書体を CJK の先頭に置き、残りは控えに残す', () => {
    expect(webFamilies('sans', 'zh-hans')).toEqual([
      'Geist',
      'Noto Sans SC',
      'Noto Sans TC',
      'Noto Sans',
      'Noto Sans Thai',
    ])
    // 中国語・韓国語の文字列に和文の書体は入れない（漢字を和文の書体で描かない）
    expect(webFamilies('serif', 'ko')).toEqual([
      'Noto Serif',
      'Noto Serif KR',
      'Noto Serif TC',
      'Noto Serif SC',
      'Noto Sans Thai',
    ])
    // 和文・欧文は、欧文の書体に無い欧文（ギリシャ文字など）を CJK 書体より先に
    expect(webFamilies('sans', 'ja').slice(0, 3)).toEqual([
      'Geist',
      'Noto Sans',
      'Zen Kaku Gothic New',
    ])
    expect(firstCjk('sans', 'ko')).toBe('Noto Sans KR')
    expect(firstCjk('sans', 'ja')).toBe('Zen Kaku Gothic New')
    expect(firstCjk('sans', 'latin')).toBe('Zen Kaku Gothic New')
  })

  it('明朝: 和文は欧文も Shippori Mincho、中国語・韓国語の欧文は Noto Serif', () => {
    expect(webFamilies('serif', 'zh-hant').slice(0, 3)).toEqual([
      'Noto Serif',
      'Noto Serif TC',
      'Noto Serif SC',
    ])
    expect(webFamilies('serif', 'ja').slice(0, 2)).toEqual([
      'Shippori Mincho',
      'Noto Serif',
    ])
    expect(webFamilies('display', 'zh-hans').slice(0, 2)).toEqual([
      'Instrument Serif',
      'Noto Serif SC',
    ])
  })

  it('ドット文字は日本語・欧文だけ。中国語・韓国語は等幅の系統', () => {
    expect(webFamilies('pixel', 'ja')[0]).toBe('DotGothic16')
    expect(webFamilies('pixel', 'zh-hant')).toEqual(
      webFamilies('mono', 'zh-hant'),
    )
    expect(webFamilies('pixel', 'ko')).not.toContain('DotGothic16')
  })

  it('OS 標準フォントも体系に合わせた順で後ろに付く', () => {
    const tc = fontStack('sans', 'zh-hant')
    expect(tc.indexOf('"PingFang TC"')).toBeLessThan(
      tc.indexOf('"PingFang SC"'),
    )
    expect(tc.indexOf('"PingFang TC"')).toBeLessThan(
      tc.indexOf('"Hiragino Sans"'),
    )
    const ko = fontStack('serif', 'ko')
    expect(ko.indexOf('AppleMyungjo')).toBeLessThan(ko.indexOf('"Songti TC"'))
    expect(fontStack('sans', 'zh-hans')).toContain('"Microsoft YaHei"')
    expect(fontStack('sans', 'ko')).toContain('"Malgun Gothic"')
    expect(fontStack('mono')).toMatch(/monospace$/)
  })

  it('withScript は太さ・大きさ・字間を保ったままスタックだけ入れ替える', () => {
    const f = font(600, 31.25, 'sans', { tracking: -0.015 })
    expect(parseFont(f).script).toBeUndefined()
    const tc = withScript(f, 'zh-hant')
    const p = parseFont(tc)
    expect(p.script).toBe('zh-hant')
    expect(p.stack).toBe('sans')
    expect(p.tracking).toBe(-0.015)
    expect(p.css).toBe(`600 31.3px ${fontStack('sans', 'zh-hant')}`)
    // font() で作っていない文字列はそのまま
    expect(withScript('10px x', 'ko')).toBe('10px x')
  })
})
