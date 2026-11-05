/**
 * 書体。canvas の出力が端末（iOS / Android / Windows）の標準フォントで変わると
 * 仕上がりがぶれるので、Google Fonts（すべて OFL）を読み込んで使う。
 *
 * - 欧文: Geist（本文・見出し）、Geist Mono（番号・補足列）、Instrument Serif
 *   （エディトリアルの見出し）、Archivo（センターの見出し、幅の軸で詰める）
 * - 和文: Zen Kaku Gothic New（ゴシック）、Shippori Mincho（明朝）
 * - 中国語: Noto Sans TC / SC（ゴシック）、Noto Serif TC / SC（明朝）
 * - 韓国語: Noto Sans KR（ゴシック）、Noto Serif KR（明朝）
 * - 欧文の書体に無い字（ギリシャ文字、Archivo / Instrument Serif に無いキリル文字・
 *   ベトナム語など）: Noto Sans / Noto Serif。タイ文字: Noto Sans Thai
 * - Y2K だけ: Unbounded、DotGothic16（中国語・韓国語の文字列は Geist Mono の系統へ）
 *
 * どの CJK 書体を先頭に置くかは、1 文字ずつではなく描く文字列ごとに決める
 * （script.ts。1 つの曲名の中で漢字のデザインが混ざらないように）。決めた体系は
 * font 文字列に持たせ、計測・省略・折り返し・描画のすべてで同じスタックを使う。
 *
 * CJK の Web フォントは unicode-range で細かく分割されているので、描いた文字ごとに
 * ブラウザーが実際に選ぶ face（unicode-range と太さで決まる）を割り出して、
 * その face だけを読み込む。中国語・韓国語の CSS 自体も、その書体を使う文字列が
 * 出てくるまで読まない。
 * オフライン（PWA）などで読めないときは、各スタックの後ろの OS 標準フォントに落ちる。
 */
import { isCjkChar } from './script'
import type { CjkScript, Script } from './script'

// ---------------------------------------------------------------------------
// スタック
// ---------------------------------------------------------------------------

export type FontStack =
  'sans' | 'serif' | 'display' | 'mono' | 'condensed' | 'wide' | 'pixel'

type CjkRole = 'sans' | 'serif'
type SystemRole = 'sans' | 'serif' | 'mono'

const CJK_FAMILIES: Record<CjkRole, Record<CjkScript, string>> = {
  sans: {
    ja: 'Zen Kaku Gothic New',
    'zh-hant': 'Noto Sans TC',
    'zh-hans': 'Noto Sans SC',
    ko: 'Noto Sans KR',
  },
  serif: {
    ja: 'Shippori Mincho',
    'zh-hant': 'Noto Serif TC',
    'zh-hans': 'Noto Serif SC',
    ko: 'Noto Serif KR',
  },
}

/**
 * 体系ごとの CJK の Web フォントの順（先頭が選んだ書体、残りは字が無いときの控え）。
 * 中国語・韓国語の文字列には和文の書体を入れない: その CSS を読む前の 1 回目の
 * 描画で、ブラウザーが漢字を和文の書体で描こうとして、使わない分割ファイルを
 * 大量に読んでしまうため（Noto の TC / SC はかなも持っているので、控えは要らない）。
 */
const CJK_WEB_ORDER: Record<Script, ReadonlyArray<CjkScript>> = {
  latin: ['ja', 'zh-hant', 'zh-hans', 'ko'],
  ja: ['ja', 'zh-hant', 'zh-hans', 'ko'],
  'zh-hant': ['zh-hant', 'zh-hans'],
  'zh-hans': ['zh-hans', 'zh-hant'],
  ko: ['ko', 'zh-hant', 'zh-hans'],
}

/** 体系ごとの CJK の OS 標準フォントの順（入っているものを使うだけなので全部並べる） */
const CJK_ORDER: Record<Script, ReadonlyArray<CjkScript>> = {
  latin: ['ja', 'zh-hant', 'zh-hans', 'ko'],
  ja: ['ja', 'zh-hant', 'zh-hans', 'ko'],
  'zh-hant': ['zh-hant', 'zh-hans', 'ja', 'ko'],
  'zh-hans': ['zh-hans', 'zh-hant', 'ja', 'ko'],
  ko: ['ko', 'zh-hant', 'zh-hans', 'ja'],
}

