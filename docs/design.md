# デザインの決まりごと

方向性は「自分で riso 印刷した文具・ノート」。白い紙に青インク 1 色で刷り、蛍光ピンクを差し色に重ねる。
トークンと部品の実体は `src/styles.css`（`@theme` / `@layer components`）と `src/components/ui/`。

## トークン（Tailwind のユーティリティとして使える）

| 名前         | 値                  | 用途                                         | 例                          |
| ------------ | ------------------- | -------------------------------------------- | --------------------------- |
| paper        | `#FFFFFF`           | 紙（地）                                     | `bg-paper`                  |
| ink          | `#1D3A8A`           | 主インク。本文・見出し・線。**黒は使わない** | `text-ink` `border-ink`     |
| ink-muted    | `#566BA7`           | 弱い文字（補足・件数・説明文）               | `text-ink-muted`            |
| rule         | `#CDD4E5`           | 罫・区切り線・未選択の枠                     | `border-rule`               |
| wash         | `#F1F3F8`           | 面の薄塗り（hover、まとまりの地）            | `bg-wash`                   |
| pink         | `#FF48B0`           | 差し色（下の「ピンクの使いどころ」だけ）     | `bg-pink` `decoration-pink` |
| pink-tint    | `#FFCCE9`           | 主要ボタン・選択中チップの面                 | `bg-pink-tint`              |
| pink-wash    | `#FFE9F6`           | エラー中の入力欄の地                         | `bg-pink-wash`              |
| riso-*       | 下表                | カテゴリ色                                   | `bg-riso-teal`              |
| on-riso      | `#1D3A8A`           | Riso インクのベタに載せる濃い文字            | `text-on-riso`              |
| font-sans    | Zen Kaku Gothic New | 本文・UI（body の既定）                      | —                           |
| font-display | Dela Gothic One     | ページタイトルとワードマークだけ             | `font-display`              |
| radius-ui    | 3px                 | 入力・チップ・ボタン                         | `rounded-ui`                |

線は青インク 1.5px: `ink-line`（四辺）/ `ink-line-t` / `ink-line-b`。細い区切りは `border-t border-rule`（1px）。

TS から値が要るとき（canvas など出力に描くとき）は `INK` `PAPER` `PINK` `RISO_INKS`（`src/components/ui/inks.ts`）。これはライトの実際の値なので、画面の部品（SVG のアイコン・地図など）には CSS 変数（`var(--color-ink)`）を使う（下の「ダーク」）。

## ダーク

ダークは「同じノートを、濃い藍の色紙に淡いインクで刷ったもの」。真っ黒や灰色のダークモードにはしない。
ヘッダー右端（スマホは目次の中）の「自動・ライト・ダーク」で切り替え、選んだものは localStorage（`theme`）に残す。自動は OS の設定に従う。

- 仕組み: html の `data-theme`（`light` / `dark`、自動なら付けない）。`src/lib/theme.ts` が付け替え、`index.html` の head の小さなスクリプトが最初の描画より前に当てる（白く光らない）。CSS は `src/styles.css` の「配色の切り替え」で、ダークの値はそこに 1 回だけ書き、`@variant theme-dark`（明示のダーク／自動で OS がダーク）で展開する。
- 部品もツールもトークン（`bg-paper` `text-ink` `var(--color-rule)` など）で塗っていれば何もしなくてよい。`bg-white` や `#1D3A8A` の直書き、`INK` / `PAPER` 定数を画面の部品に使うと切り替わらない。SVG は `fill="var(--color-ink)"` のように CSS 変数を渡す。
- 印刷は常にライト（ダークは `@media screen` の中だけ）。
- 実物の紙や出力を見せる面は `theme-light` を付けてライトのまま（原寸レイアウトの A4 用紙、ドラムロールの濃紺のステージ）。canvas に描く出力（セトリ画像・リソの合成と版）は値を直接使っているので変わらない。
- 実際のインクの色見本（`RISO_INKS` の hex、リソのインク選び、セトリの配色）は実際の値のまま。カテゴリ色として使う `riso-*` トークンだけ、濃い地で沈む色を明るく刷り直す。

