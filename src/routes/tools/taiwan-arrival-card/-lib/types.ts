/**
 * 台湾入国カードメーカーのデータモデル。
 *
 * 設計判断:
 * - 旅程(TripInfo)と個人(Traveler)を分ける。公式テンプレートは 1 行 = 1 人で、
 *   入国日も便名も宿泊先も人ごとの列として持っているが、同行者は同じ便で入って
 *   同じ宿に泊まるのが普通なので、そこまで人別に入力させるのは 16 人ぶんの
 *   同じ入力を 16 回させることになる。書き出すときに全行へ配る。
 * - 日付は内部では常に 'YYYY-MM-DD'(input type="date" がそのまま扱える形)で持ち、
 *   テンプレートが要求する DD/MM/YYYY への変換は書き出しの直前(xlsx.ts)でだけ行う。
 *   途中の層で表記が混ざると、どちらの形式で入っているのか読んでも分からなくなる。
 * - 選択肢を持つ欄(国籍・職業・航空会社など)の型は string のままにする。
 *   options.ts のリテラルユニオンにすると、localStorage から復元した古い値や
 *   AI が返した未知の値を型の上で表現できなくなり、いちいち検証を挟む場所が
 *   増える。リストとの一致は「書き出し前の警告」として UI で扱う。
 */

/** テンプレートのデータ行は 2〜17 行目の 16 行しかない */
export const MAX_TRAVELERS = 16

/** 入出国の手段。テンプレートの T / Y 列 */
export type ModeOfTravel = 'AIR' | 'SEA'

/** 台湾での滞在先の種別。テンプレートの AG 列 */
export type Accommodation = 'Residential Address' | 'Hotel Name' | 'Transfer'

/** 同行者全員で共有する旅程。書き出し時に全行へ同じ値を配る */
export interface TripInfo {
  /** 台湾に入国する日。'YYYY-MM-DD' か空文字 */
  dateOfEntry: string
  entryMode: ModeOfTravel
  /** 'BR : EVA Air' 形式(FLIGHT_CODE_OPTIONS のリスト値)。未設定なら空文字 */
  entryFlightCode: string
  /** 便番号の数字部分のみ。'BR190' なら '190' */
  entryFlightNumber: string
  entryVesselNumber: string
  exitDate: string
  exitMode: ModeOfTravel
  exitFlightCode: string
  exitFlightNumber: string
  exitVesselNumber: string
  /** PURPOSE_OPTIONS のリスト値 */
  purpose: string
  /** purpose が 5.探親 のときだけ使う */
  relativesName: string
  relativesMobile: string
  /** purpose が 10.其他 のときだけ使う */
  reason: string
  accommodation: Accommodation
  /** 住所またはホテル名。accommodation が Transfer のときは任意 */
  addressOrHotel: string
}

/** 1 人ぶんの個人情報。テンプレートの 1 行に対応する */
export interface Traveler {
  id: string
  /** パスポート表記のローマ字氏名(姓 名) */
  englishName: string
  chineseName: string
  passportNumber: string
  /** 'YYYY-MM-DD' */
  passportExpiry: string
  sex: 'Male' | 'Female' | ''
  dateOfBirth: string
  /** 'JPN,JAPAN' 形式 */
  nationality: string
  countryOfBirth: string
  /** 出生した都市。自由入力(例: TOKYO) */
  cityOfBirth: string
  placeOfResidence: string
  /** 国籍に応じて選択肢が変わる。visaTypeOptionsFor() を参照 */
  visaType: string
  /** 免簽證など番号を持たない区分では空のまま書き出す */
  visaNumber: string
  /** '+81 JPN' 形式 */
  regionCode: string
  mobileNumber: string
  /** OCCUPATION_OPTIONS のリスト値 */
  occupation: string
  jobTitle: string
  email: string
}

/**
 * 過去に書き出した旅程。次の旅行の下書きとして呼び戻すためだけに持つ。
 *
 * 旅行者(パスポート情報)は履歴に入れない。あちらは書き換えずに使い回す前提の
 * データで、そもそも現在の travelers にずっと残っている。履歴に複製を作ると
 * パスポート番号のコピーが端末の中で増えていくだけで、得るものが無い。
 */
export interface PastTrip {
  id: string
  /** 保存した時刻。ISO 8601。一覧の並びと表示に使う */
  savedAt: string
  trip: TripInfo
}

/** 履歴に残す上限。これを超えたら古いものから捨てる */
export const MAX_PAST_TRIPS = 10

/** 保存・書き出しの単位。localStorage にもこの形で入る */
export interface ArrivalCardState {
  trip: TripInfo
  travelers: Array<Traveler>
  /** 新しいものが先頭。最大 MAX_PAST_TRIPS 件 */
  pastTrips: Array<PastTrip>
}
