/**
 * かんちゅの台湾マップのデータを検証し、配信用 JSON を生成する CLI。
 *
 *   node scripts/build-taiwan-map-data.ts             # 検証 → public/data/taiwan/ へ書き出し
 *   node scripts/build-taiwan-map-data.ts --validate  # 検証のみ（書き出さない）
 *
 * 普段は手で叩く必要はない。dev / build では Vite プラグイン
 * （vite-plugin-taiwan-map-data.ts）が同じ処理を自動で走らせる。
 * CI は `pnpm taiwan:validate` でデータの壊れだけを先に見て、生成は
 * build に任せる（同じ生成を何度も走らせないため）。
 *
 * エラーがあれば非ゼロで終了する。警告（訪問時期の書き忘れなど）は
 * 表示するだけで止めない。
 */
import { formatIssues, generateTaiwanMapData } from './taiwan-map-data.ts'

const validateOnly = process.argv.includes('--validate')
const result = generateTaiwanMapData({ validateOnly })

for (const line of formatIssues(result)) console.warn(line)

if (result.errors.length > 0) {
  console.error(
    `\n台湾マップのデータに ${result.errors.length} 件のエラーがあります（src/data/taiwan/）`,
  )
  process.exit(1)
}

console.log(
  validateOnly
    ? `台湾マップ: 検証 OK（スポット ${result.spotCount} 件、警告 ${result.warnings.length} 件）`
    : `台湾マップ: public/data/taiwan/ に書き出しました（スポット ${result.spotCount} 件、警告 ${result.warnings.length} 件）`,
)
