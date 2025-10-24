<div align="center">

![tainakanchu avatar](./public/assets/tainakanchu-avatar.jpg)

# かんちゅツールズ

小さな日常ツールをまとめていく個人プロジェクト。

</div>

## ✨ 現在のアプリ

- **免許証レイアウトメーカー**  
  免許証などのカード型画像を原寸大でA4用紙にレイアウトし、印刷やPDF出力ができるツール。  
  URL: `/tools/license-layout`
  - 最大2枚の画像をアップロード
  - 免許証プリセット（85.6mm × 54mm）またはカスタムサイズ
  - 用紙余白・カード間隔の調整
  - 印刷時は倍率100%で実寸出力

## 🛠 技術スタック

- Vite + React 19
- TanStack Router / Devtools
- Tailwind CSS v4
- TypeScript 5
- pnpm

## 🚀 セットアップ

```bash
pnpm install
pnpm run dev
```

ローカル開発サーバーはデフォルトで `http://localhost:3000` で起動します。

## 📦 ビルド & チェック

```bash
pnpm run build      # Vite ビルド + tsc
pnpm run typecheck  # 型チェックのみ
pnpm run lint       # ESLint
pnpm run format     # Prettier (チェックのみ)
pnpm run check      # Prettier --write + ESLint --fix まとめ実行
```

## 🧪 テスト

Vitest を採用しています。

```bash
pnpm run test
```

## 📁 主なディレクトリ

```
src/
├─ components/        ヘッダーなどの共通コンポーネント
├─ routes/            TanStack Router のファイルベースルート
│  └─ tools/license-layout/  免許証レイアウトメーカーの実装
├─ styles.css         Tailwind CSS ベースのグローバルスタイル
└─ routeTree.gen.ts   TanStack Router 自動生成ファイル
```

## 🖨 印刷時のポイント

1. ブラウザの印刷ダイアログで用紙を **A4 / 縦向き** に設定
2. **倍率（スケール）を 100%** に固定
3. 余白設定は「なし」またはユーザー指定で調整
4. プレビューでカードがはみ出していないか確認してから印刷 / PDF 保存

## 🔁 CI

`.github/workflows/ci.yml` で GitHub Actions を設定しています。
`main` / `master` への push と Pull Request で下記を実行:

1. pnpm install（`--frozen-lockfile`）
2. `pnpm run build`
3. `pnpm run typecheck`

## 🧭 ルーティング

- TanStack Router の `createFileRoute` を利用したファイルベース構成
- `src/routes/__root.tsx` でヘッダーなどの共通レイアウトを定義
- 新しいツールは `src/routes/tools/<app-name>/` に配置し、トップページとヘッダーのリンクリストを更新

## 📌 メモ

- Devtools は開発環境のみで読み込まれ、印刷時は自動的に非表示になります
- Tailwind の `@media print` 設定で、印刷出力時の余白やサイズを厳密に調整しています

---

今後も便利なツールを少しずつ追加予定です。アイデアがあれば issue や PR でどうぞ！ 👋
