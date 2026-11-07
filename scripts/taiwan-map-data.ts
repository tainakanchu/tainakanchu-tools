/**
 * かんちゅの台湾マップ: 正本（src/data/taiwan/*.json）の読み込み・検証・
 * 配信用 JSON（public/data/taiwan/）の書き出し。
 *
 * CLI（build-taiwan-map-data.ts）と Vite プラグイン
 * （vite-plugin-taiwan-map-data.ts）の両方から使うので、ここでは
 * process.exit もログ出力もしない。結果を返して呼び出し側に任せる
 * （dev サーバーはエラーでも落とさず、build と CLI は止める、という
 * 扱いの違いがあるため）。
 *
 * public/data/taiwan/ は毎回ここから作り直す生成物なので .gitignore している。
 * 生成物をコミットすると、正本だけ直して生成し忘れた差分が混ざる事故が
 * 起きるため。
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
import type {
  RawTaiwanData,
  ValidationIssue,
} from '../src/lib/taiwan-map/schema.ts'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
export const TAIWAN_DATA_SRC_DIR = path.join(repoRoot, 'src/data/taiwan')
export const TAIWAN_DATA_OUT_DIR = path.join(repoRoot, 'public/data/taiwan')

export type TaiwanMapDataResult = {
  errors: Array<ValidationIssue>
  warnings: Array<ValidationIssue>
  spotCount: number
  /** 書き出したか（エラーあり・validateOnly のときは false） */
  written: boolean
}

function readJson(file: string): unknown {
  const full = path.join(TAIWAN_DATA_SRC_DIR, file)
  return JSON.parse(readFileSync(full, 'utf8'))
}

/** areas.json 以外の *.json を都市ファイルとして読む（未知の都市はバリデータが弾く） */
function readRawData(): RawTaiwanData {
  const cityFiles: Record<string, unknown> = {}
  for (const file of readdirSync(TAIWAN_DATA_SRC_DIR).toSorted()) {
    if (!file.endsWith('.json') || file === 'areas.json') continue
    cityFiles[file.slice(0, -'.json'.length)] = readJson(file)
  }
  return { areas: readJson('areas.json'), cityFiles }
}

export function generateTaiwanMapData(
  options: { validateOnly?: boolean } = {},
): TaiwanMapDataResult {
  let raw: RawTaiwanData
  try {
    raw = readRawData()
  } catch (e) {
    // JSON の構文エラーは位置情報つきのメッセージをそのまま見せたい
    const message = e instanceof Error ? e.message : String(e)
    return {
      errors: [{ path: 'src/data/taiwan', message }],
      warnings: [],
      spotCount: 0,
      written: false,
    }
  }

  const { errors, warnings } = validateTaiwanData(raw)
  if (errors.length > 0) {
    return { errors, warnings, spotCount: 0, written: false }
  }

  const built = buildTaiwanMapData(asTaiwanDataSource(raw))
  const spotCount = built.spotIndex.length
  if (options.validateOnly) {
    return { errors, warnings, spotCount, written: false }
  }

  // 消えた都市のファイルが残らないよう、出力先は毎回作り直す
  if (existsSync(TAIWAN_DATA_OUT_DIR)) {
    rmSync(TAIWAN_DATA_OUT_DIR, { recursive: true })
  }
  mkdirSync(TAIWAN_DATA_OUT_DIR, { recursive: true })
  const write = (file: string, data: unknown) =>
    writeFileSync(
      path.join(TAIWAN_DATA_OUT_DIR, file),
      serializeGenerated(data),
    )
  write('manifest.json', built.manifest)
  write('spot-index.json', built.spotIndex)
  for (const city of built.cities) write(`${city.city}.json`, city)

  return { errors, warnings, spotCount, written: true }
}

export function formatIssues(result: TaiwanMapDataResult): Array<string> {
  return [
    ...result.warnings.map((w) => `⚠ ${w.path}: ${w.message}`),
    ...result.errors.map((e) => `✖ ${e.path}: ${e.message}`),
  ]
}
