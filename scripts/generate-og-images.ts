/**
 * OG カード画像を生成する。
 * 実行要件: rsvg-convert（nix で導入済み）と fontconfig の Noto Sans CJK JP が必要。
 * `pnpm og:images` で再生成。生成物はコミットする運用（ビルドには組み込まない。
 * 理由: デプロイ環境に rsvg-convert とフォントの依存を持ち込まないため）。
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SITE_ORIGIN, TOOL_META, siteName } from '../src/lib/site-meta.ts'
import type { IconName } from './lucide-icons.ts'
import { hexPoints, iconGroup } from './lucide-icons.ts'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const AVATAR_PATH = path.join(
  repoRoot,
  'public/assets/tainakanchu-avatar-512.png',
)
const OUT_DIR = path.join(repoRoot, 'public/assets/og')
const TMP_DIR = os.tmpdir()

const WIDTH = 1200
const HEIGHT = 630

const FONT_TITLE = "'Noto Sans CJK JP'"
const FONT_MONO = "'Noto Sans Mono CJK JP', 'Noto Sans CJK JP'"

// ---------------------------------------------------------------------------
// パレット: main / sub(teal) / accent(rose)。シーン配置の color キーに対応。
// ---------------------------------------------------------------------------
const PALETTE = {
  main: '#0f172a',
  sub: '#0891b2',
  accent: '#f43f5e',
} as const

type PaletteKey = keyof typeof PALETTE

// ---------------------------------------------------------------------------
// ダーク専用トークン（ライト版は運用しない）
// ---------------------------------------------------------------------------
const DARK = {
  bg: {
    base: '#0f172a',
    radial: '#1e293b',
  },
  titleFill: '#f8fafc',
  eyebrowFill: '#cbd5e1',
  domainFill: '#94a3b8',
  hexStroke: '#22d3ee',
  hexStrokeOpacity: 0.22,
  hexFillSmall: '#22d3ee',
  hexFillSmallOpacity: 0.16,
  cardStroke: '#22d3ee',
} as const

// ---------------------------------------------------------------------------
// 背景装飾: flat-top 六角形（上下端からはみ出す配置）
// ---------------------------------------------------------------------------
const HEXAGONS = [
  { cx: 640, cy: 40, r: 180, mode: 'stroke' as const },
  { cx: 185, cy: 555, r: 110, mode: 'stroke' as const },
  { cx: 600, cy: 150, r: 34, mode: 'fill' as const },
]

// ---------------------------------------------------------------------------
// ツールカード共通レイアウト
// ---------------------------------------------------------------------------
const CARD = { cx: 940, cy: 315, size: 400, rx: 48, rotate: -4 }

// ---------------------------------------------------------------------------
// シーン定義（プレゼンテーション用。改行位置やアイコン配置はここだけがソース）
// ---------------------------------------------------------------------------

type IconPlacement = {
  type?: undefined
  icon: IconName
  part: string
  cx: number
  cy: number
  size: number
  rotate: number
  color: PaletteKey
}

type AvatarSquarePlacement = {
  type: 'avatarSquare'
  cx: number
  cy: number
  size: number
  rx: number
}

type ScenePlacement = IconPlacement | AvatarSquarePlacement

type TitleLine = { text: string; y: number }

type CardDef = {
  /** TOOL_META の slug と一致。特別枠の `site` のみ例外 */
  slug: string
  titleFontSize: number
  titleLines: ReadonlyArray<TitleLine>
  scene: ReadonlyArray<ScenePlacement>
  eyebrowText?: string
  eyebrowFontFamily?: string
  /** 既定 true。site カードはカード内アバターと二重にならないよう false */
  showEyebrowAvatar?: boolean
}

