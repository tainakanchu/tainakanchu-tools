import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ROOT_PWA_HEAD,
  TOOL_APP_PARAM,
  TOOL_META,
  buildToolManifest,
  findToolByPathname,
  getPwaHeadForPathname,
  getPwaTools,
  getToolMeta,
  isPwaTool,
} from './site-meta'
import type { PwaTool } from './site-meta'

function pwaTool(slug: string): PwaTool {
  const tool = getToolMeta(slug)
  if (!tool || !isPwaTool(tool)) throw new Error(`${slug} is not a PWA tool`)
  return tool
}

describe('buildToolManifest', () => {
  it('ツールの URL を scope とする独立したアプリの manifest を作る', () => {
    const manifest = buildToolManifest(pwaTool('timetable'))

    expect(manifest).toMatchObject({
      id: '/tools/timetable',
      name: 'マイタイムテーブル',
      short_name: 'タイムテーブル',
      start_url: `/tools/timetable?${TOOL_APP_PARAM}=timetable`,
      // 末尾スラッシュなし（アプリの URL 自身が scope に入るように）
      scope: '/tools/timetable',
      display: 'standalone',
      lang: 'ja-JP',
    })
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true)
    expect(manifest.icons).toEqual([
      expect.objectContaining({
        src: '/assets/pwa/timetable-192.png',
        sizes: '192x192',
        purpose: 'any',
      }),
      expect.objectContaining({
        src: '/assets/pwa/timetable-512.png',
        sizes: '512x512',
        purpose: 'any',
      }),
      expect.objectContaining({
        src: '/assets/pwa/timetable-maskable-192.png',
        sizes: '192x192',
        purpose: 'maskable',
      }),
      expect.objectContaining({
        src: '/assets/pwa/timetable-maskable-512.png',
        sizes: '512x512',
        purpose: 'maskable',
      }),
    ])
  })

  it('PWA 対応ツールごとに id が重ならない', () => {
    const ids = getPwaTools().map((tool) => buildToolManifest(tool).id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('/')
  })
})

describe('findToolByPathname', () => {
  it('ツールの URL とその配下だけを一致とする', () => {
    expect(findToolByPathname('/tools/timetable')?.slug).toBe('timetable')
    expect(findToolByPathname('/tools/timetable/')?.slug).toBe('timetable')
    expect(findToolByPathname('/tools/timetable/x')?.slug).toBe('timetable')
    expect(findToolByPathname('/tools/timetablex')).toBeUndefined()
    expect(findToolByPathname('/')).toBeUndefined()
  })
})

describe('getPwaHeadForPathname', () => {
  it('PWA 対応ツールではツールの manifest / アイコン / 名前を返す', () => {
    expect(getPwaHeadForPathname('/tools/trip-notes')).toEqual({
      manifestHref: '/manifests/trip-notes.webmanifest',
      appleTouchIcon: '/assets/pwa/trip-notes-apple-180.png',
      appleTitle: '旅のしおり',
    })
  })

  it('トップや PWA 非対応ツールではサイト全体の値に戻す', () => {
    expect(getPwaHeadForPathname('/')).toEqual(ROOT_PWA_HEAD)
    expect(getPwaHeadForPathname('/tools/drum-roll')).toEqual(ROOT_PWA_HEAD)
  })
})

describe('ROOT_PWA_HEAD', () => {
  // 「元に戻す」先の値が index.html とずれると、ツールから戻ったときに
  // サイト全体のアプリのアイコンや名前が変わってしまう
  it('index.html の apple-touch-icon / apple-mobile-web-app-title と一致する', () => {
    const indexHtml = readFileSync(
      new URL('../../index.html', import.meta.url),
      'utf-8',
    )
    expect(indexHtml).toMatch(
      new RegExp(
        `rel="apple-touch-icon"[^>]*href="${ROOT_PWA_HEAD.appleTouchIcon}"`,
      ),
    )
    expect(indexHtml).toContain(
      `name="apple-mobile-web-app-title" content="${ROOT_PWA_HEAD.appleTitle}"`,
    )
  })
})

describe('TOOL_META の pwa 設定', () => {
  it('初期対象の 3 ツールで有効になっている', () => {
    expect(
      TOOL_META.filter(isPwaTool)
        .map((tool) => tool.slug)
        .toSorted(),
    ).toEqual(['taiwan-map', 'timetable', 'trip-notes'])
  })
})