/** オフラインのときの OS 標準フォント（欧文） */
const SYSTEM_LATIN: Record<SystemRole, string> = {
  sans: '"Helvetica Neue", Helvetica, Arial',
  serif: 'Georgia, "Times New Roman"',
  mono: '"SF Mono", Menlo, Consolas, "Roboto Mono", "DejaVu Sans Mono"',
}

/** オフラインのときの OS 標準フォント（CJK。macOS / iOS・Windows・Linux / Android の順） */
const SYSTEM_CJK: Record<CjkRole, Record<CjkScript, string>> = {
  sans: {
    ja: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", YuGothic, Meiryo, "Noto Sans JP", "Noto Sans CJK JP"',
    'zh-hant':
      '"PingFang TC", "Heiti TC", "Microsoft JhengHei", "Noto Sans CJK TC"',
    'zh-hans':
      '"PingFang SC", "Heiti SC", "Microsoft YaHei", "Noto Sans CJK SC"',
    ko: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR"',
  },
  serif: {
    ja: '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Noto Serif CJK JP"',
    'zh-hant': '"Songti TC", PMingLiU, MingLiU, "Noto Serif CJK TC"',
    'zh-hans': '"Songti SC", STSong, SimSun, "Noto Serif CJK SC"',
    ko: 'AppleMyungjo, Batang, "Noto Serif CJK KR"',
  },
}

const GENERIC: Record<SystemRole, string> = {
  sans: 'sans-serif',
  serif: 'serif',
  mono: 'monospace',
}

type StackDef = {
  /** 欧文の書体（CJK の字を持たない）。空なら CJK 書体の欧文を使う */
  head: ReadonlyArray<string>
  cjk: CjkRole
  /** 欧文の書体に無い欧文（ギリシャ文字など） */
  extra: string
  system: SystemRole
}

const STACK_DEFS: Record<Exclude<FontStack, 'pixel'>, StackDef> = {
  /** 本文・見出しのゴシック */
  sans: { head: ['Geist'], cjk: 'sans', extra: 'Noto Sans', system: 'sans' },
  /** 明朝（本文にも使える重さ 500 / 700）。欧文も明朝の書体のもの */
  serif: { head: [], cjk: 'serif', extra: 'Noto Serif', system: 'serif' },
  /** 見出し用のセリフ（400 と斜体だけ。和文は明朝へ落ちる） */
  display: {
    head: ['Instrument Serif'],
    cjk: 'serif',
    extra: 'Noto Serif',
    system: 'serif',
  },
  /** 番号・時刻・BPM・Key */
  mono: {
    head: ['Geist Mono'],
    cjk: 'sans',
    extra: 'Noto Sans',
    system: 'mono',
  },
  /** センターの見出し（幅を詰めた太いグロテスク） */
  condensed: {
    head: ['Archivo'],
    cjk: 'sans',
    extra: 'Noto Sans',
    system: 'sans',
  },
  /** Y2K の見出し */
  wide: {
    head: ['Unbounded'],
    cjk: 'sans',
    extra: 'Noto Sans',
    system: 'sans',
  },
}

/** Y2K の小さなラベル（ドット文字。DotGothic16 は日本語の字だけ） */
const PIXEL_DEF: StackDef = {
  head: ['DotGothic16'],
  cjk: 'sans',
  extra: 'Noto Sans',
  system: 'mono',
}

const THAI = 'Noto Sans Thai'

const quote = (family: string) => `"${family}"`

function defFor(stack: FontStack, script: Script): StackDef {
  if (stack !== 'pixel') return STACK_DEFS[stack]
  // ドットの漢字は日本の字形しか無く、簡体字・ハングルも欠けるので、
  // 中国語・韓国語の文字列は等幅の系統で描く（1 つの文字列の中で混ぜない）
  return script === 'latin' || script === 'ja' ? PIXEL_DEF : STACK_DEFS.mono
}

