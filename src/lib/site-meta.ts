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
  // イベント
  {
    slug: 'drum-roll',
    name: 'ドラムロール',
    description:
      'スペースキーを押している間ドラムロールが鳴り、放すとシンバル＋キックで「ジャーン！」と締まる演出ツール。',
    path: '/tools/drum-roll',
    ogImagePath: '/assets/og/drum-roll.png',
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
  travel: ['trip-scheduler', 'trip-notes', 'taiwan-arrival-card'],
  desk: ['actual-size-layout', 'risograph', 'magnify-image'],
  event: ['drum-roll', 'online-roulette'],
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