const CARDS: ReadonlyArray<CardDef> = [
  {
    slug: 'actual-size-layout',
    titleFontSize: 84,
    titleLines: [
      { text: '原寸レイアウト', y: 300 },
      { text: 'メーカー', y: 408 },
    ],
    // 配列順に描画: 先の要素が下に来る
    scene: [
      {
        icon: 'printer',
        part: 'all',
        cx: 940,
        cy: 295,
        size: 190,
        rotate: 0,
        color: 'main',
      },
      {
        icon: 'id-card',
        part: 'all',
        cx: 1035,
        cy: 425,
        size: 110,
        rotate: -8,
        color: 'sub',
      },
      {
        icon: 'ruler',
        part: 'all',
        cx: 825,
        cy: 195,
        size: 70,
        rotate: -18,
        color: 'accent',
      },
    ],
  },
  {
    slug: 'risograph',
    titleFontSize: 84,
    titleLines: [
      { text: 'リソ風分版', y: 300 },
      { text: 'メーカー', y: 408 },
    ],
    scene: [
      {
        icon: 'layers',
        part: 'all',
        cx: 940,
        cy: 300,
        size: 195,
        rotate: 0,
        color: 'main',
      },
      {
        icon: 'palette',
        part: 'all',
        cx: 1030,
        cy: 420,
        size: 105,
        rotate: -9,
        color: 'sub',
      },
      {
        icon: 'stamp',
        part: 'all',
        cx: 828,
        cy: 195,
        size: 72,
        rotate: 0,
        color: 'accent',
      },
    ],
  },
  {
    slug: 'meeting-recorder',
    titleFontSize: 84,
    titleLines: [
      { text: 'Web会議', y: 300 },
      { text: 'レコーダー', y: 408 },
    ],
    scene: [
      {
        icon: 'mic',
        part: 'all',
        cx: 940,
        cy: 300,
        size: 195,
        rotate: 0,
        color: 'main',
      },
      {
        icon: 'headphones',
        part: 'all',
        cx: 1030,
        cy: 420,
        size: 105,
        rotate: -9,
        color: 'sub',
      },
      {
        icon: 'audio-lines',
        part: 'all',
        cx: 828,
        cy: 195,
        size: 76,
        rotate: 0,
        color: 'accent',
      },
    ],
  },
  {
    slug: 'timetable',
    titleFontSize: 84,
    titleLines: [
      { text: 'マイ', y: 300 },
      { text: 'タイムテーブル', y: 408 },
    ],
    scene: [
      {
        icon: 'calendar-clock',
        part: 'all',
        cx: 940,
        cy: 300,
        size: 195,
        rotate: 0,
        color: 'main',
      },
      {
        icon: 'ticket',
        part: 'all',
        cx: 1030,
        cy: 420,
        size: 100,
        rotate: -10,
        color: 'sub',
      },
      {
        icon: 'music',
        part: 'all',
        cx: 828,
        cy: 195,
        size: 72,
        rotate: 0,
        color: 'accent',
      },
    ],
  },
  {
    slug: 'drum-roll',
    titleFontSize: 96,
    titleLines: [{ text: 'ドラムロール', y: 330 }],
    scene: [
      {
        icon: 'drum',
        part: 'all',
        cx: 940,
        cy: 305,
        size: 200,
        rotate: 0,
        color: 'main',
      },
      {
        icon: 'sparkles',
        part: 'main',
        cx: 1055,
        cy: 185,
        size: 80,
        rotate: 0,
        color: 'sub',
      },
      {
        icon: 'sparkles',
        part: 'accent',
        cx: 1055,
        cy: 185,
        size: 80,
        rotate: 0,
        color: 'accent',
      },
    ],
  },
  {
    slug: 'setlist-card',
    titleFontSize: 84,
    titleLines: [
      { text: 'セトリ画像', y: 300 },
      { text: 'メーカー', y: 408 },
    ],
    scene: [
      {
        icon: 'disc-3',
        part: 'all',
        cx: 940,
        cy: 300,
        size: 195,
        rotate: 0,
        color: 'main',
      },
      {
        icon: 'image',
        part: 'all',
        cx: 1030,
        cy: 420,
        size: 105,
        rotate: -9,
        color: 'sub',
      },
      {
        icon: 'list-music',
        part: 'all',
        cx: 828,
        cy: 195,
        size: 76,
        rotate: 0,
        color: 'accent',
      },
    ],
  },
  {
    slug: 'trip-scheduler',
    titleFontSize: 96,
    titleLines: [{ text: '旅程パズル', y: 330 }],
    scene: [
      {
        icon: 'map',
        part: 'all',
        cx: 940,
        cy: 305,
        size: 190,
        rotate: 0,
        color: 'main',
      },
      {
        icon: 'train-front',
        part: 'all',
        cx: 1030,
        cy: 420,
        size: 100,
        rotate: -10,
        color: 'sub',
      },
      {
        icon: 'puzzle',
        part: 'all',
        cx: 830,
        cy: 195,
        size: 80,
        rotate: -15,
        color: 'accent',
      },
    ],
  },
  {
    slug: 'trip-notes',
    titleFontSize: 96,
    titleLines: [{ text: '旅のしおり', y: 330 }],
    scene: [
      {
        icon: 'notebook-pen',
        part: 'all',
        cx: 940,
        cy: 305,
        size: 190,
        rotate: 0,
        color: 'main',
      },
      {
        icon: 'ticket',
        part: 'all',
        cx: 1030,
        cy: 420,
        size: 100,
        rotate: -10,
        color: 'sub',
      },
      {
        icon: 'clock',
        part: 'all',
        cx: 830,
        cy: 195,
        size: 70,
        rotate: 0,
        color: 'accent',
      },
    ],
  },
  {
    slug: 'taiwan-arrival-card',
    titleFontSize: 84,
    titleLines: [
      { text: '台湾入国カード', y: 300 },
      { text: 'メーカー', y: 408 },
    ],
    scene: [
      {
        icon: 'plane-landing',
        part: 'all',
        cx: 940,
        cy: 305,
        size: 190,
        rotate: 0,
        color: 'main',
      },
      {
        icon: 'id-card',
        part: 'all',
        cx: 1030,
        cy: 420,
        size: 100,
        rotate: -10,
        color: 'sub',
      },
      {
        icon: 'stamp',
        part: 'all',
        cx: 828,
        cy: 195,
        size: 72,
        rotate: 0,
        color: 'accent',
      },
    ],
  },
  {
    slug: 'taiwan-map',
    titleFontSize: 84,
    titleLines: [
      { text: 'かんちゅの', y: 300 },
      { text: '台湾マップ', y: 408 },
    ],
    scene: [
      {
        icon: 'map-pinned',
        part: 'all',
        cx: 940,
        cy: 305,
        size: 190,
        rotate: 0,
        color: 'main',
      },
      {
        icon: 'coffee',
        part: 'all',
        // 地図ピンの台座が横に広いので、既定位置 (1030, 420) より少し外へ逃がす
        cx: 1048,
        cy: 438,
        size: 100,
        rotate: -8,
        color: 'sub',
      },
      {
        icon: 'heart',
        part: 'all',
        cx: 828,
        cy: 195,
        size: 72,
        rotate: 0,
        color: 'accent',
      },
    ],
  },
  {
    // トップ用サイトカード: ツールアイコンではなくアバター角丸を中央に
    slug: 'site',
    // かな 8 文字を 84/96px にするとカードに食い込むため少し落とす
    titleFontSize: 78,
    titleLines: [{ text: siteName, y: 330 }],
    eyebrowText: 'tainakanchu tools',
    eyebrowFontFamily: FONT_MONO,
    // カード内の大きなアバターと二重表示にしない
    showEyebrowAvatar: false,
    scene: [
      { type: 'avatarSquare', cx: 940, cy: 315, size: 240, rx: 64 },
      {
        icon: 'sparkles',
        part: 'main',
        cx: 1070,
        cy: 155,
        size: 76,
        rotate: 0,
        color: 'sub',
      },
      {
        icon: 'sparkles',
        part: 'accent',
        cx: 1070,
        cy: 155,
        size: 76,
        rotate: 0,
        color: 'accent',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// 描画ヘルパ（lucide アイコン・六角形の描画は lucide-icons.ts と共有）
// ---------------------------------------------------------------------------

function renderHexagons(): string {
  return HEXAGONS.map((h) => {
    const points = hexPoints(h.cx, h.cy, h.r)
    if (h.mode === 'stroke') {
      return `<polygon points="${points}" fill="none" stroke="${DARK.hexStroke}" stroke-opacity="${DARK.hexStrokeOpacity}" stroke-width="3"/>`
    }
    return `<polygon points="${points}" fill="${DARK.hexFillSmall}" fill-opacity="${DARK.hexFillSmallOpacity}"/>`
  }).join('')
}

function renderBackground(): string {
  return `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${DARK.bg.base}"/><rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#bgRadial)"/>`
}

function renderBackgroundDefs(): string {
  return `<radialGradient id="bgRadial" cx="0%" cy="0%" r="75%">
    <stop offset="0%" stop-color="${DARK.bg.radial}" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="${DARK.bg.radial}" stop-opacity="0"/>
  </radialGradient>`
}

function renderCard(): string {
  const { cx, cy, size, rx, rotate } = CARD
  const x = cx - size / 2
  const y = cy - size / 2
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" fill="#ffffff" stroke="${DARK.cardStroke}" stroke-width="3" filter="url(#cardShadow)" transform="rotate(${rotate} ${cx} ${cy})"/>`
}

/** site カード用: アバターを角丸正方形で切り抜く */
function avatarSquareGroup(opts: {
  cx: number
  cy: number
  size: number
  rx: number
  avatarBase64: string
  strokeColor: string
}): string {
  const { cx, cy, size, rx, avatarBase64, strokeColor } = opts
  const x = cx - size / 2
  const y = cy - size / 2
  const clipId = `avatarSquareClip-${cx}-${cy}-${size}`
  return `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}"/></clipPath>
  <image href="data:image/png;base64,${avatarBase64}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>
  <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" fill="none" stroke="${strokeColor}" stroke-width="4"/>`
}

function renderScene(card: CardDef, avatarBase64: string): string {
  const parts = card.scene
    .map((placement) => {
      if (placement.type === 'avatarSquare') {
        return avatarSquareGroup({
          ...placement,
          avatarBase64,
          strokeColor: DARK.cardStroke,
        })
      }
      return iconGroup({
        ...placement,
        color: PALETTE[placement.color],
      })
    })
    .join('')
  // アイコンをカードと同じ回転に載せ、カードに「貼り付いて」見えるようにする
  return `<g transform="rotate(${CARD.rotate} ${CARD.cx} ${CARD.cy})">${parts}</g>`
}

function renderTitle(card: CardDef): string {
  const tspans = card.titleLines
    .map((line) => `<tspan x="88" y="${line.y}">${line.text}</tspan>`)
    .join('')
  return `<text font-family="${FONT_TITLE}" font-weight="900" font-size="${card.titleFontSize}" fill="${DARK.titleFill}">${tspans}</text>`
}

function renderSvg(card: CardDef, avatarBase64: string): string {
  const showEyebrowAvatar = card.showEyebrowAvatar ?? true
  const eyebrowText = card.eyebrowText ?? siteName
  const eyebrowFontFamily = card.eyebrowFontFamily ?? FONT_TITLE
  // アバター表示時はアバター右端から、非表示時はタイトルと同じ左マージン
  const eyebrowTextX = showEyebrowAvatar ? 166 : 90

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    ${renderBackgroundDefs()}
    <clipPath id="avatarClip"><circle cx="118" cy="88" r="30"/></clipPath>
    <filter id="cardShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.15"/>
    </filter>
  </defs>

  ${renderBackground()}
  ${renderHexagons()}

  <!-- Eyebrow: avatar + brand name -->
  ${showEyebrowAvatar ? `<image href="data:image/png;base64,${avatarBase64}" x="88" y="58" width="60" height="60" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>` : ''}
  <text x="${eyebrowTextX}" y="97" font-family="${eyebrowFontFamily}" font-weight="700" font-size="27" letter-spacing="2px" fill="${DARK.eyebrowFill}">${eyebrowText}</text>

  <!-- Title -->
  ${renderTitle(card)}

  <!-- Domain -->
  <text x="90" y="562" font-family="${FONT_MONO}" font-size="23" letter-spacing="1px" fill="${DARK.domainFill}">${new URL(SITE_ORIGIN).host}</text>

  <!-- Tool card signature -->
  ${renderCard()}
  ${renderScene(card, avatarBase64)}
</svg>`
}

function assertCardSlugs(): void {
  const toolSlugs = new Set(TOOL_META.map((t) => t.slug))
  for (const card of CARDS) {
    if (card.slug === 'site') continue
    if (!toolSlugs.has(card.slug)) {
      throw new Error(
        `OG card slug "${card.slug}" is not in TOOL_META. Add the tool to site-meta or fix the scene definition.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
assertCardSlugs()
mkdirSync(OUT_DIR, { recursive: true })

const avatarBase64 = readFileSync(AVATAR_PATH).toString('base64')

for (const card of CARDS) {
  const svg = renderSvg(card, avatarBase64)
  // 中間 SVG は OS の tmpdir に置き、リポジトリを汚さない
  const svgPath = path.join(TMP_DIR, `og-${card.slug}.svg`)
  const pngPath = path.join(OUT_DIR, `${card.slug}.png`)
  writeFileSync(svgPath, svg, 'utf-8')
  execSync(`rsvg-convert -w ${WIDTH} -h ${HEIGHT} "${svgPath}" -o "${pngPath}"`)
  console.log(`generated ${pngPath}`)
}
