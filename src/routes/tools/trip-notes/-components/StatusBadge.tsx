/**
 * 予約状況バッジ・支払状況バッジ・手続き状況バッジ。
 *
 * この 3 つは独立した軸(「確定しているが現地払い」「確定しているがビザは未着手」が
 * 普通にある)なので、同じ画面に並んでも混ざらないように、状態は必ず文字で言う。
 * 形は共通の Badge の 4 種(破線・細線・ベタ・弱い線)に寄せ、段階を線の種類で添える。
 * - 予約状況: 検討中は破線、仮押さえは細線、確定はベタ、キャンセルは弱い線＋打ち消し線
 * - 支払状況: 未払は破線、デポジット・完済は細線、現地払いは弱い線
 * - 手続き状況: 未着手は破線、申請中は細線、取得済みはベタ
 *
 * 読み上げでは軸の名前を頭に付ける(「予約状況: 確定」)。見た目の文字だけでは、
 * 「確定」と「完済」が並んだときにどちらの軸の札なのかが分からないため。
 */

import { Badge } from '../../../../components/ui'
import type {
  BookingStatus,
  PaymentStatus,
  TravelDocStatus,
} from '../../../../lib/trip-notes/types'

type BadgeTone = 'outline' | 'solid' | 'dashed' | 'muted'

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  idea: '検討中',
  held: '仮押さえ',
  confirmed: '確定',
  cancelled: 'キャンセル',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: '未払',
  deposit: 'デポジットのみ',
  paid: '完済',
  onsite: '現地払い',
}

export const TRAVEL_DOC_STATUS_LABELS: Record<TravelDocStatus, string> = {
  todo: '未着手',
  applied: '申請中',
  done: '取得済み',
}

const BOOKING_STATUS_TONES: Record<BookingStatus, BadgeTone> = {
  idea: 'dashed',
  held: 'outline',
  confirmed: 'solid',
  cancelled: 'muted',
}

const PAYMENT_STATUS_TONES: Record<PaymentStatus, BadgeTone> = {
  unpaid: 'dashed',
  deposit: 'outline',
  paid: 'outline',
  // 「現地払い」は良し悪しのある状態ではなく単なる情報なので、弱い線で中立に置く
  onsite: 'muted',
}

const TRAVEL_DOC_STATUS_TONES: Record<TravelDocStatus, BadgeTone> = {
  todo: 'dashed',
  applied: 'outline',
  done: 'solid',
}

/**
 * size は呼び出し側との互換のために受け取るだけで、見た目は変えない
 * (Badge は 1 種類の大きさに揃えてある)。
 */
interface SizeProp {
  size?: 'sm' | 'md'
}

export function BookingStatusBadge({
  status,
}: { status: BookingStatus } & SizeProp) {
  const label = BOOKING_STATUS_LABELS[status]
  return (
    <Badge
      tone={BOOKING_STATUS_TONES[status]}
      aria-label={`予約状況: ${label}`}
    >
      {/* キャンセルだけは打ち消し線も重ねる。線の差が見えなくても取り消しだと分かる */}
      <span className={status === 'cancelled' ? 'line-through' : undefined}>
        {label}
      </span>
    </Badge>
  )
}

export function PaymentStatusBadge({
  payment,
}: { payment: PaymentStatus } & SizeProp) {
  const label = PAYMENT_STATUS_LABELS[payment]
  return (
    <Badge
      tone={PAYMENT_STATUS_TONES[payment]}
      aria-label={`支払状況: ${label}`}
    >
      {label}
    </Badge>
  )
}

export function TravelDocStatusBadge({
  status,
}: { status: TravelDocStatus } & SizeProp) {
  const label = TRAVEL_DOC_STATUS_LABELS[status]
  return (
    <Badge
      tone={TRAVEL_DOC_STATUS_TONES[status]}
      aria-label={`手続きの状況: ${label}`}
    >
      {label}
    </Badge>
  )
}
