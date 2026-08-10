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
// Lucide path data（静的データ）
// extracted from lucide-react icons/{printer,id-card,ruler,map,train-front,puzzle,notebook-pen,ticket,clock,sparkles,drum,plane-landing,stamp,layers,palette}.
// viewBox 0 0 24 24、stroke ベース。シーンがパーツ単位で再色できるよう
// shapes を part ごとに分けている（例: sparkles の小ドット）。
// ---------------------------------------------------------------------------

type SvgAttrs = Record<string, string>
type SvgShape = readonly [tag: string, attrs: SvgAttrs]
type IconParts = Record<string, ReadonlyArray<SvgShape>>

const ICONS = {
  printer: {
    all: [
      [
        'path',
        {
          d: 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
        },
      ],
      ['path', { d: 'M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6' }],
      ['rect', { x: '6', y: '14', width: '12', height: '8', rx: '1' }],
    ],
  },
  'id-card': {
    all: [
      ['path', { d: 'M16 10h2' }],
      ['path', { d: 'M16 14h2' }],
      ['path', { d: 'M6.17 15a3 3 0 0 1 5.66 0' }],
      ['circle', { cx: '9', cy: '11', r: '2' }],
      ['rect', { x: '2', y: '5', width: '20', height: '14', rx: '2' }],
    ],
  },
  ruler: {
    all: [
      [
        'path',
        {
          d: 'M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z',
        },
      ],
      ['path', { d: 'm14.5 12.5 2-2' }],
      ['path', { d: 'm11.5 9.5 2-2' }],
      ['path', { d: 'm8.5 6.5 2-2' }],
      ['path', { d: 'm17.5 15.5 2-2' }],
    ],
  },
  drum: {
    all: [
      ['path', { d: 'm2 2 8 8' }],
      ['path', { d: 'm22 2-8 8' }],
      ['ellipse', { cx: '12', cy: '9', rx: '10', ry: '5' }],
      ['path', { d: 'M7 13.4v7.9' }],
      ['path', { d: 'M12 14v8' }],
      ['path', { d: 'M17 13.4v7.9' }],
      ['path', { d: 'M2 9v8a10 5 0 0 0 20 0V9' }],
    ],
  },
  sparkles: {
    main: [
      [
        'path',
        {
          d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
        },
      ],
      ['path', { d: 'M20 2v4' }],
      ['path', { d: 'M22 4h-4' }],
    ],
    accent: [['circle', { cx: '4', cy: '20', r: '2' }]],
  },
  map: {
    all: [
      [
        'path',
        {
          d: 'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z',
        },
      ],
      ['path', { d: 'M15 5.764v15' }],
      ['path', { d: 'M9 3.236v15' }],
    ],
  },
  'train-front': {
    all: [
      ['path', { d: 'M8 3.1V7a4 4 0 0 0 8 0V3.1' }],
      ['path', { d: 'm9 15-1-1' }],
      ['path', { d: 'm15 15 1-1' }],
      [
        'path',
        {
          d: 'M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z',
        },
      ],
      ['path', { d: 'm8 19-2 3' }],
      ['path', { d: 'm16 19 2 3' }],
    ],
  },
  puzzle: {
    all: [
      [
        'path',
        {
          d: 'M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z',
        },
      ],
    ],
  },
  'notebook-pen': {
    all: [
      [
        'path',
        {
          d: 'M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4',
        },
      ],
      ['path', { d: 'M2 6h4' }],
      ['path', { d: 'M2 10h4' }],
      ['path', { d: 'M2 14h4' }],
      ['path', { d: 'M2 18h4' }],
      [
        'path',
        {
          d: 'M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z',
        },
      ],
    ],
  },
  ticket: {
    all: [
      [
        'path',
        {
          d: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z',
        },
      ],
      ['path', { d: 'M13 5v2' }],
      ['path', { d: 'M13 17v2' }],
      ['path', { d: 'M13 11v2' }],
    ],
  },
  clock: {
    all: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['path', { d: 'M12 6v6l4 2' }],
    ],
  },
  'plane-landing': {
    all: [
      ['path', { d: 'M2 22h20' }],
      [
        'path',
        {
          d: 'M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z',
        },
      ],
    ],
  },
  stamp: {
    all: [
      [
        'path',
        { d: 'M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13' },
      ],
      [
        'path',
        {
          d: 'M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z',
        },
      ],
      ['path', { d: 'M5 22h14' }],
    ],
  },
  layers: {
    all: [
      [
        'path',
        {
          d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
        },
      ],
      [
        'path',
        {
          d: 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
        },
      ],
      [
        'path',
        {
          d: 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
        },
      ],
    ],
  },
  palette: {
    all: [
      [
        'path',
        {
          d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z',
        },
      ],
      ['circle', { cx: '13.5', cy: '6.5', r: '.5' }],
      ['circle', { cx: '17.5', cy: '10.5', r: '.5' }],
      ['circle', { cx: '6.5', cy: '12.5', r: '.5' }],
      ['circle', { cx: '8.5', cy: '7.5', r: '.5' }],
    ],
  },
} as const satisfies Record<string, IconParts>

type IconName = keyof typeof ICONS

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
// 描画ヘルパ
// ---------------------------------------------------------------------------

function renderShape([tag, attrs]: SvgShape): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  return `<${tag} ${attrStr}/>`
}

/**
 * Lucide アイコン (24x24 viewBox) を (cx, cy) 中心・指定ピクセルサイズで配置。
 * 回転も中心周り。
 */
function iconGroup(opts: {
  icon: IconName
  part?: string
  cx: number
  cy: number
  size: number
  rotate?: number
  color: string
  strokeWidth?: number
}): string {
  const {
    icon,
    part = 'all',
    cx,
    cy,
    size,
    rotate = 0,
    color,
    strokeWidth = 2,
  } = opts
  const iconDef = ICONS[icon] as IconParts
  // part はデータ定義由来の string。存在しない part を実行時に弾く
  if (!(part in iconDef)) {
    throw new Error(`Unknown icon part: ${icon}.${part}`)
  }
  const shapes = iconDef[part]
  const scale = size / 24
  const transform = `translate(${cx} ${cy}) rotate(${rotate}) scale(${scale}) translate(-12 -12)`
  const body = shapes.map(renderShape).join('')
  return `<g transform="${transform}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</g>`
}

/** flat-top 正六角形の点列 */
function hexPoints(cx: number, cy: number, r: number): string {
  const pts: Array<string> = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i)
    pts.push(
      `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`,
    )
  }
  return pts.join(' ')
}

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
