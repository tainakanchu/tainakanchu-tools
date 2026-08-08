/**
 * 日付の検証と表記変換。
 *
 * ■ なぜ 1 か所にまとめてあるのか
 *   「形は 'YYYY-MM-DD' だが実在しない日」(例 '2026-02-30')は、この画面では
 *   どこにも現れない。`<input type="date">` は読めない値を**空欄として描画する**ので
 *   画面上は未入力に見え、未入力チェックは「文字列が空か」しか見ていないので
 *   警告も出ず、xlsx 書き出しは変換に失敗して空セルにする。
 *   結果、**入国日が空のまま、警告も出ない Excel** ができあがる。
 *   気付けるのは早くて空港のカウンターで、そこで直す手段はない。
 *
 *   これは検証の規則が層ごとに違っていたために起きる事故なので、規則は
 *   このファイルの isValidIsoDate ただ 1 つにする。AI 取り込みのパース・
 *   localStorage からの復元・書き出し前の警告・xlsx への変換は、
 *   すべてこの関数を通す。片方だけ厳しくしても、緩いほうの入口から入ってくる。
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * 'YYYY-MM-DD' として妥当で、かつ**実在する日付**か。
 *
 * 形だけの検査では足りない。Date.UTC は 2 月 31 日を 3 月 3 日に繰り上げて
 * 受け入れてしまうので、組み立て直した結果が元の文字列と一致するかまで見る
 * (この往復検査が「実在するか」の判定そのもの)。
 * 前後の空白は呼び出し側で落としてから渡すこと。ここでは受け取った文字列を
 * そのまま見る(空白を黙って許すと、空白付きの値がそのまま保存される)。
 */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value)
  if (match === null) return false
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (Number.isNaN(date.getTime())) return false
  return date.toISOString().slice(0, 10) === `${year}-${month}-${day}`
}

/**
 * 'YYYY-MM-DD' を、テンプレートが要求する 'DD/MM/YYYY' に変換する。
 *
 * 読めない値は握りつぶして空文字にする。ここで例外を投げると、日付欄が
 * 1 つ壊れているだけで書き出しが丸ごとできなくなる。空欄で出れば TWAC の
 * 画面で足りないことに気付けるが、書き出せなければ何も手元に残らない。
 * 「空欄のまま出た」ことは collectWarnings が別途知らせる。
 */
export function toDdMmYyyy(iso: string): string {
  const trimmed = iso.trim()
  if (!isValidIsoDate(trimmed)) return ''
  const [year, month, day] = trimmed.split('-')
  return `${day}/${month}/${year}`
}
