/**
 * 「ランダム」（おまかせ）: テンプレート × パレット と、テンプレートごとの文字組み
 * （書体・区切り・粒子・面番号）を選び直す。純粋関数で、乱数は外から渡す。
 *
 * 変えるのはデザインだけ。曲・見出し・隠した曲とその見せ方・サイズ・出力解像度と
 * 形式・長い名前の扱い・枚数・写真の位置は、呼び出し側が渡さないので変わらない。
 *
 * - 今と同じ テンプレート + パレット には戻らない。直近 RECENT_MAX 回の組み合わせも避ける
 * - テンプレート固定 / パレット固定で片方だけ選び直せる
 * - 写真があるときは、写真から作った配色（ダーク / ライト / ビビッド / ミュート）を
 *   全体の半分ほどの確率で選ぶ
 * - 戻る / 進む 用の履歴（最大 HISTORY_MAX 個前まで）。選び直しても前の結果は消えない
 */
import { LAYOUTS, getTemplate } from './layouts'
import { sameColors } from './palettes'
import type { SeparatorId, StyleOptions } from './draw'
import type { LayoutId } from './layouts'
import type { Palette } from './palettes'
import type { Rng } from './random'

export type Design = {
  layout: LayoutId
  palette: Palette
  style: StyleOptions
}

export type ShuffleLocks = { layout: boolean; palette: boolean }

/** 直近の何回ぶんの組み合わせを避けるか */
export const RECENT_MAX = 5
/** 戻れる数 */
export const HISTORY_MAX = 20
/** 写真から作った配色を選ぶ確率（写真があるとき） */
export const PHOTO_PALETTE_SHARE = 0.5

/**
 * 見比べて合わないと判断した組み合わせ（ランダムでは選ばない。手では選べる）。
 * [テンプレート, パレット ID]。全テンプレート × 全プリセット・写真の配色 4 種を
 * 見比べた範囲では無し。合わなかったのはテンプレートと写真の置き方の組み合わせで、
 * これは randomLayouts で外す。
 */
export const EXCLUDED: ReadonlyArray<readonly [LayoutId, string]> = []

/**
 * ランダムで選ぶテンプレート。
 * - フォトは写真が主役の組み方で、写真が無いと上半分が空いたままになるので、
 *   写真があるときだけ選ぶ
 * - センターは写真枠（帯）だと残りの高さに収めるため 2 段になり、曲名が「Kaito… ／
 *   Opening Sig…」のように両方とも詰められて読めなくなる（14 曲の 4:5 で確認）ので、
 *   写真を枠で置いているときは選ばない（全面背景なら 1 段のまま収まる）
 */
export function randomLayouts(
  hasPhoto: boolean,
  photoBand = false,
): Array<LayoutId> {
  return LAYOUTS.map((t) => t.id).filter((id) => {
    if (id === 'photo') return hasPhoto
    if (id === 'center') return !(hasPhoto && photoBand)
    return true
  })
}

export function comboKey(
  layout: LayoutId,
  palette: Pick<Palette, 'id'>,
): string {
  return `${layout}|${palette.id}`
}

export type ShuffleOptions = {
  locks: ShuffleLocks
  layouts: ReadonlyArray<LayoutId>
  presets: ReadonlyArray<Palette>
  /** 写真から作った配色（写真が無ければ空） */
  photoPalettes: ReadonlyArray<Palette>
  /** 直近の組み合わせ（comboKey）。新しいものが後ろ */
  recent: ReadonlyArray<string>
  rng: Rng
  excluded?: ReadonlyArray<readonly [LayoutId, string]>
}

function weightedPick<T>(
  items: ReadonlyArray<{ value: T; weight: number }>,
  rng: Rng,
): T | undefined {
  const total = items.reduce((sum, it) => sum + it.weight, 0)
  if (total <= 0) return undefined
  let r = rng() * total
  for (const it of items) {
    r -= it.weight
    if (r < 0) return it.value
  }
  return items.at(-1)?.value
}

