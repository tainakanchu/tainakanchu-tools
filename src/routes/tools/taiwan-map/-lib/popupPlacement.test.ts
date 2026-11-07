import { describe, expect, it } from 'vitest'
import { placePopup } from './popupPlacement'

const base = {
  popup: { width: 300, height: 160 },
  container: { width: 1000, height: 800 },
  gap: 14,
  margin: 8,
  topInset: 48,
}

describe('placePopup', () => {
  it('ふつうはピンの真上・中央に出す', () => {
    expect(placePopup({ ...base, anchor: { x: 500, y: 400 } })).toEqual({
      left: 350,
      top: 400 - 14 - 160,
      side: 'above',
      arrowX: 150,
      visible: true,
    })
  })

  it('上に収まらない（ジャンルチップにかかる）ときは真下に出す', () => {
    const p = placePopup({ ...base, anchor: { x: 500, y: 120 } })
    expect(p.side).toBe('below')
    expect(p.top).toBe(120 + 14)
  })

  it('左右は地図からはみ出さないよう寄せ、三角はピンの上に残す', () => {
    const left = placePopup({ ...base, anchor: { x: 40, y: 400 } })
    expect(left.left).toBe(8)
    expect(left.arrowX).toBe(32)
    const right = placePopup({ ...base, anchor: { x: 995, y: 400 } })
    expect(right.left).toBe(1000 - 300 - 8)
    // 三角はポップアップの角からは少し内側に留める
    expect(right.arrowX).toBe(300 - 16)
  })

  it('ピンが地図の外にあれば隠す', () => {
    expect(placePopup({ ...base, anchor: { x: -5, y: 400 } }).visible).toBe(
      false,
    )
    expect(placePopup({ ...base, anchor: { x: 500, y: 801 } }).visible).toBe(
      false,
    )
  })
})
