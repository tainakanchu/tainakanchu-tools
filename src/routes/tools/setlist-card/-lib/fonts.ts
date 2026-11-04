/**
 * 書体。canvas の出力が端末（iOS / Android / Windows）の標準フォントで変わると
 * 仕上がりがぶれるので、Google Fonts（すべて OFL）を読み込んで使う。
 *
 * - 欧文: Geist（本文・見出し）、Geist Mono（番号・補足列）、Instrument Serif
 *   （エディトリアルの見出し）、Archivo（センターの見出し、幅の軸で詰める）
 * - 和文: Zen Kaku Gothic New（ゴシック）、Shippori Mincho（明朝）
 * - Y2K だけ: Unbounded、DotGothic16
 *
 * 和文の Web フォントは unicode-range で細かく分割されているので、
 * document.fonts.load には実際に描く文字列を渡して、要る分だけ読み込む。
 * オフライン（PWA）などで読めないときは、各スタックの後ろの OS 標準フォントに落ちる。
 */

const SYSTEM_SANS =
  '"Helvetica Neue", Helvetica, Arial, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", YuGothic, "Noto Sans JP", "Noto Sans CJK JP", Meiryo, sans-serif'
const SYSTEM_SERIF =
  'Georgia, "Times New Roman", "Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Noto Serif CJK JP", serif'
const SYSTEM_MONO =
  '"SF Mono", Menlo, Consolas, "Roboto Mono", "DejaVu Sans Mono", "Noto Sans Mono CJK JP", monospace'

const JP_SANS = '"Zen Kaku Gothic New"'
const JP_SERIF = '"Shippori Mincho"'

export const FONT_STACKS = {
  /** 本文・見出しのゴシック */
  sans: `"Geist", ${JP_SANS}, ${SYSTEM_SANS}`,
  /** 明朝（本文にも使える重さ 500 / 700） */
  serif: `${JP_SERIF}, ${SYSTEM_SERIF}`,
  /** 見出し用のセリフ（400 と斜体だけ。和文は明朝へ落ちる） */
  display: `"Instrument Serif", ${JP_SERIF}, ${SYSTEM_SERIF}`,
  /** 番号・時刻・BPM・Key */
  mono: `"Geist Mono", ${JP_SANS}, ${SYSTEM_MONO}`,
  /** センターの見出し（幅を詰めた太いグロテスク） */
  condensed: `"Archivo", ${JP_SANS}, ${SYSTEM_SANS}`,
  /** Y2K の見出し */
  wide: `"Unbounded", ${JP_SANS}, ${SYSTEM_SANS}`,
  /** Y2K の小さなラベル（ドット文字） */
  pixel: `"DotGothic16", ${SYSTEM_MONO}`,
  /** 旧テンプレートの極太見出し */
  black: `"Archivo", ${JP_SANS}, "Arial Black", ${SYSTEM_SANS}`,
} as const

export type FontStack = keyof typeof FONT_STACKS

export const GOOGLE_FONTS_CSS =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Geist:wght@400;500;600',
    'family=Geist+Mono:wght@400;500',
    'family=Instrument+Serif:ital@0;1',
    'family=Archivo:wdth,wght@75..100,500..900',
    'family=Zen+Kaku+Gothic+New:wght@400;500;700',
    'family=Shippori+Mincho:wght@500;700',
    'family=Unbounded:wght@800',
    'family=DotGothic16',
  ].join('&') +
  '&display=swap'

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

let stylesheet: Promise<boolean> | null = null

/** Google Fonts の CSS を 1 回だけ差し込む（読めなければ false） */
function ensureStylesheet(): Promise<boolean> {
  if (stylesheet) return stylesheet
  stylesheet = new Promise<boolean>((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false)
      return
    }
    const existing = document.querySelector<HTMLLinkElement>(
      'link[data-setlist-fonts]',
    )
    if (existing) {
      resolve(true)
      return
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = GOOGLE_FONTS_CSS
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
      stylesheet = null
      resolve(false)
    })
    document.head.append(link)
  })
  return stylesheet
}

/** 描画・計測に使った書体と文字（まだ読み込みを頼んでいない分） */
const pending = new Map<string, Set<string>>()
/** 読み込みを頼み終えた文字 */
const requested = new Map<string, Set<string>>()

/**
 * 描く・測る書体と文字列を記録する（render 側から呼ぶ）。
 * 記録した分は loadPendingFonts で読み込む。
 */
export function noteFontUse(cssFont: string, text: string): void {
  if (!text || typeof document === 'undefined') return
  const done = requested.get(cssFont)
  let set = pending.get(cssFont)
  for (const ch of text) {
    if (done?.has(ch) || set?.has(ch)) continue
    if (!set) {
      set = new Set()
      pending.set(cssFont, set)
    }
    set.add(ch)
  }
}

/**
 * 記録した書体を読み込む。新しく読み込めた書体があれば true（呼び出し側で描き直す）。
 * オフラインなどで読めないときは false のまま、OS 標準フォントで描く。
 */
export async function loadPendingFonts(): Promise<boolean> {
  if (pending.size === 0 || typeof document === 'undefined') return false
  if (!('fonts' in document)) return false
  const ok = await ensureStylesheet()
  if (!ok) return false
  const jobs: Array<Promise<number>> = []
  for (const [cssFont, chars] of pending) {
    const text = Array.from(chars).join('')
    let done = requested.get(cssFont)
    if (!done) {
      done = new Set()
      requested.set(cssFont, done)
    }
    for (const ch of chars) done.add(ch)
    jobs.push(
      document.fonts.load(cssFont, text).then(
        (faces) => faces.filter((f) => f.status === 'loaded').length,
        () => 0,
      ),
    )
  }
  pending.clear()
  const loaded = await Promise.all(jobs)
  return loaded.some((n) => n > 0)
}
