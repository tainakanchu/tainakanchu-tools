# 台湾入国カード 一括アップロード用テンプレート

`template.xlsx` は、TWAC（台湾オンライン入国カード）公式サイト <https://twac.immigration.gov.tw>
が配布している一括アップロード用 Excel テンプレートを 2026-08-08 に取得したもの。
**シートの中身（工作表1 の列構成・工作表2 の選択肢マスタ・データ入力規則・条件付き書式・
シート保護）は 1 バイトも変えていない。** 公式サイトの取り込みがそのまま通ることが
このツールの前提なので、値を書き込むとき（`-lib/xlsx.ts`）も sheet1.xml の空セルだけを
差し替え、他のエントリはバイト列のまま詰め直している。

同梱にあたって `docProps/core.xml` の作成者メタデータだけを除去した（公開リポジトリで
第三者の氏名を配布し続けないため）。`dc:creator` と `cp:lastModifiedBy` を空文字にし、
`dcterms:modified` は `dcterms:created`（2024-11-28T07:05:03Z）に揃えてある。

## テンプレートが更新されたときの差し替え手順

1. 公式サイトから最新のテンプレートを取得し、上記と同じスクラブ（`dc:creator` /
   `cp:lastModifiedBy` を空に、`dcterms:modified` を `dcterms:created` に揃える）をかけて
   `template.xlsx` を置き換える。
2. `pnpm test` を実行する。`-lib/options.test.ts` が工作表2 の各範囲と `-lib/options.ts` の
   配列を順序込みで突き合わせ、`-lib/xlsx.test.ts` が 34 列のヘッダーとセルの構造を検証するので、
   選択肢の増減や列のずれはここで落ちる。
3. 落ちたら `-lib/options.ts` を新しいテンプレートから作り直す（配列の並びも工作表2 のまま）。
