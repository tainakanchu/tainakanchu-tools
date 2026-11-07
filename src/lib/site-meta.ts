/**
 * サイト共通メタとツール別 OG 情報の単一ソース。
 * vite.config / ビルドプラグインからも import するため、DOM や Vite 固有の
 * 依存を持たない純粋な TS にしている。
 */

export const SITE_ORIGIN = 'https://tools.tainakanchu.com'

export const siteName = 'かんちゅツールズ'
export const siteTitle = 'かんちゅツールズ | tainakanchu tools'
export const siteDescription =
  'かんちゅが作る日常の小さな便利ツール集。原寸レイアウトメーカーなど、原寸レイアウトにこだわったユーティリティを公開中。'
/** サイト共通 OG 画像（ツール別は ToolMeta.ogImagePath） */
export const ogImagePath = '/assets/og/site.png'

/**
 * PWA のテーマ色・背景色・言語。サイト全体の manifest (vite.config) と
 * ツール別 manifest の両方がここを参照する。
 * ツール別 manifest もテーマ色をサイトと揃えているのは、standalone 時の
 * タイトルバーが全ツール共通の暗いヘッダーと地続きに見えるようにするため
 * （ツールの色はアイコン側で出している）。
 */
export const PWA_THEME_COLOR = '#0f172a'
export const PWA_BACKGROUND_COLOR = '#ffffff'
export const PWA_LANG = 'ja-JP'

/** カテゴリ表示順: 旅行 → デスク → イベント */
export const TOOL_CATEGORIES = [
  { id: 'travel', name: '旅行' },
  { id: 'desk', name: 'デスク' },
  { id: 'event', name: 'イベント' },
] as const

export type ToolCategoryId = (typeof TOOL_CATEGORIES)[number]['id']

export type ToolMeta = {
  slug: string
  name: string
  description: string
  path: string
  /** public 配下の OG 画像パス（例: /assets/og/trip-notes.png） */
  ogImagePath: string
  category: ToolCategoryId
  /**
   * 指定したツールだけ、サイト全体の PWA とは別に「そのツール単体のアプリ」と
   * してホーム画面へ追加できるようにする（オプトイン）。
   * 有効にしたら `pnpm pwa:icons` でアイコンを生成してコミットすること。
   */
  pwa?: ToolPwa
}

/** ツール単体 PWA の設定。manifest の他の値は slug / name / description から導出する */
export type ToolPwa = {
  /**
   * ホーム画面のアイコン下に出る名前（manifest の short_name と
   * apple-mobile-web-app-title）。ホーム画面では長いと切れるので短くする。
   */
  shortName: string
}

/** 別ホストの外部ツール（OG 生成・getToolMeta の対象外） */
export type ExternalTool = {
  slug: string
  name: string
  description: string
  /** 絶対 URL */
  href: string
  category: ToolCategoryId
}

/**
 * このリポジトリでホストしているツールのみ。
 * path / ogImagePath 必須。OG ページ生成・getToolMeta がここを参照する。
 * 配列順はカテゴリ内の表示順に揃えている。
 */
