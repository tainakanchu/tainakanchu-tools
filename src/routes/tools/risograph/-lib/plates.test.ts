import { describe, expect, it } from 'vitest'
import {
  compositeFileName,
  fitLongSide,
  initialPlateSettings,
  plateFileName,
  previewDpi,
  reconcilePlateSettings,
  toBaseName,
  toPlateTransforms,
  zeroRegistrations,
} from './plates'

describe('initialPlateSettings: 版設定の初期値', () => {
  it('推奨スクリーン角を版数に応じて割り当てる', () => {
    const settings = initialPlateSettings(['blue', 'red', 'yellow'])
    expect(settings.map((s) => s.angleDeg)).toEqual([15, 45, 75])
    expect(settings.map((s) => s.method)).toEqual(['am', 'am', 'am'])
    expect(settings.map((s) => s.lpi)).toEqual([60, 60, 60])
  })
})

describe('reconcilePlateSettings: インク差し替え時の引き継ぎ', () => {
  it('残ったインクの設定は保持し、新規インクは初期値になる', () => {
    const previous = initialPlateSettings(['blue', 'red'])
    previous[0].lpi = 85
    previous[0].method = 'blue-noise'

    const next = reconcilePlateSettings(['blue', 'yellow'], previous)
    expect(next[0].lpi).toBe(85)
    expect(next[0].method).toBe('blue-noise')
    expect(next[1].inkId).toBe('yellow')
    expect(next[1].lpi).toBe(60)
  })

  it('刷り順を入れ替えても設定はインクについて回る', () => {
    const previous = initialPlateSettings(['blue', 'red'])
    previous[1].angleDeg = 30

    const next = reconcilePlateSettings(['red', 'blue'], previous)
    expect(next[0].inkId).toBe('red')
    expect(next[0].angleDeg).toBe(30)
  })
})

describe('fitLongSide: プレビュー用の縮小寸法', () => {
  it('長辺が上限を超えるときだけ縮小する', () => {
    const fitted = fitLongSide(2000, 1000, 1400)
    expect(fitted.width).toBe(1400)
    expect(fitted.height).toBe(700)
    expect(fitted.scale).toBeCloseTo(0.7)
  })

  it('上限以下なら等倍のまま', () => {
    const fitted = fitLongSide(800, 600, 1400)
    expect(fitted).toEqual({ width: 800, height: 600, scale: 1 })
  })

  it('縦長でも長辺基準で判定する', () => {
    const fitted = fitLongSide(300, 1500, 900)
    expect(fitted.height).toBe(900)
    expect(fitted.width).toBe(180)
  })
})

describe('previewDpi: 縮小率に合わせた dpi', () => {
  it('縮小率ぶん dpi も下げる', () => {
    expect(previewDpi(0.5, 300)).toBe(150)
  })

  it('0 以下にはしない', () => {
    expect(previewDpi(0)).toBe(1)
  })
})

describe('toPlateTransforms: 版ズレの px 変換', () => {
  const regs = [
    { offsetMm: { x: 0, y: 0 }, rotationDeg: 0 },
    { offsetMm: { x: 25.4, y: 0 }, rotationDeg: 0.5 },
  ]

  it('無効なら全て null', () => {
    expect(toPlateTransforms(regs, 300, false)).toEqual([null, null])
  })

  it('mm を dpi で px に直す。ズレ 0 の版は null', () => {
    const transforms = toPlateTransforms(regs, 300, true)
    expect(transforms[0]).toBeNull()
    expect(transforms[1]).toEqual({
      offsetXPx: 300,
      offsetYPx: 0,
      rotationDeg: 0.5,
    })
  })
})

describe('zeroRegistrations', () => {
  it('版数ぶんのゼロ設定を作る', () => {
    expect(zeroRegistrations(2)).toEqual([
      { offsetMm: { x: 0, y: 0 }, rotationDeg: 0 },
      { offsetMm: { x: 0, y: 0 }, rotationDeg: 0 },
    ])
  })
})

describe('書き出しファイル名', () => {
  it('拡張子とディレクトリを落として basename にする', () => {
    expect(toBaseName('photos/sunset.PNG')).toBe('sunset')
  })

  it('日本語はそのまま、記号は _ に潰す', () => {
    expect(toBaseName('夏の写真 (1).jpg')).toBe('夏の写真_1_')
  })

  it('空になったら image で代替する', () => {
    expect(toBaseName('.png')).toBe('image')
  })

  it('版 PNG は 1 始まりの版番号とインク id を含む', () => {
    expect(plateFileName('sunset', 0, 'fluor-pink')).toBe(
      'sunset_plate1_fluor-pink.png',
    )
  })

  it('合成 PNG は版ズレ焼き込みで名前を分ける', () => {
    expect(compositeFileName('sunset', false)).toBe('sunset_composite.png')
    expect(compositeFileName('sunset', true)).toBe(
      'sunset_composite_misregistered.png',
    )
  })
})
