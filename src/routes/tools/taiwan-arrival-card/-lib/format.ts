/**
 * 台湾入国カードメーカー UI 固有の表示ヘルパー。
 * ロジック本体(xlsx 生成・AI 取り込み)は隣のファイルにあるので、
 * ここには「画面でどう扱うか」だけを置く。
 */

/**
 * クリップボードへコピー。
 * src/routes/tools/trip-notes/-lib/format.ts の copyText を写したもの。
 *
 * navigator.clipboard は https か localhost でしか使えず、
 * 社内 LAN や共有 Wi-Fi 経由で http のプレビューを開くこともあるので、
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

/** ローカルタイムの今日を YYYY-MM-DD で返す。書き出すファイル名に使う */
export function todayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${date}`
}