/** スタックに並ぶ Web フォント（先頭から順に） */
export function webFamilies(stack: FontStack, script: Script): Array<string> {
  const def = defFor(stack, script)
  const cjk = CJK_WEB_ORDER[script].map((s) => CJK_FAMILIES[def.cjk][s])
  // 和文・欧文の文字列は、欧文の書体の後ろに足りない欧文（ギリシャ文字など）、CJK の順。
  // 明朝のように欧文の書体が無ければ、選んだ和文の書体（の欧文）を先頭にする。
  // 中国語・韓国語の文字列は、欧文の書体に無い字も選んだ CJK 書体で描く（CSS を
  // 読む前の 1 回目の描画で、控えの Noto Sans / Serif を余分に読まないよう後ろに回す）
  const cjkFirst =
    script === 'zh-hant' || script === 'zh-hans' || script === 'ko'
  if (cjkFirst) {
    // 明朝の中国語・韓国語の文字列の欧文は Noto Serif で描く（Noto Serif TC などは
    // ē のような声調記号つきの字を持たず、記号の位置がずれるため）
    const head = def.head.length > 0 ? def.head : [def.extra]
    return [
      ...head,
      ...cjk,
      ...(head.includes(def.extra) ? [] : [def.extra]),
      THAI,
    ]
  }
  const families =
    def.head.length > 0
      ? [...def.head, def.extra, ...cjk]
      : [cjk[0], def.extra, ...cjk.slice(1)]
  return [...families, THAI]
}

const stackMemo = new Map<string, string>()

/** font-family の値（Web フォント → OS 標準フォント） */
export function fontStack(stack: FontStack, script: Script = 'latin'): string {
  const key = `${stack}:${script}`
  const hit = stackMemo.get(key)
  if (hit) return hit
  const def = defFor(stack, script)
  const cjkRole: CjkRole = def.system === 'serif' ? 'serif' : 'sans'
  const system = [
    SYSTEM_LATIN[def.system],
    ...CJK_ORDER[script].map((s) => SYSTEM_CJK[cjkRole][s]),
    GENERIC[def.system],
  ]
  const value = [...webFamilies(stack, script).map(quote), ...system].join(', ')
  stackMemo.set(key, value)
  return value
}

// ---------------------------------------------------------------------------
// font 文字列
// ---------------------------------------------------------------------------

/**
 * 字間・字幅・スタック名・文字体系は CSS の font の後ろに区切って持たせる
 * （計測のメモのキーにもなる）。canvas には先頭の CSS の部分だけを渡す。
 */
const SEP = '\u0001'

export type FontOpts = {
  /** 字間（em） */
  tracking?: number
  /** 字幅（Archivo の幅の軸） */
  stretch?: 'normal' | 'semi-condensed' | 'condensed'
  italic?: boolean
}

const STACK_NAMES: ReadonlyArray<string> = [
  'sans',
  'serif',
  'display',
  'mono',
  'condensed',
  'wide',
  'pixel',
]
const SCRIPTS: ReadonlyArray<string> = [
  'latin',
  'ja',
  'zh-hant',
  'zh-hans',
  'ko',
]
const isStack = (v: string): v is FontStack => STACK_NAMES.includes(v)
const isScript = (v: string): v is Script => SCRIPTS.includes(v)

/**
 * 書体の指定。文字体系はまだ決めていない（描く・測る文字列から決める。
 * 省略・折り返しをする文字列は、先に withScript / forText で決めておく）。
 */
export function font(
  weight: number,
  size: number,
  stack: FontStack,
  opts: FontOpts = {},
): string {
  const px = Math.max(1, Math.round(size * 10) / 10)
  const css = `${opts.italic ? 'italic ' : ''}${weight} ${px}px ${fontStack(stack)}`
  return [css, opts.tracking ?? 0, opts.stretch ?? 'normal', stack].join(SEP)
}

export function fontSize(f: string): number {
  return Number(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? 16)
}

export type ParsedFont = {
  css: string
  tracking: number
  stretch: string
  stack?: FontStack
  script?: Script
}

export function parseFont(f: string): ParsedFont {
  if (!f.includes(SEP)) return { css: f, tracking: 0, stretch: 'normal' }
  const [css, tracking, stretch, stack, script] = f.split(SEP)
  return {
    css,
    tracking: Number(tracking) || 0,
    stretch: stretch || 'normal',
    ...(stack && isStack(stack) ? { stack } : {}),
    ...(script && isScript(script) ? { script } : {}),
  }
}

/**
 * 文字体系を決めた font にする（スタックの CJK 書体の順を入れ替える）。
 * font() で作っていない文字列（テストの '10px x' など）はそのまま返す。
 */
const scriptMemo = new Map<string, string>()

