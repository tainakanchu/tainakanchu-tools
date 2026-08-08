/**
 * 書き出す前に気付いておきたいことを集める層。
 *
 * 設計判断:
 * - **書き出しは止めない。** ここで出るのは「TWAC 側で弾かれるかもしれない」
 *   という予測でしかなく、公式の検証規則をこちらが完全に写せているわけではない。
 *   止めてしまうと、こちらの読み違いのせいで正しい入力が書き出せなくなる。
 *   出すのは警告だけにして、判断は人に残す。
 * - 選択肢との一致は、UI の琥珀色の注記(Fields.tsx の ListField)と
 *   同じ判定にする。画面では警告が出ているのに書き出し前の一覧には出てこない
 *   (またはその逆)という状態を作らない。
 * - 空欄かどうかは**前後の空白を落としてから**見る。空白だけの氏名は
 *   人間の目には空欄だが、`value.length > 0` は真になる。入力済みとして
 *   素通りさせると、空白 1 文字が氏名として書き出される。
 * - 日付は「実在するか」まで見る(isValidIsoDate)。`<input type="date">` は
 *   読めない値を空欄として描くので、この層で見ないと誰も気付けない
 *   (理由の全体は -lib/dates.ts の冒頭)。
 */

import { isValidIsoDate } from './dates'
import {
  FLIGHT_CODE_OPTIONS,
  NATIONALITY_OPTIONS,
  OCCUPATION_OPTIONS,
  PURPOSE_OPTIONS,
  PURPOSE_OTHERS,
  PURPOSE_VISIT_RELATIVE,
  REGION_CODE_OPTIONS,
  needsVisaNumber,
  visaTypeOptionsFor,
} from './options'
import type { ArrivalCardState, Traveler, TripInfo } from './types'

export interface Warning {
  /** 誰の話か。旅程全体なら null */
  travelerIndex: number | null
  message: string
}

/** 空白だけの入力を「未入力」として扱うための判定 */
function isBlank(value: string): boolean {
  return value.trim().length === 0
}

/** 値が空でなく、かつ公式の選択肢に無いときだけ警告する */
function checkListValue(
  value: string,
  options: ReadonlyArray<string>,
  label: string,
): string | null {
  if (isBlank(value)) return null
  if (options.includes(value)) return null
  return `${label} '${value}' は公式の選択肢にありません`
}

/**
 * 日付欄の検査。空欄と「実在しない日付」を別のメッセージで区別する。
 *
 * 区別するのは、利用者にとって次にやることが違うから。空欄なら入れればよいが、
 * 実在しない日付が入っているときは**画面上は空欄に見えている**ので、
 * 「入れたはずなのに未入力と言われる」という不可解な状態になる。
 * そうと分かるメッセージにしておく。
 */
function checkDate(value: string, label: string): string | null {
  if (isBlank(value)) return `${label}が未入力です`
  if (!isValidIsoDate(value.trim())) {
    return `${label} '${value}' は実在しない日付です。入力し直してください`
  }
  return null
}

function tripWarnings(trip: TripInfo): Array<string> {
  const messages: Array<string> = []

  const entryDate = checkDate(trip.dateOfEntry, '入国日')
  if (entryDate !== null) messages.push(entryDate)
  const exitDate = checkDate(trip.exitDate, '出国予定日')
  if (exitDate !== null) messages.push(exitDate)
  // 前後関係は両方が実在する日付のときだけ見る。片方が壊れている状態で
  // 文字列比較すると、意味のない「前後が逆です」が上乗せされる
  if (
    entryDate === null &&
    exitDate === null &&
    trip.exitDate.trim() < trip.dateOfEntry.trim()
  ) {
    messages.push('出国予定日が入国日より前になっています')
  }

  if (trip.entryMode === 'AIR') {
    if (isBlank(trip.entryFlightCode)) {
      messages.push('入国便の航空会社が未選択です')
    }
    if (isBlank(trip.entryFlightNumber)) {
      messages.push('入国便の便番号が未入力です')
    }
    const unknown = checkListValue(
      trip.entryFlightCode,
      FLIGHT_CODE_OPTIONS,
      '入国便の航空会社',
    )
    if (unknown !== null) messages.push(unknown)
  } else if (isBlank(trip.entryVesselNumber)) {
    messages.push('入国便の船便番号が未入力です')
  }

  if (trip.exitMode === 'AIR') {
    if (isBlank(trip.exitFlightCode)) {
      messages.push('出国便の航空会社が未選択です')
    }
    if (isBlank(trip.exitFlightNumber)) {
      messages.push('出国便の便番号が未入力です')
    }
    const unknown = checkListValue(
      trip.exitFlightCode,
      FLIGHT_CODE_OPTIONS,
      '出国便の航空会社',
    )
    if (unknown !== null) messages.push(unknown)
  } else if (isBlank(trip.exitVesselNumber)) {
    messages.push('出国便の船便番号が未入力です')
  }

  const unknownPurpose = checkListValue(
    trip.purpose,
    PURPOSE_OPTIONS,
    '渡航目的',
  )
  if (isBlank(trip.purpose)) messages.push('渡航目的が未選択です')
  else if (unknownPurpose !== null) messages.push(unknownPurpose)

  if (trip.purpose === PURPOSE_VISIT_RELATIVE) {
    if (isBlank(trip.relativesName)) {
      messages.push('渡航目的が探親のため、親族の氏名が必要です')
    }
    if (isBlank(trip.relativesMobile)) {
      messages.push('渡航目的が探親のため、親族の電話番号が必要です')
    }
  }
  if (trip.purpose === PURPOSE_OTHERS && isBlank(trip.reason)) {
    messages.push('渡航目的が其他のため、理由の入力が必要です')
  }

  // Transfer(乗り継ぎのみ)は滞在先を書かないのが正しいので、空でも警告しない
  if (trip.accommodation !== 'Transfer' && isBlank(trip.addressOrHotel)) {
    messages.push(
      trip.accommodation === 'Hotel Name'
        ? 'ホテル名が未入力です'
        : '滞在先の住所が未入力です',
    )
  }

  return messages
}

