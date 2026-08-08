---
name: add-tool
description: かんちゅツールズ (tainakanchu-tools) リポジトリに新しいツールページ (/tools/<slug>) を追加する手順とチェックリスト。ユーザーが「新しいツールを追加したい」「〇〇するツールを作って」「ツールを増やしたい」など、このリポジトリへの新アプリ・新ページ・新ツールの追加に言及したら、実装に着手する前に必ずこのスキルを読むこと。site-meta・ルーティング・Header ナビ・OG カード画像・README の更新漏れ（特に手動同期が必要な Header と README）を防ぐ。
---

# 新ツール追加ガイド（かんちゅツールズ）

## 全体像

このリポジトリの「ツール 1 個」は次の要素で構成される。

| 要素 | ファイル | 更新方法 |
| --- | --- | --- |
| メタ情報（単一ソース） | `src/lib/site-meta.ts` の `TOOL_META` | 手動追加（起点） |
| ページ本体 | `src/routes/tools/<slug>/index.tsx` | 手動作成 |
| トップページのカード一覧 | `src/routes/index.tsx` | 自動（TOOL_META 由来） |
| ツール別 OG メタ入り静的 HTML | `dist/tools/<slug>.html` | 自動（ビルドプラグイン） |
| ヘッダーのドロワーナビ | `src/components/Header.tsx` の `tools` 配列 | ⚠️ 手動同期 |
| OG カード画像 | `scripts/generate-og-images.ts` + `public/assets/og/<slug>.png` | 手動定義 + `pnpm og:images` |
| README | `README.md` の「✨ 現在のアプリ」 | ⚠️ 手動同期 |

`index.html` はサイト共通メタのテンプレートなので**編集しない**。ツール別の OG は `scripts/vite-plugin-og-pages.ts` がビルド後に `dist/index.html` を複製・メタ差し替えして `dist/tools/<slug>.html` を自動生成する。`TOOL_META` に載っていれば新ツールも自動で対象になる。

作業は原則 git worktree を切って行う（プロジェクト CLAUDE.md 準拠）。

## 手順

### 1. slug・名前・説明文を決める

- slug は kebab-case（例: `drum-roll`）。URL・OG 画像ファイル名・ルートディレクトリ名のすべてに使う。
- description は「トップページのカード・OG description・ページの `head()`」で共用される一文。SNS カードにそのまま出るので、単体で意味が通る文にする。
- Header のドロワー用には、これとは別にもう少し短い説明文を用意する（幅が狭く、既存ツールも短縮版を使っている）。

### 2. `src/lib/site-meta.ts` に登録する

`TOOL_META` 配列へ 1 エントリ追加する:

```ts
{
  slug: '<slug>',
  name: '<ツール名>',
  description: '<一文説明>',
  path: '/tools/<slug>',
  ogImagePath: '/assets/og/<slug>.png',
},
```

これだけでトップページの一覧カードと、ビルド時の `dist/tools/<slug>.html`（OG メタ差し替え済み静的 HTML）が自動で生成されるようになる。

### 3. ルートを作る — `src/routes/tools/<slug>/index.tsx`

TanStack Router のファイルベースルーティング。`head()` は site-meta を単一ソースにするのが既存の慣習（文言の二重管理を避けるため）:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { getToolMeta, toolPageTitle } from '../../../lib/site-meta'

// head() と静的 OG HTML で同じ文言を使うため site-meta を単一ソースにする
const tool = getToolMeta('<slug>')!

