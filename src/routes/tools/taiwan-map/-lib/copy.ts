/**
 * クリップボードへのコピー。旅のしおりの copyText と同じく、
 * Clipboard API が使えない環境（http のプレビュー、古い WebView など）では
 * execCommand にフォールバックする。
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

/** 共有用の絶対 URL。query は serializeTaiwanMapSearch の結果 */
export function shareUrl(query: string): string {
  const base = `${window.location.origin}/tools/taiwan-map`
  return query ? `${base}?${query}` : base
}
