/**
 * Temporal のグローバル型だけを読み込む。
 *
 * `temporal-polyfill/types/global` は temporal-spec の型宣言を再エクスポートするだけで、
 * 実行時コードを 1 バイトも含まない(実体は 0 バイトの .js)。
 * polyfill 本体(min+gzip 約 20KB)の読み込みは temporal-setup.ts が
 * ネイティブ非対応のブラウザでだけ動的 import する。
 *
 * `temporal-polyfill/global` を直接 import しても型は付かない
 * (あちらの global.d.ts は空)ので、型と実装で入口を分ける必要がある。
 */
import 'temporal-polyfill/types/global'
