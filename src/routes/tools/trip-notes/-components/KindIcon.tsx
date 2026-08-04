/**
 * 予約種別と手続き種別のアイコンと日本語ラベル。
 * タイムライン・フォーム・印刷しおりで同じ対応を使い回して、
 * 「宿のアイコンが画面によって違う」を起こさないための一元管理。
 * 旅行前の手続き(ビザ・eSIM など)のアイコンも、理由は同じなのでここに集める。
 */

import {
  Bed,
  CarFront,
  FileBadge,
  FileText,
  Plane,
  ShieldCheck,
  Ship,
  SmartphoneNfc,
  Stamp,
  Ticket,
  TrainFront,
  Bus as TransitBus,
  MapPin as UnknownPin,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  BookingKind,
  TravelDocKind,
} from '../../../../lib/trip-notes/types'

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

export const TRAVEL_DOC_KIND_LABELS: Record<TravelDocKind, string> = {
  visa: 'ビザ',
  sim: 'SIM・eSIM',
  insurance: '保険',
  permit: '入域許可',
  other: 'その他',
}

const TRAVEL_DOC_KIND_ICONS: Record<TravelDocKind, LucideIcon> = {
  visa: Stamp,
  sim: SmartphoneNfc,
  insurance: ShieldCheck,
  permit: FileBadge,
  other: FileText,
}

export function TravelDocIcon({
  kind,
  size = 16,
  className,
}: {
  kind: TravelDocKind
  size?: number
  className?: string
}) {
  const Icon = TRAVEL_DOC_KIND_ICONS[kind]
  return <Icon size={size} className={className} aria-hidden="true" />
}
