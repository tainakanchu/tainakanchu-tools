/**
 * 予約種別のアイコンと日本語ラベル。
 * タイムライン・フォーム・印刷しおりで同じ対応を使い回して、
 * 「宿のアイコンが画面によって違う」を起こさないための一元管理。
 */

import {
  Bed,
  CarFront,
  Plane,
  Ship,
  Ticket,
  TrainFront,
  Bus as TransitBus,
  MapPin as UnknownPin,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { BookingKind } from '../../../../lib/trip-notes/types'

export const BOOKING_KIND_LABELS: Record<BookingKind, string> = {
  lodging: '宿泊',
  flight: '飛行機',
  train: '列車',
  bus: 'バス',
  ferry: '船',
  car: 'レンタカー',
  activity: 'アクティビティ',
  other: 'その他',
}

const KIND_ICONS: Record<BookingKind, LucideIcon> = {
  lodging: Bed,
  flight: Plane,
  train: TrainFront,
  bus: TransitBus,
  ferry: Ship,
  car: CarFront,
  activity: Ticket,
  other: UnknownPin,
}

export function KindIcon({
  kind,
  size = 16,
  className,
}: {
  kind: BookingKind
  size?: number
  className?: string
}) {
  const Icon = KIND_ICONS[kind]
  return <Icon size={size} className={className} aria-hidden="true" />
}
