/**
 * フォームの入力欄。label でラップし、見出しは `<span className={labelClass}>` に
 * 入れる(trip-notes の BookingForm と同じ書き方)。
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
 *   そのままだと TWAC 側で弾かれるので、琥珀色の注記で知らせる。ここで
 *   勝手に消したり近い値に寄せたりはしない。打った値が黙って変わるほうが
 *   分かりにくいうえ、正しい値を知っているのは利用者のほうだからである。
 */

import {
  FLIGHT_CODE_OPTIONS,
  NATIONALITY_OPTIONS,
  REGION_CODE_OPTIONS,
} from '../-lib/options'
import { fieldClass, labelClass, unverifiedFieldClass } from '../-lib/styles'
import type { ReactNode } from 'react'

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

interface FieldShellProps {
  label: string
  /** 入力欄の下に出す補足。空欄のときの例など */
  hint?: string
  children: ReactNode
}

function FieldShell({ label, hint, children }: FieldShellProps) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      {children}
      {hint !== undefined && (
        <span className="block text-xs text-gray-500">{hint}</span>
      )}
    </label>
  )
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'date' | 'email' | 'tel'
  placeholder?: string
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
    <FieldShell label={label} hint={hint}>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      />
    </FieldShell>
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
    <FieldShell label={label} hint={hint}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      >
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldShell>
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
 * 検索つきの選択入力。値が公式の選択肢に無ければ琥珀色の注記を添える。
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
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      <input
        type="text"
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClass} ${unknown ? unverifiedFieldClass : ''}`}
      />
      {unknown ? (
        <span className="block text-xs text-amber-700">
          公式の選択肢にない値です。このままでは TWAC
          側で弾かれる可能性があります
        </span>
      ) : (
        hint !== undefined && (
          <span className="block text-xs text-gray-500">{hint}</span>
        )
      )}
    </label>
  )
}
