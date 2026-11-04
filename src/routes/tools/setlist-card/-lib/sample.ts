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
