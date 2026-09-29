/**
 * かんちゅの台湾マップのデータを検証し、配信用 JSON を生成する。
 *
 *   node scripts/build-taiwan-map-data.ts             # 検証 → public/data/taiwan/ へ書き出し
 *   node scripts/build-taiwan-map-data.ts --validate  # 検証のみ（書き出さない）
 *
 * 正本は src/data/taiwan/*.json（人が編集するのはこちら）。
 * public/data/taiwan/ は毎回ここから作り直す生成物なので .gitignore している。
 * 生成物をコミットすると、正本だけ直して生成し忘れた差分が混ざる事故が
 * 起きるため、dev / build の前に必ずこのスクリプトを走らせる運用にしている。
 *
 * エラーがあれば非ゼロで終了してビルドを止める。警告（訪問時期の書き忘れ
 * など）は表示するだけで止めない。
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildTaiwanMapData,
  serializeGenerated,
} from '../src/lib/taiwan-map/buildData.ts'
import {
  asTaiwanDataSource,
  validateTaiwanData,
} from '../src/lib/taiwan-map/schema.ts'
import type { RawTaiwanData } from '../src/lib/taiwan-map/schema.ts'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const SRC_DIR = path.join(repoRoot, 'src/data/taiwan')
const OUT_DIR = path.join(repoRoot, 'public/data/taiwan')

function readJson(file: string): unknown {
  const full = path.join(SRC_DIR, file)
  try {
    return JSON.parse(readFileSync(full, 'utf8'))
  } catch (e) {
    // JSON の構文エラーは位置情報つきのメッセージをそのまま見せたい
    throw new Error(
      `${file} を読めませんでした: ${e instanceof Error ? e.message : String(e)}`,
      {
        cause: e,
      },
    )
  }
}

/** areas.json 以外の *.json を都市ファイルとして読む（未知の都市はバリデータが弾く） */
function readRawData(): RawTaiwanData {
  const cityFiles: Record<string, unknown> = {}
  for (const file of readdirSync(SRC_DIR).toSorted()) {
    if (!file.endsWith('.json') || file === 'areas.json') continue
    cityFiles[file.slice(0, -'.json'.length)] = readJson(file)
  }
  return { areas: readJson('areas.json'), cityFiles }
}

function main(): void {
  const validateOnly = process.argv.includes('--validate')
  const raw = readRawData()
  const { errors, warnings } = validateTaiwanData(raw)

  for (const w of warnings) console.warn(`⚠ ${w.path}: ${w.message}`)
  for (const e of errors) console.error(`✖ ${e.path}: ${e.message}`)

  if (errors.length > 0) {
    console.error(
      `\n台湾マップのデータに ${errors.length} 件のエラーがあります（src/data/taiwan/）`,
    )
    process.exit(1)
  }

  const built = buildTaiwanMapData(asTaiwanDataSource(raw))
  const spotCount = built.spotIndex.length
  if (validateOnly) {
    console.log(
      `台湾マップ: 検証 OK（スポット ${spotCount} 件、警告 ${warnings.length} 件）`,
    )
    return
  }

  // 消えた都市のファイルが残らないよう、出力先は毎回作り直す
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const write = (file: string, data: unknown) =>
    writeFileSync(path.join(OUT_DIR, file), serializeGenerated(data))
  write('manifest.json', built.manifest)
  write('spot-index.json', built.spotIndex)
  for (const city of built.cities) write(`${city.city}.json`, city)

  console.log(
    `台湾マップ: public/data/taiwan/ に書き出しました（スポット ${spotCount} 件、警告 ${warnings.length} 件）`,
  )
}

main()