export function withScript(f: string, script: Script): string {
  const key = `${script}\u0002${f}`
  const hit = scriptMemo.get(key)
  if (hit !== undefined) return hit
  let value = f
  const p = parseFont(f)
  const head = p.stack ? /^(.*?\d+(?:\.\d+)?px) /.exec(p.css)?.[1] : undefined
  if (p.stack && head) {
    value = [
      `${head} ${fontStack(p.stack, script)}`,
      p.tracking,
      p.stretch,
      p.stack,
      script,
    ].join(SEP)
  }
  if (scriptMemo.size > 5000) scriptMemo.clear()
  scriptMemo.set(key, value)
  return value
}

/** 文字体系がまだ決まっていなければ、text から決める */
export function forScript(f: string, script: () => Script): string {
  const p = parseFont(f)
  return p.stack && !p.script ? withScript(f, script()) : f
}

// ---------------------------------------------------------------------------
// canvas に渡す font
// ---------------------------------------------------------------------------

/** Web フォントの書体名（OS 標準フォントと見分ける） */
const WEB_FAMILIES: ReadonlySet<string> = new Set([
  ...Object.values(CJK_FAMILIES).flatMap((byScript) => Object.values(byScript)),
  ...Object.values(STACK_DEFS).flatMap((d) => [...d.head, d.extra]),
  ...PIXEL_DEF.head,
  THAI,
])
const CJK_WEB: ReadonlySet<string> = new Set(
  Object.values(CJK_FAMILIES).flatMap((byScript) => Object.values(byScript)),
)
const GENERIC_NAMES: ReadonlySet<string> = new Set(Object.values(GENERIC))

/** CSS を読み終えた中国語・韓国語の書体 */
const lazyLoaded = new Set<string>()
let lazyVersion = 0

/** 中国語・韓国語の CSS を読むたびに変わる値（文字幅のメモのキーに混ぜる） */
export function fontsVersion(): number {
  return lazyVersion
}

const canvasMemo = new Map<string, string>()

/**
 * canvas に渡す CSS の font。選んだ中国語・韓国語の書体の CSS をまだ読んでいない
 * 間は、その後ろの Web フォント（和文・欧文の控え）を外して OS 標準フォントで描く。
 * そのままだとブラウザーが控えの書体で描こうとして、使わない分割ファイルを読んで
 * しまうため。CSS を読んだら（fontsVersion が変わったら）元のスタックで描き直す。
 */
export function canvasFont(css: string): string {
  const key = `${lazyVersion}\u0000${css}`
  const hit = canvasMemo.get(key)
  if (hit !== undefined) return hit
  let value = css
  const use = parseFontUse(css)
  const head = /^(?:italic )?\d+ [\d.]+px /.exec(css)?.[0]
  const firstCjk = use ? waitingCjk(use) : -1
  if (use && head && firstCjk >= 0) {
    const kept = use.families.filter(
      (f, i) => i < firstCjk || !WEB_FAMILIES.has(f),
    )
    value =
      head + kept.map((f) => (GENERIC_NAMES.has(f) ? f : quote(f))).join(', ')
  }
  if (canvasMemo.size > 2000) canvasMemo.clear()
  canvasMemo.set(key, value)
  return value
}

/**
 * 選んだ CJK 書体（スタックで最初の CJK 書体）が、CSS をまだ読んでいない
 * 中国語・韓国語の書体なら、その位置。そうでなければ -1
 */
function waitingCjk(use: FontUse): number {
  const index = use.families.findIndex((f) => CJK_WEB.has(f))
  const chosen = use.families[index] as string | undefined
  return chosen && chosen in LAZY_FONTS_CSS && !lazyLoaded.has(chosen)
    ? index
    : -1
}

let quiet = 0

/** withoutNewCjkFonts の中か */
export function fontRequestsPaused(): boolean {
  return quiet > 0
}

/**
 * fn の中で描く・測る文字では、まだ CSS を読んでいない中国語・韓国語の書体を
 * 読みに行かない（テンプレートのサムネ用。小さな見本のために明朝の分割ファイルまで
 * 読まない。本体の画像で読んだ書体は、サムネでもそのまま使う）。
 */
export function withoutNewCjkFonts<T>(fn: () => T): T {
  quiet++
  try {
    return fn()
  } finally {
    quiet--
  }
}

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

