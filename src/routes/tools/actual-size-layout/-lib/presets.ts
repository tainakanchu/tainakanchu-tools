export type PresetId =
  'id1-card' | 'passport-spread' | 'passport-page' | 'custom'

export type DocumentPreset = {
  id: PresetId
  label: string
  widthMm: number
  heightMm: number
  description?: string
}

export const documentPresets: Array<DocumentPreset> = [
  {
    id: 'id1-card',
    label: '免許証・マイナンバーカードなど（85.6mm × 54mm）',
    widthMm: 85.6,
    heightMm: 54,
    description:
      'JIS/ISO の ID-1 サイズ。運転免許証・マイナンバーカード・在留カード・クレジットカードなどに共通です。',
  },
  {
    id: 'passport-spread',
    label: 'パスポート見開き（176mm × 125mm）',
    widthMm: 176,
    heightMm: 125,
    description:
      'パスポート（ID-3: 88mm × 125mm）を開いた見開きの原寸サイズです。顔写真ページのコピーに。',
  },
  {
    id: 'passport-page',
    label: 'パスポート単ページ（88mm × 125mm）',
    widthMm: 88,
    heightMm: 125,
    description: 'パスポート1ページ分（ID-3: 88mm × 125mm）の原寸サイズです。',
  },
  { id: 'custom', label: 'カスタムサイズ', widthMm: 85.6, heightMm: 54 },
]
