/**
 * 地図のピンに付けるポップアップの置き場所（純関数）。
 * ピンの画面座標（地図コンテナ内の px）とポップアップ・地図の大きさから、
 * ポップアップの左上の位置と、ピンを指す三角の位置を決める。
 *
 * - 基本はピンの真上。上に収まらない（地図の上端・ジャンルチップに
 *   かかる）ときは真下に出す。どちらにも収まらなければ広いほう
 * - 左右は地図からはみ出さないよう寄せる。三角はピンの真上に残す
 * - ピンが地図の外に出ていたら visible=false（ポップアップを隠す）
 */

export type PopupPlacementInput = {
  anchor: { x: number; y: number }
  popup: { width: number; height: number }
  container: { width: number; height: number }
  /** ピンの中心からポップアップまでの距離（ピンの半径 + 三角のぶん） */
  gap: number
  /** 地図の縁からの余白 */
  margin: number
  /** 上端で避ける高さ（地図に重ねたジャンルチップなど） */
  topInset: number
}

export type PopupPlacement = {
  left: number
  top: number
  side: 'above' | 'below'
  /** ポップアップの左端から三角の中心まで */
  arrowX: number
  visible: boolean
}

const ARROW_EDGE = 16

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

export function placePopup({
  anchor,
  popup,
  container,
  gap,
  margin,
  topInset,
}: PopupPlacementInput): PopupPlacement {
  const visible =
    anchor.x >= 0 &&
    anchor.y >= 0 &&
    anchor.x <= container.width &&
    anchor.y <= container.height
  const roomAbove = anchor.y - gap - margin - topInset
  const roomBelow = container.height - anchor.y - gap - margin
  const side: PopupPlacement['side'] =
    roomAbove >= popup.height || roomAbove >= roomBelow ? 'above' : 'below'
  const top = side === 'above' ? anchor.y - gap - popup.height : anchor.y + gap
  const left = clamp(
    anchor.x - popup.width / 2,
    margin,
    container.width - popup.width - margin,
  )
  const arrowX = clamp(anchor.x - left, ARROW_EDGE, popup.width - ARROW_EDGE)
  return { left, top, side, arrowX, visible }
}