| 名前      | ダークの値 | 確認したコントラスト              |
| --------- | ---------- | --------------------------------- |
| paper     | `#141B3D`  | —                                 |
| ink       | `#E8ECF7`  | paper 上 14.2:1、wash 上 12.4:1   |
| ink-muted | `#A3AFD3`  | paper 上 7.7:1、wash 上 6.7:1     |
| rule      | `#34407A`  | —（罫のみ）                       |
| wash      | `#1C2550`  | —                                 |
| pink      | `#FF5DBB`  | paper 上 6.0:1                    |
| pink-tint | `#6B2457`  | ink の文字 8.8:1                  |
| pink-wash | `#3A1C45`  | ink の文字 12.4:1                 |
| on-riso   | `#141B3D`  | 明るくしたインクの上で 5.5:1 以上 |

riso-* のダーク: blue `#8BA4E6` / teal `#2FB7BE` / purple `#A68BDB` / brick `#D98487` / grey `#A9AAAB` / pink `#FF5DBB`（yellow・orange・green はそのまま）。
ダークではインクのベタの上の文字はすべて紙の藍（`text-paper` / `text-on-riso`）になる。`mark-pink` は濃い地では multiply せずそのまま刷る。

## 形

- 影なし。グラデーションなし。`backdrop-blur` なし。例外はフォーカス時のピンクのズレ（solid offset）だけ。
- 面（パネル）は青インク 1.5px の線で囲み、角丸 0。カードを浮かせない。
- 入力・チップ・ボタンは角丸 3px（`rounded-ui`）。`rounded-2xl` や `rounded-full` のピルは使わない。
- 未確定のもの（まだ行っていない、下書き）は破線（`Panel tone="dashed"`）。

## ピンクの使いどころ

ピンクは次の 4 つだけ。装飾やアイコンの色には使わない。

1. 選択中（チップ、セグメント、スイッチのオン、タブの下線、ナビの現在地の下線、地図の選択ピン）
2. 主要ボタン（1 画面に 1 つ）
3. ハイライト（`mark-pink`。「新しい」の印など、重ね刷りの multiply）
4. エラーの印（`field-error` の四角、エラー中の入力欄の地）

## 版ズレ（シグネチャ）

背後のピンクの版が右下に 2–3px ずれて見える。`:active` で揃い、キーボードフォーカスでは 1px 大きくずれる。

- 使う: 主要ボタン（`btn-primary`、3px）、選択中のチップ（`chip[aria-pressed=true]`、2px）、セグメントの選択中（`seg-item[aria-checked=true]`、2px）。それ以外で使うなら `misreg` クラス（地図の選択中ピンなど、「いま選んでいる 1 つ」だけ）。
- 主要ボタンの面はピンクのベタではなくピンクの網（pink-tint）。ベタのピンクは右下のズレにだけ出る（ベタだと強すぎるため）。
- 使わない: 普通のボタン、カード、見出し、一覧の行。並べて何個も付けない。

## カテゴリ色（Riso インク）

| id     | 値        | 上に載せる文字                                       |
| ------ | --------- | ---------------------------------------------------- |
| teal   | `#00838A` | 白                                                   |
| orange | `#FF6C2F` | 青インク                                             |
| purple | `#765BA7` | 白                                                   |
| yellow | `#FFE800` | 青インク（白は不可）                                 |
| brick  | `#A75154` | 白                                                   |
| green  | `#00A95C` | 青インク                                             |
| blue   | `#3255A4` | 白                                                   |
| pink   | `#FF48B0` | 青インク（選択色と紛れるのでカテゴリには最後に回す） |
| grey   | `#88898A` | 青インク                                             |

割り当ては `RISO_INKS` の並び順で。色だけに頼らず、ラベル・形（丸の塗り/白抜き、実線/破線）でも区別する。
色の丸には青インクの縁を付ける（`Chip` の `dot` は自動で付く。イエローが紙に溶けないように）。

## 部品（`src/components/ui`）

React から使うときは部品、既存の Tailwind 直書きのマークアップを移すときはクラスだけを付け替えてもよい（中身は同じ）。
ツールの中に同じ役目の独自実装を作らない。足りないものはここに足す。

