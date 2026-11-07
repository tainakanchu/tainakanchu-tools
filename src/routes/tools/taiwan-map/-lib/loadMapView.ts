/**
 * 地図チャンク（MapView + maplibre-gl）の読み込み口。React.lazy と先読みが
 * 同じ Promise を使うよう、ここ 1 箇所にまとめている。
 *
 * ■ いつ先読みするか
 * - 地図を出す画面（デスクトップ / スマホの地図表示）では、都市 JSON の
 *   読み込みを待たずにすぐ取りに行く。以前は「JSON が届いて件数が分かって
 *   から」lazy コンポーネントが描かれて初めて import が始まっていたので、
 *   JSON → 地図 JS → style → タイルが一直線に並んでいた。
 * - スマホの一覧表示では、ブラウザが暇になったとき（requestIdleCallback）に
 *   先読みする。「地図」を押してから約 1MB を落とし始めると、旅先の回線では
 *   数秒待たされるため。ただしデータセーバーが有効・2G 相当の回線では、
 *   地図を見ない人に大きな JS を落とさせないよう先読みしない
 *   （押したときに読むだけになる）。
 */

// 型だけの import なので、地図チャンクは静的に取り込まれない
import type * as MapViewModuleType from '../-components/MapView'

type MapViewModule = typeof MapViewModuleType

let promise: Promise<MapViewModule> | null = null

export function loadMapView(): Promise<MapViewModule> {
  if (promise === null) {
    promise = import('../-components/MapView')
    // 失敗（圏外など）した Promise は捨て、次に地図を開いたとき読み直せるようにする
    promise.catch(() => {
      promise = null
    })
  }
  return promise
}

type NetworkInformationLike = { saveData?: boolean; effectiveType?: string }

/** 回線・設定から見て、使うか分からない大きな JS を先読みしてよいか */
export function shouldPrefetchOnIdle(
  connection: NetworkInformationLike | undefined,
): boolean {
  if (!connection) return true
  if (connection.saveData) return false
  return (
    connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g'
  )
}

/**
 * ブラウザが暇になったら地図チャンクを先読みする。返り値で取り消せる。
 * requestIdleCallback の無いブラウザ（Safari の一部）は少し待ってから読む。
 */
export function prefetchMapViewOnIdle(): () => void {
  const nav = navigator as Navigator & { connection?: NetworkInformationLike }
  if (!shouldPrefetchOnIdle(nav.connection)) return () => {}
  const run = () => {
    void loadMapView().catch(() => {})
  }
  if ('requestIdleCallback' in window) {
    const handle = window.requestIdleCallback(run, { timeout: 5000 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = setTimeout(run, 2000)
  return () => clearTimeout(handle)
}
