/**
 * セトリ画像を Canvas 2D に描く（入口）。
 * プレビューも書き出しも同じ関数・同じ論理 px のレイアウトで描く。書き出しだけ
 * canvas を倍率ぶん大きくして ctx.scale を掛ける（devicePixelRatio と同じ）ので、
 * 見たものと書き出した画像は、細かさが違うだけで同じ絵になる。
 *
 * テンプレート（構図と文字組み）とパレット（色の役割）は独立していて、
 * どのテンプレートもどのパレットで描ける。写真を全面に敷くときは、
 * 文字の後ろの実際の画素で読みやすさを測って、幕の濃さと文字色を決める。
 *
 * 曲が多いときは 1 枚を複数ページに分けられる（renderPage を枚数ぶん呼ぶ）。
 * 2 枚目以降は 1 枚目と同じ組み方（段数・行の形・文字サイズ）にそろえる。
 */
import { cleanArtistName, cleanTitle } from './clean'
import { hexToRgb, readableOn, rgbToHex } from './color'
import {
  drawGrain,
  drawScrim,
  drawText,
  font,
  resetMeasureCache,
  scratchContext,
  scrimWeight,
  sharedMeasure,
} from './draw'
import {
  MAX_PAGES,
  distributePages,
  getTemplate,
  maxColumnsFor,
  minLegibleFont,
  planPhotoBlock,
} from './layouts'
import { SCRIM_MIN, ditherStops, duotoneStops } from './palettes'
import { photoSampler, processedPhoto } from './photo'
import { resolvePhotoColors } from './photo-contrast'
import { formatBpm, formatOffset } from './text'
import { renderCenter } from './tpl-center'
import {
  renderLegacyColumns,
  renderLegacyList,
  renderLegacyPoster,
} from './tpl-legacy'
import { renderCopy, renderPhoto } from './tpl-photo'
import { renderEditorial, renderMinimal, renderTracklist } from './tpl-simple'
import { renderY2k } from './tpl-y2k'
import type { TintMode } from './color'
import type {
  Colors,
  Ctx,
  DisplayOptions,
  ScrimZone,
  StyleOptions,
  TextBox,
  TextOptions,
} from './draw'
import type { Rect } from './fit'
import type {
  CanvasSize,
  ColumnsSetting,
  LayoutId,
  PhotoMode,
  PhotoSettings,
} from './layouts'
import type { Palette } from './palettes'
import type { LoadedPhoto } from './photo'
import type { Sample } from './photo-contrast'
import type { RowItem } from './rows'
import type {
  LayoutResult,
  Meta,
  PageLock,
  PageSpec,
  TemplateArgs,
} from './template-types'
import type { Setlist, Track } from './types'

export { resetMeasureCache }
export type { DisplayOptions, StyleOptions, TextOptions } from './draw'
export type { PageLock, PageSpec } from './template-types'

export type SplitOptions = {
  enabled: boolean
  mode: 'auto' | 'manual'
  /** 手動のときの枚数 */
  count: number
}

export type RenderInput = {
  setlist: Setlist
  layout: LayoutId
  size: CanvasSize
  palette: Palette
  style: StyleOptions
  display: DisplayOptions
  text: TextOptions
  columns: ColumnsSetting
  split: SplitOptions
  photo: { image: LoadedPhoto; settings: PhotoSettings } | null
}

export type MetaKey = 'time' | 'bpm' | 'key' | 'label'
export const META_LABELS: Record<MetaKey, string> = {
  time: '開始時刻',
  bpm: 'BPM',
  key: 'Key',
  label: 'レーベル',
}

export type RenderInfo = {
  overflow: boolean
  hiddenCount: number
  /** 実際に使った写真の置き方（写真が無ければ null） */
  photoMode: PhotoMode | null
  /** 写真の描画範囲（プレビューでのドラッグ用、書き出し座標） */
  photoRect: Rect | null
  /** 写真枠では曲が入りきらず、全面背景に切り替えたか */
  photoFallback: boolean
  /** 幅が足りずに隠した補足列 */
  hiddenMeta: Array<MetaKey>
  lock: PageLock
  /** 曲の文字サイズ（ページ数の自動決定に使う） */
  textSize: number
  /** 段が狭くて名前が切れがちか（ページ数の自動決定に使う） */
  cramped: boolean
  /** 写真の上の読みやすさの調整（全面背景のときだけ） */
  photoContrast: {
    /** 幕のいちばん濃いところ */
    scrim: number
    /** パレットと逆の向きの文字色にしたか */
    flipped: boolean
    /** 幕を上限まで濃くしても足りず、文字色を補正したか */
    adjusted: boolean
  } | null
}

