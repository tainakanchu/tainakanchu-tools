// vite ではなく vitest/config の defineConfig を使うのは test セクションに型を通すため
import { URL, fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact(),
    tailwindcss(),
    VitePWA({
      // 新しいデプロイを開いたら黙って更新する。「更新があります」バナーを
      // 出す手もあるが、このツール集には通知 UI の仕組みが無く、そのために
      // 作るには複雑さが見合わないので自動更新に倒している。
      registerType: 'autoUpdate',
      // これまで public/manifest.json に静的に置いていた内容をここへ移した。
      // プラグインが manifest.webmanifest を生成して index.html にリンクを
      // 注入するため、二重管理を避けて設定の出どころを 1 箇所にしている。
      manifest: {
        name: 'かんちゅツールズ | tainakanchu tools',
        short_name: 'かんちゅツールズ',
        description:
          'かんちゅが作る日常の小さな便利ツール集。原寸レイアウトメーカーなど、原寸レイアウトにこだわったユーティリティを公開中。',
        lang: 'ja-JP',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        // アイコンはリポジトリにコミット済みの PNG をそのまま使う。ビルド時
        // に PNG を生成する仕組み (アイコンジェネレータ) を足すとビルド依存
        // が増えるので入れていない。`purpose: 'maskable'` を付けていないの
        // は、この画像がアバターで余白 (セーフゾーン) を持たないため、
        // maskable として渡すと Android 側で丸く切り抜かれて絵が欠けるから。
        icons: [
          {
            src: '/assets/tainakanchu-avatar-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/assets/tainakanchu-avatar-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // precache するのはアプリ本体 (HTML/JS/CSS/SVG/フォント) だけ。
        // 旅のしおりのデータは最初から localStorage にあってネットワークに
        // 出ないので、本体さえキャッシュできれば機内モードや圏外でも開ける。
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        // SPA なので、/tools/trip-notes のような TanStack Router のルートを
        // 直接開いても index.html を返す。これが無いとオフライン時にトップ
        // 以外の URL を開けない。
        navigateFallback: '/index.html',
        // autoUpdate で precache が入れ替わったとき、古い世代のキャッシュを
        // 残さない。
        cleanupOutdatedCaches: true,
        // runtimeCaching を書いていないのは、このアプリが外部リソースを
        // 一切読み込まないから。外部を読むようになったらその時に足す。
      },
      // glob (js/css/html/svg/フォント) に入らない画像のうち、オフラインで
      // も要るものだけを名指しで足す。avatar.png は全ページのヘッダーに出る
      // ブランドマーク、192 は manifest アイコン。512 の方は OS がインス
      // トール時 (=オンライン時) にしか読まないので precache しない。
      // public/assets/drum-roll/*.m4a も、旅先で要るものではない上に
      // 200KB 超あるので入れていない。
      includeAssets: [
        'favicon.ico',
        'assets/tainakanchu-avatar.png',
        'assets/tainakanchu-avatar-192.png',
      ],
      // manifest の icons を自動で precache に足す挙動 (デフォルト true) を
      // 切っている。これを有効のままにすると 512 のアイコン (352KB) まで
      // precache に載るが、インストール用アイコンは OS がインストール時 =
      // オンライン時に読むものでオフラインには要らない。precache に入れたい
      // 画像は includeAssets で名指ししている。
      includeManifestIcons: false,
      // devOptions を書いていないのは意図的で、開発時 (pnpm dev) はサービス
      // ワーカーを動かさないため。ホットリロードとキャッシュが噛み合って
      // 余計な混乱を生む。
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Node 22 に Temporal が無いので、全テストの前に polyfill を注入する
    setupFiles: ['./src/test-setup.ts'],
  },
})
