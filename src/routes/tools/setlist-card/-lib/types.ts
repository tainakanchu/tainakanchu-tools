/**
 * セトリ画像メーカーの共通モデル。
 * 4 形式（rekordbox XML / TXT、Traktor NML、Serato CSV）はどれもここへ正規化する。
 */

export type Track = {
  /** 並べ替え用の安定 ID（表示はしない） */
  id: string
  title: string
  artist: string
  bpm?: number
  /** 表示用のキー表記（例: Am, F#m, Db, 8A） */
  key?: string
  /**
   * 再生開始の壁時計秒（任意の基準からの秒数）。
   * 表示は「セットの最初の曲からの相対時刻」にするので基準は問わない。
   */
  startAt?: number
  /**
   * 再生を終えた壁時計秒（startAt と同じ基準）。再生記録に実際の終了時刻があるときだけ
   * （Serato の end time）。ファイルの長さから推して埋めない。
   */
  endAt?: number
  /**
   * 実際にかけていた秒数。再生記録にあるときだけ（Serato の playtime、
   * Traktor History の EXTENDEDDATA DURATION）。ファイルの長さ（durationSec）とは別物で、
   * 混ぜない。
   */
  playedSec?: number
  /** ファイル（曲そのもの）の長さ。かけた長さではないので、セットの長さには使わない */
  durationSec?: number
  genre?: string
  label?: string
  /**
   * 隠す欄（未発表の曲など）。かけたことは見せたまま、画像ではアーティスト名・曲名を
   * 伏せる。元の文字は残すので、いつでも戻せる。
   */
  hidden?: { artist: boolean; title: boolean }
}

export type Setlist = {
  title?: string
  djName?: string
  /** 表示用の日付文字列（曖昧な形式は元の文字列のまま） */
  date?: string
  venue?: string
  tracks: Array<Track>
}

export type SourceFormat =
  'rekordbox-xml' | 'rekordbox-txt' | 'traktor-nml' | 'serato-csv'

export const FORMAT_LABELS: Record<SourceFormat, string> = {
  'rekordbox-xml': 'rekordbox XML',
  'rekordbox-txt': 'rekordbox プレイリスト (テキスト)',
  'traktor-nml': 'Traktor History (NML)',
  'serato-csv': 'Serato History (CSV)',
}

/** 1 ファイルに複数入っているプレイリストの候補 */
export type PlaylistCandidate = {
  id: string
  name: string
  /** ルートを除いたフォルダ階層（表示用） */
  path: Array<string>
  /** HISTORY 系フォルダ配下か */
  isHistory: boolean
  setlist: Setlist
}

export type ParseResult = {
  format: SourceFormat
  playlists: Array<PlaylistCandidate>
  /** 最初に選んでおく候補の index */
  defaultIndex: number
}

let idCounter = 0
const idPrefix = Math.random().toString(36).slice(2, 7)

/** 並べ替え用のユニーク ID */
export function createTrackId(): string {
  idCounter += 1
  return `t-${idPrefix}-${idCounter}`
}
