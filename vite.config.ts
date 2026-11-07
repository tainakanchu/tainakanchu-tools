// vite ではなく vitest/config の defineConfig を使うのは test セクションに型を通すため
import { URL, fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { ogPagesPlugin } from './scripts/vite-plugin-og-pages'
import { taiwanMapDataPlugin } from './scripts/vite-plugin-taiwan-map-data.ts'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact(),
    tailwindcss(),
    // 台湾マップの配信用 JSON を src/data/taiwan/ から生成する（dev は監視つき）
    taiwanMapDataPlugin(),
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
        // ただし「かんちゅの台湾マップ」の地図まわりは precache から外す。
        // - assets/maplibre-*: maplibre-gl 本体（JS 約 1MB + CSS）。下の
        //   build.rolldownOptions で決まった名前のチャンクにしている。
        //   precache に入れると、このサイトを一度開いただけの人（台湾マップを
        //   使わない人、台北の一覧しか見ない人）にまで地図ライブラリを裏で
        //   落とさせてしまう。地図を実際に表示したときだけ取りに行けば十分で、
        //   そもそも地図タイルはオフラインでは取れないので、JS だけキャッシュ
        //   しても圏外では役に立たない。
        // - assets/MapView-*: maplibre を包む React 部品の小さな遅延チャンク。
        //   単体では使い道が無いので一緒に外す。
        // - data/taiwan/**: 都市ごとに分けた配信用 JSON。見る都市のぶんだけ
        //   読む設計なので、全都市ぶんを precache したら分けた意味が無くなる
        //   （json は globPatterns に入っていないが、意図を明示しておく）。
        //   見たことのある都市は下の runtimeCaching でオフラインでも開ける。
        globIgnores: [
          'assets/maplibre-*',
          'assets/MapView-*',
          'data/taiwan/**',
        ],
        // Web会議レコーダーの書き出しワーカー (export.worker-*.js) も js なのでここで
        // precache される。MP3 エンコーダー (LAME の WASM を base64 で埋め込んだ JS) を
        // 同梱していて約 510KB (gzip 約 180KB) あるが、既定の上限
        // (maximumFileSizeToCacheInBytes = 2MiB) には収まるので、オフラインでも
        // MP3 で書き出せる。
        // SPA なので、/tools/trip-notes のような TanStack Router のルートを
        // 直接開いても index.html を返す。これが無いとオフライン時にトップ
        // 以外の URL を開けない。
        navigateFallback: '/index.html',
        // autoUpdate で precache が入れ替わったとき、古い世代のキャッシュを
        // 残さない。
        cleanupOutdatedCaches: true,
        // 実行時キャッシュは 2 種類。
        //
        // 1) 台湾マップの配信用 JSON。旅行中（圏外や不安定な回線）でも
        // 「一度見た都市」はもう一度開けるようにする。NetworkFirst にしているのは、
        // データを更新したのに古いコメントが出続けるのを避けたいから。回線が遅い
        // ときは 3 秒で見切ってキャッシュを返す。正規表現は URL の途中にマッチする
        // ので、別オリジンの URL には workbox の仕様上マッチしない（同一オリジンの
        // /data/taiwan/ だけ）。地図タイル（tiles.openfreemap.org）はあえて
        // キャッシュしない。量が読めない上に、利用規約上もブラウザの通常の HTTP
        // キャッシュに任せるのが無難なため。
        //
        // 2) セトリ画像メーカーの Web フォント (Google Fonts)。
        // canvas の出力を端末の標準フォントに左右されないようにするために読む。
        // 一度読んだものはキャッシュに残して、オフラインでも同じ書体で描けるようにする
        // (読めないときは OS の書体に落ちる)。CSS は更新を拾えるよう
        // StaleWhileRevalidate、フォント本体はファイル名が版ごとに変わるので
        // CacheFirst。和文・中国語・韓国語のフォントは unicode-range で 100 個
        // 前後に分かれ (書体ごと)、中国語・韓国語の CSS は使うときだけ読むので、
        // 件数の上限は多めに取る。
        runtimeCaching: [
          {
            urlPattern: /\/data\/taiwan\/[a-z0-9-]+\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'taiwan-map-data',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 16 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 800,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
      // glob (js/css/html/svg/フォント) に入らない画像のうち、オフラインで
      // も要るものだけを名指しで足す。avatar.png は全ページのヘッダーに出る
      // ブランドマーク、192 は manifest アイコン。512 の方は OS がインス
      // トール時 (=オンライン時) にしか読まないので precache しない。
      // public/assets/drum-roll/*.m4a も、旅先で要るものではない上に
      // 200KB 超あるので入れていない。
      //
      // taiwan-arrival-card/template.xlsx は逆に必ず入れる。これが無いと
      // フォームは開けるのに「Excel をダウンロード」だけが必ず失敗する、という
      // いちばん困る壊れ方をする。しかもこのツールを使うのは渡航直前で、
      // 機内や空港の不安定な回線という「まさにオフラインになる場面」が
      // 想定される。44KB なので上の 200KB の目安も下回る。
      includeAssets: [
        'favicon.ico',
        'assets/tainakanchu-avatar.png',
        'assets/tainakanchu-avatar-192.png',
        'assets/taiwan-arrival-card/template.xlsx',
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
    // VitePWA より後に置く理由: VitePWA の closeBundle で SW の precache
    // manifest が確定したあと tools/*.html を生成し、precache に載せない。
    // オフライン時のツール URL 直開きは navigateFallback (/index.html) が拾う。
    ogPagesPlugin(),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // maplibre-gl（JS と CSS）を必ず maplibre-*.js / maplibre-*.css という
          // 名前のチャンクに隔離する。PWA の precache から名指しで外す
          // （workbox.globIgnores）ために、読み込み元のファイル名に左右されない
          // 決まった名前が要る。
          groups: [
            {
              name: 'maplibre',
              test: /node_modules[\\/]maplibre-gl[\\/]/,
            },
          ],
        },
      },
    },
  },
  optimizeDeps: {
    // mediabunny は Web会議レコーダーの書き出しワーカーからしか import されないので、
    // 開発サーバーの依存スキャンが初回の書き出し時まで気づかない。そのとき
    // 「optimized dependencies changed. reloading」でページごとリロードされ、
    // 書き出しが中断されてしまうので、最初から事前バンドルの対象にしておく。
    // @mediabunny/mp3-encoder も同じ理由（MP3 書き出し時にワーカーが動的 import する）。
    // 両者を一緒に事前バンドルすることで、エンコーダーの登録先の mediabunny が
    // 書き出し側と同じインスタンスになる。
    include: ['mediabunny', '@mediabunny/mp3-encoder'],
  },
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
