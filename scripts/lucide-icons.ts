/**
 * OG カード画像 (generate-og-images.ts) と PWA アイコン (generate-pwa-icons.ts)
 * で共有する lucide アイコンの path データと SVG 描画ヘルパ。
 * 両スクリプトで同じ絵柄を使うため、path データを二重に持たないよう切り出している。
 * lucide-react をランタイムで読まないのは、Node から直接 SVG 文字列を組み立てたい
 * （React を描画する仕組みをスクリプトに持ち込まない）ため。
 */

// ---------------------------------------------------------------------------
// Lucide path data（静的データ）
// extracted from lucide-react icons/{printer,id-card,ruler,map,train-front,puzzle,notebook-pen,ticket,clock,sparkles,drum,plane-landing,stamp,layers,palette,map-pinned,coffee,heart,calendar-clock,music,mic,headphones,audio-lines,disc-3,list-music,image}.
// viewBox 0 0 24 24、stroke ベース。シーンがパーツ単位で再色できるよう
// shapes を part ごとに分けている（例: sparkles の小ドット）。
// ---------------------------------------------------------------------------

export type SvgAttrs = Record<string, string>
export type SvgShape = readonly [tag: string, attrs: SvgAttrs]
export type IconParts = Record<string, ReadonlyArray<SvgShape>>

export const ICONS = {
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
  'map-pinned': {
    all: [
      [
        'path',
        {
          d: 'M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0',
        },
      ],
      ['circle', { cx: '12', cy: '8', r: '2' }],
      [
        'path',
        {
          d: 'M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712',
        },
      ],
    ],
  },
  coffee: {
    all: [
      ['path', { d: 'M10 2v2' }],
      ['path', { d: 'M14 2v2' }],
      [
        'path',
        {
          d: 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1',
        },
      ],
      ['path', { d: 'M6 2v2' }],
    ],
  },
  heart: {
    all: [
      [
        'path',
        {
          d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5',
        },
      ],
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
  'calendar-clock': {
    all: [
      ['path', { d: 'M16 14v2.2l1.6 1' }],
      ['path', { d: 'M16 2v3' }],
      [
        'path',
        { d: 'M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338' },
      ],
      ['path', { d: 'M3 9h5.859' }],
      ['path', { d: 'M8 2v3' }],
      ['circle', { cx: '16', cy: '16', r: '6' }],
    ],
  },
  music: {
    all: [
      ['path', { d: 'M9 18V5l12-2v13' }],
      ['circle', { cx: '6', cy: '18', r: '3' }],
      ['circle', { cx: '18', cy: '16', r: '3' }],
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
  mic: {
    all: [
      ['path', { d: 'M12 19v3' }],
      ['path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }],
      ['rect', { x: '9', y: '2', width: '6', height: '13', rx: '3' }],
    ],
  },
  headphones: {
    all: [
      [
        'path',
        {
          d: 'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3',
        },
      ],
    ],
  },
  'audio-lines': {
    all: [
      ['path', { d: 'M2 10v3' }],
      ['path', { d: 'M6 6v11' }],
      ['path', { d: 'M10 3v18' }],
      ['path', { d: 'M14 8v7' }],
      ['path', { d: 'M18 5v13' }],
      ['path', { d: 'M22 10v3' }],
    ],
  },
  'disc-3': {
    all: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['path', { d: 'M6 12c0-1.7.7-3.2 1.8-4.2' }],
      ['circle', { cx: '12', cy: '12', r: '2' }],
      ['path', { d: 'M18 12c0 1.7-.7 3.2-1.8 4.2' }],
    ],
  },
  'list-music': {
    all: [
      ['path', { d: 'M16 5H3' }],
      ['path', { d: 'M11 12H3' }],
      ['path', { d: 'M11 19H3' }],
      ['path', { d: 'M21 16V5' }],
      ['circle', { cx: '18', cy: '16', r: '3' }],
    ],
  },
  image: {
    all: [
      ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }],
      ['circle', { cx: '9', cy: '9', r: '2' }],
      ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }],
    ],
  },
} as const satisfies Record<string, IconParts>

export type IconName = keyof typeof ICONS

// ---------------------------------------------------------------------------
// 描画ヘルパ
// ---------------------------------------------------------------------------

export function renderShape([tag, attrs]: SvgShape): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  return `<${tag} ${attrStr}/>`
}

/**
 * Lucide アイコン (24x24 viewBox) を (cx, cy) 中心・指定ピクセルサイズで配置。
 * 回転も中心周り。
 */
export function iconGroup(opts: {
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
export function hexPoints(cx: number, cy: number, r: number): string {
  const pts: Array<string> = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i)
    pts.push(
      `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`,
    )
  }
  return pts.join(' ')
}
