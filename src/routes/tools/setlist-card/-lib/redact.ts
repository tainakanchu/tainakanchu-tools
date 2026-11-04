/**
 * 曲を「隠す」（未発表・解禁前の曲を、かけたことだけ見せて伏せる）。純粋関数。
 *
 * 隠した欄は、描画の入口（toItems）で表示用の文字に置き換える。以降の計測・省略・
 * 折り返し・行の形や段数の選択・ページ割りはすべて置き換えた後の文字で行うので、
 * 本当の曲名の長さ（空かどうかも含めて）は画像に一切影響しない。
 *
 * 表示のしかた（全曲共通）:
 *   id       … 「ID — ID」（片方だけなら「Artist — ID」）
 *   qmark    … 「？？？？」。個数は本当の文字数ではなく、曲順から決めた擬似乱数（3〜8）
 *   scribble … ペンでぐちゃぐちゃに塗りつぶした跡（下に本当の文字は描かない）
 *   bar      … 黒塗りの帯
 *   custom   … 入力した文字（「Unreleased」など）。両方隠すときは 1 つだけ出す
 * ぐちゃぐちゃ・黒塗りの幅も曲順から決めた擬似乱数で、本当の文字の長さにはよらない。
 */
import { mulberry32 } from './random'
import type { Track } from './types'

export type RedactStyle = 'id' | 'qmark' | 'scribble' | 'bar' | 'custom'

export type RedactOptions = {
  style: RedactStyle
  /** カスタムの文字 */
  custom: string
  /** 隠した曲の BPM・Key も出さない（時刻と番号は常に出す） */
  hideMeta: boolean
}

export const DEFAULT_REDACT: RedactOptions = {
  style: 'id',
  custom: 'Unreleased',
  hideMeta: false,
}

export const REDACT_STYLES: ReadonlyArray<{ id: RedactStyle; label: string }> =
  [
    { id: 'id', label: 'ID — ID' },
    { id: 'qmark', label: '？？？' },
    { id: 'scribble', label: 'ぐちゃぐちゃ' },
    { id: 'bar', label: '黒塗り' },
    { id: 'custom', label: 'カスタム' },
  ]

/** 隠す欄の選び方（曲ごと） */
export type HideTarget = 'both' | 'artist' | 'title'

export const HIDE_TARGETS: ReadonlyArray<{ id: HideTarget; label: string }> = [
  { id: 'both', label: '両方' },
  { id: 'artist', label: 'アーティストだけ' },
  { id: 'title', label: '曲名だけ' },
]

export function hiddenOf(track: Pick<Track, 'hidden'>): {
  artist: boolean
  title: boolean
} {
  return {
    artist: track.hidden?.artist === true,
    title: track.hidden?.title === true,
  }
}

export function isHidden(track: Pick<Track, 'hidden'>): boolean {
  const h = hiddenOf(track)
  return h.artist || h.title
}

export function hideTargetOf(track: Pick<Track, 'hidden'>): HideTarget | null {
  const h = hiddenOf(track)
  if (h.artist && h.title) return 'both'
  if (h.artist) return 'artist'
  if (h.title) return 'title'
  return null
}

export function hiddenFor(target: HideTarget): NonNullable<Track['hidden']> {
  return { artist: target !== 'title', title: target !== 'artist' }
}

/** カスタムの文字の上限（長すぎると曲名の欄を食うので） */
export const CUSTOM_MAX = 24

export function customText(value: string): string {
  const text = value.replace(/[\s　]+/g, ' ').trim()
  const chars = Array.from(text)
  const cut = chars.length > CUSTOM_MAX ? chars.slice(0, CUSTOM_MAX) : chars
  return cut.join('').trim() || 'ID'
}

/** 帯・ぐちゃぐちゃの幅を測る字（幅のそろった数字で測る） */
const MARK_GLYPH = '0'
const MARK_RANGE = { artist: [6, 10], title: [8, 14] } as const
/** ？？？ の個数 */
const QMARK_RANGE = [3, 8] as const
/**
 * ？？？ に使う字。欧文が先頭の書体（Geist・Geist Mono・Archivo など）では全角の ？ が
 * 和文フォントへ落ちて 1 字ずつ間延びするので半角の ?、明朝（和文の書体が先頭）では全角。
 */
