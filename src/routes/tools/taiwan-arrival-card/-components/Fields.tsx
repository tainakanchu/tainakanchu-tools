/**
 * フォームの入力欄。共通部品の Field(label・補足・エラーと入力欄をつなぐ)で包む。
 *
 * 設計判断:
 * - 選択肢が数百件ある欄(国籍 256 件・電話の国番号 219 件・航空会社 108 件)は
 *   `<select>` にしない。台湾側の表記は 'JPN,JAPAN' や '+81 JPN' のように
 *   検索できる形をしているので、`<input>` + `<datalist>` にすれば
 *   'JPN' と打つだけで絞り込める。数百件の select をスクロールさせるより速い。
 * - `<datalist>` の実体はページに 1 つずつしか置かない(DataLists)。
 *   旅行者 16 人 × 3 つの国名欄それぞれに 256 件の option を出すと
 *   1 万個以上の DOM ノードになり、入力のたびに描画が引っかかる。
 * - datalist は入力を選択肢に**縛らない**(自由に打てる)。リストに無い値は
 *   そのままだと TWAC 側で弾かれるので、ピンクの印付きの注記で知らせる。ここで
 *   勝手に消したり近い値に寄せたりはしない。打った値が黙って変わるほうが
 *   分かりにくいうえ、正しい値を知っているのは利用者のほうだからである。
 */

import { Field, Select, TextInput } from '../../../../components/ui'
import {
  FLIGHT_CODE_OPTIONS,
  NATIONALITY_OPTIONS,
  REGION_CODE_OPTIONS,
} from '../-lib/options'

/** ページに 1 つだけ置く datalist の id */
export const LIST_IDS = {
  nationality: 'twac-list-nationality',
  regionCode: 'twac-list-region-code',
  flightCode: 'twac-list-flight-code',
} as const

export type ListId = (typeof LIST_IDS)[keyof typeof LIST_IDS]

/**
 * 件数の多い選択肢の実体。ページのどこかに 1 度だけ描画する。
 * 表示はされないので置き場所はどこでもよいが、参照する input より先に
 * あるほうが分かりやすい。
 */
export function DataLists() {
  return (
    <>
      <datalist id={LIST_IDS.nationality}>
        {NATIONALITY_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id={LIST_IDS.regionCode}>
        {REGION_CODE_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id={LIST_IDS.flightCode}>
        {FLIGHT_CODE_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  )
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'date' | 'email' | 'tel'
  placeholder?: string
  /** 入力欄の下に出す補足。空欄のときの例など */
  hint?: string
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
}: TextFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <TextInput
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

interface SelectFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<string>
  /** 未選択を許すときのラベル。省略すると未選択の選択肢を出さない */
  emptyLabel?: string
  hint?: string
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  emptyLabel,
  hint,
}: SelectFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </Field>
  )
}

interface ListFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** LIST_IDS のどれか。実体は DataLists が持つ */
  listId: ListId
  /** 一致判定に使う選択肢。listId と同じリストを渡すこと */
  options: ReadonlyArray<string>
  placeholder?: string
  hint?: string
}

/**
 * 検索つきの選択入力。値が公式の選択肢に無ければピンクの印付きの注記を添える。
 * 注記は書き出し前のチェック(index.tsx の collectWarnings)とも同じ判定を使う。
 */
export function ListField({
  label,
  value,
  onChange,
  listId,
  options,
  placeholder,
  hint,
}: ListFieldProps) {
  const unknown = value.length > 0 && !options.includes(value)
  return (
    <Field
      label={label}
      hint={unknown ? undefined : hint}
      error={
        unknown
          ? '公式の選択肢にない値です。このままでは TWAC 側で弾かれる可能性があります。'
          : undefined
      }
    >
      <TextInput
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}
