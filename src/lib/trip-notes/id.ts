/**
 * ID 発行。
 * 予約は端末ローカルにしか存在しない(サーバがない)ので、
 * 衝突しないことより「同じ端末の同じセッションで重複しない」ことだけを保証すれば足りる。
 */

let idCounter = 0

export function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}