// ---------------------------------------------------------------------------
// 曲データ → 表示用
// ---------------------------------------------------------------------------

const LABEL_MAX = 18

/** A1 / A2 … B1 のような面ごとの番号（12 曲までは 2 面、それより多ければ 6 曲ずつ） */
export function sideNumber(index: number, count: number): string {
  const perSide = count <= 12 ? Math.max(1, Math.ceil(count / 2)) : 6
  const side = Math.min(25, Math.floor(index / perSide))
  return `${String.fromCharCode(65 + side)}${(index % perSide) + 1}`
}

function toItems(
  tracks: ReadonlyArray<Track>,
  input: Pick<RenderInput, 'display' | 'text' | 'style' | 'layout'>,
): { items: Array<RowItem>; metaKeys: Array<MetaKey> } {
  const { display, text } = input
  const starts = tracks
    .map((t) => t.startAt)
    .filter((v): v is number => v !== undefined)
  const origin = starts.length > 0 ? Math.min(...starts) : undefined
  const keys: Array<MetaKey> = ['time', 'bpm', 'key', 'label']
  const raw = tracks.map((track) => ({
    time:
      display.time && track.startAt !== undefined && origin !== undefined
        ? formatOffset(track.startAt - origin)
        : '',
    bpm: display.bpm && track.bpm !== undefined ? formatBpm(track.bpm) : '',
    key: display.key && track.key ? track.key : '',
    label:
      display.label && track.label
        ? Array.from(track.label).length > LABEL_MAX
          ? `${Array.from(track.label)
              .slice(0, LABEL_MAX - 1)
              .join('')
              .trimEnd()}…`
          : track.label
        : '',
  }))
  // 1 曲も値が無い列は詰める
  const metaKeys = keys.filter((k) => raw.some((r) => r[k] !== ''))
  const sides = input.style.sideNumbers && input.layout === 'tracklist'
  const items = tracks.map((track, index) => ({
    num: sides
      ? sideNumber(index, tracks.length)
      : String(index + 1).padStart(2, '0'),
    artist: cleanArtistName(track.artist, text),
    title: cleanTitle(track.title, text),
    meta: metaKeys.map((k) => raw[index][k]),
  }))
  return { items, metaKeys }
}

/** レコードの品番風の ID（DJ 名の頭 3 文字 + 日付の数字） */
export function catalogId(setlist: Setlist, total: number): string {
  const source = setlist.djName || setlist.title || ''
  const letters =
    source
      .normalize('NFKD')
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase()
      .slice(0, 3) || 'SET'
  const digits = (setlist.date ?? '').replace(/\D/g, '')
  return `${letters}-${digits.length >= 6 ? digits : String(total).padStart(3, '0')}`
}

function metaOf(setlist: Setlist): Meta {
  const starts = setlist.tracks
    .map((t) => t.startAt)
    .filter((v): v is number => v !== undefined)
    .toSorted((a, b) => a - b)
  let setLength: number | undefined
  if (starts.length >= 2) {
    const last = setlist.tracks.findLast((t) => t.startAt !== undefined)
    const gaps = starts.slice(1).map((v, i) => v - starts[i])
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
    setLength =
      starts[starts.length - 1] - starts[0] + (last?.durationSec ?? avg)
  }
  const total = setlist.tracks.length
  return {
    event: setlist.title?.trim() ?? '',
    dj: setlist.djName?.trim() ?? '',
    date: setlist.date?.trim() ?? '',
    venue: setlist.venue?.trim() ?? '',
    total,
    setLength,
    catalog: catalogId(setlist, total),
  }
}

// ---------------------------------------------------------------------------
// テンプレートの振り分け
// ---------------------------------------------------------------------------

const RENDERERS: Record<LayoutId, (a: TemplateArgs) => LayoutResult> = {
  minimal: renderMinimal,
  photo: renderPhoto,
  tracklist: renderTracklist,
  center: renderCenter,
  editorial: renderEditorial,
  copy: renderCopy,
  y2k: renderY2k,
  list: renderLegacyList,
  columns: renderLegacyColumns,
  poster: renderLegacyPoster,
}

