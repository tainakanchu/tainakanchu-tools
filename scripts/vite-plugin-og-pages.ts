/**
 * ビルド後にツール別の静的 HTML を dist/tools/<slug>.html として生成する。
 * SNS クローラは JS を実行しないため、SPA の head() だけでは各ツールの
 * OG が取れない。ビルド成果物として HTML を複製してメタだけ差し替える。
 *
 * ToolMeta.pwa を持つツールは、ツール単体 PWA の manifest を
 * dist/manifests/<slug>.webmanifest として書き出し、静的 HTML の
 * <link rel="manifest"> などもそのツールの値に差し替える。
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import type { PwaTool, ToolMeta } from '../src/lib/site-meta'
import {
  SITE_ORIGIN,
  TOOL_META,
  buildToolManifest,
  getPwaTools,
  isPwaTool,
  toolManifestPath,
  toolPageTitle,
  toolPwaHead,
  toolPwaIconPaths,
} from '../src/lib/site-meta'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * name / property / rel をキーに content または href を差し替える。
 * 現在の content 文字列一致に依存しないのは、トップの文言が変わっても
 * ツール HTML 生成が壊れないようにするため。
 */
function replaceByAttr(
  html: string,
  tagName: 'meta' | 'link',
  keyAttr: 'name' | 'property' | 'rel',
  keyValue: string,
  valueAttr: 'content' | 'href',
  newValue: string,
): string {
  // 属性値内の > を誤ってタグ終端と見ないよう、引用符で囲まれた部分をまとめて進める
  const tagRe = new RegExp(`<${tagName}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi')
  const keyRe = new RegExp(
    `\\b${keyAttr}\\s*=\\s*(["'])${escapeRegExp(keyValue)}\\1`,
    'i',
  )
  const valueRe = new RegExp(
    `(\\b${valueAttr}\\s*=\\s*)(["'])(?:(?!\\2)[\\s\\S])*\\2`,
    'i',
  )

  // replace コールバック内のフラグ更新は制御フロー解析が追えないため、
  // 先に対象タグを見つけてから文字列を組み立てる。
  let targetTag: string | undefined
  let targetIndex: number | undefined
  for (const match of html.matchAll(tagRe)) {
    const tag = match[0]
    if (!keyRe.test(tag)) continue
    targetTag = tag
    targetIndex = match.index
    break
  }

  if (targetTag === undefined || targetIndex === undefined) {
    throw new Error(
      `Could not find <${tagName} ${keyAttr}="${keyValue}"> to replace ${valueAttr}`,
    )
  }

  if (!valueRe.test(targetTag)) {
    throw new Error(
      `Found <${tagName} ${keyAttr}="${keyValue}"> but missing ${valueAttr}`,
    )
  }

  const newTag = targetTag.replace(
    valueRe,
    (_match, prefix: string, quote: string) =>
      `${prefix}${quote}${newValue}${quote}`,
  )
  return (
    html.slice(0, targetIndex) +
    newTag +
    html.slice(targetIndex + targetTag.length)
  )
}

function replaceTitle(html: string, title: string): string {
  const re = /<title>[^<]*<\/title>/i
  if (!re.test(html)) {
    throw new Error('Could not find <title> to replace')
  }
  return html.replace(re, `<title>${title}</title>`)
}

/** テンプレート HTML にツール別 OG メタを流し込んだ結果を返す（テストからも利用） */
export function applyToolOgMeta(html: string, tool: ToolMeta): string {
  const title = toolPageTitle(tool.name)
  const url = `${SITE_ORIGIN}${tool.path}`
  const { description } = tool

  let result = html
  result = replaceTitle(result, title)
  result = replaceByAttr(
    result,
    'meta',
    'name',
    'description',
    'content',
    description,
  )
  result = replaceByAttr(
    result,
    'meta',
    'property',
    'og:title',
    'content',
    title,
  )
  result = replaceByAttr(
    result,
    'meta',
    'property',
    'og:description',
    'content',
    description,
  )
  result = replaceByAttr(result, 'meta', 'property', 'og:url', 'content', url)
  result = replaceByAttr(
    result,
    'meta',
    'name',
    'twitter:title',
    'content',
    title,
  )
  result = replaceByAttr(
    result,
    'meta',
    'name',
    'twitter:description',
    'content',
    description,
  )
  // ツール別 OG 画像。width/height は全カード 1200x630 固定なので触らない。
  const imageUrl = `${SITE_ORIGIN}${tool.ogImagePath}`
  result = replaceByAttr(
    result,
    'meta',
    'property',
    'og:image',
    'content',
    imageUrl,
  )
  result = replaceByAttr(
    result,
    'meta',
    'name',
    'twitter:image',
    'content',
    imageUrl,
  )
  result = replaceByAttr(
    result,
    'meta',
    'property',
    'og:image:alt',
    'content',
    tool.name,
  )
  result = replaceByAttr(result, 'link', 'rel', 'canonical', 'href', url)
  if (isPwaTool(tool)) {
    result = applyToolPwaMeta(result, tool)
  }
  return result
}

/**
 * ツール単体 PWA 用に manifest / apple-touch-icon / ホーム画面の名前を差し替える。
 * SW がまだ無い初回訪問（=インストールしようとしている最初の 1 回）はこの静的
 * HTML が返るので、ここで差し替えておけばブラウザはツールの manifest を読む。
 * SW が入った後は navigateFallback で /index.html が返るため、同じ差し替えを
 * src/components/PwaHeadSync.tsx がランタイムでも行う。
 */
export function applyToolPwaMeta(html: string, tool: PwaTool): string {
  const head = toolPwaHead(tool)
  let result = html
  result = replaceByAttr(
    result,
    'link',
    'rel',
    'manifest',
    'href',
    head.manifestHref,
  )
  result = replaceByAttr(
    result,
    'link',
    'rel',
    'apple-touch-icon',
    'href',
    head.appleTouchIcon,
  )
  result = replaceByAttr(
    result,
    'meta',
    'name',
    'apple-mobile-web-app-title',
    'content',
    head.appleTitle,
  )
  return result
}

/**
 * manifest が指すアイコンが dist に揃っているか確かめる。
 * pwa を有効にしたのに `pnpm pwa:icons` を忘れると、インストール時に
 * アイコンが 404 になって「インストールできない」になるので、ビルドで止める。
 */
async function assertPwaIconsExist(outDir: string, tool: PwaTool) {
  for (const iconPath of Object.values(toolPwaIconPaths(tool.slug))) {
    try {
      await access(path.join(outDir, iconPath))
    } catch {
      throw new Error(
        `PWA icon ${iconPath} for "${tool.slug}" is missing. Run \`pnpm pwa:icons\` and commit public/assets/pwa/.`,
      )
    }
  }
}

export function ogPagesPlugin(): Plugin {
  let outDir = 'dist'

  return {
    name: 'vite-plugin-og-pages',
    apply: 'build',
    configResolved(config) {
      // build.outDir は相対のことがあるので config.root 基準で絶対パス化しておく。
      // closeBundle 時の path.resolve(outDir) は process.cwd() 基準になり誤る。
      outDir = path.resolve(config.root, config.build.outDir)
    },
    // order: 'post' で VitePWA の closeBundle（precache 確定）より後に回す。
    // 先に tools/*.html を書くと workbox の glob に拾われて SW precache に
    // 載ってしまうが、ツール URL 直開きは navigateFallback で足りるので載せない。
    closeBundle: {
      sequential: true,
      order: 'post',
      async handler() {
        const indexPath = path.join(outDir, 'index.html')
        const template = await readFile(indexPath, 'utf-8')
        const toolsDir = path.join(outDir, 'tools')
        await mkdir(toolsDir, { recursive: true })

        for (const tool of TOOL_META) {
          const html = applyToolOgMeta(template, tool)
          // dist/tools/<slug>.html 形式にする理由:
          // Cloudflare assets の html_handling（auto-trailing-slash）は拡張子なし
          // URL `/tools/<slug>` を `<slug>.html` にリダイレクトなしで解決する。
          // `<slug>/index.html` 形式だと trailing slash への 307 が挟まる。
          await writeFile(
            path.join(toolsDir, `${tool.slug}.html`),
            html,
            'utf-8',
          )
        }

        // ツール単体 PWA の manifest。VitePWA のサイト全体用 manifest と同じく
        // precache には載せない（インストールはオンライン時にしか起きない）。
        // ここは VitePWA の closeBundle より後なので、そもそも glob にも拾われない。
        const pwaTools = getPwaTools()
        if (pwaTools.length > 0) {
          await mkdir(path.join(outDir, 'manifests'), { recursive: true })
        }
        for (const tool of pwaTools) {
          await assertPwaIconsExist(outDir, tool)
          await writeFile(
            path.join(outDir, toolManifestPath(tool.slug)),
            JSON.stringify(buildToolManifest(tool)),
            'utf-8',
          )
        }
      },
    },
  }
}
