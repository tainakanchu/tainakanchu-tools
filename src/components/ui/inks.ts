/**
 * Riso インクのカテゴリ色。CSS では `bg-riso-teal` などのユーティリティか
 * `var(--color-riso-teal)` を使う。canvas / SVG などで値そのものが要るときだけここを使う。
 * 並びはカテゴリに順番に割り当てるときの推奨順（隣り合っても見分けやすい順）。
 */
export const RISO_INKS = [
  { id: 'teal', name: 'ティール', hex: '#00838A', textOnInk: 'paper' },
  { id: 'orange', name: 'オレンジ', hex: '#FF6C2F', textOnInk: 'ink' },
  { id: 'purple', name: 'パープル', hex: '#765BA7', textOnInk: 'paper' },
  { id: 'yellow', name: 'イエロー', hex: '#FFE800', textOnInk: 'ink' },
  { id: 'brick', name: 'ブリック', hex: '#A75154', textOnInk: 'paper' },
  { id: 'green', name: 'グリーン', hex: '#00A95C', textOnInk: 'ink' },
  { id: 'blue', name: 'ブルー', hex: '#3255A4', textOnInk: 'paper' },
  { id: 'pink', name: '蛍光ピンク', hex: '#FF48B0', textOnInk: 'ink' },
  { id: 'grey', name: 'グレー', hex: '#88898A', textOnInk: 'ink' },
] as const

export type RisoInkId = (typeof RISO_INKS)[number]['id']

/** 紙と主インク（TS から値が要るとき用。CSS では text-ink / bg-paper など） */
export const PAPER = '#FFFFFF'
export const INK = '#1D3A8A'
export const PINK = '#FF48B0'