export const TOOL_META: ReadonlyArray<ToolMeta> = [
  // 旅行
  {
    slug: 'trip-scheduler',
    name: '旅程パズル',
    description:
      'ヨーロッパ周遊の滞在日数・訪問順・移動手段を、泊数を配り切るパズルとして組み立てる新婚旅行プランナー。',
    path: '/tools/trip-scheduler',
    ogImagePath: '/assets/og/trip-scheduler.png',
    category: 'travel',
  },
  {
    slug: 'trip-notes',
    name: '旅のしおり',
    description:
      '予約の抜けを旅行前に潰し、旅行中は確認番号や集合時刻だけをすぐ取り出せる予約ダッシュボード。',
    path: '/tools/trip-notes',
    ogImagePath: '/assets/og/trip-notes.png',
    category: 'travel',
    pwa: { shortName: '旅のしおり' },
  },
  {
    slug: 'taiwan-arrival-card',
    name: '台湾入国カードメーカー',
    description:
      '台湾オンライン入国カード（TWAC）の一括アップロード用 Excel を、AI による航空券読み取りつきで同行者のぶんまでまとめて作成できるフォーム。',
    path: '/tools/taiwan-arrival-card',
    ogImagePath: '/assets/og/taiwan-arrival-card.png',
    category: 'travel',
  },
  {
    slug: 'taiwan-map',
    name: 'かんちゅの台湾マップ',
    description:
      '台湾で実際に行った場所を、かんちゅの主観コメントつきで記録した個人マップ。都市・エリア・やりたいことで絞り込んだ URL をそのまま共有できる。',
    path: '/tools/taiwan-map',
    ogImagePath: '/assets/og/taiwan-map.png',
    category: 'travel',
    pwa: { shortName: '台湾マップ' },
  },
  // デスク
  {
    slug: 'actual-size-layout',
    name: '原寸レイアウトメーカー',
    description:
      '免許証やパスポートなどの書類画像を原寸大でA4に配置して印刷・PDF出力できるレイアウトツール。',
    path: '/tools/actual-size-layout',
    ogImagePath: '/assets/og/actual-size-layout.png',
    category: 'desk',
  },
  {
    slug: 'risograph',
    name: 'リソ風分版メーカー',
    description:
      '画像を仮想特色インクの版に分解し、重ね刷りシミュレーション・網点・版ズレ表現つきでリソグラフ風の印刷データを作れる分版ツール。',
    path: '/tools/risograph',
    ogImagePath: '/assets/og/risograph.png',
    category: 'desk',
  },
  {
    slug: 'meeting-recorder',
    name: 'Web会議レコーダー',
    description:
      'イヤホン使用中でも、Web会議の相手の音声（タブ / システム音声）と自分のマイクを左右別チャンネルで録音。文字起こし向けに MP3 / Opus などで軽量に書き出せるブラウザ完結ツール。',
    path: '/tools/meeting-recorder',
    ogImagePath: '/assets/og/meeting-recorder.png',
    category: 'desk',
  },
  // イベント
  {
    slug: 'timetable',
    name: 'マイタイムテーブル',
    description:
      'フェスやイベントの公式タイムテーブルを AI で取り込み、見たい出演だけの自分用タイムテーブルを作れるツール。',
    path: '/tools/timetable',
    ogImagePath: '/assets/og/timetable.png',
    category: 'event',
    pwa: { shortName: 'タイムテーブル' },
  },
  {
    slug: 'drum-roll',
    name: 'ドラムロール',
    description:
      'スペースキーを押している間ドラムロールが鳴り、放すとシンバル＋キックで「ジャーン！」と締まる演出ツール。',
    path: '/tools/drum-roll',
    ogImagePath: '/assets/og/drum-roll.png',
    category: 'event',
  },
  {
    slug: 'setlist-card',
    name: 'セトリ画像メーカー',
    description:
      'rekordbox・Traktor・Serato の再生履歴を読み込んで、SNS にそのまま載せられるセトリ画像を PNG で作れるブラウザ完結ツール。',
    path: '/tools/setlist-card',
    ogImagePath: '/assets/og/setlist-card.png',
    category: 'event',
  },
]

/**
 * 外部ホストのツール。TOOL_META に混ぜない（OG 生成や getToolMeta を壊さないため）。
 * カテゴリ内の並びは getCatalogByCategory で明示する。
 */
export const EXTERNAL_TOOLS: ReadonlyArray<ExternalTool> = [
  {
    slug: 'magnify-image',
    name: '画像拡大',
    description:
      'ドラッグ&ドロップで画像をピクセルパーフェクトに整数倍拡大し、指定サイズで印刷したときの DPI も確認できるツール。',
    href: 'https://magnify-image.vercel.app/',
    category: 'desk',
  },
  {
    slug: 'online-roulette',
    name: 'ルーレット',
    description:
      'シンプルで使いやすいルーレットアプリ。選択肢を入力してスピンするだけで、ランダムな結果が得られます。',
    href: 'https://online-roulette-mu.vercel.app/',
    category: 'event',
  },
]

