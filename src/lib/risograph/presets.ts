/**
 * 参照インクプリセット。
 * RISO の公称色は仮想インクを選ぶ際の参照色としてのみ扱い、
 * 物理モデルには一切使用しない(仕様書 §1)。
 * driverInput はプリンタへ送る入力色の初期値(= 参照色と同じ hex から出発)。
 */
import { linearRgbToXyz, srgb8ToLinear, type RGB, type XYZ } from './color'
import type { SimInkDef } from './press-sim'

export function hexToLinear(hex: string): RGB {
  const v = hex.replace('#', '')
  return srgb8ToLinear(
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  )
}

export function hexToXyz(hex: string): XYZ {
  return linearRgbToXyz(hexToLinear(hex))
}

export interface InkPreset extends SimInkDef {
  /** UI スウォッチ表示用の参照 hex */
  hex: string
}

function preset(id: string, name: string, hex: string): InkPreset {
  return {
    id,
    name,
    hex,
    driverInput: hexToLinear(hex),
    referenceColor: hexToXyz(hex),
  }
}

/** RISO 特色にインスパイアされた参照色(公称近似値) */
export const INK_PRESETS: ReadonlyArray<InkPreset> = [
  preset('black', 'ブラック', '#000000'),
  preset('burgundy', 'バーガンディ', '#914E72'),
  preset('fluor-pink', '蛍光ピンク', '#FF48B0'),
  preset('red', 'レッド', '#FF665E'),
  preset('orange', 'オレンジ', '#FF6C2F'),
  preset('yellow', 'イエロー', '#FFE800'),
  preset('flat-gold', 'フラットゴールド', '#BB8B41'),
  preset('brown', 'ブラウン', '#925F52'),
  preset('green', 'グリーン', '#00A95C'),
  preset('hunter-green', 'ハンターグリーン', '#407060'),
  preset('teal', 'ティール', '#00838A'),
  preset('aqua', 'アクア', '#5EC8E5'),
  preset('blue', 'ブルー', '#0078BF'),
  preset('federal-blue', 'フェデラルブルー', '#3D5588'),
  preset('violet', 'バイオレット', '#9D7AD2'),
  preset('purple', 'パープル', '#765BA7'),
]

export function getInkPreset(id: string): InkPreset | undefined {
  return INK_PRESETS.find((p) => p.id === id)
}