/** このサイズで選べる段数の上限（UI 用） */
export function columnsLimit(size: { width: number; height: number }): number {
  const u = Math.min(size.width, size.height * 1.6) / 1080
  const margin = (size.width > size.height * 1.3 ? 0.06 : 0.07) * size.width
  return maxColumnsFor(size, size.width - margin * 2, 48 * u)
}

/** テンプレートが写真に掛ける色調（コピーは必ずコピー機風、Y2K は既定でドット） */
export function effectiveTint(layout: LayoutId, tint: TintMode): TintMode {
  if (layout === 'copy') return 'xerox'
  if (layout === 'y2k' && tint === 'none') return 'dither'
  return tint
}

function baseColors(palette: Palette): Colors {
  const accent2 = palette.accent2 ?? palette.accent
  return {
    bg: palette.bg,
    fg: palette.fg,
    muted: palette.muted,
    accent: palette.accent,
    accent2,
    rule: palette.rule,
    scrim: palette.scrim,
    onAccent: rgbToHex(readableOn(hexToRgb(palette.accent))),
    onAccent2: rgbToHex(readableOn(hexToRgb(accent2))),
  }
}

function setupCtx(
  c: CanvasRenderingContext2D,
  input: RenderInput,
  onPhoto: boolean,
  scale: number,
): Ctx {
  const { width: W, height: H } = input.size
  const safe = input.size.id === 'story' ? Math.round(H * 0.13) : 0
  return {
    c,
    W,
    H,
    scale,
    u: Math.min(W, H) / 1080,
    s: Math.min(W, H * 1.6) / 1080,
    minFont: minLegibleFont(input.size),
    pal: baseColors(input.palette),
    base: baseColors(input.palette),
    palette: input.palette,
    measure: sharedMeasure,
    display: input.display,
    text: input.text,
    style: input.style,
    safe: { top: safe, bottom: safe },
    boxes: null,
    zone: 0,
    onPhoto,
  }
}

type PaintResult = LayoutResult & {
  photoRect: Rect | null
  photoContrast: RenderInfo['photoContrast']
}

/** 縮小した写真から、文字の範囲の画素を幕の区域ごとに集める */
function collectSamples(
  sample: (x: number, y: number) => readonly [number, number, number],
  step: number,
  boxes: ReadonlyArray<TextBox>,
  zones: ReadonlyArray<ScrimZone>,
): Array<Array<Sample>> {
  const out: Array<Array<Sample>> = zones.map(() => [])
  for (const box of boxes) {
    if (box.zone < 0) continue
    const zi = Math.min(zones.length - 1, box.zone)
    const zone = zones[zi]
    for (let y = box.y + step / 2; y < box.y + box.h; y += step) {
      for (let x = box.x + step / 2; x < box.x + box.w; x += step) {
        out[zi].push({ rgb: sample(x, y), w: scrimWeight(zone, x, y) })
      }
    }
  }
  // 多すぎると重いので間引く（最低コントラストの画素を落とさないよう、均等に）
  return out.map((list) => {
    const limit = 6000
    if (list.length <= limit) return list
    const k = list.length / limit
    return Array.from({ length: limit }, (_, i) => list[Math.floor(i * k)])
  })
}

let underlay: HTMLCanvasElement | null = null

/** ぼかした写真を、幕の区域のグラデーション（文字の側ほど濃い）で重ねる */
function drawMaskedUnderlay(
  ctx: Ctx,
  blurred: HTMLCanvasElement,
  zones: ReadonlyArray<ScrimZone>,
) {
  const { W, H, scale } = ctx
  // 重ね用の canvas も書き出しの画素数で持つ（1x に戻れば縮め直す）
  const pw = Math.round(W * scale)
  const ph = Math.round(H * scale)
  underlay ??= document.createElement('canvas')
  if (underlay.width !== pw) underlay.width = pw
  if (underlay.height !== ph) underlay.height = ph
  const u = underlay.getContext('2d')
  if (!u) return
  u.setTransform(scale, 0, 0, scale, 0, 0)
  for (const zone of zones) {
    u.globalCompositeOperation = 'source-over'
    u.clearRect(0, 0, W, H)
    u.drawImage(blurred, 0, 0, W, H)
    u.globalCompositeOperation = 'destination-in'
    drawScrim({ ...ctx, c: u }, zone, '#000000', 1)
    u.globalCompositeOperation = 'source-over'
    ctx.c.drawImage(underlay, 0, 0, W, H)
  }
}

