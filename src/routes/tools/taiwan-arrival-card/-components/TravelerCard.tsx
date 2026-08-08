/**
 * 旅行者 1 人ぶんの入力カード。テンプレートの 1 行に対応する。
 *
 * 国籍を変えたら Visa Type の選択肢が切り替わる(テンプレートの M 列に
 * 張られた INDIRECT のデータ入力規則と同じ挙動)。現在値が新しいリストに
 * 無ければ先頭の値にリセットする。残しておくと、選択肢に無い値のまま
 * 書き出されて TWAC 側で弾かれる。
 */

import { Trash2, User } from 'lucide-react'
import {
  NATIONALITY_OPTIONS,
  OCCUPATION_OPTIONS,
  REGION_CODE_OPTIONS,
  SEX_OPTIONS,
  needsVisaNumber,
  visaTypeOptionsFor,
} from '../-lib/options'
import { iconButtonClass } from '../-lib/styles'
import { LIST_IDS, ListField, SelectField, TextField } from './Fields'
import type { Traveler } from '../-lib/types'

interface TravelerCardProps {
  traveler: Traveler
  /** 見出しに使う 1 始まりの番号。氏名が未入力のときに「旅行者N」と出す */
  position: number
  onChange: <K extends keyof Traveler>(key: K, value: Traveler[K]) => void
  onRemove: () => void
  /** 1 人しかいないときは消せないようにする(空の画面を作らない) */
  canRemove: boolean
}

export function TravelerCard({
  traveler,
  position,
  onChange,
  onRemove,
  canRemove,
}: TravelerCardProps) {
  const visaTypes = visaTypeOptionsFor(traveler.nationality)
  const heading =
    traveler.englishName.trim().length > 0
      ? traveler.englishName
      : `旅行者${position}`

  /*
    ビザ番号は、区分を変えたら**必ず**消す。

    「番号が要らない区分に変わったときだけ消す」では足りない。番号を持つ区分は
    複数あり(持有簽證・落地簽證・具入國許可・入國許可證號)、その間を行き来すると
    入力欄が出たままなので、前の区分で入れた番号が残っていることに気付けない。
    落地簽證の番号が持有簽證の番号として書き出されるのは、空欄で出すより悪い。
    区分が変われば番号も別物、と一律に決めておく。
  */
  const changeVisaType = (next: string): void => {
    if (next === traveler.visaType) return
    onChange('visaType', next)
    onChange('visaNumber', '')
  }

  /**
   * 国籍の変更。Visa Type の選択肢が変わるので、現在値が新しいリストに
   * 無ければ先頭に寄せる(テンプレートの M 列に張られた INDIRECT と同じ挙動)。
   */
  const handleNationalityChange = (value: string): void => {
    onChange('nationality', value)
    const nextVisaTypes = visaTypeOptionsFor(value)
    if (!nextVisaTypes.includes(traveler.visaType)) {
      changeVisaType(nextVisaTypes[0])
    }
  }

  const handleVisaTypeChange = (value: string): void => {
    changeVisaType(value)
  }

  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-800">
          <User
            size={16}
            aria-hidden="true"
            className="shrink-0 text-cyan-600"
          />
          <span className="truncate">{heading}</span>
        </h3>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className={iconButtonClass}
          aria-label={`${heading}を削除する`}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextField
          label="氏名(パスポート表記)"
          value={traveler.englishName}
          onChange={(value) => onChange('englishName', value)}
          placeholder="YAMADA TARO"
          hint="姓・名の順。パスポートのローマ字表記のまま"
        />
        <TextField
          label="中国語氏名(あれば)"
          value={traveler.chineseName}
          onChange={(value) => onChange('chineseName', value)}
        />
        <TextField
          label="パスポート番号"
          value={traveler.passportNumber}
          onChange={(value) => onChange('passportNumber', value)}
          placeholder="TR1234567"
        />
        <TextField
          label="パスポート有効期限"
          type="date"
          value={traveler.passportExpiry}
          onChange={(value) => onChange('passportExpiry', value)}
        />
        <SelectField
          label="性別"
          value={traveler.sex}
          onChange={(value) =>
            onChange('sex', value === 'Male' || value === 'Female' ? value : '')
          }
          options={SEX_OPTIONS}
          emptyLabel="選択してください"
        />
        <TextField
          label="生年月日"
          type="date"
          value={traveler.dateOfBirth}
          onChange={(value) => onChange('dateOfBirth', value)}
        />
        <ListField
          label="国籍"
          value={traveler.nationality}
          onChange={handleNationalityChange}
          listId={LIST_IDS.nationality}
          options={NATIONALITY_OPTIONS}
          placeholder="JPN と打つと絞り込めます"
        />
        <ListField
          label="出生国"
          value={traveler.countryOfBirth}
          onChange={(value) => onChange('countryOfBirth', value)}
          listId={LIST_IDS.nationality}
          options={NATIONALITY_OPTIONS}
        />
        <TextField
          label="出生都市"
          value={traveler.cityOfBirth}
          onChange={(value) => onChange('cityOfBirth', value)}
          placeholder="TOKYO"
          hint="ラテン文字(英語表記)で入力してください"
        />
        <ListField
          label="居住国"
          value={traveler.placeOfResidence}
          onChange={(value) => onChange('placeOfResidence', value)}
          listId={LIST_IDS.nationality}
          options={NATIONALITY_OPTIONS}
        />
        <SelectField
          label="ビザの区分"
          value={traveler.visaType}
          onChange={handleVisaTypeChange}
          options={visaTypes}
          emptyLabel="選択してください"
          hint="国籍によって選べる区分が変わります"
        />
        {needsVisaNumber(traveler.visaType) && (
          <TextField
            label="ビザ番号"
            value={traveler.visaNumber}
            onChange={(value) => onChange('visaNumber', value)}
          />
        )}
        <ListField
          label="電話の国番号"
          value={traveler.regionCode}
          onChange={(value) => onChange('regionCode', value)}
          listId={LIST_IDS.regionCode}
          options={REGION_CODE_OPTIONS}
          placeholder="+81 と打つと絞り込めます"
        />
        <TextField
          label="携帯電話番号"
          type="tel"
          value={traveler.mobileNumber}
          onChange={(value) => onChange('mobileNumber', value)}
          placeholder="9012345678"
          hint="国番号を除いた番号。先頭の 0 は不要です"
        />
        <SelectField
          label="職業"
          value={traveler.occupation}
          onChange={(value) => onChange('occupation', value)}
          options={OCCUPATION_OPTIONS}
          emptyLabel="選択してください"
        />
        <TextField
          label="役職・肩書き"
          value={traveler.jobTitle}
          onChange={(value) => onChange('jobTitle', value)}
          hint="職業が「其他/OTHER」のときは必須です"
        />
        <TextField
          label="メールアドレス"
          type="email"
          value={traveler.email}
          onChange={(value) => onChange('email', value)}
        />
      </div>
    </li>
  )
}
