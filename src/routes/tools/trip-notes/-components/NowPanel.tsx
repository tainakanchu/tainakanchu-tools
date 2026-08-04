/**
 * 「今」タブ。旅行中にスマホで開く画面。
 *
 * カウンターや改札で慌てて開く場面を想定し、一画面一情報に振り切る。
 * - 進行中の予約(current)と、次に来る予約(next)だけを大きく表示する。
 * - 残りの upcoming は「このあとの予定」として下に小さく流す。
 * - 確認番号は画面幅いっぱいで見せ、タップでコピーできるようにする。
 *   カウンターで「これです」とスマホごと渡す運用を想定しているため。
 * - 表示タイムゾーンの手動固定トグルを最上部に置く。機内モードで
 *   デバイスの時計が出発地のまま止まっている事故を防ぐための安全弁なので、
 *   予約が0件のときやエラー状態でも必ず見える位置に置く。
 */

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRightCircle,
  CalendarPlus,
  CalendarX2,
  CircleDot,
  Clock,
  Copy,
  ListChecks,
  MapPin,
} from 'lucide-react'
import { findCurrentAndNext } from '../../../../lib/trip-notes/derive'
import {
  COMMON_TIMEZONES,
  formatDualTime,
  formatStamp,
  stampToEpoch,
  tryParseStamp,
} from '../../../../lib/trip-notes/datetime'
import { copyText, formatCountdown, mapsUrl } from '../-lib/format'
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import { BOOKING_KIND_LABELS, KindIcon } from './KindIcon'
import { BookingStatusBadge, PaymentStatusBadge } from './StatusBadge'
import type { TripNotesDispatch } from '../-lib/reducer'
import type {
  Booking,
  Place,
  Stamp,
  TripNotesState,
} from '../../../../lib/trip-notes/types'

interface NowPanelProps {
  state: TripNotesState
  /** 現在の表示タイムゾーン(state.pinnedTz ?? getDeviceTz() を親が解決済み) */
  displayTz: string
  dispatch: TripNotesDispatch
  /** 「日程を見る」から日程タブへ移動する */
  onGoToSchedule: () => void
}

/** 現在時刻の更新間隔。カウントダウンは分単位表示なので秒単位で更新する意味がない */
const NOW_TICK_MS = 60_000

// --- Stamp のフォーマットを落ちないようにするラッパー ---
// findCurrentAndNext は start が壊れている予約をそもそも除外するが、
// 保存データの破損や end 側の壊れは起こりうるので、表示側でも二重に防ぐ。

function safeFormatDualTime(stamp: Stamp, displayTz: string): string {
  return tryParseStamp(stamp) === null
    ? '時刻不明'
    : formatDualTime(stamp, displayTz)
}

function safeFormatStamp(
  stamp: Stamp,
  displayTz: string,
  opts: Parameters<typeof formatStamp>[2],
): string {
  return tryParseStamp(stamp) === null
    ? '時刻不明'
    : formatStamp(stamp, displayTz, opts)
}

function safeCountdown(stamp: Stamp, nowMs: number): string | null {
  return tryParseStamp(stamp) === null
    ? null
    : formatCountdown(stampToEpoch(stamp) - nowMs)
}

function tzLabel(tz: string): string {
  return COMMON_TIMEZONES.find((option) => option.tz === tz)?.label ?? tz
}

/** 選択肢に現在のタイムゾーンが無ければ先頭に足す。旅行先が一覧の対象外でも選べるようにする */
function tzOptions(currentTz: string) {
  if (COMMON_TIMEZONES.some((option) => option.tz === currentTz)) {
    return COMMON_TIMEZONES
  }
  return [
    { tz: currentTz, label: `現在のタイムゾーン (${currentTz})` },
    ...COMMON_TIMEZONES,
  ]
}

export function NowPanel({
  state,
  displayTz,
  dispatch,
  onGoToSchedule,
}: NowPanelProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const { current, next, upcoming } = useMemo(
    () => findCurrentAndNext(state.bookings, nowMs),
    [state.bookings, nowMs],
  )

  const hasAnyBooking = state.bookings.length > 0
  const hasNothingToShow = current.length === 0 && upcoming.length === 0
  // next は upcoming の先頭と同じものなので、下の一覧では重複させない
  const laterUpcoming = upcoming.slice(1)

  return (
    // 旅行中にスマホで開く一画面一情報の画面なので、main を広げても
    // ここだけは横に伸ばさず中央寄せの読みやすい幅に留める
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <TzControl state={state} displayTz={displayTz} dispatch={dispatch} />

      {!hasAnyBooking ? (
        <EmptyState onGoToSchedule={onGoToSchedule} />
      ) : hasNothingToShow ? (
        <OutOfRangeState onGoToSchedule={onGoToSchedule} />
      ) : (
        <>
          {current.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className={sectionTitleClass}>
                <CircleDot
                  size={16}
                  className="text-emerald-600"
                  aria-hidden="true"
                />
                今
              </h2>
              {current.map((booking) => (
                <BookingHero
                  key={booking.id}
                  booking={booking}
                  displayTz={displayTz}
                  variant="current"
                />
              ))}
            </section>
          )}

          {next && (
            <section className="flex flex-col gap-3">
              <h2 className={sectionTitleClass}>
                <ArrowRightCircle
                  size={16}
                  className="text-cyan-600"
                  aria-hidden="true"
                />
                次の予定
              </h2>
              <BookingHero
                booking={next}
                displayTz={displayTz}
                variant="next"
                nowMs={nowMs}
              />
            </section>
          )}

          {laterUpcoming.length > 0 && (
            <UpcomingList bookings={laterUpcoming} displayTz={displayTz} />
          )}
        </>
      )}
    </div>
  )
}

