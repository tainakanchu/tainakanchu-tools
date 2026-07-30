/** 実質観光日数のような小数を「2.5」「3」のように短く見せる */
export function formatDays(days: number): string {
  return String(Math.round(days * 100) / 100)
}

/** ローカルタイムの今日を YYYY-MM-DD で返す(初期状態の起点) */
export function todayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${date}`
}
