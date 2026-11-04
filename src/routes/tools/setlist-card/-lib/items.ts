/**
 * 曲データ → 表示用の行（純粋関数）。
 *
 * 隠した曲（redact）の置き換えはここで済ませる。テンプレート・行組み・ページ割りは
 * ここで作った items しか見ないので、隠した欄の本当の文字は計測にも描画にも届かない。
 */
import { cleanArtistName, cleanTitle } from './clean'
import { displayNames, isHidden } from './redact'
import { formatBpm, formatOffset } from './text'
import type { CleanOptions } from './clean'
import type { QmarkGlyph, RedactOptions } from './redact'
import type { RowItem } from './rows'
import type { Track } from './types'

export type MetaKey = 'time' | 'bpm' | 'key' | 'label'
export const META_LABELS: Record<MetaKey, string> = {
  time: '開始時刻',
  bpm: 'BPM',
  key: 'Key',
  label: 'レーベル',
}

const LABEL_MAX = 18

/** A1 / A2 … B1 のような面ごとの番号（12 曲までは 2 面、それより多ければ 6 曲ずつ） */
export function sideNumber(index: number, count: number): string {
  const perSide = count <= 12 ? Math.max(1, Math.ceil(count / 2)) : 6
  const side = Math.min(25, Math.floor(index / perSide))
  return `${String.fromCharCode(65 + side)}${(index % perSide) + 1}`
}

export type ItemsOptions = {
  display: { time: boolean; bpm: boolean; key: boolean; label: boolean }
  text: CleanOptions
  redact: RedactOptions
  /** A1 / A2 … の面番号にする */
  sideNumbers: boolean
  /** ？？？ の字（書体に合わせる） */
  qmark?: QmarkGlyph
}

function shortLabel(label: string): string {
  const chars = Array.from(label)
  return chars.length > LABEL_MAX
    ? `${chars
        .slice(0, LABEL_MAX - 1)
        .join('')
        .trimEnd()}…`
    : label
}

export function toItems(
  tracks: ReadonlyArray<Track>,
  opts: ItemsOptions,
): { items: Array<RowItem>; metaKeys: Array<MetaKey> } {
  const { display } = opts
  const starts = tracks
    .map((t) => t.startAt)
    .filter((v): v is number => v !== undefined)
  const origin = starts.length > 0 ? Math.min(...starts) : undefined
  const keys: Array<MetaKey> = ['time', 'bpm', 'key', 'label']
  const raw = tracks.map((track) => {
    const hidden = isHidden(track)
    // 隠した曲のレーベルは出さない（曲を特定できてしまうため）。BPM・Key は設定次第
    const hideMeta = hidden && opts.redact.hideMeta
    return {
      time:
        display.time && track.startAt !== undefined && origin !== undefined
          ? formatOffset(track.startAt - origin)
          : '',
      bpm:
        display.bpm && !hideMeta && track.bpm !== undefined
          ? formatBpm(track.bpm)
          : '',
      key: display.key && !hideMeta && track.key ? track.key : '',
      label:
        display.label && !hidden && track.label ? shortLabel(track.label) : '',
    }
  })
  // 1 曲も値が無い列は詰める（表示する値で判定するので、隠した値は数えない）
  const metaKeys = keys.filter((k) => raw.some((r) => r[k] !== ''))
  const clean = {
    artist: (s: string) => cleanArtistName(s, opts.text),
    title: (s: string) => cleanTitle(s, opts.text),
  }
  const items = tracks.map((track, index): RowItem => {
    const names = displayNames(track, index, opts.redact, clean, opts.qmark)
    const item: RowItem = {
      num: opts.sideNumbers
        ? sideNumber(index, tracks.length)
        : String(index + 1).padStart(2, '0'),
      artist: names.artist,
      title: names.title,
      meta: metaKeys.map((k) => raw[index][k]),
    }
    if (names.mark) item.mark = names.mark
    return item
  })
  return { items, metaKeys }
}