function paint(
  c: CanvasRenderingContext2D,
  input: RenderInput,
  mode: PhotoMode | null,
  page: PageSpec,
  lock: PageLock | undefined,
  dry: boolean,
  scale: number,
): PaintResult {
  const photoBg = input.photo !== null && mode === 'background'
  const ctx = setupCtx(c, input, photoBg, scale)
  const { W, H } = ctx
  // 写真枠は 1 枚目だけ（2 枚目以降は曲に場所を回す）
  const plan =
    mode === 'block' && page.index === 0
      ? planPhotoBlock(input.layout, input.size)
      : null
  const meta = metaOf(input.setlist)
  const { items: all, metaKeys } = toItems(input.setlist.tracks, input)
  const items = all.slice(page.start, page.end)
  const frame = plan ? plan.content : { x: 0, y: 0, w: W, h: H }
  const render = RENDERERS[input.layout]
  const argsFor = (target: Ctx): TemplateArgs => ({
    ctx: target,
    meta,
    items,
    frame,
    plan,
    page,
    lock,
    columns: input.columns,
    photoBg,
    metaKeys,
  })
  if (dry) {
    return { ...render(argsFor(ctx)), photoRect: null, photoContrast: null }
  }

  c.save()
  // 以降はすべて論理 px で描く（canvas は論理 px × scale の画素）
  c.setTransform(scale, 0, 0, scale, 0, 0)
  c.clearRect(0, 0, W, H)
  c.fillStyle = ctx.pal.bg
  c.fillRect(0, 0, W, H)
  let photoRect: Rect | null = null
  let photoContrast: RenderInfo['photoContrast'] = null
  const photo = input.photo
  const tint = photo ? effectiveTint(input.layout, photo.settings.tint) : 'none'
  const effect = photo
    ? {
        zoom: photo.settings.zoom,
        posX: photo.settings.posX,
        posY: photo.settings.posY,
        blur: photo.settings.blur,
        tint,
      }
    : null
  const stops =
    tint === 'dither' ? ditherStops(input.palette) : duotoneStops(input.palette)
  if (photo && effect && photoBg) {
    photoRect = { x: 0, y: 0, w: W, h: H }
    const processed = processedPhoto(
      photo.image,
      photoRect,
      effect,
      stops,
      scale,
    )
    c.drawImage(processed, 0, 0, W, H)
    // 下描きで文字の範囲を集め、その後ろの画素で幕の濃さと文字色を決める
    const probe: Ctx = { ...ctx, c: scratchContext(), boxes: [] }
    const trial = render(argsFor(probe))
    if (!trial.solidText) {
      const zones: Array<ScrimZone> = trial.scrim ?? [{ edge: 'all' }]
      const uniform = zones.length === 1 && zones[0].edge === 'all'
      // 文字の後ろの画素は、倍率に関係なく 1x で加工した写真から測る（プレビューで
      // 作ったものがキャッシュにあるので安く、書き出しの倍率で幕の濃さが変わらない）
      let behind1x =
        scale === 1
          ? processed
          : processedPhoto(photo.image, photoRect, effect, stops, 1)
      if (!uniform) {
        // 文字の下だけ写真を少しぼかす（幕を薄くできる）。幕と同じグラデーションで馴染ませる
        const underEffect = {
          ...effect,
          blur: Math.max(effect.blur, 6 * ctx.s),
        }
        const behind = processedPhoto(
          photo.image,
          photoRect,
          underEffect,
          stops,
          scale,
        )
        drawMaskedUnderlay(ctx, behind, zones)
        behind1x =
          scale === 1
            ? behind
            : processedPhoto(photo.image, photoRect, underEffect, stops, 1)
      }
      const sampler = photoSampler(behind1x)
      const samples = collectSamples(
        sampler.at,
        sampler.step,
        probe.boxes ?? [],
        zones,
      )
      const resolved = resolvePhotoColors(input.palette, samples, {
        floor: photo.settings.dim,
        // 一様な幕は写真全体を暗くするので、下限を少し下げる
        min: uniform ? 0.25 : SCRIM_MIN,
      })
      ctx.pal = {
        ...ctx.pal,
        fg: resolved.fg,
        muted: resolved.muted,
        accent: resolved.accent,
        rule: resolved.rule,
        scrim: resolved.scrim,
        onAccent: rgbToHex(readableOn(hexToRgb(resolved.accent))),
      }
      zones.forEach((zone, i) =>
        drawScrim(ctx, zone, resolved.scrim, resolved.alphas[i] ?? 0),
      )
      photoContrast = {
        scrim: Math.max(0, ...resolved.alphas),
        flipped: resolved.flipped,
        adjusted: resolved.adjusted,
      }
    }
  }
  if (photo && effect && plan) {
    photoRect = plan.photo
    const processed = processedPhoto(
      photo.image,
      plan.photo,
      effect,
      stops,
      scale,
    )
    c.drawImage(
      processed,
      plan.photo.x,
      plan.photo.y,
      plan.photo.w,
      plan.photo.h,
    )
    if (photo.settings.dim > 0) {
      c.fillStyle = `rgba(${hexToRgb(input.palette.scrim).join(',')},${photo.settings.dim})`
      c.fillRect(plan.photo.x, plan.photo.y, plan.photo.w, plan.photo.h)
    }
  }
  const result = render(argsFor(ctx))
  if (all.length === 0) {
    // まだ曲が無いときの案内（書き出す前提ではないプレビュー用）
    drawText(
      ctx,
      '履歴ファイルを読み込むと、ここに曲が並びます',
      W / 2,
      H * 0.62,
      font(400, 28 * ctx.s, 'sans'),
      ctx.pal.muted,
      'center',
      'middle',
    )
  }
  if (input.style.grain) drawGrain(ctx, 0.07)
  c.restore()
  return { ...result, photoRect, photoContrast }
}