function travelerWarnings(traveler: Traveler): Array<string> {
  const messages: Array<string> = []

  const required: Array<[value: string, label: string]> = [
    [traveler.englishName, '氏名'],
    [traveler.passportNumber, 'パスポート番号'],
    [traveler.sex, '性別'],
    [traveler.nationality, '国籍'],
    [traveler.countryOfBirth, '出生国'],
    [traveler.cityOfBirth, '出生都市'],
    [traveler.placeOfResidence, '居住国'],
    [traveler.visaType, 'ビザの区分'],
    [traveler.regionCode, '電話の国番号'],
    [traveler.mobileNumber, '携帯電話番号'],
    [traveler.occupation, '職業'],
    [traveler.email, 'メールアドレス'],
  ]
  for (const [value, label] of required) {
    if (isBlank(value)) messages.push(`${label}が未入力です`)
  }

  const dates: Array<[value: string, label: string]> = [
    [traveler.passportExpiry, 'パスポート有効期限'],
    [traveler.dateOfBirth, '生年月日'],
  ]
  for (const [value, label] of dates) {
    const message = checkDate(value, label)
    if (message !== null) messages.push(message)
  }

  const listChecks: Array<
    [value: string, options: ReadonlyArray<string>, label: string]
  > = [
    [traveler.nationality, NATIONALITY_OPTIONS, '国籍'],
    [traveler.countryOfBirth, NATIONALITY_OPTIONS, '出生国'],
    [traveler.placeOfResidence, NATIONALITY_OPTIONS, '居住国'],
    [traveler.regionCode, REGION_CODE_OPTIONS, '電話の国番号'],
    [traveler.occupation, OCCUPATION_OPTIONS, '職業'],
    [traveler.visaType, visaTypeOptionsFor(traveler.nationality), 'ビザの区分'],
  ]
  for (const [value, options, label] of listChecks) {
    const unknown = checkListValue(value, options, label)
    if (unknown !== null) messages.push(unknown)
  }

  // 番号を持つビザ区分(持有簽證・落地簽證・具入國許可・入國許可證號)を選んだのに
  // 番号が空、という組み合わせは向こうで必ず弾かれる。番号を持たない区分では
  // そもそも入力欄を出していないので、この判定は needsVisaNumber と同じ規則で行う
  if (needsVisaNumber(traveler.visaType) && isBlank(traveler.visaNumber)) {
    messages.push(
      `ビザの区分が「${traveler.visaType}」のため、ビザ番号の入力が必要です`,
    )
  }

  // 職業が「其他/OTHER」のときだけ役職欄が必須になる
  // (テンプレートの条件付き書式が R 列をそう塗り分けている)
  if (traveler.occupation === '其他/OTHER' && isBlank(traveler.jobTitle)) {
    messages.push('職業が「其他/OTHER」のため、役職・肩書きの入力が必要です')
  }

  return messages
}

/**
 * 書き出し前のチェック。空欄も選択肢との不一致もまとめて返す。
 * 旅行者は「N人目」で引けるように index を添える。
 */
export function collectWarnings(state: ArrivalCardState): Array<Warning> {
  const warnings: Array<Warning> = tripWarnings(state.trip).map((message) => ({
    travelerIndex: null,
    message,
  }))
  state.travelers.forEach((traveler, index) => {
    for (const message of travelerWarnings(traveler)) {
      warnings.push({ travelerIndex: index, message })
    }
  })
  return warnings
}
