/**
 * 文字列ごとの OS 標準フォントのスタック（canvas の font 用）。純粋関数。
 *
 * styles.css の body / :lang() と同じ並びにしてあり、画面で見た書体と
 * 画像に描いた書体が揃う。canvas は lang 属性を持てないので、langOf の結果で
 * 文字列ごとにスタックを選ぶ（1 つの名前の中で漢字のデザインが混ざらないように）。
 */

import { langOf } from './lang'
import type { TextLang } from './lang'

const LATIN = "'Helvetica Neue', Arial"

const STACKS: Record<TextLang, string> = {
  ja: `${LATIN}, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', Meiryo, sans-serif`,
  'zh-Hans': `${LATIN}, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'Noto Sans CJK SC', 'Source Han Sans SC', sans-serif`,
  'zh-Hant': `${LATIN}, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', 'Noto Sans CJK TC', 'Source Han Sans TC', sans-serif`,
  ko: `${LATIN}, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Noto Sans CJK KR', 'Source Han Sans K', sans-serif`,
}

/** 文字体系ごとの font-family（lang が無ければ本文の日本語のスタック） */
export function systemFontStack(lang: TextLang | undefined): string {
  return STACKS[lang ?? 'ja']
}

/** その文字列を描くための canvas の font 値 */
export function systemCanvasFont(
  text: string,
  sizePx: number,
  weight: number | 'normal' | 'bold' = 'normal',
): string {
  return `${weight} ${sizePx}px ${systemFontStack(langOf(text))}`
}
