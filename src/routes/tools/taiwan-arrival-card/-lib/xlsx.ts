/**
 * 公式の一括アップロード用テンプレート(xlsx)にフォームの入力値を流し込む層。
 *
 * 設計判断:
 * - **テンプレートを 1 バイトも壊さない。** SheetJS のような汎用ライブラリで
 *   読み書きすると、書き出す側が知らない要素(シート保護・条件付き書式・
 *   非表示シートの選択肢マスタ・dataValidation・印刷設定)が黙って落ちたり
 *   書き換わったりする。TWAC の取り込みがそれを受け付けるかどうかは
 *   こちらからは確かめようがないので、そもそも触らない方針にする。
 *   やることは zip を開いて `xl/worksheets/sheet1.xml` の**文字列だけ**を
 *   加工し、他のエントリはバイト列のまま詰め直す、それだけ。
 * - 値は共有文字列(sharedStrings.xml)ではなくインライン文字列で書く。
 *   共有文字列に足すと sharedStrings.xml と count/uniqueCount の整合まで
 *   面倒を見る必要があり、「他のファイルは無変更」という上の原則が崩れる。
 * - すべての値を文字列として書く。日付は DD/MM/YYYY の**文字列**が要求されており
 *   (ヘッダーにそう書いてある)、シリアル値の日付にすると表示形式次第で
 *   別の日付として読まれる。便番号も先頭ゼロが意味を持つ場合に備えて文字列。
 * - fetch や DOM に依存しない純関数にしてある。テンプレートの取得(ブラウザなら
 *   fetch、テストなら node:fs)は呼び出し側の仕事。
 * - 置換対象のセルが見つからなければ**必ず throw する**。テンプレートが
 *   差し替わって列がずれたとき、黙って値が消えた xlsx を渡すのが最悪の結末で、
 *   それは入国審査の窓口まで気付けない。
 */

import { unzipSync, zipSync } from 'fflate'
import { toDdMmYyyy } from './dates'
import { PURPOSE_OTHERS, PURPOSE_VISIT_RELATIVE } from './options'
import { MAX_TRAVELERS } from './types'
import type { Traveler, TripInfo } from './types'

/** 加工する唯一のエントリ。工作表1(入力シート) */
const SHEET1_PATH = 'xl/worksheets/sheet1.xml'

/** データ行の先頭。1 行目はヘッダー */
const FIRST_DATA_ROW = 2

/**
 * XML 1.0 が文書の中に持つことを許していない制御文字。
 *
 * タブ・改行・復帰(\t \n \r)だけが例外で、それ以外の C0 制御文字は
 * 実体参照に置き換えても不正なままなので、**取り除くしかない**。
 * PDF の予約票からコピーした住所には垂直タブや改ページが紛れ込むことがあり、
 * AI の出力にも混ざりうる。1 文字でも残ると sheet1.xml が ill-formed になって
 * Excel も TWAC もファイルごと開けなくなる。値がわずかに削れることより、
 * ファイルが開けることを優先する。
 */
// oxlint-disable-next-line no-control-regex -- XML 1.0 が禁じている C0 制御文字そのものを対象にするための意図的な指定
const XML_ILLEGAL_CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

/**
 * XML として持てない制御文字を落とす。
 * 取り込み側(aiImport)でも同じものを使い、混入した時点で issue に残す。
 */
export function stripXmlIllegalChars(value: string): string {
  return value.replace(XML_ILLEGAL_CONTROL_RE, '')
}