```tsx
import { Button, buttonClass, Chip, Field, TextInput, Select, Textarea, Checkbox, Radio, Switch,
  SegmentedControl, Panel, Note, Badge, Swatch, Dialog, DropZone, Page, PageTitle } from '../../../components/ui'

<Page>                                                           // <main class="page">。広い作業面なら width="wide"
  <PageTitle lead="同行者のぶんまで入力して、一括アップロード用の Excel を作ります。" actions={<Button size="sm">元に戻す</Button>}>
    台湾入国カードメーカー
  </PageTitle>
  ...
</Page>

<Button variant="primary" type="submit">Excel を作る</Button>    // .btn.btn-primary（1 画面 1 つ）
<Button>同行者を追加</Button>                                    // .btn.btn-secondary（既定）
<Button variant="quiet" size="sm">条件を消す</Button>            // .btn.btn-quiet.btn-sm
<Button variant="danger" size="sm">この予約を消す</Button>       // .btn.btn-secondary.btn-danger（取り消しにくい操作）
<Link to="/" className={buttonClass('secondary')}>目次に戻る</Link>

<Chip pressed={genre === 'drink'} onPressedChange={() => setGenre('drink')} dot="var(--color-riso-teal)" count={8}>飲む</Chip>

<SegmentedControl label="表示" value={view} onChange={setView}  // 2〜4 択。矢印キーで移る radiogroup
  options={[{ value: 'list', label: '一覧' }, { value: 'map', label: '地図' }]} />

<Field label="旅券番号" hint="英字 2 文字と数字 7 桁" error={error}>
  <TextInput value={v} onChange={...} />     // id / aria-describedby / aria-invalid は Field がつなぐ
</Field>
<Field label="国籍"><Select>...</Select></Field>
<Checkbox label="同行者にも同じ滞在先を使う" checked={x} onChange={...} />
<fieldset><legend className="field-label">支払い</legend><Radio name="pay" label="現地払い" ... /></fieldset>
<Switch label="写真を敷く" checked={x} onChange={setX} />        // 押した瞬間に効く設定
<input type="range" className="range" ... />

<Panel className="p-6">...</Panel>          // tone="wash" | "dashed"
<Note>保存しました。</Note>                   // tone="warn"（破線。続行できる注意）| "error"（ピンクの薄網＋四角）
<Badge tone="solid">確定</Badge>             // tone="outline"（既定）| "dashed"（未確定）| "muted"
<Swatch color={ink.hex} />

<Dialog onClose={close} labelledBy={titleId} initialFocusRef={cancelRef} className="max-w-sm p-5">
  <h2 id={titleId} className="dialog-title">全部の予約を消しますか</h2> ...
</Dialog>                                    // フォーカスの閉じ込め・Esc・閉じたあとの復帰付き

<DropZone accept="image/*" multiple onFiles={add} title="画像を選ぶか、ここへドロップ" hint="PNG / JPG / HEIC" />
```

クラスだけで使う場合: `btn btn-primary` / `btn btn-secondary` / `btn btn-quiet` / `btn-danger` / `btn-sm`、`chip`（`aria-pressed` で選択表示、`chip-dot` `chip-count`）、`seg` `seg-item`（`aria-checked`、`seg-sm` `seg-full`）、`field` `field-label` `field-hint` `field-error`、`input`（input / select / textarea 共通）、`checkbox` `radio`（label に付け、中に input）、`switch` `switch-track`、`range`、`panel` `panel-wash` `panel-dashed`、`panel-note` `panel-note-warn` `panel-note-error`、`badge` `badge-solid` `badge-dashed` `badge-muted`、`swatch`、`dialog-backdrop` `dialog` `dialog-title`、`dropzone`（`data-dragover`）、`on-ink`、`page` `page-wide` `page-head` `page-measure`、`page-title` `page-lead`、`ink-link`、`mark-pink`。

### どれを使うか

- 2〜4 択で 1 つ選ぶ → `SegmentedControl`。5 択以上・複数選択・絞り込み → `Chip`。長い説明付きの択 → `Radio`。
- その場で効くオン／オフ → `Switch`。フォームの一項目として送るオン／オフ → `Checkbox`。
- 状態の札（確定・検討中・再訪） → `Badge`。アイコンは付けない（文字で言う）。
- 保存した・注意・エラーの帯 → `Note`。エラーの帯は 1 画面に 1 つまで。入力欄のエラーは `Field` の `error`。

## ページの枠

- すべてのページは `<Page>`（`main.page`）で包む。最大幅は 2 種類だけ。
  - 標準 `page`: 72rem（ヘッダーと同じ幅）。フォーム・一覧・読み物のツール。
  - 広幅 `page-wide`: 90rem。地図・カードのプレビュー・印刷面など作業面が広いツール（旅程パズル・旅のしおり・セトリ画像・原寸レイアウト）。開いている間はヘッダーの中身も 90rem に広がり、タイトルの左端とワードマークの左端が常に揃う。
