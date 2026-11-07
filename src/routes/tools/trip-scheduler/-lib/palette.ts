/**
 * 都市ごとの色。タイムラインと滞在リストで同じ色を使い、
 * 「どのブロックがどの都市か」を目で追えるようにする。
 * 色は Riso インク（RISO_INKS の並び順）。色だけに頼らず、都市名の文字も必ず添える。
 * Tailwind は静的な文字列しか拾えないので、クラス名はここに literal で並べる。
 */

import { RISO_INKS } from '../../../../components/ui'
import type { RisoInkId } from '../../../../components/ui'

export interface CityColor {
  /** ブロック・丸・色帯の地（bg-riso-*） */
  bar: string
  /** 地の上に載せる文字色（text-paper / text-on-riso） */
  text: string
  /** SVG・色の丸用の地の色（CSS の色。ダークでは明るく刷り直した値になる） */
  fill: string
  /** SVG 用の文字の色（CSS の色） */
  textFill: string
}

function inkColor(id: RisoInkId, bar: string): CityColor {
  const ink = RISO_INKS.find((item) => item.id === id)
  const onPaper = ink?.textOnInk === 'paper'
  return {
    bar,
    text: onPaper ? 'text-paper' : 'text-on-riso',
    fill: `var(--color-riso-${id})`,
    textFill: onPaper ? 'var(--color-paper)' : 'var(--color-on-riso)',
  }
}

const cityColors: Array<CityColor> = [
  inkColor('teal', 'bg-riso-teal'),
  inkColor('orange', 'bg-riso-orange'),
  inkColor('purple', 'bg-riso-purple'),
  inkColor('yellow', 'bg-riso-yellow'),
  inkColor('brick', 'bg-riso-brick'),
  inkColor('green', 'bg-riso-green'),
  inkColor('blue', 'bg-riso-blue'),
  inkColor('pink', 'bg-riso-pink'),
  inkColor('grey', 'bg-riso-grey'),
]

/** 都市 ID → 色。訪問順に色を割り当てるので、並べ替えても同じ都市は同じ色 */
export function buildCityColorMap(
  cityIds: Array<string>,
): Map<string, CityColor> {
  const map = new Map<string, CityColor>()
  let index = 0
  for (const cityId of cityIds) {
    if (map.has(cityId)) continue
    map.set(cityId, cityColors[index % cityColors.length])
    index += 1
  }
  return map
}

/** カタログに無い都市など、色が決まらないときの色（紙に近い薄い面） */
export const fallbackCityColor: CityColor = {
  bar: 'bg-rule',
  text: 'text-ink',
  fill: 'var(--color-rule)',
  textFill: 'var(--color-ink)',
}

/**
 * 曜日番号 (0 = 日 〜 6 = 土) → 曜日の文字色。
 * 土はティール、日はブリック。平日は色を持たず周囲を継承する。
 */
const weekdayToneClasses: Array<string> = [
  'text-riso-brick', // 日
  '',
  '',
  '',
  '',
  '',
  'text-riso-teal', // 土
]

export function weekdayToneClass(weekdayIndex: number): string {
  return weekdayToneClasses[weekdayIndex] ?? ''
}
