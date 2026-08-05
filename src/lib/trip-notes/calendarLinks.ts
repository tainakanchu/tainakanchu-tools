/**
 * 予約 1 件を Google カレンダーに登録するための URL 生成。
 *
 * searchLinks.ts と同じで、API は叩かず、値をプリセットした URL を組み立てるだけの
 * 純関数である。押した先で何が起きるか(ログイン画面か、イベント作成画面か)は
 * 相手のサービスの都合であって、このツールからは検証しようがない。
 *
 * ■ なぜ .ics(ics.ts)と別に用意するのか
 *   スマホの Google カレンダーアプリには .ics を取り込む導線が無い。
 *   インポートはデスクトップのウェブ版の「設定 → インポート」だけで、
 *   スマホでファイルを開いても閲覧用のプレビューになるか、開けずに終わる。
 *   旅程を組むのはパソコンでも、旅先で 1 件足すのはスマホなので、
 *   「この予約だけカレンダーに入れたい」に応える道を別に用意する。
 *   逆に .ics は 10 件でも 50 件でも 1 回の操作で入る。
 *   一括はファイル、1 件ずつはリンク、と役割で分ける。
 *
 * ■ dates の書式は .ics と同じ
 *   イベント作成URLの dates は UTC の 'YYYYMMDDTHHMMSSZ' か、終日の 'YYYYMMDD' を
 *   スラッシュで繋いだ形で、これは .ics の DTSTART/DTEND とまったく同じ書式である。
 *   終日の終わりが排他(その日を含まない)なのも同じ。
 *   だから帯の計算は ics.ts の bookingCalendarEvent に一本化してある
 *   (宿のチェックアウト日の扱いが 2 経路で食い違わないようにするため)。
 */

import { bookingCalendarEvent } from './ics'
import type { Booking } from './types'

/**
 * イベント作成画面の URL。action=TEMPLATE は「この内容で新規作成の画面を開く」で、
 * 押しただけでは登録されない(利用者が保存を押すまで何も起きない)。
 */
const GOOGLE_CALENDAR_RENDER = 'https://calendar.google.com/calendar/render'

/**
 * Google カレンダーのイベント作成URL。開始が壊れた Stamp なら null。
 *
 * 時刻が読めない予約はカレンダーに置きようがないので、リンクごと出さない
 * (searchLinks.ts と同じで、意味のあるリンクにならない条件では null を返す)。
 */
export function googleCalendarUrl(booking: Booking): string | null {
  const event = bookingCalendarEvent(booking)
  if (event === null) return null

  const { window } = event
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.summary,
    /*
      終わりが無い予約は開始と同じ時刻にする。dates ごと省くと日時が空の
      下書きが開き、せっかくプリセットした開始時刻まで人が入れ直すことになる。
      終日の帯は ics.ts 側で必ず終わり(排他)まで決まっているので、
      この ?? が効くのは時刻付きで終わりが無い予約だけ。
    */
    dates: `${window.start}/${window.end ?? window.start}`,
  })

  // 値が無いパラメータは付けない(空の details=、location= を並べても意味がない)
  if (event.description !== null) params.set('details', event.description)
  if (event.location !== null) params.set('location', event.location)

  return `${GOOGLE_CALENDAR_RENDER}?${params.toString()}`
}