export type QmarkGlyph = '?' | '？'

/** 曲順と欄だけで決まる整数 lo..hi（本当の文字には一切よらない） */
function seeded(
  index: number,
  field: 'artist' | 'title',
  salt: number,
  lo: number,
  hi: number,
): number {
  const rand = mulberry32(
    (index + 1) * 7919 + (field === 'artist' ? 17 : 4099) + salt * 104729,
  )
  // 最初の値は種に近く偏りやすいので捨てる
  rand()
  return lo + Math.floor(rand() * (hi - lo + 1))
}

/** 黒塗り・ぐちゃぐちゃの代わりに測る文字列（幅を決めるだけで描かない） */
export function markPlaceholder(
  index: number,
  field: 'artist' | 'title',
): string {
  const [lo, hi] = MARK_RANGE[field]
  return MARK_GLYPH.repeat(seeded(index, field, 0, lo, hi))
}

/** ？？？ の文字列 */
export function qmarkText(
  index: number,
  field: 'artist' | 'title',
  glyph: QmarkGlyph = '?',
): string {
  return glyph.repeat(seeded(index, field, 1, QMARK_RANGE[0], QMARK_RANGE[1]))
}

/** 黒塗り / ぐちゃぐちゃで描く印 */
export type MarkKind = 'bar' | 'scribble'

/** 曲の中で印を描く欄と、印の形の種（曲順から） */
export type Marks = { artist?: MarkKind; title?: MarkKind; seed: number }

/** 描く 1 つの印（ぐちゃぐちゃの線の形は seed で決まる） */
export type PlacedMark = { kind: MarkKind; seed: number }

/** 欄の印（無ければ undefined） */
export function markFor(
  marks: Marks | undefined,
  role: string,
): PlacedMark | undefined {
  if (!marks || (role !== 'artist' && role !== 'title')) return undefined
  const kind = marks[role]
  return kind
    ? { kind, seed: marks.seed * 2 + (role === 'title' ? 1 : 0) }
    : undefined
}

export type DisplayNames = {
  artist: string
  title: string
  /** 印で描く欄（artist / title は印の幅を測るための置き換え文字で、描かない） */
  mark: Marks | null
}

/**
 * 表示する名前。隠していない欄だけ clean（ミックス表記・feat. の省略）を掛ける。
 * 隠した欄は本当の文字を読まずに置き換える。
 */
export function displayNames(
  track: Pick<Track, 'artist' | 'title' | 'hidden'>,
  index: number,
  opts: RedactOptions,
  clean: { artist: (s: string) => string; title: (s: string) => string },
  glyph: QmarkGlyph = '?',
): DisplayNames {
  const h = hiddenOf(track)
  if (!h.artist && !h.title) {
    return {
      artist: clean.artist(track.artist),
      title: clean.title(track.title),
      mark: null,
    }
  }
  const visibleArtist = h.artist ? '' : clean.artist(track.artist)
  const visibleTitle = h.title ? '' : clean.title(track.title)
  const pick = (replace: (field: 'artist' | 'title') => string) => ({
    artist: h.artist ? replace('artist') : visibleArtist,
    title: h.title ? replace('title') : visibleTitle,
  })
  switch (opts.style) {
    case 'bar':
    case 'scribble': {
      const kind = opts.style
      return {
        ...pick((field) => markPlaceholder(index, field)),
        mark: {
          ...(h.artist ? { artist: kind } : {}),
          ...(h.title ? { title: kind } : {}),
          seed: index,
        },
      }
    }
    case 'qmark':
      return { ...pick((field) => qmarkText(index, field, glyph)), mark: null }
    case 'custom': {
      const text = customText(opts.custom)
      // 両方隠すなら「Unreleased — Unreleased」にせず 1 つだけ（曲名の欄に）
      if (h.artist && h.title) return { artist: '', title: text, mark: null }
      return { ...pick(() => text), mark: null }
    }
    default:
      return { ...pick(() => 'ID'), mark: null }
  }
}
