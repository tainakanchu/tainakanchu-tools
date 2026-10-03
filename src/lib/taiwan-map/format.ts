/** 台湾マップの表示用フォーマッタ（純関数） */

/**
 * "2026-08" → "2026年8月"、"2026-08-15" → "2026年8月15日"。
 * 形式が崩れていたらそのまま返す（バリデータを通っていれば起きないが、
 * 表示が空になるよりは生の値が見えたほうが直しやすい）。
 */
export function formatVisitedAt(value: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value)
  if (!m) return value
  const [, y, mo, d] = m
  const base = `${y}年${Number(mo)}月`
  // 日の部分は省略可能なグループ。型上は string だが、実際はマッチしないと undefined
  return d ? `${base}${Number(d)}日` : base
}

/**
 * Google Maps の検索 URL。place_id を調べずに作れて、店名＋住所で
 * 検索させればほぼ目的の店が 1 件目に出る。データに googleMapsUrl が
 * 無いときの代替にも使う。
 */
export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
