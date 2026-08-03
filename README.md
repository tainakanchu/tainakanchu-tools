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

- **旅程パズル**  
  ヨーロッパ周遊の滞在日数・訪問順・移動手段を、泊数を配り切るパズルとして組み立てる新婚旅行プランナー。  
  URL: `/tools/trip-scheduler`
  - 航空券で確定した期間とIN/OUT都市を前提条件として固定
  - 「残り◯泊」の未割り当てゲージをゼロにするのがゴール
  - ±ボタンと▲▼だけで泊数と訪問順を微調整（ドラッグ不要）
  - 移動手段はdoor-to-door時間で比較し、夜行列車の損得も表示
  - 「必ず行く」「この日はこの都市」などの条件を追加して違反をリアルタイム表示
  - Undo/Redo・localStorage自動保存・JSONの書き出し / 読み込み

- **旅のしおり**  
  旅行の予約状況を進捗として管理し、旅行中は必要な予約情報だけをすぐ呼び出せる予約ダッシュボード。  
  URL: `/tools/trip-notes`
  - 「寝る場所がない夜」を1泊1セルの帯で可視化（色に依存せず模様とアイコンでも区別）
  - 予約状況と支払状況を独立した軸として管理し、予算は通貨別に集計
  - 無料キャンセル期限を相対表現＋絶対日時で併記してカウントダウン
  - 宿が変わるのに交通の予約がない「移動の穴」を自動検出
  - 予約確認メールをAIに読ませて一括取り込み（日時とタイムゾーンだけは確定前に必ず確認）
  - 旅行中の「今」画面は確認番号を画面幅いっぱいに表示、現地語の住所も併記
  - 共有URL / QRコードでの受け渡し、A4縦の印刷しおり（緊急連絡先つき）
  - Undo/Redo・localStorage自動保存・JSONの書き出し / 読み込み

- **ドラムロール**  
  スペースキーを押している間ドラムロールが鳴り、放すとシンバル＋キックで「ジャーン」と締まる演出ツール。  
  URL: `/tools/drum-roll`
  - 押している間はスネア連打（音量・ピッチ・パン・間隔を毎打ランダマイズ）
  - 放すとシンバルクラッシュ＋キックの同時ワンショット
  - 音はすべてブラウザ内で再生（サーバー送信なし）

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
├─ lib/               画面から独立した純粋ロジック
│  ├─ trip-scheduler/ 旅程パズルのデータモデル・導出・制約チェック
│  └─ trip-notes/     旅のしおりのデータモデル・日時処理・夜のカバレッジ計算・共有URL
├─ routes/            TanStack Router のファイルベースルート
│  ├─ tools/license-layout/  免許証レイアウトメーカーの実装
│  ├─ tools/trip-scheduler/  旅程パズルの実装（`-components` / `-lib` はルート対象外）
│  └─ tools/trip-notes/      旅のしおりの実装（4タブ構成の予約ダッシュボード）
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
