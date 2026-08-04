/**
 * 予約 1 件分のカード。タイムラインの主役。
 *
 * 移動系(飛行機・列車・バス・船・レンタカー)だけ formatDualTime で
 * 日本時間を併記する。「現地 14:20 発」だけだと、日本にいる家族と
 * 予定をすり合わせるたびに暗算が要るため。
 */

import { Check, Pencil, Trash2 } from 'lucide-react'
import {
  formatDualTime,
  formatStamp,
} from '../../../../lib/trip-notes/datetime'
import { isTransportKind } from '../../../../lib/trip-notes/nights'
import { iconButtonClass, unverifiedFieldClass } from '../-lib/styles'
import { KindIcon } from './KindIcon'
import { BookingStatusBadge, PaymentStatusBadge } from './StatusBadge'
import type { Booking, FieldKey, Stamp } from '../../../../lib/trip-notes/types'

interface BookingCardProps {
  booking: Booking
  displayTz: string
  onEdit: () => void
  onDelete: () => void
  /**
   * この予約の未確認フィールドをまとめて確認済みにする。
   * 未確認が残っているときだけカードにボタンが出る。
   */
  onVerifyAll: () => void
}

function formatTime(
  kind: Booking['kind'],
  stamp: Stamp,
  displayTz: string,
): string {
  return isTransportKind(kind)
    ? formatDualTime(stamp, displayTz)
    : formatStamp(stamp, displayTz)
}

interface PlaceSummary {
  text: string
  fields: Array<FieldKey>
}

/** カードに出す場所の要約。宿泊・アクティビティは place、移動は from → to */
function summarizePlace(booking: Booking): PlaceSummary | null {
  if (booking.place !== undefined) {
    return { text: booking.place.name, fields: ['place'] }
  }
  if (booking.from !== undefined || booking.to !== undefined) {
    const from = booking.from?.name ?? '?'
    const to = booking.to?.name ?? '?'
    return { text: `${from} → ${to}`, fields: ['from', 'to'] }
  }
  return null
}

export function BookingCard({
  booking,
  displayTz,
  onEdit,
  onDelete,
  onVerifyAll,
}: BookingCardProps) {
  const unverified = booking.unverified ?? []
  const isUnverified = (...fields: Array<FieldKey>) =>
    fields.some((field) => unverified.includes(field))
      ? unverifiedFieldClass
      : ''
  const cancelled = booking.status === 'cancelled'
  const place = summarizePlace(booking)

  const timeLabel = formatTime(booking.kind, booking.start, displayTz)
  const endLabel =
    booking.end !== null
      ? formatTime(booking.kind, booking.end, displayTz)
      : null

  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition sm:p-4 ${
        cancelled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 ${isUnverified('kind')}`}
        >
          <KindIcon kind={booking.kind} size={16} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4
              className={`truncate text-sm font-semibold text-gray-900 ${
                cancelled ? 'line-through' : ''
              } ${isUnverified('title')}`}
            >
              {booking.title}
            </h4>
            {unverified.length > 0 ? (
              <>
                <span
                  className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                  title="AI が入力したまま未確認のフィールドがあります"
                >
                  未確認 {unverified.length}件
                </span>
                {/*
                  1 フィールドずつ「確認済みにする」を押させると、AI 取り込み直後の
                  予約は 10 回近い操作になる。カードの表示だけで内容を見終えた人の
                  ために、予約単位でまとめて外す出口を並べておく
                */}
                <button
                  type="button"
                  onClick={onVerifyAll}
                  aria-label={`${booking.title} の未確認 ${unverified.length}件をすべて確認済みにする`}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                >
                  <Check size={11} aria-hidden="true" />
                  確認済みにする
                </button>
              </>
            ) : null}
          </div>

          <p
            className={`mt-0.5 text-xs text-gray-600 ${isUnverified('start', 'end')}`}
          >
            {timeLabel}
            {endLabel !== null ? `〜${endLabel}` : ''}
          </p>

          {place !== null ? (
            <p
              className={`mt-1 truncate text-xs text-gray-500 ${isUnverified(...place.fields)}`}
            >
              {place.text}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <BookingStatusBadge status={booking.status} size="sm" />
            <PaymentStatusBadge payment={booking.payment} size="sm" />
          </div>

          {booking.confirmationNumber !== undefined ? (
            <p
              className={`mt-1.5 font-mono text-[11px] text-gray-500 ${isUnverified('confirmationNumber')}`}
            >
              確認番号: {booking.confirmationNumber}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className={iconButtonClass}
            aria-label={`${booking.title} を編集`}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={`${iconButtonClass} hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600`}
            aria-label={`${booking.title} を削除`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
