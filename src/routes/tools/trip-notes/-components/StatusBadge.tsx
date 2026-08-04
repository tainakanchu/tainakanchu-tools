/**
 * 予約状況バッジ・支払状況チップ・手続き状況バッジ。
 *
 * この 3 つは独立した軸(「確定しているが現地払い」「確定しているがビザは未着手」が
 * 普通にある)なので、同じ画面に並んでも混ざらないように色ではなく形で系統を分ける。
 * - 予約状況: 塗りつぶしの pill (rounded-full)
 * - 支払状況: 白地の枠線 chip (rounded-md)
 * - 手続き状況: 白地 + 左だけ太い罫線の chip (rounded-lg)。「申請してから発給まで
 *   進む」という時系列の軸であることを、チェックリストの行のような見た目で示す
 *
 * さらに、色覚特性や白黒印刷でも区別が付くように、
 * 状態ごとにアイコンを変え、キャンセルには打ち消し線を入れる。
 */

import {
  BadgeCheck,
  Ban,
  Banknote,
  CheckCheck,
  CheckCircle2,
  CircleDashed,
  Clock,
  Hourglass,
  PiggyBank,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  BookingStatus,
  PaymentStatus,
  TravelDocStatus,
} from '../../../../lib/trip-notes/types'

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

interface BadgeStyle {
  className: string
  icon: LucideIcon
  /** 色に依存しない最強のシグナル。キャンセルにだけ使う */
  strike?: boolean
}

const BOOKING_STATUS_STYLES: Record<BookingStatus, BadgeStyle> = {
  idea: {
    // 破線ボーダーで「まだ決まっていない」感を形で出す
    className:
      'bg-slate-100 text-slate-700 border border-dashed border-slate-300',
    icon: CircleDashed,
  },
  held: {
    className: 'bg-amber-100 text-amber-800 border border-amber-300',
    icon: Clock,
  },
  confirmed: {
    className: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    icon: CheckCircle2,
  },
  cancelled: {
    className: 'bg-rose-50 text-rose-600 border border-rose-200',
    icon: XCircle,
    strike: true,
  },
}

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, BadgeStyle> = {
  unpaid: {
    className: 'bg-white text-rose-700 border border-rose-300',
    icon: Ban,
  },
  deposit: {
    className: 'bg-white text-amber-700 border border-amber-300',
    icon: PiggyBank,
  },
  paid: {
    // 予約確定の CheckCircle2 とアイコンを変えて、2 つ並んだときに混同させない
    className: 'bg-white text-emerald-700 border border-emerald-300',
    icon: CheckCheck,
  },
  onsite: {
    // 「現地払い」は良し悪しのある状態ではなく単なる情報なので、
    // 警告色を当てずに sky で中立に置く
    className: 'bg-white text-sky-700 border border-sky-300',
    icon: Banknote,
  },
}

export const TRAVEL_DOC_STATUS_LABELS: Record<TravelDocStatus, string> = {
  todo: '未着手',
  applied: '申請中',
  done: '取得済み',
}

const TRAVEL_DOC_STATUS_STYLES: Record<TravelDocStatus, BadgeStyle> = {
  todo: {
    className:
      'bg-white text-slate-600 border border-slate-300 border-l-4 border-l-slate-400',
    icon: CircleDashed,
  },
  applied: {
    // 「申請したまま発給待ち」の待ちを表すのに、乗り継ぎ待ちで使っている
    // Hourglass と同じアイコンを流用する(別画面なので混同はしない)
    className:
      'bg-white text-amber-700 border border-amber-300 border-l-4 border-l-amber-500',
    icon: Hourglass,
  },
  done: {
    className:
      'bg-white text-emerald-700 border border-emerald-300 border-l-4 border-l-emerald-500',
    icon: BadgeCheck,
  },
}

export function BookingStatusBadge({
  status,
  size = 'md',
}: {
  status: BookingStatus
  size?: 'sm' | 'md'
}) {
  const style = BOOKING_STATUS_STYLES[status]
  const Icon = style.icon
  const label = BOOKING_STATUS_LABELS[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${style.className} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      }`}
      aria-label={`予約状況: ${label}`}
    >
      <Icon size={size === 'sm' ? 11 : 13} aria-hidden="true" />
      <span className={style.strike === true ? 'line-through' : undefined}>
        {label}
      </span>
    </span>
  )
}

export function PaymentStatusBadge({
  payment,
  size = 'md',
}: {
  payment: PaymentStatus
  size?: 'sm' | 'md'
}) {
  const style = PAYMENT_STATUS_STYLES[payment]
  const Icon = style.icon
  const label = PAYMENT_STATUS_LABELS[payment]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-medium ${style.className} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      }`}
      aria-label={`支払状況: ${label}`}
    >
      <Icon size={size === 'sm' ? 11 : 13} aria-hidden="true" />
      {label}
    </span>
  )
}

export function TravelDocStatusBadge({
  status,
  size = 'md',
}: {
  status: TravelDocStatus
  size?: 'sm' | 'md'
}) {
  const style = TRAVEL_DOC_STATUS_STYLES[status]
  const Icon = style.icon
  const label = TRAVEL_DOC_STATUS_LABELS[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg font-medium ${style.className} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      }`}
      aria-label={`手続きの状況: ${label}`}
    >
      <Icon size={size === 'sm' ? 11 : 13} aria-hidden="true" />
      {label}
    </span>
  )
}
