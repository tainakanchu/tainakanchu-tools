import { describe, expect, it } from 'vitest'
import { applyToolOgMeta } from './vite-plugin-og-pages'
import type { PwaTool, ToolMeta } from '../src/lib/site-meta'

const sampleTool: ToolMeta = {
  slug: 'trip-notes',
  name: '旅のしおり',
  description:
    '予約の抜けを旅行前に潰し、旅行中は確認番号や集合時刻だけをすぐ取り出せる予約ダッシュボード。',
  path: '/tools/trip-notes',
  ogImagePath: '/assets/og/trip-notes.png',
  category: 'travel',
}

const template = `<!doctype html>
<html lang="ja">
  <head>
    <meta
      name="description"
      content="サイト共通の説明文です。"
    />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="かんちゅツールズ" />
    <meta
      property="og:description"
      content="サイト共通の OG 説明文です。"
    />
    <meta property="og:image" content="https://tools.tainakanchu.com/assets/og/site.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="かんちゅツールズ" />
    <meta property="og:url" content="https://tools.tainakanchu.com/" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="かんちゅツールズ" />
    <meta
      name="twitter:description"
      content="サイト共通の Twitter 説明文です。"
    />
    <meta name="twitter:image" content="https://tools.tainakanchu.com/assets/og/site.png" />
    <link rel="canonical" href="https://tools.tainakanchu.com/" />
    <link
      rel="apple-touch-icon"
      sizes="180x180"
      href="/assets/tainakanchu-avatar-192.png"
    />
    <meta name="apple-mobile-web-app-title" content="かんちゅツールズ" />
    <title>かんちゅツールズ | tainakanchu tools</title>
  <link rel="manifest" href="/manifest.webmanifest"></head>
  <body></body>
</html>
`

const samplePwaTool: PwaTool = {
  slug: 'timetable',
  name: 'マイタイムテーブル',
  description: 'フェスやイベントの自分用タイムテーブル。',
  path: '/tools/timetable',
  ogImagePath: '/assets/og/timetable.png',
  category: 'event',
  pwa: { shortName: 'タイムテーブル' },
}

describe('applyToolOgMeta', () => {
  it('ツール別の title / description / og / twitter / canonical を差し替える', () => {
    const result = applyToolOgMeta(template, sampleTool)

    expect(result).toContain('<title>旅のしおり | かんちゅツールズ</title>')
    expect(result).toContain(
      'content="予約の抜けを旅行前に潰し、旅行中は確認番号や集合時刻だけをすぐ取り出せる予約ダッシュボード。"',
    )
    expect(result).toContain(
      'property="og:title" content="旅のしおり | かんちゅツールズ"',
    )
    expect(result).toContain(
      'property="og:url" content="https://tools.tainakanchu.com/tools/trip-notes"',
    )
    expect(result).toContain(
      'name="twitter:title" content="旅のしおり | かんちゅツールズ"',
    )
    expect(result).toContain(
      'rel="canonical" href="https://tools.tainakanchu.com/tools/trip-notes"',
    )
    // ツール別 OG 画像と alt を差し替える（width/height は全カード共通で触らない）
    expect(result).toContain(
      'property="og:image" content="https://tools.tainakanchu.com/assets/og/trip-notes.png"',
    )
    expect(result).toContain(
      'name="twitter:image" content="https://tools.tainakanchu.com/assets/og/trip-notes.png"',
    )
    expect(result).toContain('property="og:image:alt" content="旅のしおり"')
    expect(result).toContain('property="og:image:width" content="1200"')
    expect(result).toContain('property="og:image:height" content="630"')
  })

  it('PWA 非対応ツールは manifest / apple-touch-icon / ホーム画面名をサイト全体のまま残す', () => {
    const result = applyToolOgMeta(template, sampleTool)

    expect(result).toContain(
      '<link rel="manifest" href="/manifest.webmanifest">',
    )
    expect(result).toContain('href="/assets/tainakanchu-avatar-192.png"')
    expect(result).toContain(
      'name="apple-mobile-web-app-title" content="かんちゅツールズ"',
    )
  })

  it('PWA 対応ツールは manifest / apple-touch-icon / ホーム画面名をツールの値に差し替える', () => {
    const result = applyToolOgMeta(template, samplePwaTool)

    // VitePWA が </head> 直前に注入する形のリンクも差し替えられる
    expect(result).toContain(
      '<link rel="manifest" href="/manifests/timetable.webmanifest">',
    )
    expect(result).toContain('href="/assets/pwa/timetable-apple-180.png"')
    expect(result).not.toContain('tainakanchu-avatar-192.png')
    expect(result).toContain(
      'name="apple-mobile-web-app-title" content="タイムテーブル"',
    )
    expect(result).not.toContain('/manifest.webmanifest"')
  })

  it('PWA 対応ツールで manifest のリンクが無い場合は throw する', () => {
    const noManifest = template.replace(
      '<link rel="manifest" href="/manifest.webmanifest">',
      '',
    )
    expect(() => applyToolOgMeta(noManifest, samplePwaTool)).toThrow(
      /Could not find <link rel="manifest">/,
    )
  })

  it('置換対象タグが無い場合は throw する', () => {
    const incomplete = `<html><head><title>x</title></head></html>`
    expect(() => applyToolOgMeta(incomplete, sampleTool)).toThrow(
      /Could not find/,
    )
  })

  it('title が無い場合も throw する', () => {
    const noTitle = template.replace(
      /<title>[^<]*<\/title>/i,
      '<!-- no title -->',
    )
    expect(() => applyToolOgMeta(noTitle, sampleTool)).toThrow(
      /Could not find <title>/,
    )
  })
})
