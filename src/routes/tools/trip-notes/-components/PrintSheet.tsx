/**
 * 印刷用のしおり本体。
 *
 * 画面には出さず(hidden)、印刷時だけ表示する(print:block)。
 * 「スマホが壊れても電池が切れても手元に残る」ことが唯一の目的なので、
 * 装飾は削ぎ落とし、白地に黒文字・最小限の罫線だけで構成する。
 * 通信も充電も要らない情報源であることを最優先にする。
 */

import { groupByDay } from '../../../../lib/trip-notes/derive'
import {
  formatDateJa,
  formatStamp,
  stampDate,
} from '../../../../lib/trip-notes/datetime'
import { todayISO } from '../-lib/format'
import { KindIcon, TRAVEL_DOC_KIND_LABELS } from './KindIcon'
import { TRAVEL_DOC_STATUS_LABELS } from './StatusBadge'
import type { Booking, TripNotesState } from '../../../../lib/trip-notes/types'

interface PrintSheetProps {
  state: TripNotesState
  displayTz: string
}

/** 1件の予約行。時刻・種別・タイトルを1行目、場所と確認番号を2行目に置く */
function BookingLine({
  booking,
  displayTz,
}: {
  booking: Booking
  displayTz: string
}) {
  const place = booking.place ?? booking.to ?? booking.from

  return (
    <div className="break-inside-avoid py-1">
      <div className="flex items-baseline gap-1.5">
        <span className="w-12 shrink-0 font-mono text-[10pt] font-semibold">
          {formatStamp(booking.start, displayTz)}
        </span>
        <KindIcon
          kind={booking.kind}
          size={11}
          className="shrink-0 text-black"
        />
        <span className="text-[10pt] font-semibold">{booking.title}</span>
      </div>
      {place !== undefined || booking.confirmationNumber !== undefined ? (
        <div className="ml-[3.75rem] text-[9pt] text-gray-800">
          {place !== undefined ? (
            <p>
              {place.name}
              {place.localName !== undefined ? `(${place.localName})` : ''}
            </p>
          ) : null}
          {booking.confirmationNumber !== undefined ? (
            <p>
              確認番号:{' '}
              <span className="font-mono font-semibold">
                {booking.confirmationNumber}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 連泊中の宿・日をまたぐ移動を示す最小限の 1 行。
 * 紙は画面と違ってクリックで詳細に飛べないので、BookingLine のように
 * 情報を積む意味が薄い。「この日もまだそこにいる」と分かれば十分なので、
 * 状態は「チェックアウト/到着」と「継続中」だけに絞って印字を軽くする。
 */
function OngoingLine({ booking, date }: { booking: Booking; date: string }) {
  // date は groupByDay が現地日付で作った見出しなので、終了日も現地日付で見る
  const isEndDate = booking.end !== null && stampDate(booking.end) === date
  const label = isEndDate
    ? booking.kind === 'lodging'
      ? 'チェックアウト'
      : '到着'
    : '継続中'

  return (
    <div className="flex items-baseline gap-1.5 py-0.5 text-[9pt] text-gray-500">
      <KindIcon
        kind={booking.kind}
        size={9}
        className="shrink-0 text-gray-400"
      />
      <span>{booking.title}</span>
      <span className="text-gray-400">({label})</span>
    </div>
  )
}

export function PrintSheet({ state, displayTz }: PrintSheetProps) {
  // キャンセル済みは紙に残す価値がないので、印刷時だけ取り除く
  // (画面側のタイムライン表示には影響しない、この関数内だけの絞り込み)。
  const days = groupByDay(state.bookings, state).map((day) => ({
    ...day,
    bookings: day.bookings.filter((b) => b.status !== 'cancelled'),
  }))

  // 1 件も無ければフィールドごと存在しない(types.ts 参照)
  const travelDocs = state.travelDocs ?? []

  return (
    <div className="hidden bg-white p-10 text-[10pt] leading-snug text-black print:block">
      <header className="break-inside-avoid border-b-4 border-black pb-2">
        <h1 className="text-[16pt] font-bold">
          {state.tripTitle.length > 0 ? state.tripTitle : '旅のしおり'}
        </h1>
        <p className="mt-0.5 text-[10pt] text-gray-700">
          {formatDateJa(state.startDate)} 〜 {formatDateJa(state.endDate)}
        </p>
      </header>

      {days.map((day) => (
        <section key={day.date} className="break-inside-avoid mt-3">
          <h2 className="border-b-2 border-black pb-1 text-[12pt] font-bold">
            {formatDateJa(day.date)}
          </h2>
          {day.bookings.length === 0 && day.ongoing.length === 0 ? (
            <p className="mt-1 text-[9pt] text-gray-500">予定なし</p>
          ) : (
            <>
              {day.ongoing.length > 0 ? (
                <div className="mt-1">
                  {day.ongoing.map((booking) => (
                    <OngoingLine
                      key={booking.id}
                      booking={booking}
                      date={day.date}
                    />
                  ))}
                </div>
              ) : null}
              {day.bookings.length > 0 ? (
                <div className="mt-1 divide-y divide-gray-300">
                  {day.bookings.map((booking) => (
                    <BookingLine
                      key={booking.id}
                      booking={booking}
                      displayTz={displayTz}
                    />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>
      ))}

      {/*
        旅行前の手続き(ビザ・eSIMなど)。緊急連絡先と同じく「電池が切れても
        通信できなくても読める紙」として持ち歩く情報なので、その直前に置く。
        1件も無ければセクションごと省く(紙面を無駄に伸ばさないため)。

        未取得のものも印刷に載せる: この印刷しおりは出発直前にも見返す前提の
        紙なので、取得済みだけに絞ると「印刷した時点で何が残っていたか」が
        紙の上からは分からなくなる。むしろ未取得のものが載っているほうが、
        紙を見返したときに「これはまだだった」と気付ける。
        参照番号と有効期間は必ず載せる(紙で持ち歩く目的そのものがそこにあるため)。
      */}
      {travelDocs.length > 0 ? (
        <section className="break-inside-avoid mt-4 border-t-4 border-black pt-2">
          <h2 className="text-[12pt] font-bold">旅行前の手続き</h2>
          <ul className="mt-1 space-y-1">
            {travelDocs.map((doc) => (
              <li key={doc.id} className="break-inside-avoid text-[9pt]">
                <span className="font-semibold">
                  [{TRAVEL_DOC_KIND_LABELS[doc.kind]}] {doc.title}
                  {doc.region !== undefined ? `(${doc.region})` : ''}
                </span>
                {' - '}
                {TRAVEL_DOC_STATUS_LABELS[doc.status]}
                {doc.referenceNumber !== undefined ? (
                  <>
                    {' / 参照番号: '}
                    <span className="font-mono font-semibold">
                      {doc.referenceNumber}
                    </span>
                  </>
                ) : null}
                {doc.validFrom !== undefined || doc.validUntil !== undefined ? (
                  <>
                    {' / 有効期間: '}
                    {doc.validFrom ?? '未定'} 〜 {doc.validUntil ?? '未定'}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="break-inside-avoid mt-4 border-t-4 border-black pt-2">
        <h2 className="text-[12pt] font-bold">緊急連絡先</h2>
        {state.emergencyContacts.length === 0 ? (
          <p className="mt-1 text-[9pt] text-gray-600">
            緊急連絡先が未登録です。
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {state.emergencyContacts.map((contact) => (
              <li key={contact.id} className="break-inside-avoid text-[9pt]">
                <span className="font-semibold">{contact.label}</span>
                {': '}
                <span className="font-mono font-semibold">{contact.value}</span>
                {contact.note !== undefined && contact.note.length > 0
                  ? ` (${contact.note})`
                  : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-4 text-[8pt] text-gray-500">
        印刷日: {formatDateJa(todayISO())}
      </footer>
    </div>
  )
}
