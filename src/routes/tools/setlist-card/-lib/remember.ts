/**
 * 最後に使ったテンプレート・配色・サイズを覚えておく（localStorage）。
 *
 * - 読み書きはすべて try/catch（プライベートブラウズやストレージを切った環境でも動く）
 * - 写真から作った配色は写真ごとのものなので覚えない（写真は覚えないため）
 * - フォトのテンプレートは写真が無いと上半分が空くので、開き直したときには戻さない
 * - 中身は信用しない: 知らない ID・壊れた色は捨てて、既定に任せる
 */
import { CANVAS_SIZES, LAYOUTS } from './layouts'
import { PALETTE_ROLES, getPreset } from './palettes'
import type { CanvasSize, LayoutId } from './layouts'
import type { Palette, PaletteColors, PaletteRole } from './palettes'

export const REMEMBER_KEY = 'setlist-card:last-design:v1'

export type Remembered = {
  layout?: LayoutId
  palette?: Palette
  sizeId?: CanvasSize['id']
}

const HEX = /^#[0-9a-f]{6}$/i

/** 覚えてよい配色か（写真から作った配色は覚えない） */
export function isRememberablePalette(palette: Pick<Palette, 'id'>): boolean {
  return !palette.id.startsWith('photo')
}

function parsePalette(value: unknown): Palette | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const get = (key: string): unknown => Reflect.get(value, key)
  const id = get('id')
  if (typeof id !== 'string' || !isRememberablePalette({ id })) return undefined
  // プリセットは ID だけで引く（色はコードの側が正）
  const preset = getPreset(id)
  if (preset) return preset
  const name = get('name')
  if (typeof name !== 'string') return undefined
  const colors: Array<[PaletteRole, string]> = []
  for (const role of PALETTE_ROLES) {
    const v = get(role)
    if (typeof v !== 'string' || !HEX.test(v)) return undefined
    colors.push([role, v.toLowerCase()])
  }
  const hex = (role: PaletteRole) =>
    colors.find(([r]) => r === role)?.[1] ?? '#000000'
  return {
    id,
    name: name.slice(0, 40),
    bg: hex('bg'),
    fg: hex('fg'),
    muted: hex('muted'),
    accent: hex('accent'),
    rule: hex('rule'),
    scrim: hex('scrim'),
  }
}

/** 保存した文字列を読む（壊れていても例外にせず、読めた分だけ返す） */
export function parseRemembered(raw: string | null | undefined): Remembered {
  if (!raw) return {}
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return {}
  const get = (key: string): unknown => Reflect.get(data, key)
  const out: Remembered = {}
  const layout = get('layout')
  const known = LAYOUTS.find((t) => t.id === layout)
  if (known && known.id !== 'photo') out.layout = known.id
  const size = CANVAS_SIZES.find((s) => s.id === get('size'))
  if (size) out.sizeId = size.id
  const palette = parsePalette(get('palette'))
  if (palette) out.palette = palette
  return out
}

function pickColors(p: PaletteColors): PaletteColors {
  return {
    bg: p.bg,
    fg: p.fg,
    muted: p.muted,
    accent: p.accent,
    rule: p.rule,
    scrim: p.scrim,
  }
}

/** 保存する文字列（写真の配色なら配色は入れない） */
export function serializeRemembered(value: Remembered): string {
  const palette =
    value.palette && isRememberablePalette(value.palette)
      ? getPreset(value.palette.id)
        ? { id: value.palette.id }
        : {
            id: value.palette.id,
            name: value.palette.name,
            ...pickColors(value.palette),
          }
      : undefined
  return JSON.stringify({
    layout: value.layout,
    palette,
    size: value.sizeId,
  })
}

export function loadRemembered(): Remembered {
  try {
    return parseRemembered(window.localStorage.getItem(REMEMBER_KEY))
  } catch {
    return {}
  }
}

/**
 * 覚える。写真の配色のときは、前に覚えた配色を残す（写真を外したあとに戻る先）。
 * 保存できなくても黙って続ける。
 */
export function saveRemembered(value: Remembered): void {
  try {
    const prev = loadRemembered()
    const palette =
      value.palette && isRememberablePalette(value.palette)
        ? value.palette
        : prev.palette
    window.localStorage.setItem(
      REMEMBER_KEY,
      serializeRemembered({ ...value, palette }),
    )
  } catch {
    // 保存できない環境では覚えないだけ
  }
}

/** 一度だけ出すヒントを出したか（写真のドラッグなど） */
export function seenOnce(key: string): boolean {
  try {
    return window.localStorage.getItem(`setlist-card:seen:${key}`) === '1'
  } catch {
    return true
  }
}

export function markSeen(key: string): void {
  try {
    window.localStorage.setItem(`setlist-card:seen:${key}`, '1')
  } catch {
    // 覚えられなければ、次も出るだけ
  }
}