const chance = (rng: Rng, p: number) => rng() < p

/** 明朝にしてよいテンプレート（曲と見出しの書体が書体の設定に従うもの） */
const SERIF_OK: ReadonlySet<LayoutId> = new Set<LayoutId>([
  'minimal',
  'photo',
  'tracklist',
  'center',
])

const SEPARATOR_WEIGHTS: Record<
  'common' | 'center',
  ReadonlyArray<{
    value: SeparatorId
    weight: number
  }>
> = {
  common: [
    { value: 'dash', weight: 3 },
    { value: 'slash', weight: 2 },
    { value: 'dot', weight: 1.5 },
  ],
  // 改行（アーティストと曲名を 2 行）は 1 曲が 2 行になって字が半分ほどに縮み、
  // 14 曲でも中央に小さな文字が細く並ぶだけになるので、ランダムでは選ばない
  center: [
    { value: 'slash', weight: 3 },
    { value: 'dash', weight: 1.5 },
    { value: 'dot', weight: 1 },
  ],
}

/**
 * テンプレートの文字組みを選び直す（見栄えのよい値の範囲だけ）。
 * 等幅の設定はテンプレートに関係ないので、今の値のまま。
 */
export function randomStyle(
  layout: LayoutId,
  prev: StyleOptions,
  rng: Rng,
): StyleOptions {
  const t = getTemplate(layout)
  const family = SERIF_OK.has(layout)
    ? chance(rng, 0.3)
      ? 'serif'
      : 'sans'
    : t.family
  const separator =
    weightedPick(
      SEPARATOR_WEIGHTS[layout === 'center' ? 'center' : 'common'],
      rng,
    ) ?? 'dash'
  // 粒子はテンプレートの既定に寄せる（Y2K はクロームが濁るので付けない）
  const grain = layout === 'y2k' ? false : chance(rng, t.grain ? 0.75 : 0.25)
  const sideNumbers =
    layout === 'tracklist' ? chance(rng, 0.4) : prev.sideNumbers
  return { family, monoMeta: prev.monoMeta, separator, grain, sideNumbers }
}

/**
 * 次のデザインを選ぶ。選べる組み合わせが無ければ（両方固定など）null。
 * 直近の組み合わせを避けると候補が無いときは、今と違うことだけを守る。
 */
export function shuffleDesign(
  current: Design,
  opts: ShuffleOptions,
): Design | null {
  const { locks, rng } = opts
  if (locks.layout && locks.palette) return null
  const excluded = new Set(
    (opts.excluded ?? EXCLUDED).map(([l, p]) => `${l}|${p}`),
  )
  const layouts = locks.layout ? [current.layout] : opts.layouts
  const photo = locks.palette ? [] : opts.photoPalettes
  const presets = locks.palette ? [current.palette] : opts.presets
  const presetShare = photo.length > 0 ? 1 - PHOTO_PALETTE_SHARE : 1
  const palettes = [
    ...presets.map((p) => ({ p, weight: presetShare / presets.length })),
    ...photo.map((p) => ({
      p,
      weight: PHOTO_PALETTE_SHARE / photo.length,
    })),
  ]
  const currentKey = comboKey(current.layout, current.palette)
  const all = layouts.flatMap((layout) =>
    palettes.map(({ p, weight }) => ({
      value: { layout, palette: p },
      weight: weight / layouts.length,
      key: comboKey(layout, p),
    })),
  )
  // 「写真から自動」は写真の配色のどれかと同じ色なので、色で見て今と同じものも外す
  const isCurrent = (c: (typeof all)[number]) =>
    c.key === currentKey ||
    (c.value.layout === current.layout &&
      sameColors(c.value.palette, current.palette))
  const allowed = all.filter((c) => !isCurrent(c) && !excluded.has(c.key))
  const recent = new Set(opts.recent.slice(-RECENT_MAX))
  const fresh = allowed.filter((c) => !recent.has(c.key))
  const picked = weightedPick(fresh.length > 0 ? fresh : allowed, rng)
  if (!picked) return null
  const style =
    locks.layout && picked.layout === current.layout
      ? current.style
      : randomStyle(picked.layout, current.style, rng)
  return { layout: picked.layout, palette: picked.palette, style }
}

