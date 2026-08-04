/**
 * 旅のしおり UI 固有の表示ヘルパー。
 * 日時まわりの本体は src/lib/trip-notes/datetime.ts にあるので、
 * ここには「画面にどう出すか」だけを置く。
 */

/** ローカルタイムの今日を YYYY-MM-DD で返す(初期状態の起点) */
export function todayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${date}`
}

/**
 * ISO 日付から先頭ゼロ無しの月日を取り出す。'2026-09-05' → '9/5'。
 * 年を落とすのは、旅程セレクタや穴アラートのように
 * 「どの旅行の話か」が文脈で決まっている場所で使うため。
 */
export function monthDay(iso: string): string {
  const date = Temporal.PlainDate.from(iso)
  return `${date.month}/${date.day}`
}

/** '9/5〜9/20' のように月日だけをつなぐ */
export function formatRangeShort(startISO: string, endISO: string): string {
  return `${monthDay(startISO)}〜${monthDay(endISO)}`
}

/**
 * 金額表示。通貨コードごとの小数桁は Intl に任せる
 * (JPY は 0 桁、EUR は 2 桁)。未知のコードでも落ちないようにする。
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('ja-JP')}`
  }
}

/**
 * 残り時間の相対表現。「あと2時間15分」「あと3日」。
 * 分単位まで落とすのは当日だけで、日をまたぐ先は日数だけで足りる。
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'まもなく'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `あと${minutes}分`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest === 0 ? `あと${hours}時間` : `あと${hours}時間${rest}分`
  }
  const days = Math.floor(hours / 24)
  return `あと${days}日`
}

/** 「あと3日」「今日まで」。無料キャンセル期限のチップ用 */
export function formatDaysLeft(daysLeft: number): string {
  return daysLeft === 0 ? '今日まで' : `あと${daysLeft}日`
}

/** Google Maps を開く URL。座標があれば座標優先(同名の店を掴まないため) */
export function mapsUrl(query: {
  lat?: number
  lng?: number
  address?: string
  name?: string
}): string {
  const target =
    query.lat !== undefined && query.lng !== undefined
      ? `${query.lat},${query.lng}`
      : (query.address ?? query.name ?? '')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`
}

/**
 * クリップボードへコピー。
 * navigator.clipboard は https か localhost でしか使えず、
 * 旅先の共有 Wi-Fi 経由で http のプレビューを開くこともあるので、
 * 失敗したときは execCommand へ落とす。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}
