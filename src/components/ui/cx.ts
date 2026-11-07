/** className を空白区切りで連結する（falsy は捨てる） */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
