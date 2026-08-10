<div align="center">

![tainakanchu avatar](./public/assets/tainakanchu-avatar.jpg)

# かんちゅツールズ

小さな日常ツールをまとめていく個人プロジェクト。

</div>

## ✨ 現在のアプリ

### 旅行

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

- **台湾入国カードメーカー**  
  台湾オンライン入国カード（TWAC）の一括アップロード用 Excel を、AI による航空券読み取りつきで同行者のぶんまでまとめて作成できるフォーム。  
  URL: `/tools/taiwan-arrival-card`
  - 公式の一括アップロード用テンプレートをそのまま埋めるので TWAC サイトに直接取り込める
  - 旅程・宿泊先は同行者全員で共有し、個人情報だけ人別に入力（最大16名）
  - 航空券・ホテル予約を手持ちのAIに読ませてJSONで貼り戻す一括入力（アプリは外部APIを呼ばない）
  - 入力内容は端末のlocalStorageにのみ保存。パスポート情報は次回の旅行でも再利用できる
  - 過去の旅程をコピーして次の旅行の下書きにできる（日付だけは事故防止で空に）
  - TWAC公式サイトへの導線つき（有料代行をうたう偽サイトへの注意喚起も表示）
  - テンプレートもオフラインキャッシュ済みなので、機内モードでも書き出せる

### デスク

- **原寸レイアウトメーカー**  
  免許証やパスポートなどの書類画像を原寸大でA4用紙にレイアウトし、印刷やPDF出力ができるツール。  
  URL: `/tools/actual-size-layout`
  - 最大2枚の画像をアップロード
  - ID-1カード（85.6mm × 54mm）・パスポート見開き（176mm × 125mm）・パスポート単ページ（88mm × 125mm）・カスタムサイズのプリセット
  - 用紙余白・画像の間隔の調整
  - 配置した画像が印刷可能領域を超える場合は注意表示
  - 印刷時は倍率100%で実寸出力

- **リソ風分版メーカー**  
  画像を仮想特色インクの版に分解し、重ね刷りシミュレーション・網点・版ズレ表現つきでリソグラフ風の印刷データを作れる分版ツール。  
  URL: `/tools/risograph`
  - 仮想特色インク2〜4色への分版
  - 実測ベースの順モデルによる重ね刷りシミュレーション
  - AM網点 / blue-noiseスクリーニング
  - 版ズレシミュレーションと焼き込み
  - 版別グレースケールPNG書き出し

- **画像拡大**（外部）  
  ドラッグ&ドロップで画像をピクセルパーフェクトに整数倍拡大し、指定サイズで印刷したときの DPI も確認できるツール。  
  別ホストで公開しているツールへのリンクです（このリポジトリには埋め込んでいません）。  
  URL: https://magnify-image.vercel.app/

### イベント

- **ドラムロール**  
  スペースキーを押している間ドラムロールが鳴り、放すとシンバル＋キックで「ジャーン」と締まる演出ツール。  
  URL: `/tools/drum-roll`
  - 押している間はスネア連打（音量・ピッチ・パン・間隔を毎打ランダマイズ）
  - 放すとシンバルクラッシュ＋キックの同時ワンショット

- **ルーレット**（外部）  
  シンプルで使いやすいルーレットアプリ。選択肢を入力してスピンするだけで、ランダムな結果が得られます。  
  別ホストで公開しているツールへのリンクです（このリポジトリには埋め込んでいません）。  
  URL: https://online-roulette-mu.vercel.app/

## 🛠 技術スタック

- Vite + React 19
- TanStack Router / Devtools
- Tailwind CSS v4
- TypeScript 7
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
pnpm run lint       # oxlint
pnpm run format     # Prettier (チェックのみ)
pnpm run check      # Prettier --write + oxlint --fix まとめ実行
```

## ☁️ デプロイ（Cloudflare Workers）

Cloudflare Workers（Static Assets）にホスティングしています。設定は `wrangler.jsonc` を参照してください。

```bash
pnpm run cf:dev   # ビルド後、wrangler dev でローカル動作確認
pnpm run deploy   # ビルド後、wrangler deploy で本番へ反映
```

初回デプロイ前に `wrangler login` で Cloudflare アカウントと連携してください。

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
│  ├─ tools/actual-size-layout/  原寸レイアウトメーカーの実装
│  ├─ tools/trip-scheduler/  旅程パズルの実装（`-components` / `-lib` はルート対象外）
│  ├─ tools/trip-notes/      旅のしおりの実装（4タブ構成の予約ダッシュボード）
│  └─ tools/taiwan-arrival-card/  台湾入国カードメーカーの実装（xlsx生成・選択肢マスタ・AI取り込み）
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
4. `wrangler deploy --dry-run`（Cloudflare Workers 設定の検証。実デプロイは行いません）

## 🧭 ルーティング

- TanStack Router の `createFileRoute` を利用したファイルベース構成
- `src/routes/__root.tsx` でヘッダーなどの共通レイアウトを定義
- 新しいツールは `src/routes/tools/<app-name>/` に配置し、トップページとヘッダーのリンクリストを更新

## 📌 メモ

- Devtools は開発環境のみで読み込まれ、印刷時は自動的に非表示になります
- Tailwind の `@media print` 設定で、印刷出力時の余白やサイズを厳密に調整しています

---

今後も便利なツールを少しずつ追加予定です。アイデアがあれば issue や PR でどうぞ！ 👋