export const Route = createFileRoute('/tools/<slug>/')({
  head: () => ({
    meta: [
      { title: toolPageTitle(tool.name) },
      { name: 'description', content: tool.description },
    ],
  }),
  component: <PascalSlug>Page,
})
```

補助コードの置き場所:

- `src/routes/tools/<slug>/-lib/` — ツール固有ロジック＋テスト。`-` プレフィックスでルート化を回避している。
- `src/routes/tools/<slug>/-components/` — ツール固有の UI 部品。
- `src/lib/<slug>/` — ロジックが大きく育つ場合はこちら（trip-notes / trip-scheduler が前例）。DOM や Vite 依存を持ち込まない純 TS に保つ。

`src/routeTree.gen.ts` は dev/build 時に自動再生成される。手で編集しないこと（ただし生成された差分のコミットは必要）。

### 4. ヘッダーナビに追加する — `src/components/Header.tsx`（忘れやすい）

ドロワーの `tools` 配列は `TOOL_META` から導出されていない。lucide-react のアイコンと短い説明文を添えて手動で 1 エントリ追加する。ここを忘れると「トップページには出るのにメニューに出ない」ツールになる。

### 5. OG カード画像を作る — `scripts/generate-og-images.ts`

1. 使いたい lucide アイコンの path データが `ICONS` に無ければ、lucide-react のソースから抽出して追加する（viewBox 0 0 24 24 の stroke ベース。既存エントリのコメント参照）。
2. `CARDS` に CardDef を追加する。既存の定番構図:
   - main アイコン: 中央 (cx 940, cy 295〜305) に 190〜200px、rotate 0
   - sub アイコン: 右下 (cx 1030 前後, cy 420 前後) に 100〜110px、rotate -8〜-10
   - accent アイコン: 左上 (cx 825〜830, cy 195) に 70〜80px
   - タイトルは 1 行なら font-size 96 / y 330、2 行なら font-size 84 / y 300・408 が目安
3. `pnpm og:images` で PNG を再生成する。rsvg-convert と Noto Sans CJK JP が必要（nix で導入済み）。ビルドには組み込まれておらず、**生成された `public/assets/og/<slug>.png` (1200x630) はコミットする運用**。
4. 注意: `assertCardSlugs()` は「CARDS の slug が TOOL_META に存在するか」という片方向しか検証しない。TOOL_META に足して CARDS を忘れてもエラーにならず、単に OG 画像 URL が 404 になる。CARDS への追加と `pnpm og:images` の実行は必ずセットで行う。

### 6. README を更新する — `README.md`（忘れやすい）

「✨ 現在のアプリ」セクションに、ツール名・一文説明・`URL: /tools/<slug>`・機能の箇条書きを既存エントリと同じ形式で追加する。

### 7. 検証する

```bash
pnpm check      # prettier --write + oxlint --fix
pnpm typecheck
pnpm test
pnpm build      # dist/tools/<slug>.html が生成されることを確認
pnpm dev        # http://localhost:3000/tools/<slug> で動作確認
```

build 後に `dist/tools/<slug>.html` の og:title / og:image がツール別の内容になっているかまで見ると、OG まわりを最後まで検証できる。

## 条件つきステップ

- **静的アセットが必要な場合**: `public/assets/<slug>/` に置く（drum-roll の音源が前例）。VitePWA の precache には大きいバイナリを入れない方針。オフラインでも必要な小さいファイルだけを `vite.config.ts` の `includeAssets` に名指しで追加する。
- **slug をリネームする場合**: 旧 slug のルートを redirect だけのファイルとして残す（`src/routes/tools/license-layout/index.tsx` が前例）:

  ```tsx
  import { createFileRoute, redirect } from '@tanstack/react-router'

  export const Route = createFileRoute('/tools/<old-slug>/')({
    beforeLoad: () => {
      throw redirect({ to: '/tools/<new-slug>', replace: true })
    },
  })
  ```

- **ロジックのテスト**: Vitest を使う。Temporal polyfill は `src/test-setup.ts` で注入済みなので、日時ロジックには Temporal を使ってよい。

## 最終チェックリスト

- [ ] `TOOL_META` に追加した（slug / name / description / path / ogImagePath）
- [ ] `src/routes/tools/<slug>/index.tsx` を作り、`head()` が site-meta を参照している
- [ ] `Header.tsx` の `tools` 配列に追加した
- [ ] `CARDS` に CardDef を追加し `pnpm og:images` を実行、`public/assets/og/<slug>.png` が生成された
- [ ] `README.md` にエントリを追加した
- [ ] `pnpm check && pnpm typecheck && pnpm test && pnpm build` が通る
- [ ] `dist/tools/<slug>.html` が生成され、OG メタがツール別になっている
- [ ] 新規ファイル（ルート・OG PNG・`routeTree.gen.ts` の差分）をコミット対象に含めた
