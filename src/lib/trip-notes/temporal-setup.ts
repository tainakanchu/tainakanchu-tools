/**
 * Temporal の polyfill を、必要な環境でだけ読み込む。
 *
 * Temporal は TC39 Stage 4 / ES2026 で、Chrome・Firefox・Edge の新しい版は
 * ネイティブ実装を持つ。未対応なのは実質 Safari だけ。
 * polyfill は min+gzip で約 20KB あるので、静的 import にすると
 * ネイティブ対応済みの利用者にも毎回払わせることになる。
 * 動的 import にしておけばバンドラが別チャンクに切り出すため、
 * ネイティブ対応環境では 0KB、Safari だけ 20KB という配分になる。
 */

export async function ensureTemporal(): Promise<void> {
  if ('Temporal' in globalThis) return
  await import('temporal-polyfill/global')
}
