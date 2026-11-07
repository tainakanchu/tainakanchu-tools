/**
 * 「ツール単体アプリとして起動された」状態の判定。
 *
 * ツール単体 PWA の manifest は start_url を `/tools/<slug>?pwa=<slug>` にしている
 * (site-meta の buildToolManifest)。サイト全体の PWA も standalone で動き、
 * その中から /tools/* へ移動できるので、display-mode だけでは両者を区別できない。
 * そこで起動 URL の印をルーター初期化前に読み取り、タブ（ウィンドウ）単位で
 * 消える sessionStorage に覚えておく。
 */
import { TOOL_APP_PARAM, findToolByPathname, getToolMeta } from './site-meta'

const STORAGE_KEY = 'tainakanchu-tools:tool-app'

/**
 * 起動 URL から印を読み、印を除いた URL を返す（純粋関数）。
 * 印が無ければ cleanedHref も undefined（URL を書き換える必要が無い）。
 * slug は「PWA 対応ツールで、しかもそのツールの URL で開かれた」ときだけ返す。
 * 手で書き換えた URL などで別ツールの slug が付いていても、印だけ消して無視する。
 */
export function parseToolAppLaunch(href: string): {
  slug: string | undefined
  cleanedHref: string | undefined
} {
  const url = new URL(href)
  const value = url.searchParams.get(TOOL_APP_PARAM)
  if (value === null) return { slug: undefined, cleanedHref: undefined }

  url.searchParams.delete(TOOL_APP_PARAM)
  const cleanedHref = `${url.pathname}${url.search}${url.hash}`
  const tool = getToolMeta(value)
  const matches =
    tool?.pwa !== undefined && findToolByPathname(url.pathname) === tool
  return { slug: matches ? value : undefined, cleanedHref }
}

/**
 * src/main.tsx から createRouter より前に呼ぶ。
 * ルーターより先に URL から印を消すのは、validateSearch を持つルート
 * (timetable / taiwan-map) の search に `pwa` が紛れ込んだり、共有用 URL に
 * 残ったりしないようにするため。
 */
export function captureToolAppLaunch(): void {
  const { slug, cleanedHref } = parseToolAppLaunch(window.location.href)
  if (cleanedHref === undefined) return
  window.history.replaceState(window.history.state, '', cleanedHref)
  if (slug === undefined) return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, slug)
  } catch {
    // ストレージが使えない環境では「ツール単体アプリ扱い」を諦める。
    // メニューが出るだけで、ツール自体は普通に使える。
  }
}

/** このウィンドウがツール単体アプリとして起動されていれば、その slug */
export function getLaunchedToolAppSlug(): string | undefined {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/** ホーム画面から起動されたアプリのウィンドウか（ブラウザのタブではないか） */
export function isStandaloneDisplay(): boolean {
  // navigator.standalone は display-mode を返さない古い iOS 向けの保険
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true
  return (
    iosStandalone || window.matchMedia('(display-mode: standalone)').matches
  )
}

/**
 * いまの pathname を「ツール単体アプリ」として表示すべきか。
 * 起動したツールの scope 内にいる間だけ true。ヘッダーのロゴからトップへ出たら
 * (scope 外なのでブラウザの UI つきで開く) 普通のサイトとして振る舞い、
 * メニューから他のツールへ行けるようにする。
 */
export function isToolAppPathname(
  pathname: string,
  launchedSlug: string | undefined,
): boolean {
  if (launchedSlug === undefined) return false
  return findToolByPathname(pathname)?.slug === launchedSlug
}
