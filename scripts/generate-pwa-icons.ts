/**
 * ツール単体 PWA のアイコン (public/assets/pwa/<slug>-*.png) を生成する。
 * 実行要件: rsvg-convert（OG 画像と同じ。文字を描かないのでフォントは不要）。
 * `pnpm pwa:icons` で再生成。生成物はコミットする運用（OG 画像と同じく、
 * デプロイ環境に rsvg-convert の依存を持ち込まないためビルドには組み込まない）。
 *
 * 絵柄は OG カードの主役アイコンと同じ lucide アイコンを、ツールごとの色の
 * 背景に白で載せる。サイト全体のアプリ（アバター）や他のツールとホーム画面で
 * 見分けられるよう、背景色をツールごとに大きく変えている。
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPwaTools, toolPwaIconPaths } from '../src/lib/site-meta.ts'
import type { IconName } from './lucide-icons.ts'
import { hexPoints, iconGroup } from './lucide-icons.ts'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const PUBLIC_DIR = path.join(repoRoot, 'public')
const TMP_DIR = os.tmpdir()

/** 描画は 512 四方の座標で行い、書き出し時に各サイズへ縮める */
const CANVAS = 512

type IconDef = {
  icon: IconName
  /** 背景グラデーション（左上 → 右下） */
  from: string
  to: string
}

/**
 * ツールごとの絵柄。アイコンは OG カードの主役 (scene の先頭) に揃えている。
 * 色はアバター（シアン〜藍）と被らない系統から、ツール同士も離して選ぶ。
 * 白い線が細くても読めるよう、どれも明度を落とした色にしている。
 */
const ICON_DEFS: Record<string, IconDef> = {
  timetable: { icon: 'calendar-clock', from: '#7c3aed', to: '#c026d3' },
  'trip-notes': { icon: 'notebook-pen', from: '#10b981', to: '#047857' },
  'taiwan-map': { icon: 'map-pinned', from: '#f97316', to: '#e11d48' },
}

type Variant = {
  key: keyof ReturnType<typeof toolPwaIconPaths>
  size: number
  /**
   * maskable / apple は全面塗り。any は角丸の板を透過の上に置く。
   * maskable は OS が丸や角丸に切り抜くので、四隅まで塗っておかないと
   * 切り抜いた形の縁に透過の隙間が出る。
   */
  shape: 'fullBleed' | 'rounded'
  /** グリフ (24 四方の viewBox) を描く一辺。CANVAS に対する比率 */
  glyphRatio: number
}

/*
 * グリフの大きさの決め方:
 * - maskable は「中心から半径 40% の円」がセーフゾーン（W3C の仕様）。lucide の
 *   線は 24 四方の viewBox の 2〜22 に収まるので、viewBox の一辺を 56% にすると
 *   線の外接矩形は 47% 四方、その四隅でも中心から約 33% で円の内側に収まる。
 * - apple-touch-icon は iOS が角丸 (約 22%) に切るだけで丸くは切らないので、
 *   少し大きく 60% にする。
 * - any は板の内側に描くので、板の余白ぶん少し小さくする。
 */
const VARIANTS: ReadonlyArray<Variant> = [
  { key: 'any192', size: 192, shape: 'rounded', glyphRatio: 0.52 },
  { key: 'any512', size: 512, shape: 'rounded', glyphRatio: 0.52 },
  { key: 'maskable192', size: 192, shape: 'fullBleed', glyphRatio: 0.56 },
  { key: 'maskable512', size: 512, shape: 'fullBleed', glyphRatio: 0.56 },
  { key: 'apple180', size: 180, shape: 'fullBleed', glyphRatio: 0.6 },
]

/** any の板: 縁に 4% の透過を残し、角丸は板の一辺の約 22%（iOS / Android の角丸アイコンに近い） */
const ROUNDED_INSET = CANVAS * 0.04
const ROUNDED_RX = (CANVAS - ROUNDED_INSET * 2) * 0.22

function renderSvg(def: IconDef, variant: Variant): string {
  const isRounded = variant.shape === 'rounded'
  const plate = isRounded
    ? `x="${ROUNDED_INSET}" y="${ROUNDED_INSET}" width="${CANVAS - ROUNDED_INSET * 2}" height="${CANVAS - ROUNDED_INSET * 2}" rx="${ROUNDED_RX}"`
    : `x="0" y="0" width="${CANVAS}" height="${CANVAS}"`
  // OG カードと同じ flat-top 六角形を、右下の角から大きくはみ出す形で薄く敷く。
  // サイトの絵柄とのつながりを持たせつつ、主役のグリフは邪魔しない濃さにする。
  const hex = `<polygon points="${hexPoints(CANVAS * 0.96, CANVAS * 0.98, CANVAS * 0.36)}" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="${CANVAS * 0.03}"/>`
  const glyph = iconGroup({
    icon: def.icon,
    cx: CANVAS / 2,
    cy: CANVAS / 2,
    size: CANVAS * variant.glyphRatio,
    color: '#ffffff',
    // 192px や 180px に縮めても線が痩せすぎないよう、lucide 既定の 2 より少し太く
    strokeWidth: 2.25,
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${def.from}"/>
      <stop offset="100%" stop-color="${def.to}"/>
    </linearGradient>
    <clipPath id="plate"><rect ${plate}/></clipPath>
  </defs>
  <g clip-path="url(#plate)">
    <rect ${plate} fill="url(#bg)"/>
    ${hex}
  </g>
  ${glyph}
</svg>`
}

/**
 * pwa を有効にしたツールと ICON_DEFS が過不足なく対応しているか。
 * OG 画像の assertCardSlugs と違って双方向に見るのは、アイコンが欠けると
 * ビルドが止まる (vite-plugin-og-pages の assertPwaIconsExist) ため。
 */
function assertIconDefs(): void {
  const pwaSlugs = new Set(getPwaTools().map((tool) => tool.slug))
  for (const slug of pwaSlugs) {
    if (!(slug in ICON_DEFS)) {
      throw new Error(
        `PWA icon definition for "${slug}" is missing. Add it to ICON_DEFS in scripts/generate-pwa-icons.ts.`,
      )
    }
  }
  for (const slug of Object.keys(ICON_DEFS)) {
    if (!pwaSlugs.has(slug)) {
      throw new Error(
        `ICON_DEFS has "${slug}" but the tool does not enable pwa in TOOL_META.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
assertIconDefs()

for (const tool of getPwaTools()) {
  const def = ICON_DEFS[tool.slug]
  const paths = toolPwaIconPaths(tool.slug)
  for (const variant of VARIANTS) {
    const svg = renderSvg(def, variant)
    // 中間 SVG は OS の tmpdir に置き、リポジトリを汚さない
    const svgPath = path.join(TMP_DIR, `pwa-${tool.slug}-${variant.key}.svg`)
    const pngPath = path.join(PUBLIC_DIR, paths[variant.key])
    mkdirSync(path.dirname(pngPath), { recursive: true })
    writeFileSync(svgPath, svg, 'utf-8')
    execSync(
      `rsvg-convert -w ${variant.size} -h ${variant.size} "${svgPath}" -o "${pngPath}"`,
    )
    console.log(`generated ${pngPath}`)
  }
}