/** カタログ用の判別可能な union */
export type CatalogItem =
  (ToolMeta & { kind: 'internal' }) | (ExternalTool & { kind: 'external' })

/** カテゴリ内の表示順（slug） */
const ORDER_BY_CATEGORY: Record<ToolCategoryId, ReadonlyArray<string>> = {
  travel: ['trip-scheduler', 'trip-notes', 'taiwan-arrival-card', 'taiwan-map'],
  desk: [
    'actual-size-layout',
    'risograph',
    'meeting-recorder',
    'magnify-image',
  ],
  event: ['timetable', 'drum-roll', 'setlist-card', 'online-roulette'],
}

function sortByCategoryOrder(
  items: Array<CatalogItem>,
  categoryId: ToolCategoryId,
): Array<CatalogItem> {
  const order = ORDER_BY_CATEGORY[categoryId]
  const indexOf = (slug: string) => {
    const i = order.indexOf(slug)
    return i === -1 ? order.length : i
  }
  return items.toSorted((a, b) => indexOf(a.slug) - indexOf(b.slug))
}

/** 内部 + 外部を kind 付きでフラットに返す（カテゴリ順・カテゴリ内順） */
export function getCatalogItems(): Array<CatalogItem> {
  return getCatalogByCategory().flatMap((group) => group.items)
}

/** カテゴリ見出し付きでグループ化したカタログ */
export function getCatalogByCategory(): Array<{
  id: ToolCategoryId
  name: string
  items: Array<CatalogItem>
}> {
  const internal: Array<CatalogItem> = TOOL_META.map((tool) => ({
    ...tool,
    kind: 'internal' as const,
  }))
  const external: Array<CatalogItem> = EXTERNAL_TOOLS.map((tool) => ({
    ...tool,
    kind: 'external' as const,
  }))
  const all = [...internal, ...external]

  return TOOL_CATEGORIES.map((cat) => ({
    id: cat.id,
    name: cat.name,
    items: sortByCategoryOrder(
      all.filter((item) => item.category === cat.id),
      cat.id,
    ),
  })).filter((group) => group.items.length > 0)
}

/** ブラウザタブと OG で揃えるため、ツール名にサイト名を付けた形式に統一する */
export function toolPageTitle(name: string): string {
  return `${name} | かんちゅツールズ`
}

/** ホスト済み内部ツールのみ（EXTERNAL_TOOLS は対象外） */
export function getToolMeta(slug: string): ToolMeta | undefined {
  return TOOL_META.find((tool) => tool.slug === slug)
}

// ---------------------------------------------------------------------------
// ツール単体 PWA
//
// サイト全体の PWA (scope `/`) とは別に、ToolMeta.pwa を持つツールは
// /tools/<slug> を scope とする独立したアプリとしてインストールできる。
// manifest はビルド時に dist/manifests/<slug>.webmanifest として書き出し
// (scripts/vite-plugin-og-pages.ts)、<link rel="manifest"> などは
// 静的 HTML とランタイム (src/components/PwaHeadSync.tsx) の両方で差し替える。
// ---------------------------------------------------------------------------

export type PwaTool = ToolMeta & { pwa: ToolPwa }

/**
 * ツール単体アプリとして起動されたことを示すクエリ。manifest の start_url に
 * `?pwa=<slug>` として付け、src/main.tsx がルーター初期化前に読み取って消す。
 * display-mode: standalone だけでは「サイト全体のアプリから /tools/* を
 * 開いた」のと区別できないため、起動 URL に印を付けている。
 */
export const TOOL_APP_PARAM = 'pwa'

/** head の manifest / apple-touch-icon / apple-mobile-web-app-title の値 */
export type PwaHead = {
  manifestHref: string
  appleTouchIcon: string
  appleTitle: string
}

/**
 * サイト全体の PWA の値。index.html と VitePWA が注入する
 * <link rel="manifest"> に一致させる（site-meta.test.ts で index.html と照合）。
 * ツール HTML を直接開いた場合は head にツールの値が入っているので、
 * 「元に戻す」ときは DOM の初期値ではなくここを使う。
 */
