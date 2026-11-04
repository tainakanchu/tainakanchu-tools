/**
 * 「サンプルで試す」用の架空のセトリ（曲名・アーティストはすべて架空）。
 */
import { createTrackId } from './types'
import type { Setlist } from './types'

const START = 22 * 3600

const RAW: ReadonlyArray<
  [artist: string, title: string, bpm: number, key: string, min: number]
> = [
  ['Kaito Mizuno', 'Opening Signal', 118, 'Am', 0],
  ['Lumen Arcade', 'Night Bus to Shimokita', 120, 'Em', 5],
  ['夜光ラジオ', '午前二時の交差点', 121, 'Bm', 11],
  ['Hollow Coast', 'Glass Pavilion (Extended Mix)', 122, 'F#m', 17],
  ['Saya Otomo', 'Tidal Memory', 122, 'C#m', 23],
  ['DJ Tsuki', 'ネオンの海 (Club Edit)', 123, 'G#m', 29],
  ['Brass Theory', 'Second Wind', 124, 'D#m', 34],
  ['Mori & Halden', 'Paper Lanterns', 124, 'Bbm', 40],
  ['Sora Collective', '遠雷', 125, 'Fm', 46],
  ['Velvet Static', 'Undercurrent', 125, 'Cm', 51],
  ['Akane Shibata', 'Rooftop Bloom', 126, 'Gm', 57],
  ['Kanchu', '終電のあとで', 126, 'Dm', 63],
  ['Echo Tanaka', 'Last Light, First Train', 124, 'Am', 69],
  ['Polar Hymn', 'Encore (Sunrise Version)', 120, 'C', 75],
]

export function createSampleSetlist(): Setlist {
  return {
    title: 'NIGHT DRIVE vol.12',
    djName: 'KANCHU',
    date: '2026.11.03',
    venue: 'SHIBUYA SOUND LAB',
    tracks: RAW.map(([artist, title, bpm, key, min]) => ({
      id: createTrackId(),
      artist,
      title,
      bpm,
      key,
      startAt: START + min * 60,
    })),
  }
}

/**
 * 長いセット・長い名前の確認用（架空）。
 * 実際の履歴で見かける「連名 + feat.」「リミックス + 版表記 + リマスター」や、
 * 空白の無い長い日本語タイトルを混ぜて、詰め込みと省略の挙動を試せるようにする。
 */
const LONG_ARTISTS = [
  'Mika Tanabe, Leon Varga & Oskar Lindqvist feat. Hana Okada',
  'The Midnight Laundromat Orchestra & Friends',
  '深夜喫茶サウンドシステム',
  'Nils Okafor',
  'Yuzu Kurokawa vs. The Paper Kites Collective feat. MC Sorano',
  'Rin',
  'Aurelio Benedetti, Kenta Shiraishi & Ilse Marchetti',
  'ゆうやけプラネタリウム楽団',
]
const LONG_TITLES = [
  'Something Beautiful Happens After Midnight (Leon Varga Remix) [Extended Mix] - 2024 Remaster',
  'Glass Pavilion (Original Mix)',
  '真夜中の高速道路でカーラジオから流れてきたあの曲をもう一度だけ聴きたかった',
  'Heat',
  'Dancing Through the Static of a Thousand Radio Stations (Radio Edit)',
  'Afterglow [Kenta Shiraishi Edit]',
  'Tidal Memory feat. Hana Okada (Club Mix)',
  '夜明け前',
  'Second Wind - Extended Version',
  'Undercurrent (Rin & Nils Okafor Dub) [Remastered 2019]',
]
const KEYS = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'Bbm', 'Fm', 'Cm']

export function createStressSetlist(count: number): Setlist {
  return {
    title: `LONG NIGHT SESSION ${count}`,
    djName: 'KANCHU b2b The Midnight Laundromat Orchestra',
    date: '2026.11.03',
    venue: 'SHIBUYA SOUND LAB',
    tracks: Array.from({ length: count }, (_, i) => ({
      id: createTrackId(),
      artist: LONG_ARTISTS[i % LONG_ARTISTS.length],
      title: LONG_TITLES[(i * 3) % LONG_TITLES.length],
      bpm: 118 + (i % 12),
      key: KEYS[i % KEYS.length],
      startAt: START + i * 4 * 60 + (i % 3) * 37,
    })),
  }
}
