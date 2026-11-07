/**
 * キー表記の正規化。
 * rekordbox の Tonality は設定次第で "Am" のような標準表記か "8A" のような
 * Camelot 表記で入ってくるので、文字列はそのまま整えるだけにする。
 * Traktor の MUSICAL_KEY VALUE (0〜23) は rekordbox の既定表示に揃えて標準表記へ変換する。
 */

/** Camelot ホイールで一般的な表記（♭/♯ の選び方もそれに合わせる） */
const MAJOR = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const
const MINOR = [
  'Cm',
  'C#m',
  'Dm',
  'Ebm',
  'Em',
  'Fm',
  'F#m',
  'Gm',
  'G#m',
  'Am',
  'Bbm',
  'Bm',
] as const

/** Traktor の MUSICAL_KEY VALUE: 0〜11 = C〜B (major)、12〜23 = Cm〜Bm */
export function traktorKeyToName(value: number): string | undefined {
  if (!Number.isInteger(value) || value < 0 || value > 23) return undefined
  return value < 12 ? MAJOR[value] : MINOR[value - 12]
}

/** 表記ゆれ（"A minor"、"a#m"、"8a"、全角 ♯）を軽く揃える */
export function normalizeKey(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined
  let text = value.trim().replace(/♯/g, '#').replace(/♭/g, 'b')
  if (!text) return undefined
  const camelot = /^(\d{1,2})\s*([ABab])$/.exec(text)
  if (camelot) return `${Number(camelot[1])}${camelot[2].toUpperCase()}`
  const openKey = /^(\d{1,2})\s*([dmDM])$/.exec(text)
  if (openKey) return `${Number(openKey[1])}${openKey[2].toLowerCase()}`
  text = text
    .replace(/\s*(minor|min)$/i, 'm')
    .replace(/\s*(major|maj)$/i, '')
    .replace(/\s+/g, '')
  const std = /^([A-Ga-g])([#b]?)(m?)$/.exec(text)
  if (std) return `${std[1].toUpperCase()}${std[2]}${std[3]}`
  return text
}