function hiddenMetaOf(input: RenderInput, shown: number): Array<MetaKey> {
  const { metaKeys } = toItems(input.setlist.tracks, input)
  return metaKeys.slice(shown)
}

/**
 * 1 枚描く。写真枠で曲があふれるときは、全面背景なら入るか試して切り替える
 * （複数枚に分ける設定のときはページで解決するので切り替えない）。
 * dry なら背景や写真を描かずに組み方だけ計算する（ページ数の試算用）。
 * scale は書き出しの倍率。canvas は呼び出し側で論理 px × scale の大きさにしておく
 * （組み方は倍率に関係なく同じ）。
 */
export function renderPage(
  c: CanvasRenderingContext2D,
  input: RenderInput,
  page: PageSpec,
  lock?: PageLock,
  dry = false,
  scale = 1,
): RenderInfo {
  const info = (
    r: PaintResult,
    mode: PhotoMode | null,
    fallback: boolean,
  ): RenderInfo => ({
    overflow: r.overflow,
    hiddenCount: r.hidden,
    photoMode: mode,
    photoRect: r.photoRect,
    photoFallback: fallback,
    hiddenMeta: hiddenMetaOf(input, r.metaShown),
    lock: r.lock,
    textSize: r.textSize,
    cramped: r.cramped ?? false,
    photoContrast: r.photoContrast,
  })
  if (!input.photo)
    return info(paint(c, input, null, page, lock, dry, scale), null, false)

  let mode = input.photo.settings.mode
  let fallback = false
  if (mode === 'block' && !planPhotoBlock(input.layout, input.size)) {
    mode = 'background'
    // 写真枠に対応しないテンプレート（フォト）は、切り替えたとは言わない
    fallback = getTemplate(input.layout).photoBlock
  }
  let r = paint(c, input, mode, page, lock, dry, scale)
  if (
    mode === 'block' &&
    r.overflow &&
    !input.split.enabled &&
    page.index === 0
  ) {
    const alt = paint(c, input, 'background', page, lock, dry, scale)
    if (alt.overflow) {
      // 背景にしても入らないなら、写真枠のまま描き直す（ユーザーの選択を尊重）
      r = paint(c, input, 'block', page, lock, dry, scale)
    } else {
      r = alt
      mode = 'background'
      fallback = true
    }
  }
  return info(r, mode, fallback)
}

