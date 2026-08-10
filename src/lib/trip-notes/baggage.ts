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
 *
 * ■ 表示は「数・寸法」と「注記」を分ける
 *   note に「前の座席の下」「総重量 7kg まで」のような長い説明が入りやすく、
 *   個数・寸法と同じ・で繋ぐと 1 行が読めなくなる。metrics と note を分け、
 *   カードはスロットごとに行を分けて出す。
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

/** フォーム・詳細見出し用のフルラベル */
export const BAGGAGE_SLOT_LABELS: Record<BaggageSlot, string> = {
  personal: '身の回り品',
  cabin: '機内/車内持込',
  checked: '受託手荷物',
}

/**
 * カード・印刷・1 行要約用の短いラベル。
 * 一覧で 3 行並ぶとき「身の回り品」「機内/車内持込」だとラベルが値より重い。
 */
export const BAGGAGE_SLOT_SHORT_LABELS: Record<BaggageSlot, string> = {
  personal: '身の回り',
  cabin: '機内持込',
  checked: '受託',
}

/** カード展開などで 1 スロット分を行にするときの形 */
export interface BaggageSlotView {
  slot: BaggageSlot
  /** 短いラベル(身の回り / 機内持込 / 受託) */
  label: string
  /** 個数・重量・寸法だけ。「1個 · 23kg · 55×40×20cm」 */
  metrics: string
  /** 補足。無ければ undefined */
  note?: string
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

/**
 * 個数・重量・寸法だけを短い日本語にする。note は含めない。
 * 例: 「1個 · 7kg · 55×40×20cm」「なし」
 */
export function formatBaggageMetrics(allowance: BaggageAllowance): string {
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

  return parts.join(' · ')
}

/**
 * 1 スロットの全文(metrics + note)。未確認チェックリストなど 1 文字列が要るとき用。
 * note は括弧に入れ、metrics と混ぜない。
 */
export function formatBaggageAllowance(allowance: BaggageAllowance): string {
  const metrics = formatBaggageMetrics(allowance)
  if (allowance.note === undefined) return metrics
  if (metrics.length === 0) return allowance.note
  return `${metrics}（${allowance.note}）`
}

/**
 * カード・印刷向けに、埋まっているスロットを行の配列にする。
 * 空なら null(呼び出し側でブロックごと出さない)。
 */
export function listBaggageSlots(
  baggage: BookingBaggage | undefined,
): Array<BaggageSlotView> | null {
  if (baggage === undefined) return null

  const rows: Array<BaggageSlotView> = []
  for (const slot of BAGGAGE_SLOTS) {
    const allowance = baggage[slot]
    if (allowance === undefined) continue
    const metrics = formatBaggageMetrics(allowance)
    // metrics も note も空はありえない(parse が弾く)が、防御的に飛ばす
    if (metrics.length === 0 && allowance.note === undefined) continue
    rows.push({
      slot,
      label: BAGGAGE_SLOT_SHORT_LABELS[slot],
      metrics: metrics.length > 0 ? metrics : '—',
      ...(allowance.note !== undefined ? { note: allowance.note } : {}),
    })
  }

  return rows.length > 0 ? rows : null
}

/**
 * 荷物枠の 1 行要約(注記なし)。
 * 例: 「身の回り 1個 · 3kg / 機内持込 1個 · 7kg / 受託 1個 · 23kg」
 * 空なら null。印刷の 1 行や、未確認チェックの要約に使う。
 *
 * note を載せないのは、総重量の説明などがスロットをまたいで重複し、
 * 1 行が画面幅を食い潰すため。詳細は listBaggageSlots で出す。
 */
export function formatBookingBaggage(
  baggage: BookingBaggage | undefined,
): string | null {
  const rows = listBaggageSlots(baggage)
  if (rows === null) return null
  return rows.map((row) => `${row.label} ${row.metrics}`).join(' / ')
}