/** 直近の組み合わせに足す（古いものから捨てる） */
export function pushRecent(
  recent: ReadonlyArray<string>,
  ...keys: Array<string>
): Array<string> {
  const out = [...recent]
  for (const key of keys) {
    if (out.at(-1) !== key) out.push(key)
  }
  return out.slice(-RECENT_MAX)
}

// ---------------------------------------------------------------------------
// 戻る / 進む
// ---------------------------------------------------------------------------

/**
 * 履歴。entries[index] が今のデザイン（手で変えていれば、今とずれている）。
 * 新しく選び直すと index のすぐ後ろに入れるので、戻ったあとに選び直しても、
 * 先にあった結果は 進む で取り戻せる（どれも消えない。上限を超えた分だけ古い方から捨てる）。
 */
export type DesignHistory = { entries: Array<Design>; index: number }

export const EMPTY_HISTORY: DesignHistory = { entries: [], index: -1 }

export function sameDesign(a: Design, b: Design): boolean {
  return (
    a.layout === b.layout &&
    JSON.stringify(a.palette) === JSON.stringify(b.palette) &&
    JSON.stringify(a.style) === JSON.stringify(b.style)
  )
}

/** 上限を超えたら、今の位置から遠い側（ふつうは古い方）から捨てる */
function trim(entries: Array<Design>, index: number): DesignHistory {
  const out = [...entries]
  let at = index
  while (out.length > HISTORY_MAX + 1) {
    if (at > 0) {
      out.shift()
      at -= 1
    } else {
      out.pop()
    }
  }
  return { entries: out, index: at }
}

/** 今の位置に current をそろえる（手で変えていれば、今の位置の後ろに入れる） */
function sync(history: DesignHistory, current: Design): DesignHistory {
  const { entries, index } = history
  const here = entries.at(index)
  if (index >= 0 && here && sameDesign(here, current)) return history
  const out = [...entries]
  out.splice(index + 1, 0, current)
  return { entries: out, index: index + 1 }
}

/** 選び直したときの履歴 */
export function afterShuffle(
  history: DesignHistory,
  current: Design,
  next: Design,
): DesignHistory {
  const synced = sync(history, current)
  const out = [...synced.entries]
  out.splice(synced.index + 1, 0, next)
  return trim(out, synced.index + 1)
}

export function canGoBack(history: DesignHistory, current: Design): boolean {
  const here = history.entries.at(history.index)
  if (history.index < 0 || !here) return false
  // 手で変えていれば、今の位置（選び直した結果）へ戻れる
  return history.index > 0 || !sameDesign(here, current)
}

export function canGoForward(history: DesignHistory, current: Design): boolean {
  const synced = sync(history, current)
  return synced.index < synced.entries.length - 1
}

/** 1 つ戻る（手で変えていたら、その状態は 進む で取り戻せるよう残す） */
export function goBack(
  history: DesignHistory,
  current: Design,
): { history: DesignHistory; design: Design } | null {
  if (!canGoBack(history, current)) return null
  const here = history.entries[history.index]
  if (!sameDesign(here, current)) {
    // 手で変えた状態を今の位置の後ろに残し、選び直した結果へ戻る
    const out = [...history.entries]
    out.splice(history.index + 1, 0, current)
    const trimmed = trim(out, history.index)
    return { history: trimmed, design: here }
  }
  const index = history.index - 1
  return { history: { ...history, index }, design: history.entries[index] }
}

export function goForward(
  history: DesignHistory,
  current: Design,
): { history: DesignHistory; design: Design } | null {
  const synced = sync(history, current)
  if (synced.index >= synced.entries.length - 1) return null
  const index = synced.index + 1
  const trimmed = trim(synced.entries, index)
  return {
    history: trimmed,
    design: trimmed.entries[trimmed.index],
  }
}