// --- タイムゾーン固定トグル ---

function TzControl({
  state,
  displayTz,
  dispatch,
}: {
  state: TripNotesState
  displayTz: string
  dispatch: TripNotesDispatch
}) {
  const isPinned = state.pinnedTz !== null

  return (
    <div className={`${cardClass} border-cyan-300 bg-cyan-50/50`}>
      <div className={sectionTitleClass}>
        <Clock size={16} className="text-cyan-700" aria-hidden="true" />
        表示タイムゾーン
      </div>

      <div
        className="mt-2 flex overflow-hidden rounded-full border border-gray-300 bg-white text-sm"
        role="group"
        aria-label="タイムゾーンの決め方"
      >
        <button
          type="button"
          onClick={() => dispatch({ type: 'setPinnedTz', tz: null })}
          aria-pressed={!isPinned}
          className={`min-h-11 flex-1 px-3 py-2 font-medium transition ${
            !isPinned
              ? 'bg-cyan-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          デバイスの時計に従う
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'setPinnedTz', tz: state.pinnedTz ?? displayTz })
          }
          aria-pressed={isPinned}
          className={`min-h-11 flex-1 px-3 py-2 font-medium transition ${
            isPinned
              ? 'bg-cyan-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          タイムゾーンを固定する
        </button>
      </div>

      {/*
        機内モードでデバイスの時計が出発地のままでも気付けるように、
        「今どちらのモードで、実際のtz名が何か」を色に頼らず常に文字で出す。
      */}
      <p className="mt-2 text-xs text-gray-600">
        {isPinned ? '固定中: ' : 'デバイス依存: '}
        {tzLabel(displayTz)} ({displayTz})
      </p>

      {isPinned && (
        <div className="mt-2">
          <label
            htmlFor="now-panel-tz-select"
            className="text-xs font-medium text-gray-600"
          >
            固定するタイムゾーン
          </label>
          <select
            id="now-panel-tz-select"
            value={state.pinnedTz ?? displayTz}
            onChange={(event) =>
              dispatch({ type: 'setPinnedTz', tz: event.target.value })
            }
            className={`${fieldClass} mt-1`}
          >
            {tzOptions(state.pinnedTz ?? displayTz).map((option) => (
              <option key={option.tz} value={option.tz}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

// --- 予約カード(今/次で共通) ---

function BookingHero({
  booking,
  displayTz,
  variant,
  nowMs,
}: {
  booking: Booking
  displayTz: string
  variant: 'current' | 'next'
  /** カウントダウン表示に使う。variant === 'next' のときだけ渡す */
  nowMs?: number
}) {
  const accent =
    variant === 'current'
      ? 'border-emerald-300 bg-emerald-50/40'
      : 'border-cyan-300 bg-cyan-50/40'

  return (
    <article className={`${cardClass} ${accent}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600">
          <KindIcon kind={booking.kind} size={18} />
          {BOOKING_KIND_LABELS[booking.kind]}
        </div>
        <div className="flex items-center gap-1.5">
          <BookingStatusBadge status={booking.status} size="sm" />
          <PaymentStatusBadge payment={booking.payment} size="sm" />
        </div>
      </div>

      <h3 className="mt-2 text-xl font-bold text-gray-900">{booking.title}</h3>

      {variant === 'next' && nowMs !== undefined && (
        <p
          className="mt-1 text-2xl font-extrabold text-cyan-700"
          aria-live="polite"
        >
          {safeCountdown(booking.start, nowMs) ?? '時刻不明'}
        </p>
      )}

      <p className="mt-1 text-lg font-semibold text-gray-800">
        {safeFormatDualTime(booking.start, displayTz)}
        {booking.end !== null && (
          <>
            <span className="mx-1.5 text-gray-400" aria-hidden="true">
              →
            </span>
            {safeFormatDualTime(booking.end, displayTz)}
          </>
        )}
      </p>

      {booking.confirmationNumber && (
        <ConfirmationButton value={booking.confirmationNumber} />
      )}

      <PlacesBlock booking={booking} />

      {booking.note && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm break-words text-amber-900">
          {booking.note}
        </p>
      )}
    </article>
  )
}

/**
 * 確認番号。カウンターや改札でスマホごと見せる主役なので、画面幅いっぱいの
 * 大きさで出し、タップでクリップボードにコピーできるようにする。
 */
function ConfirmationButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  // コピー成功の表示は2秒で自動的に消す。消し忘れた古いタイマーが
  // 次のコピーの表示を巻き戻さないよう、依存が変わるたびに張り直す。
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  const handleClick = () => {
    void copyText(value).then((ok) => {
      if (ok) setCopied(true)
    })
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleClick}
        aria-label={`確認番号 ${value} をタップしてコピー`}
        className="block w-full rounded-xl border-2 border-cyan-300 bg-white px-3 py-4 text-center font-mono text-4xl font-bold tracking-wider break-all text-gray-900 shadow-sm transition hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 sm:text-5xl"
      >
        {value}
      </button>
      <p
        className="mt-1 flex items-center justify-center gap-1 text-xs font-medium text-gray-500"
        role="status"
        aria-live="polite"
      >
        <Copy size={12} aria-hidden="true" />
        {copied ? 'コピーしました' : 'タップして確認番号をコピー'}
      </p>
    </div>
  )
}

/** 移動なら from/to、宿泊・アクティビティなら place。両方あるものはすべて出す */
function PlacesBlock({ booking }: { booking: Booking }) {
  const items: Array<{ label: string; place: Place }> = []
  if (booking.from) items.push({ label: '出発', place: booking.from })
  if (booking.to) items.push({ label: '到着', place: booking.to })
  if (booking.place) items.push({ label: '場所', place: booking.place })
  if (items.length === 0) return null

  return (
    <div className="mt-3 flex flex-col gap-2">
      {items.map((item) => (
        <PlaceCard key={item.label} label={item.label} place={item.place} />
      ))}
    </div>
  )
}

/**
 * 場所1件分。タクシー運転手に見せる用途を想定し、現地語表記(localName)を
 * いちばん大きく出す。ローマ字の name は補足として小さく添える。
 */
function PlaceCard({ label, place }: { label: string; place: Place }) {
  const hasLocalName =
    place.localName !== undefined && place.localName.length > 0
  const mapHref = mapsUrl({
    lat: place.lat,
    lng: place.lng,
    address: place.address,
    name: place.name,
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      {hasLocalName ? (
        <>
          <p className="text-2xl font-bold break-words text-gray-900">
            {place.localName}
          </p>
          <p className="text-sm text-gray-600">{place.name}</p>
        </>
      ) : (
        <p className="text-xl font-bold break-words text-gray-900">
          {place.name}
        </p>
      )}
      {place.address && (
        <p className="mt-1 text-base break-words text-gray-700">
          {place.address}
        </p>
      )}
      <a
        href={mapHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-cyan-300 px-3 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
      >
        <MapPin size={16} aria-hidden="true" />
        地図で開く
      </a>
    </div>
  )
}

// --- このあとの予定(小さく流す一覧) ---

function UpcomingList({
  bookings,
  displayTz,
}: {
  bookings: Array<Booking>
  displayTz: string
}) {
  return (
    <section>
      <h2 className={sectionTitleClass}>
        <ListChecks size={16} className="text-gray-500" aria-hidden="true" />
        このあとの予定
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {bookings.map((booking) => (
          <li key={booking.id} className={`${cardClass} p-3`}>
            <div className="flex items-center gap-2">
              <KindIcon
                kind={booking.kind}
                size={16}
                className="shrink-0 text-gray-500"
              />
              <span className="text-sm font-medium text-gray-500">
                {safeFormatStamp(booking.start, displayTz, {
                  withDate: true,
                  inDisplayTz: true,
                })}
              </span>
              <span className="ml-auto shrink-0">
                <BookingStatusBadge status={booking.status} size="sm" />
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-gray-900">
              {booking.title}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

// --- 空状態 ---

function EmptyState({ onGoToSchedule }: { onGoToSchedule: () => void }) {
  return (
    <div
      className={`${cardClass} flex flex-col items-center gap-3 py-10 text-center`}
    >
      <CalendarPlus size={32} className="text-gray-300" aria-hidden="true" />
      <p className="text-base font-semibold text-gray-700">
        予約がまだありません
      </p>
      <p className="text-sm text-gray-500">
        日程タブから予約を追加すると、ここに「今」と「次」が表示されます。
      </p>
      <button
        type="button"
        onClick={onGoToSchedule}
        className={primaryButtonClass}
      >
        日程タブで追加する
      </button>
    </div>
  )
}

function OutOfRangeState({ onGoToSchedule }: { onGoToSchedule: () => void }) {
  return (
    <div
      className={`${cardClass} flex flex-col items-center gap-3 py-10 text-center`}
    >
      <CalendarX2 size={32} className="text-gray-300" aria-hidden="true" />
      <p className="text-base font-semibold text-gray-700">
        表示できる予定がありません
      </p>
      <p className="text-sm text-gray-500">
        旅行の期間外か、すべての予定が終了しています。日程タブで確認してください。
      </p>
      <button
        type="button"
        onClick={onGoToSchedule}
        className={subtleButtonClass}
      >
        日程を見る
      </button>
    </div>
  )
}