- 左右の余白は 16px（sm 以上 24px）、タイトルの上は 32px（md 以上 48px）、下は 80px。ツール側で `mx-auto max-w-*` や `px-*` を重ねない。
- 単一列のフォームは枠の中で `page-measure`（48rem）にして左寄せ。中央寄せにしない（タイトルと左端がずれるため）。
- タイトルは `PageTitle`。説明文（lead）は 40em まで、タイトルの下 8px、その下の本文まで 32px（`page-head`）。タイトル横の操作は `actions` に渡す。
- 例外: 画面いっぱいを使うステージ（ドラムロール）は `page` の幅でタイトルだけを置き、ステージは全幅にする。

## 一覧の形（同じ箱を並べない）

- 同じ種類のものが続く一覧は、`panel` の箱を縦に積まずに罫（`border-t border-rule`、外枠は `ink-line-t` / `ink-line-b`）で区切った行にする。
- 階層で形を変える: 「いま」の 1 件だけを `panel` で強く、続きは罫の行、補足は字の大きさと `text-ink-muted` で。
- 箱の中に箱を入れない（入れ子の panel は 1 段まで）。

## アイコン

- アイコンは意味を担うときだけ（文字の無い操作ボタン、地図のピン、並べ替えのつまみ）。見出し・ラベル・バッジの横の飾りのアイコンは付けない。
- 文字の無いボタンには `aria-label` を付ける。

## 区間・遷移の書き方

- 区間は「羽田から松山」「11/7〜11/9」のように言葉か「〜」で書く。「→」は使わない。
- 例外: 時刻表として読む所（便の発着時刻 08:30–11:40 など）は en dash「–」で詰めてよい。

## 文字

- 本文・UI は Zen Kaku Gothic New（400 / 500 / 700）。Dela Gothic One はページの h1 とワードマークだけ。小見出しは Zen Kaku の 700。
- UI の文字（見出し・ボタン・チップ・ラベル・ナビ・バッジ）は字間を -0.04em 詰める（`--ui-tracking`。配信版の Zen Kaku Gothic New には palt が無く font-feature-settings では詰まらないため letter-spacing で詰め、palt も併記。base で h1–h6 / button / label / legend / summary / th / nav / select と `btn` `chip` `field-label` `badge` に設定済み。ほかに当てたいときは `palt` クラス）。本文の段落は全角送りのまま（読みやすさを優先）。
- 使わない: 大文字ラベル（`uppercase` + 字間）、アイブロウ（見出しの上の小さいラベル）、等幅の小ラベル、ボタン末尾の「→」、「A・B・C」のような中黒区切りのメタ文字列。
- 補足は `text-ink-muted`、サイズは 12–14px。本文は 15–16px。

## コピーの書き方

- 話し言葉の「です・ます」。短く、何が起きるかを書く（「Excel を作る」「条件を消す」）。ボタンは動詞で終える。
- エラーは「何が違うか＋どう直すか」（「旅券番号は英字 2 文字と数字 7 桁の 9 文字です。いまは 7 文字です。」）。謝らない、感嘆符を使わない。
- 外部サイトへのリンクには「別サイト」と添える。英語の飾りコピー（"Daily helpers…" など）は付けない。

## 共通クローム

- ヘッダー: 紙の地、左に Dela Gothic One のワードマーク、下に青インクの細罫 1 本。高さは 64px 固定（ツール側の `top-16` / `calc(100dvh-4rem)` がこれを前提にしている）。PC は「目次・旅行・デスク・イベント」の文字リンク（現在地にピンクの下線）、スマホは「目次」ボタンで一覧を開く。右端に配色の切り替え（自動・ライト・ダーク。スマホは目次の一番下）。
- トップはノートの目次（番号付きの一覧）。カードの格子にはしない。

## アクセシビリティ

- キーボードフォーカスは青 2px のアウトライン＋ピンクのズレ（base と部品で設定済み。ツール側で `outline-none` だけにしない）。
- 青インクのベタ面の上では `on-ink` を付ける（フォーカスの線が紙の白になる）。
- `prefers-reduced-motion: reduce` ではトランジションを止める（全体で設定済み）。ツール固有のアニメーションはツール側で止める。
- スマホ 390px で横スクロールが出ないこと。タップできるものは高さ 44px 前後（チップは 34px まで可）。
- ink-muted は白地で 5.2:1、wash 地で 4.7:1（ダークは 7.7:1 / 6.7:1）。それより薄い色を文字に使わない。
