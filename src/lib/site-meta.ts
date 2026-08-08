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

export type ToolMeta = {
  slug: string
  name: string
  description: string
  path: string
  /** public 配下の OG 画像パス（例: /assets/og/trip-notes.png） */
  ogImagePath: string
}

export const TOOL_META: ReadonlyArray<ToolMeta> = [
  {
    slug: 'actual-size-layout',
    name: '原寸レイアウトメーカー',
    description:
      '免許証やパスポートなどの書類画像を原寸大でA4に配置して印刷・PDF出力できるレイアウトツール。',
    path: '/tools/actual-size-layout',
    ogImagePath: '/assets/og/actual-size-layout.png',
  },
  {
    slug: 'trip-scheduler',
    name: '旅程パズル',
    description:
      'ヨーロッパ周遊の滞在日数・訪問順・移動手段を、泊数を配り切るパズルとして組み立てる新婚旅行プランナー。',
    path: '/tools/trip-scheduler',
    ogImagePath: '/assets/og/trip-scheduler.png',
  },
  {
    slug: 'trip-notes',
    name: '旅のしおり',
    description:
      '予約の抜けを旅行前に潰し、旅行中は確認番号や集合時刻だけをすぐ取り出せる予約ダッシュボード。',
    path: '/tools/trip-notes',
    ogImagePath: '/assets/og/trip-notes.png',
  },
  {
    slug: 'drum-roll',
    name: 'ドラムロール',
    description:
      'スペースキーを押している間ドラムロールが鳴り、放すとシンバル＋キックで「ジャーン！」と締まる演出ツール。',
    path: '/tools/drum-roll',
    ogImagePath: '/assets/og/drum-roll.png',
  },
  {
    slug: 'taiwan-arrival-card',
    name: '台湾入国カードメーカー',
    description:
      '台湾オンライン入国カード（TWAC）の一括アップロード用 Excel を、AI による航空券読み取りつきで同行者のぶんまでまとめて作成できるフォーム。',
    path: '/tools/taiwan-arrival-card',
    ogImagePath: '/assets/og/taiwan-arrival-card.png',
  },
]

/** ブラウザタブと OG で揃えるため、ツール名にサイト名を付けた形式に統一する */
export function toolPageTitle(name: string): string {
  return `${name} | かんちゅツールズ`
}

export function getToolMeta(slug: string): ToolMeta | undefined {
  return TOOL_META.find((tool) => tool.slug === slug)
}