export type PagePlan = {
  pages: Array<PageSpec>
  auto: boolean
  /** 全ページをそろえる組み方（分割しないときは無し） */
  lock?: PageLock
  /** 最後のページに入りきらない曲があるか */
  overflow: boolean
}

function toSpecs(
  ranges: Array<{ start: number; end: number }>,
): Array<PageSpec> {
  return ranges.map((r, index) => ({
    index,
    count: ranges.length,
    start: r.start,
    end: r.end,
  }))
}

/**
 * count 枚に割り付ける。1 枚目に均等割りぶんの曲を入れて組み方（lock）を決め、
 * 以降は全ページをその組み方で、実際に入る曲数を測りながら詰める。
 * 入りきらない曲は次のページへ送り、「ほか N 曲」は最後のページにしか出ない。
 */
function planWith(
  input: RenderInput,
  count: number,
): { plan: PagePlan; textSize: number; cramped: boolean } {
  const n = input.setlist.tracks.length
  const c = scratchContext()
  const spec = (index: number, start: number, end: number): PageSpec => ({
    index,
    count,
    start,
    end,
  })
  const first = renderPage(
    c,
    input,
    spec(0, 0, Math.ceil(n / count)),
    undefined,
    true,
  )
  const lock = first.lock
  const distribute = (pageLock: PageLock) => {
    const fits = (index: number, start: number, k: number) =>
      !renderPage(c, input, spec(index, start, start + k), pageLock, true)
        .overflow
    const capacity = (index: number, start: number, want: number) => {
      if (fits(index, start, want)) return want
      let lo = 0
      let hi = want
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2)
        if (fits(index, start, mid)) lo = mid
        else hi = mid
      }
      return lo
    }
    return distributePages(n, count, capacity)
  }
  let { ranges, overflow } = distribute(lock)
  let chosen = first
  if (overflow && count > 1) {
    // 2 枚目以降の方が狭いテンプレートでは、1 枚目で決めた大きさだと後ろが
    // あふれる。2 枚目で組み方を決め直して、全曲入るならそちらを使う
    const second = renderPage(
      c,
      input,
      spec(1, 0, Math.ceil(n / count)),
      undefined,
      true,
    )
    const retry = distribute(second.lock)
    if (!retry.overflow) {
      ranges = retry.ranges
      overflow = false
      chosen = second
    }
  }
  return {
    plan: {
      pages: toSpecs(ranges),
      auto: false,
      lock: chosen.lock,
      overflow,
    },
    textSize: chosen.textSize,
    cramped: chosen.cramped,
  }
}

/**
 * 何枚に分けるか決める。
 * 自動なら、全曲が入り、1 枚目の文字が「最小サイズの 1.15 倍以上」で段が狭すぎない（ポスターは
 * 最小サイズ以上）になる最小の枚数。届かなければ全曲が入る最小の枚数。
 * 手動なら指定の枚数で割り付け、入りきらなければ最後のページで「ほか N 曲」。
 */
export function planPages(input: RenderInput): PagePlan {
  const n = input.setlist.tracks.length
  if (!input.split.enabled || n === 0) {
    return {
      pages: toSpecs([{ start: 0, end: n }]),
      auto: false,
      overflow: false,
    }
  }
  const limit = Math.min(MAX_PAGES, Math.max(1, n))
  if (input.split.mode === 'manual') {
    return planWith(input, Math.min(limit, Math.max(1, input.split.count))).plan
  }
  // リスト系は最小サイズより一回り大きく読めるまで枚数を増やす。ポスターは
  // 流し込みの密度そのものが見せ方なので、最小サイズで入れば増やさない
  // 横長（16:9）は高さが無いので、最小サイズで入れば増やさない
  const comfortable =
    minLegibleFont(input.size) *
    (input.layout === 'poster' || input.size.width > input.size.height * 1.3
      ? 1
      : 1.15)
  let firstFit: PagePlan | undefined
  let last: PagePlan | undefined
  for (let count = 1; count <= limit; count++) {
    const { plan, textSize, cramped } = planWith(input, count)
    last = plan
    if (plan.overflow) continue
    firstFit ??= plan
    if (textSize >= comfortable && !cramped) return { ...plan, auto: true }
  }
  const chosen = firstFit ?? last
  return chosen
    ? { ...chosen, auto: true }
    : { pages: toSpecs([{ start: 0, end: n }]), auto: true, overflow: true }
}
