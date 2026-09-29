/**
 * 台湾マップのデータ取得口。
 *
 * UI はこの interface だけに依存させ、実装（今は public/data/taiwan/ の静的
 * JSON を fetch する staticRepository）を差し替えられるようにしておく。
 * データが増えて Workers 側で絞り込む API を生やしたくなっても、
 * 画面側は触らずに済む。
 */

import type {
  CityData,
  CityId,
  SpotIndexEntry,
  TaiwanManifest,
} from './types.ts'

export interface TaiwanMapRepository {
  /** トップページ用の目次（都市・カテゴリごとの件数） */
  getManifest: () => Promise<TaiwanManifest>
  /** 1 都市ぶんのエリアとスポット（本文つき） */
  getCity: (id: CityId) => Promise<CityData>
  /** 全スポットの軽量インデックス（本文なし） */
  getSpotIndex: () => Promise<Array<SpotIndexEntry>>
}
