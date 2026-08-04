/**
 * vitest 用のセットアップ。
 *
 * Node 22 には Temporal がまだ無いので、テストでは polyfill を注入する。
 * 本番と同じ ensureTemporal() を通すことで、
 * 「ネイティブがあれば読み込まない」という分岐そのものも常に実行される。
 */

import { ensureTemporal } from './lib/trip-notes/temporal-setup'

await ensureTemporal()
