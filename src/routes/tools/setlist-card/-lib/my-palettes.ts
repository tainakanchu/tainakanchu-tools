/**
 * マイパレット（自分で作った配色）を localStorage に保存する。
 * プライベートブラウズやストレージを切っている環境では読み書きが例外になるので、
 * すべて try/catch で包み、失敗しても画面は動くようにする。
 */
import { PALETTE_ROLES } from './palettes'
import type { Palette } from './palettes'

const KEY = 'setlist-card:my-palettes:v1'
const HEX = /^#[0-9a-f]{6}$/i

function isPalette(value: unknown): value is Palette {
  if (typeof value !== 'object' || value === null) return false
  const get = (key: string): unknown => Reflect.get(value, key)
  return (
    typeof get('id') === 'string' &&
    typeof get('name') === 'string' &&
    PALETTE_ROLES.every((r) => {
      const v = get(r)
      return typeof v === 'string' && HEX.test(v)
    })
  )
}

export function loadMyPalettes(): Array<Palette> {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPalette).map((p) => {
      const out: Palette = { id: p.id, name: p.name.slice(0, 40), ...pick(p) }
      return out
    })
  } catch {
    return []
  }
}

function pick(p: Palette) {
  return {
    bg: p.bg,
    fg: p.fg,
    muted: p.muted,
    accent: p.accent,
    rule: p.rule,
    scrim: p.scrim,
  }
}

/** 保存できたら true */
export function saveMyPalettes(list: ReadonlyArray<Palette>): boolean {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(list.map((p) => ({ id: p.id, name: p.name, ...pick(p) }))),
    )
    return true
  } catch {
    return false
  }
}

export function newMyPaletteId(): string {
  return `mine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}
