import { useSyncExternalStore } from 'react'

/**
 * メディアクエリの一致状態。useSyncExternalStore で初回レンダーから
 * 正しい値を返すのが要点で、useEffect で後から判定すると、スマホでも
 * 最初の 1 フレームだけ「デスクトップ扱い」になって地図（maplibre の
 * 数百 KB）を読み込み始めてしまう。
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