const CSS2 = 'https://fonts.googleapis.com/css2?'

/** いつも読む書体（欧文・和文と、欧文の控え） */
export const GOOGLE_FONTS_CSS =
  CSS2 +
  [
    'family=Geist:wght@400;500;600',
    'family=Geist+Mono:wght@400;500',
    'family=Instrument+Serif:ital@0;1',
    'family=Archivo:wdth,wght@75..100,500..900',
    'family=Zen+Kaku+Gothic+New:wght@400;500;700',
    'family=Shippori+Mincho:wght@500;700',
    'family=Unbounded:wght@800',
    'family=DotGothic16',
    'family=Noto+Sans:wght@400..700',
    'family=Noto+Serif:ital,wght@0,400..700;1,400..700',
    'family=Noto+Sans+Thai:wght@400..700',
  ].join('&') +
  '&display=swap'

/**
 * 中国語・韓国語の書体（CSS だけで 1 書体 30KB 以上あるので、その書体を使う
 * 文字列が出てくるまで読まない）。可変の太さ 1 本で 400〜700 をまかなう。
 */
export const LAZY_FONTS_CSS: Readonly<Record<string, string>> = {
  'Noto Sans TC': `${CSS2}family=Noto+Sans+TC:wght@400..700&display=swap`,
  'Noto Sans SC': `${CSS2}family=Noto+Sans+SC:wght@400..700&display=swap`,
  'Noto Sans KR': `${CSS2}family=Noto+Sans+KR:wght@400..700&display=swap`,
  'Noto Serif TC': `${CSS2}family=Noto+Serif+TC:wght@500..700&display=swap`,
  'Noto Serif SC': `${CSS2}family=Noto+Serif+SC:wght@500..700&display=swap`,
  'Noto Serif KR': `${CSS2}family=Noto+Serif+KR:wght@500..700&display=swap`,
}

const stylesheets = new Map<string, Promise<boolean>>()

/** Google Fonts の CSS を 1 回だけ差し込む（読めなければ false） */
function ensureStylesheet(href: string): Promise<boolean> {
  const cached = stylesheets.get(href)
  if (cached) return cached
  const promise = new Promise<boolean>((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false)
      return
    }
    const existing = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[data-setlist-fonts]'),
    ).find((l) => l.href === href)
    if (existing) {
      resolve(true)
      return
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.setlistFonts = ''
    const timer = window.setTimeout(() => resolve(false), 6000)
    link.addEventListener('load', () => {
      window.clearTimeout(timer)
      resolve(true)
    })
    link.addEventListener('error', () => {
      window.clearTimeout(timer)
      // 次に描くときにもう一度試せるようにする（オンラインに戻ったとき用）
      link.remove()
      stylesheets.delete(href)
      resolve(false)
    })
    document.head.append(link)
  })
  stylesheets.set(href, promise)
  return promise
}

/**
 * 画面の文字（ラベルなど）にも画像と同じ Geist / Geist Mono を使うので、
 * 開いたときに Google Fonts の CSS を差し込んでおく（読めなければ OS の書体のまま）。
 */
export function ensureFontStylesheet(): void {
  void ensureStylesheet(GOOGLE_FONTS_CSS)
}

type FontUse = {
  italic: boolean
  weight: number
  families: Array<string>
  /** font の CSS（FontFace を辿れないブラウザーで document.fonts.load に渡す） */
  css: string
}