export const ROOT_PWA_HEAD: PwaHead = {
  manifestHref: '/manifest.webmanifest',
  appleTouchIcon: '/assets/tainakanchu-avatar-192.png',
  appleTitle: siteName,
}

export function isPwaTool(tool: ToolMeta): tool is PwaTool {
  return tool.pwa !== undefined
}

export function getPwaTools(): Array<PwaTool> {
  return TOOL_META.filter(isPwaTool)
}

export function toolManifestPath(slug: string): string {
  return `/manifests/${slug}.webmanifest`
}

/**
 * アイコンのパス規約。scripts/generate-pwa-icons.ts が同じ規約で書き出す。
 * any（角丸・透過の縁つき）と maskable（全面塗り）を別画像にしているのは、
 * maskable を any として使うと、マスクしない環境（デスクトップの Chrome など）で
 * 角の立った四角がそのまま出てしまうため。apple-touch-icon は iOS が自前で
 * 角丸に切り抜き、透過部分は黒く塗られるので全面塗りの方を使う。
 */
export function toolPwaIconPaths(slug: string): {
  any192: string
  any512: string
  maskable192: string
  maskable512: string
  apple180: string
} {
  const base = `/assets/pwa/${slug}`
  return {
    any192: `${base}-192.png`,
    any512: `${base}-512.png`,
    maskable192: `${base}-maskable-192.png`,
    maskable512: `${base}-maskable-512.png`,
    apple180: `${base}-apple-180.png`,
  }
}

/** Web App Manifest のうちこのサイトで使うフィールドだけ */
export type WebAppManifest = {
  id: string
  name: string
  short_name: string
  description: string
  lang: string
  start_url: string
  scope: string
  display: 'standalone'
  theme_color: string
  background_color: string
  icons: Array<{
    src: string
    sizes: string
    type: 'image/png'
    purpose: 'any' | 'maskable'
  }>
}

/** ツール単体アプリの manifest */
export function buildToolManifest(tool: PwaTool): WebAppManifest {
  const icons = toolPwaIconPaths(tool.slug)
  return {
    // id を明示するのは、start_url に起動判定用のクエリを付けているため。
    // id を省くと start_url がアプリの識別子になり、クエリを変えただけで
    // 「別のアプリ」扱いになってしまう。一度公開したら変えないこと。
    id: tool.path,
    name: tool.name,
    short_name: tool.pwa.shortName,
    description: tool.description,
    lang: PWA_LANG,
    start_url: `${tool.path}?${TOOL_APP_PARAM}=${encodeURIComponent(tool.slug)}`,
    // 末尾スラッシュを付けない。アプリの URL は /tools/<slug>（スラッシュなし）
    // で、scope は前方一致なので、/tools/<slug>/ にすると自分自身が scope 外になる。
    scope: tool.path,
    display: 'standalone',
    theme_color: PWA_THEME_COLOR,
    background_color: PWA_BACKGROUND_COLOR,
    icons: [
      {
        src: icons.any192,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: icons.any512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: icons.maskable192,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: icons.maskable512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}

/**
 * pathname が属する内部ツール。/tools/<slug> とその配下だけを一致とし、
 * /tools/<slug>-foo のような前方一致の取り違えはしない。
 */
export function findToolByPathname(pathname: string): ToolMeta | undefined {
  return TOOL_META.find(
    (tool) => pathname === tool.path || pathname.startsWith(`${tool.path}/`),
  )
}

export function toolPwaHead(tool: PwaTool): PwaHead {
  return {
    manifestHref: toolManifestPath(tool.slug),
    appleTouchIcon: toolPwaIconPaths(tool.slug).apple180,
    appleTitle: tool.pwa.shortName,
  }
}

/** その pathname で head に出すべき PWA の値（PWA 非対応ツールやトップはサイト全体の値） */
export function getPwaHeadForPathname(pathname: string): PwaHead {
  const tool = findToolByPathname(pathname)
  return tool && isPwaTool(tool) ? toolPwaHead(tool) : ROOT_PWA_HEAD
}
