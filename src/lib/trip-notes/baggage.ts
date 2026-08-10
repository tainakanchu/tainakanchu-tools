/**
 * 移動の荷物枠(身の回り品・機内/車内持込・受託)のパースと表示。
 *
 * ■ なぜ storage.ts に埋め込まないのか
 *   パース規則と「画面に出す 1 行」の組み立ては、フォーム・カード・印刷・共有・
 *   AI 取り込みの複数箇所から同じものを使う。storage.ts に閉じると表示側が
 *   独自に組み立て始めて表記が割れる。ここは「荷物枠という値の型まわり」だけを
 *   受け持つ純関数の置き場で、DOM や保存キーには依存しない。
 *
 * ■ 未入力と「枠なし」を混ぜない
 *   pieces: 0 は「無料枠なし」(LCC の手ぶら運賃など)。
 *   pieces が無い / スロット自体が無いのは「書類に書かれていない・未入力」。
 *   後者を 0 に正規化すると、分からないのに「無い」と断言してしまう。
 */

import type { BaggageAllowance, BookingBaggage } from './types'

/** 個数として受け付ける上限。現実の無料枠は数個なので、桁間違いを弾く */
export const MAX_BAGGAGE_PIECES = 20

/** 重量(kg)として受け付ける上限。同様に桁間違いを弾く */
export const MAX_BAGGAGE_WEIGHT_KG = 100

export type BaggageSlot = keyof BookingBaggage

export const BAGGAGE_SLOTS: Array<BaggageSlot> = [
  'personal',
  'cabin',
  'checked',
]

export const BAGGAGE_SLOT_LABELS: Record<BaggageSlot, string> = {
  personal: '身の回り品',
  cabin: '機内/車内持込',
  checked: '受託手荷物',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 1 スロット分。不正な項目は落として、1 つも残らなければ undefined。
 * 予約全体は落とさない(storage の任意フィールド方針と同じ)。
 */
export function parseBaggageAllowance(
  raw: unknown,
): BaggageAllowance | undefined {
  if (!isRecord(raw)) return undefined

  const allowance: BaggageAllowance = {}

  if (
    typeof raw.pieces === 'number' &&
    Number.isInteger(raw.pieces) &&
    raw.pieces >= 0 &&
    raw.pieces <= MAX_BAGGAGE_PIECES
  ) {
    allowance.pieces = raw.pieces
  }

  if (
    typeof raw.weightKg === 'number' &&
    Number.isFinite(raw.weightKg) &&
    raw.weightKg > 0 &&
    raw.weightKg <= MAX_BAGGAGE_WEIGHT_KG
  ) {
    allowance.weightKg = raw.weightKg
  }

  if (typeof raw.dimensions === 'string') {
    const trimmed = raw.dimensions.trim()
    if (trimmed.length > 0) allowance.dimensions = trimmed
  }

  if (typeof raw.note === 'string') {
    const trimmed = raw.note.trim()
    if (trimmed.length > 0) allowance.note = trimmed
  }

  return Object.keys(allowance).length > 0 ? allowance : undefined
}

/**
 * Booking.baggage。スロットが 1 つも残らなければ undefined
 * (空オブジェクトを保存しない)。
 */
export function parseBookingBaggage(raw: unknown): BookingBaggage | undefined {
  if (!isRecord(raw)) return undefined

  const baggage: BookingBaggage = {}
  for (const slot of BAGGAGE_SLOTS) {
    const allowance = parseBaggageAllowance(raw[slot])
    if (allowance !== undefined) baggage[slot] = allowance
  }

  return Object.keys(baggage).length > 0 ? baggage : undefined
}

/** 1 スロットを短い日本語にする。「1個・7kg・55×40×20cm」など */
export function formatBaggageAllowance(allowance: BaggageAllowance): string {
  const parts: Array<string> = []

  if (allowance.pieces !== undefined) {
    parts.push(allowance.pieces === 0 ? 'なし' : `${allowance.pieces}個`)
  }
  if (allowance.weightKg !== undefined) {
    parts.push(`${allowance.weightKg}kg`)
  }
  if (allowance.dimensions !== undefined) {
    parts.push(allowance.dimensions)
  }
  if (allowance.note !== undefined) {
    parts.push(allowance.note)
  }

  return parts.join('・')
}

/**
 * 荷物枠全体の 1 行要約。
 * 例: 「身の回り品 1個・3kg / 機内/車内持込 1個・7kg / 受託手荷物 1個・23kg」
 * 空なら null(呼び出し側で行ごと出さない)。
 */
export function formatBookingBaggage(
  baggage: BookingBaggage | undefined,
): string | null {
  if (baggage === undefined) return null

  const parts: Array<string> = []
  for (const slot of BAGGAGE_SLOTS) {
    const allowance = baggage[slot]
    if (allowance === undefined) continue
    const body = formatBaggageAllowance(allowance)
    if (body.length === 0) continue
    parts.push(`${BAGGAGE_SLOT_LABELS[slot]} ${body}`)
  }

  return parts.length > 0 ? parts.join(' / ') : null
}