/** CSS の font から太さ・斜体・書体の並びを読む */
export function parseFontUse(css: string): FontUse | undefined {
  const m = /^(italic )?(\d+) [\d.]+px (.+)$/.exec(css)
  if (!m) return undefined
  return {
    italic: Boolean(m[1]),
    weight: Number(m[2]),
    families: m[3].split(',').map((f) => f.trim().replace(/^["']|["']$/g, '')),
    css,
  }
}

/** 描画・計測に使った書体と文字（まだ読み込みを頼んでいない分） */
const pending = new Map<string, { use: FontUse; chars: Set<string> }>()
/** 読み込みを頼み終えた文字 */
const requested = new Map<string, Set<string>>()

/**
 * 描く・測る書体と文字列を記録する（render 側から呼ぶ）。
 * 記録した分は loadPendingFonts で読み込む。
 */
export function noteFontUse(cssFont: string, text: string): void {
  if (!text || typeof document === 'undefined') return
  if (quiet > 0) {
    const use = parseFontUse(cssFont)
    if (use && waitingCjk(use) >= 0) return
  }
  // 大きさは読み込む face に関係ないので外してまとめる
  const key = cssFont.replace(/ [\d.]+px /, ' ')
  const done = requested.get(key)
  let entry = pending.get(key)
  for (const ch of text) {
    if (done?.has(ch) || entry?.chars.has(ch)) continue
    if (!entry) {
      const use = parseFontUse(cssFont)
      if (!use) return
      entry = { use, chars: new Set() }
      pending.set(key, entry)
    }
    entry.chars.add(ch)
  }
}

// --- face の選び方（CSS Fonts の font matching をなぞる） ---------------------

type Range = [number, number]
const rangeMemo = new WeakMap<FontFace, Array<Range>>()

export function parseUnicodeRange(value: string): Array<Range> {
  const out: Array<Range> = []
  for (const part of value.split(',')) {
    const p = part.trim().replace(/^U\+/i, '')
    if (!p) continue
    if (p.includes('?')) {
      out.push([
        Number.parseInt(p.replace(/\?/g, '0'), 16),
        Number.parseInt(p.replace(/\?/g, 'F'), 16),
      ])
    } else if (p.includes('-')) {
      const [a, b] = p.split('-')
      out.push([Number.parseInt(a, 16), Number.parseInt(b, 16)])
    } else {
      const n = Number.parseInt(p, 16)
      out.push([n, n])
    }
  }
  return out
}

function covers(face: FontFace, code: number): boolean {
  let ranges = rangeMemo.get(face)
  if (!ranges) {
    ranges = parseUnicodeRange(face.unicodeRange || 'U+0-10FFFF')
    rangeMemo.set(face, ranges)
  }
  return ranges.some(([a, b]) => code >= a && code <= b)
}

/** 太さの近さ（小さいほど優先。CSS の font-weight の選び方） */
export function weightRank(lo: number, hi: number, w: number): number {
  if (w >= lo && w <= hi) return 0
  const up = lo > w ? (lo - w) / 1000 : Number.POSITIVE_INFINITY
  const down = hi < w ? (w - hi) / 1000 : Number.POSITIVE_INFINITY
  if (w >= 400 && w <= 500) {
    if (lo > w && lo <= 500) return 1 + up
    if (hi < w) return 2 + down
    return 3 + up
  }
  if (w < 400) return hi < w ? 1 + down : 2 + up
  return lo > w ? 1 + up : 2 + down
}

/** 同じ書体の face から、太さ・斜体がいちばん合う組（unicode-range ごとに分かれた face 群） */
function bestFaces(
  faces: ReadonlyArray<FontFace>,
  use: FontUse,
): Array<FontFace> {
  const styleRank = (s: string) =>
    use.italic
      ? s === 'italic'
        ? 0
        : s.startsWith('oblique')
          ? 1
          : 2
      : s === 'normal'
        ? 0
        : s.startsWith('oblique')
          ? 1
          : 2
  const scored = faces.map((face) => {
    const [lo, hi = lo] = face.weight.split(/\s+/).map(Number)
    return {
      face,
      style: styleRank(face.style),
      weight: weightRank(lo, hi, use.weight),
    }
  })
  const style = Math.min(...scored.map((s) => s.style))
  const sameStyle = scored.filter((s) => s.style === style)
  const weight = Math.min(...sameStyle.map((s) => s.weight))
  return sameStyle.filter((s) => s.weight === weight).map((s) => s.face)
}

function indexFaces(): Map<string, Array<FontFace>> {
  const index = new Map<string, Array<FontFace>>()
  document.fonts.forEach((face) => {
    const family = face.family.replace(/^["']|["']$/g, '')
    const list = index.get(family)
    if (list) list.push(face)
    else index.set(family, [face])
  })
  return index
}

/**
 * 1 文字を描くときにブラウザーが選ぶ face。スタックを先頭から見て、太さ・斜体の
 * 合う face 群のうち unicode-range がその字を含むものを返す。
 * まだ CSS を読んでいない中国語・韓国語の書体は飛ばす（ブラウザーにとっても
 * まだ無い書体）。needCss を渡したときは、CJK の字がそこに当たったら needCss に
 * 入れて止まる（その書体の CSS を読む理由になる）。
 */
function faceFor(
  index: Map<string, Array<FontFace>>,
  use: FontUse,
  ch: string,
  lazyDone: ReadonlySet<string>,
  needCss?: Set<string>,
): FontFace | undefined {
  const code = ch.codePointAt(0) ?? 0
  for (const family of use.families) {
    if (family in LAZY_FONTS_CSS && !lazyDone.has(family)) {
      if (needCss && isCjkChar(ch)) {
        needCss.add(family)
        return undefined
      }
      continue
    }
    const faces = index.get(family)
    if (!faces) continue
    const face = bestFaces(faces, use).find((f) => covers(f, code))
    if (face) return face
  }
  return undefined
}

/** 読み込んだ face と、それを読む理由になった字（確認用の記録） */
export const loadedFaceLog: Array<string> = []

/**
 * 記録した書体を読み込む。新しく読み込めた書体があれば true（呼び出し側で描き直す）。
 * オフラインなどで読めないときは false のまま、OS 標準フォントで描く。
 */
export async function loadPendingFonts(): Promise<boolean> {
  if (pending.size === 0 || typeof document === 'undefined') return false
  if (!('fonts' in document)) return false
  const ok = await ensureStylesheet(GOOGLE_FONTS_CSS)
  if (!ok) return false
  const work = Array.from(pending.entries())
  pending.clear()
  for (const [key, { chars }] of work) {
    let done = requested.get(key)
    if (!done) {
      done = new Set()
      requested.set(key, done)
    }
    for (const ch of chars) done.add(ch)
  }

  const faces = new Map<FontFace, Set<string>>()
  const lazyDone = new Set<string>(lazyLoaded)
  /** 中国語・韓国語の CSS を新しく読んだら変わる（canvas に渡す font が変わるので描き直す） */
  const versionBefore = lazyVersion
  let index = indexFaces()
  if (index.size === 0) {
    // FontFace を辿れないブラウザー: スタックごと読み込む（余分な分も読む）
    const loaded = await Promise.all(
      work.map(([, { use, chars }]) =>
        document.fonts.load(use.css, Array.from(chars).join('')).then(
          (list) => list.filter((f) => f.status === 'loaded').length,
          () => 0,
        ),
      ),
    )
    return loaded.some((n) => n > 0)
  }
  // 先に、CJK の字が当たる中国語・韓国語の書体の CSS を読む（読んだ書体の
  // unicode-range で、さらに先の書体が要るかが変わるので、要らなくなるまで繰り返す）
  for (let round = 0; round < 4; round++) {
    const needCss = new Set<string>()
    for (const [, { use, chars }] of work) {
      for (const ch of chars) {
        if (isCjkChar(ch)) faceFor(index, use, ch, lazyDone, needCss)
      }
    }
    const todo = Array.from(needCss)
    if (todo.length === 0) break
    const results = await Promise.all(
      todo.map((family) => ensureStylesheet(LAZY_FONTS_CSS[family])),
    )
    todo.forEach((family, i) => {
      // 読めなかった書体は face が無いので、この回は無いものとして先の書体へ進む
      lazyDone.add(family)
      if (results[i] && !lazyLoaded.has(family)) {
        lazyLoaded.add(family)
        lazyVersion++
      }
    })
    index = indexFaces()
  }
  // CSS がそろってから、字ごとに face を決める（欧文の字も、先に並ぶ CJK 書体が
  // 持っていればそちらで描かれるので、控えの書体を余分に読まない）
  for (const [, { use, chars }] of work) {
    for (const ch of chars) {
      const face = faceFor(index, use, ch, lazyDone)
      if (!face) continue
      const list = faces.get(face)
      if (list) list.add(ch)
      else faces.set(face, new Set([ch]))
    }
  }
  const jobs = Array.from(faces).map(async ([face, chars]) => {
    if (face.status === 'loaded' || face.status === 'error') return false
    try {
      await (face.status === 'loading' ? face.loaded : face.load())
      loadedFaceLog.push(
        `${face.family} ${face.weight} ${face.style}: ${Array.from(chars).join('')}`,
      )
      return true
    } catch {
      return false
    }
  })
  const loaded = await Promise.all(jobs)
  return lazyVersion !== versionBefore || loaded.some(Boolean)
}