/** XML のテキストノード / 属性値として安全な形にする */
export function escapeXml(value: string): string {
  return stripXmlIllegalChars(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 正規表現のメタ文字を落とす(セル参照は英数字だけなので保険) */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `<c r="B2" s="11"/>` のような空セルを、インライン文字列を持つセルに差し替える。
 *
 * スタイル属性(s)は必ず残す。テンプレートは列ごとに書式(日付の左寄せ、
 * 折り返しの有無など)を割り当てており、落とすと見た目が崩れる。
 * 自己終了タグ以外の形(すでに値が入っているセル)は想定していない。
 * データ行は必ず空セルで用意されているため、そこが崩れているなら
 * テンプレートが差し替わったということなので throw して気付かせる。
 */
function setCellValue(xml: string, ref: string, value: string): string {
  const pattern = new RegExp(`<c r="${escapeRegExp(ref)}"([^>]*?)/>`)
  const match = pattern.exec(xml)
  if (match === null) {
    throw new Error(
      `テンプレートのセル ${ref} が見つかりませんでした。public/assets/taiwan-arrival-card/template.xlsx が公式テンプレートと一致しているか確認してください`,
    )
  }
  const attrs = match[1]
  const replacement = `<c r="${ref}"${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    value,
  )}</t></is></c>`
  return (
    xml.slice(0, match.index) +
    replacement +
    xml.slice(match.index + match[0].length)
  )
}

/**
 * 1 人ぶんの行に書き込む値を、列記号をキーにして組み立てる。
 *
 * A 列(Traveler No)はテンプレートに Traveler1〜16 が入っているので触らない。
 * 空文字の欄はここに含めても書き込み側が読み飛ばす(空セルのまま残す)。
 *
 * ■ 選ばれていない側の欄は必ず落とす(排他)
 *   テンプレートの条件付き書式は、選ぶべきでない欄を塗り潰して「書くな」と
 *   示している。両方に値が入った行は向こうで弾かれる。排他にする組は 4 つ:
 *     - T 列が AIR なら W/AB(船便番号)を、SEA なら U/V・Z/AA(航空会社と便番号)を落とす
 *     - AC 列(目的)が探親でなければ AD/AE(親族の氏名・電話)を落とす
 *     - AC 列が其他でなければ AF(理由)を落とす
 *     - AG 列(滞在先の種別)が Transfer なら AH(住所・ホテル名)を落とす
 *   UI 側でも切り替え時に依存する欄を消しているが、**それだけに頼らない**。
 *   UI は入力途中の状態を持つし、localStorage から復元した古いデータや
 *   過去の旅程のコピーには、切り替え前の値が残っていることがある。
 *   「何を書き出すか」を決める最後の場所であるここで落とせば、
 *   どの経路から来た値でも取りこぼさない。
 */
export function buildRowValues(
  trip: TripInfo,
  traveler: Traveler,
): Record<string, string> {
  const entryIsAir = trip.entryMode === 'AIR'
  const exitIsAir = trip.exitMode === 'AIR'
  const visitsRelative = trip.purpose === PURPOSE_VISIT_RELATIVE
  const isOtherPurpose = trip.purpose === PURPOSE_OTHERS
  const staysSomewhere = trip.accommodation !== 'Transfer'

  return {
    B: toDdMmYyyy(trip.dateOfEntry),
    C: traveler.englishName,
    D: traveler.chineseName,
    E: traveler.passportNumber,
    F: toDdMmYyyy(traveler.passportExpiry),
    G: traveler.sex,
    H: toDdMmYyyy(traveler.dateOfBirth),
    I: traveler.nationality,
    J: traveler.countryOfBirth,
    K: traveler.cityOfBirth,
    L: traveler.placeOfResidence,
    M: traveler.visaType,
    N: traveler.visaNumber,
    O: traveler.regionCode,
    P: traveler.mobileNumber,
    Q: traveler.occupation,
    R: traveler.jobTitle,
    S: traveler.email,
    T: trip.entryMode,
    U: entryIsAir ? trip.entryFlightCode : '',
    V: entryIsAir ? trip.entryFlightNumber : '',
    W: entryIsAir ? '' : trip.entryVesselNumber,
    X: toDdMmYyyy(trip.exitDate),
    Y: trip.exitMode,
    Z: exitIsAir ? trip.exitFlightCode : '',
    AA: exitIsAir ? trip.exitFlightNumber : '',
    AB: exitIsAir ? '' : trip.exitVesselNumber,
    AC: trip.purpose,
    AD: visitsRelative ? trip.relativesName : '',
    AE: visitsRelative ? trip.relativesMobile : '',
    AF: isOtherPurpose ? trip.reason : '',
    AG: trip.accommodation,
    AH: staysSomewhere ? trip.addressOrHotel : '',
  }
}

/** sheet1.xml の文字列に、全員ぶんの行を書き込む */
export function fillSheetXml(
  sheetXml: string,
  trip: TripInfo,
  travelers: ReadonlyArray<Traveler>,
): string {
  let xml = sheetXml
  travelers.forEach((traveler, index) => {
    const row = FIRST_DATA_ROW + index
    const values = buildRowValues(trip, traveler)
    for (const [column, value] of Object.entries(values)) {
      // 空欄はテンプレートの空セルをそのまま残す。空文字のインライン文字列を
      // 書き込むと「空白 1 個が入力された」ようにも読めてしまう
      if (value === '') continue
      xml = setCellValue(xml, `${column}${row}`, value)
    }
  })
  return xml
}

/**
 * テンプレートの xlsx バイト列に入力値を流し込み、新しい xlsx を返す。
 *
 * @param templateBytes public/assets/taiwan-arrival-card/template.xlsx の中身
 * @param trip 同行者全員で共有する旅程
 * @param travelers 最大 16 名。テンプレートのデータ行がそれしかない
 */
export function fillTemplate(
  templateBytes: Uint8Array,
  trip: TripInfo,
  travelers: ReadonlyArray<Traveler>,
): Uint8Array {
  if (travelers.length > MAX_TRAVELERS) {
    throw new Error(
      `旅行者は最大 ${MAX_TRAVELERS} 名までです(${travelers.length} 名が渡されました)`,
    )
  }

  const entries = unzipSync(templateBytes)
  // 型の上では必ず取れることになっているが、実際に何が入っているかは
  // 読み込んだファイル次第なので存在を確かめる
  if (!(SHEET1_PATH in entries)) {
    throw new Error(
      `テンプレートに ${SHEET1_PATH} が含まれていません。xlsx として壊れているか、別のファイルを読み込んでいます`,
    )
  }

  const sheetXml = new TextDecoder('utf-8').decode(entries[SHEET1_PATH])
  const filled = fillSheetXml(sheetXml, trip, travelers)

  // sheet1.xml 以外は展開したバイト列をそのまま詰め直す。
  // 元のオブジェクトを書き換えず新しく組み直すのは、引数として渡された
  // テンプレートのバイト列を呼び出し側と共有していても壊さないため
  const output: Record<string, Uint8Array> = {}
  for (const [path, bytes] of Object.entries(entries)) {
    output[path] =
      path === SHEET1_PATH ? new TextEncoder().encode(filled) : bytes
  }
  return zipSync(output)
}
