import { describe, expect, it } from 'vitest'
import { applyToolOgMeta } from './vite-plugin-og-pages'
import type { ToolMeta } from '../src/lib/site-meta'

const sampleTool: ToolMeta = {
  slug: 'trip-notes',
  name: '旅のしおり',
  description:
    '予約の抜けを旅行前に潰し、旅行中は確認番号や集合時刻だけをすぐ取り出せる予約ダッシュボード。',
  path: '/tools/trip-notes',
  ogImagePath: '/assets/og/trip-notes.png',
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
    <title>かんちゅツールズ | tainakanchu tools</title>
  </head>
  <body></body>
</html>
`

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
