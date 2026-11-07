/**
 * 端末のコンパス（向いている方角）。地図の現在地の点に向きの扇を出すのに使う。
 *
 * - Android の Chrome などは deviceorientationabsolute（北を基準にした alpha）
 * - iOS の Safari は deviceorientation の webkitCompassHeading（北から時計回り）。
 *   iOS 13 以降は DeviceOrientationEvent.requestPermission() の許可が要り、
 *   それはユーザー操作（クリック）の中で同期的に呼ばないと黙って失敗する。
 *   なので現在地ボタンのクリックの中で requestCompassPermission() を呼ぶ
 * - どちらも無い（パソコン・相対的な alpha しか無い端末）なら何も届かない。
 *   そのときは呼び出し側が GPS の進行方向に頼るか、扇を出さない
 *
 * ここは方角を渡すだけで、どこにも保存しない。
 */

import { normalizeAngle } from '../../../../lib/taiwan-map/geo'

type IOSOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number
}

/**
 * iOS でコンパスを使う許可を求める。許可の要らない端末・すでに決まって
 * いる端末では何もしない（2 回目以降はダイアログは出ない）。
 * 必ずクリックの処理の中で同期的に呼ぶこと
 */
export function requestCompassPermission(): void {
  if (typeof DeviceOrientationEvent === 'undefined') return
  // requestPermission は iOS の Safari だけにある（型定義には無い）
  const request: unknown = Reflect.get(
    DeviceOrientationEvent,
    'requestPermission',
  )
  if (typeof request !== 'function') return
  const result: unknown = request.call(DeviceOrientationEvent)
  if (result instanceof Promise) result.catch(() => {})
}

/** 画面の回転（横持ち）のぶん。端末の上端の向きを画面の上端の向きに直す */
function screenAngle(): number {
  if (typeof screen === 'undefined') return 0
  // 古い iOS には screen.orientation が無い（型定義では常にある）
  const orientation: unknown = Reflect.get(screen, 'orientation')
  if (typeof orientation !== 'object' || orientation === null) return 0
  const angle: unknown = Reflect.get(orientation, 'angle')
  return typeof angle === 'number' ? angle : 0
}

/**
 * 方角（度、北から時計回り）が届くたびに onHeading を呼ぶ。戻り値で止める
 */
export function watchCompass(onHeading: (deg: number) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  // 'in' で調べると型の上では else 側が never になるので Reflect.has で
  if (Reflect.has(window, 'ondeviceorientationabsolute')) {
    const onAbsolute = (e: DeviceOrientationEvent) => {
      if (e.alpha === null) return
      onHeading(normalizeAngle(360 - e.alpha + screenAngle()))
    }
    window.addEventListener('deviceorientationabsolute', onAbsolute)
    return () =>
      window.removeEventListener('deviceorientationabsolute', onAbsolute)
  }
  const onOrientation = (e: IOSOrientationEvent) => {
    const compass = e.webkitCompassHeading
    if (typeof compass === 'number' && compass >= 0) {
      onHeading(normalizeAngle(compass + screenAngle()))
    } else if (e.absolute && e.alpha !== null) {
      onHeading(normalizeAngle(360 - e.alpha + screenAngle()))
    }
    // 相対的な alpha（北が分からない）は使わない
  }
  window.addEventListener('deviceorientation', onOrientation)
  return () => window.removeEventListener('deviceorientation', onOrientation)
}
