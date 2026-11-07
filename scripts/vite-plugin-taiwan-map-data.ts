/**
 * かんちゅの台湾マップの配信用 JSON（public/data/taiwan/）を生成する Vite プラグイン。
 *
 * - build: buildStart で 1 回生成する。データにエラーがあればビルドを止める
 *   （壊れたデータを配信しない）。public/ のコピーは buildStart より後なので、
 *   ここで書けば dist/data/taiwan/ にそのまま載る。
 * - dev: サーバー起動時に 1 回生成し、src/data/taiwan/*.json の変更を監視して
 *   作り直してからページを再読み込みさせる。こちらはエラーでもサーバーを
 *   落とさず、ログに出すだけにする（JSON を編集している途中の一瞬の
 *   構文エラーで dev サーバーが死ぬと、かえって作業が止まるため）。
 *
 * 以前は package.json の dev / build の前段で CLI を叩いていたが、
 * dev 中にデータを直しても反映されない（再起動が要る）ので、ここに一本化した。
 */
import path from 'node:path'
import {
  TAIWAN_DATA_SRC_DIR,
  formatIssues,
  generateTaiwanMapData,
} from './taiwan-map-data.ts'
import type { Plugin, ViteDevServer } from 'vite'

function logResult(
  logger: ViteDevServer['config']['logger'],
  result: ReturnType<typeof generateTaiwanMapData>,
): void {
  for (const line of formatIssues(result)) {
    if (line.startsWith('✖')) logger.error(line)
    else logger.warn(line)
  }
  if (result.errors.length > 0) {
    logger.error(
      `[taiwan-map] データに ${result.errors.length} 件のエラーがあります。直すまで前回の生成物のままです（src/data/taiwan/）`,
    )
  } else {
    logger.info(
      `[taiwan-map] public/data/taiwan/ を生成しました（スポット ${result.spotCount} 件、警告 ${result.warnings.length} 件）`,
    )
  }
}

export function taiwanMapDataPlugin(): Array<Plugin> {
  // vitest も同じ vite.config を読むが、テストは生成物に依存しない
  // （正本を直接読む）ので、書き出しの副作用を持ち込まない
  const disabled = Boolean(process.env.VITEST)
  return [
    {
      name: 'taiwan-map-data:build',
      apply: 'build',
      buildStart() {
        if (disabled) return
        const result = generateTaiwanMapData()
        for (const line of formatIssues(result)) this.warn(line)
        if (result.errors.length > 0) {
          this.error(
            `台湾マップのデータに ${result.errors.length} 件のエラーがあります（src/data/taiwan/）`,
          )
        }
      },
    },
    {
      name: 'taiwan-map-data:serve',
      apply: 'serve',
      configureServer(server) {
        if (disabled) return
        const { logger } = server.config
        const regenerate = () => {
          try {
            logResult(logger, generateTaiwanMapData())
          } catch (e) {
            // 書き出し失敗（権限など）でも dev サーバーは落とさない
            logger.error(`[taiwan-map] 生成に失敗しました: ${String(e)}`)
          }
        }
        regenerate()

        server.watcher.add(TAIWAN_DATA_SRC_DIR)
        const onChange = (file: string) => {
          if (
            path.dirname(path.resolve(file)) !== TAIWAN_DATA_SRC_DIR ||
            !file.endsWith('.json')
          ) {
            return
          }
          regenerate()
          server.ws.send({ type: 'full-reload' })
        }
        server.watcher.on('change', onChange)
        server.watcher.on('add', onChange)
        server.watcher.on('unlink', onChange)
      },
    },
  ]
}
