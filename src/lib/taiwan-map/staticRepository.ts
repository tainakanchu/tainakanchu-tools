/**
 * public/data/taiwan/*.json（scripts/build-taiwan-map-data.ts の生成物）を
 * fetch する TaiwanMapRepository 実装。
 *
 * ■ Promise をキャッシュする理由
 *   同じ JSON を画面の複数箇所（一覧・地図・?spot の解決）がほぼ同時に
 *   欲しがるので、結果ではなく「進行中の Promise」を覚えておき、2 回目以降は
 *   同じ Promise を返して同時リクエストを 1 本にまとめる。
 *   失敗した Promise は捨てる。残しておくと、圏外で一度失敗したあと電波が
 *   戻ってもリロードするまで永遠に失敗し続けてしまう。
 */

import type { TaiwanMapRepository } from './repository.ts'
import type {
  CityData,
  CityId,
  SpotIndexEntry,
  TaiwanManifest,
} from './types.ts'

export const TAIWAN_DATA_BASE_URL = '/data/taiwan'

type FetchLike = (url: string) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export function createStaticRepository(
  options: { baseUrl?: string; fetch?: FetchLike } = {},
): TaiwanMapRepository {
  const baseUrl = options.baseUrl ?? TAIWAN_DATA_BASE_URL
  // globalThis.fetch をその場で呼ぶ（テストで差し替えた fetch を拾えるように、
  // かつ this を失ったまま呼んで Illegal invocation にならないように）
  const doFetch: FetchLike = options.fetch ?? ((url) => globalThis.fetch(url))
  const cache = new Map<string, Promise<unknown>>()

  function load<T>(file: string): Promise<T> {
    const cached = cache.get(file)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- キーはファイル名ごとに固定の型（下の getManifest などが対応を決めている）
    if (cached) return cached as Promise<T>

    const promise = doFetch(`${baseUrl}/${file}`).then(async (res) => {
      if (!res.ok) {
        throw new Error(`${file} の読み込みに失敗しました (HTTP ${res.status})`)
      }
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 自前のビルドスクリプトが検証済みデータから生成した JSON なので、形は保証されている
      return (await res.json()) as T
    })
    cache.set(file, promise)
    promise.catch(() => {
      // 後から来た別の Promise を消さないよう、自分が入っているときだけ消す
      if (cache.get(file) === promise) cache.delete(file)
    })
    return promise
  }

  return {
    getManifest: () => load<TaiwanManifest>('manifest.json'),
    getCity: (id: CityId) => load<CityData>(`${id}.json`),
    getSpotIndex: () => load<Array<SpotIndexEntry>>('spot-index.json'),
  }
}
