import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXPORT_SCALE,
  JPEG_QUALITY,
  MAX_EXPORT_LONG_SIDE,
  PHOTO_MAX_LONG_SIDE,
  devicePx,
  ditherCellPx,
  effectiveScale,
  exportFileName,
  exportPixelSize,
  fitLongSide,
  formatBytes,
  maxExportScale,
  outputFormat,
} from './export'
import { CANVAS_SIZES, getSize } from './layouts'

describe('書き出しの倍率', () => {
  it('既定は 2x', () => {
    expect(DEFAULT_EXPORT_SCALE).toBe(2)
  })

  it('長辺 4096px を超えない倍率までしか選べない', () => {
    expect(maxExportScale(getSize('portrait'))).toBe(3) // 1350 × 3 = 4050
    expect(maxExportScale(getSize('story'))).toBe(2) // 1920 × 3 = 5760
    expect(maxExportScale(getSize('square'))).toBe(3)
    expect(maxExportScale(getSize('wide'))).toBe(3)
    for (const size of CANVAS_SIZES) {
      const px = exportPixelSize(size, maxExportScale(size))
      expect(Math.max(px.width, px.height)).toBeLessThanOrEqual(
        MAX_EXPORT_LONG_SIDE,
      )
    }
  })

  it('使えない倍率は上限に収める', () => {
    expect(effectiveScale(getSize('story'), 3)).toBe(2)
    expect(effectiveScale(getSize('portrait'), 3)).toBe(3)
    expect(effectiveScale(getSize('story'), 1)).toBe(1)
  })

  it('画素数は論理サイズ × 倍率', () => {
    expect(exportPixelSize(getSize('portrait'), 2)).toEqual({
      width: 2160,
      height: 2700,
    })
    expect(exportPixelSize(getSize('story'), 2)).toEqual({
      width: 2160,
      height: 3840,
    })
    expect(exportPixelSize(getSize('wide'), 1)).toEqual({
      width: 1200,
      height: 675,
    })
  })

  it('shadowBlur などは倍率を掛けた装置の px にする', () => {
    expect(devicePx(8.64, 1)).toBeCloseTo(8.64)
    expect(devicePx(8.64, 2)).toBeCloseTo(17.28)
  })

  it('ドットのマスは倍率ぶん大きくなる（論理 px では同じ）', () => {
    expect(ditherCellPx(1080, 1)).toBe(3)
    expect(ditherCellPx(1080, 2)).toBe(6)
    expect(ditherCellPx(1080, 3)).toBe(9)
    // 写真枠のように狭くても、論理 px のマスは倍率で変わらない
    for (const w of [300, 540, 620, 1200]) {
      expect(ditherCellPx(w, 2)).toBe(ditherCellPx(w, 1) * 2)
    }
  })
})

describe('書き出しの形式', () => {
  it('写真が無ければ常に PNG', () => {
    for (const choice of ['auto', 'png', 'jpeg'] as const) {
      expect(outputFormat(false, choice).mime).toBe('image/png')
    }
  })

  it('写真があれば自動は JPEG（品質 0.92）', () => {
    const f = outputFormat(true, 'auto')
    expect(f).toEqual({ mime: 'image/jpeg', ext: 'jpg', quality: 0.92 })
    expect(JPEG_QUALITY).toBe(0.92)
  })

  it('写真があっても PNG / JPEG を選べる', () => {
    expect(outputFormat(true, 'png')).toEqual({
      mime: 'image/png',
      ext: 'png',
    })
    expect(outputFormat(true, 'jpeg').ext).toBe('jpg')
  })

  it('ファイル名は形式の拡張子と通し番号', () => {
    expect(exportFileName('dj-set', 0, 1, 'png')).toBe('dj-set.png')
    expect(exportFileName('dj-set', 1, 3, 'jpg')).toBe('dj-set-2.jpg')
    expect(exportFileName('', 0, 1, 'jpg')).toBe('setlist.jpg')
  })

  it('ファイルサイズの表示', () => {
    expect(formatBytes(300)).toBe('1 KB')
    expect(formatBytes(512 * 1024)).toBe('512 KB')
    expect(formatBytes(5.25 * 1024 * 1024)).toBe('5.3 MB')
  })
})

describe('写真の縮小', () => {
  it('2x の 9:16（長辺 3840px）を拡大せずに済む上限', () => {
    expect(PHOTO_MAX_LONG_SIDE).toBeGreaterThanOrEqual(3840)
    expect(PHOTO_MAX_LONG_SIDE).toBeLessThanOrEqual(4096)
  })

  it('上限以下はそのまま、超えたら縦横比を保って縮める', () => {
    expect(fitLongSide(4000, 3000, 4096)).toBeNull()
    expect(fitLongSide(8192, 6144, 4096)).toEqual({ width: 4096, height: 3072 })
    expect(fitLongSide(3000, 6000, 4096)).toEqual({ width: 2048, height: 4096 })
  })
})
