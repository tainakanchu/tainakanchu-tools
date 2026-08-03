/**
 * 予約の追加・編集フォーム。
 *
 * 「入力コストで挫折させないこと」を最優先にする。常時見えるのは
 * 種別・タイトルと、Booking.start を組み立てるのに最低限要る
 * 日付/時刻/タイムゾーン/終日チェックだけ(start は型上 必須なので
 * ここだけは折りたためない)。確認番号・金額・場所などの付随情報は
 * すべて <details> の「詳細」に畳んでおき、開かなくても保存できるようにする。
 *
 * 時刻の入力は必ず date + time + IANA タイムゾーンの 3 点セットで受け取り、
 * tryMakeStamp() に通す。zdt 文字列を直接書かせると容易に壊れた Stamp を
 * 作れてしまうため。
 */

import { useId, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import {
  COMMON_TIMEZONES,
  isValidISODate,
  tryMakeStamp,
  tryParseStamp,
} from '../../../../lib/trip-notes/datetime'
import { newId } from '../../../../lib/trip-notes/id'
import { isTransportKind } from '../../../../lib/trip-notes/nights'
import {
  BOOKING_KINDS,
  BOOKING_STATUSES,
  PAYMENT_STATUSES,
} from '../../../../lib/trip-notes/storage'
import { useDialogFocus } from '../-lib/focusTrap'
import {
  fieldClass,
  iconButtonClass,
  labelClass,
  primaryButtonClass,
  subtleButtonClass,
  unverifiedFieldClass,
} from '../-lib/styles'
import { BOOKING_KIND_LABELS, KindIcon } from './KindIcon'
import { BOOKING_STATUS_LABELS, PAYMENT_STATUS_LABELS } from './StatusBadge'
import type { FormEvent, ReactNode } from 'react'
import type {
  Booking,
  BookingKind,
  BookingStatus,
  FieldKey,
  Money,
  PaymentStatus,
  Place,
  Stamp,
  TripNotesState,
} from '../../../../lib/trip-notes/types'
import type { TripNotesDispatch } from '../-lib/reducer'

interface BookingFormProps {
  /** 編集なら既存の予約、新規なら null */
  booking: Booking | null
  /** 新規のときの初期日付(YYYY-MM-DD)。null なら旅行開始日 */
  initialDate: string | null
  /** 新規のときの初期種別 */
  initialKind?: BookingKind
  state: TripNotesState
  displayTz: string
  dispatch: TripNotesDispatch
  onClose: () => void
}

interface FormState {
  kind: BookingKind
  title: string
  date: string
  time: string
  tz: string
  allDay: boolean
  hasEnd: boolean
  endDate: string
  endTime: string
  endTz: string
  status: BookingStatus
  payment: PaymentStatus
  confirmationNumber: string
  provider: string
  priceAmount: string
  priceCurrency: string
  freeCancelUntil: string
  note: string
  placeName: string
  placeLocalName: string
  placeAddress: string
  fromName: string
  fromAddress: string
  toName: string
  toAddress: string
}

interface StampFields {
  date: string
  time: string
  tz: string
}

/** 既存の Stamp をフォームの date/time/tz に戻す。壊れていたら安全側の既定値 */
function stampToFields(stamp: Stamp, fallbackTz: string): StampFields {
  const zdt = tryParseStamp(stamp)
  if (zdt === null) return { date: '', time: '10:00', tz: fallbackTz }
  return {
    date: zdt.toPlainDate().toString(),
    time: `${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`,
    tz: zdt.timeZoneId,
  }
}

function buildInitialForm(
  booking: Booking | null,
  initialDate: string | null,
  initialKind: BookingKind | undefined,
  state: TripNotesState,
  displayTz: string,
): FormState {
  if (booking !== null) {
    const start = stampToFields(booking.start, displayTz)
    const end =
      booking.end !== null ? stampToFields(booking.end, start.tz) : null
    return {
      kind: booking.kind,
      title: booking.title,
      date: start.date,
      time: start.time,
      tz: start.tz,
      allDay: booking.start.allDay,
      hasEnd: booking.end !== null,
      endDate: end?.date ?? start.date,
      endTime: end?.time ?? start.time,
      endTz: end?.tz ?? start.tz,
      status: booking.status,
      payment: booking.payment,
      confirmationNumber: booking.confirmationNumber ?? '',
      provider: booking.provider ?? '',
      priceAmount:
        booking.price !== undefined ? String(booking.price.amount) : '',
      priceCurrency: booking.price?.currency ?? '',
      freeCancelUntil: booking.freeCancelUntil ?? '',
      note: booking.note ?? '',
      placeName: booking.place?.name ?? '',
      placeLocalName: booking.place?.localName ?? '',
      placeAddress: booking.place?.address ?? '',
      fromName: booking.from?.name ?? '',
      fromAddress: booking.from?.address ?? '',
      toName: booking.to?.name ?? '',
      toAddress: booking.to?.address ?? '',
    }
  }

  const date = initialDate ?? state.startDate
  return {
    kind: initialKind ?? 'lodging',
    title: '',
    date,
    time: '10:00',
    tz: displayTz,
    allDay: false,
    hasEnd: false,
    endDate: date,
    endTime: '10:00',
    endTz: displayTz,
    status: BOOKING_STATUSES[0],
    payment: PAYMENT_STATUSES[0],
    confirmationNumber: '',
    provider: '',
    priceAmount: '',
    priceCurrency: '',
    freeCancelUntil: '',
    note: '',
    placeName: '',
    placeLocalName: '',
    placeAddress: '',
    fromName: '',
    fromAddress: '',
    toName: '',
    toAddress: '',
  }
}

/**
 * タイムゾーン select の選択肢。COMMON_TIMEZONES(44 ゾーン) に無い値が
 * 既存データに入っていても選択肢として残し、編集時に値を失わせない。
 */
function tzOptionsFor(current: string) {
  if (COMMON_TIMEZONES.some((opt) => opt.tz === current))
    return COMMON_TIMEZONES
  return [{ tz: current, label: `${current}(現在の設定)` }, ...COMMON_TIMEZONES]
}

function endLabelFor(kind: BookingKind): string {
  if (kind === 'lodging') return 'チェックアウト日時'
  if (isTransportKind(kind)) return '到着日時'
  return '終了日時'
}

/** 空文字を undefined に丸め込みつつ Place を組み立てる。name が空なら Place ごと無し */
function buildPlace(
  name: string,
  localName: string,
  address: string,
): Place | undefined {
  const trimmedName = name.trim()
  if (trimmedName === '') return undefined
  const place: Place = { name: trimmedName }
  const trimmedLocal = localName.trim()
  if (trimmedLocal !== '') place.localName = trimmedLocal
  const trimmedAddress = address.trim()
  if (trimmedAddress !== '') place.address = trimmedAddress
  return place
}

export function BookingForm({
  booking,
  initialDate,
  initialKind,
  state,
  displayTz,
  dispatch,
  onClose,
}: BookingFormProps) {
  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm(booking, initialDate, initialKind, state, displayTz),
  )
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const panelRef = useDialogFocus<HTMLDivElement>({ onClose })

  // unverified は毎レンダー booking(親から渡される最新の予約)から読む。
  // フォームの入力値はローカル state で保持しているので、「確認済みにする」を
  // 押しても入力途中の他フィールドが巻き戻らない
  const unverified = booking?.unverified ?? []
  const ufc = (field: FieldKey) =>
    unverified.includes(field) ? unverifiedFieldClass : ''

  function set<TKey extends keyof FormState>(
    key: TKey,
    value: FormState[TKey],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  /** AI 入力の注記 + 確認ボタン。unverified に無いフィールドでは何も出さない */
  function unverifiedNote(field: FieldKey): ReactNode {
    if (booking === null || !unverified.includes(field)) return null
    const bookingId = booking.id
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-amber-700">
        <span>AI が入力した値です。内容を確認してください。</span>
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'verifyField', id: bookingId, field })
          }
          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium text-amber-800 transition hover:bg-amber-100"
        >
          確認済みにする
        </button>
      </p>
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedTitle = form.title.trim()
    if (trimmedTitle === '') {
      setError('タイトルを入力してください')
      return
    }
    if (!isValidISODate(form.date)) {
      setError('日付を正しく入力してください')
      return
    }

    const start = tryMakeStamp(
      form.date,
      form.allDay ? null : form.time,
      form.tz,
    )
    if (start === null) {
      setError(
        '開始日時を変換できませんでした。日付・時刻・タイムゾーンを確認してください',
      )
      return
    }

    let end: Stamp | null = null
    if (form.hasEnd) {
      if (!isValidISODate(form.endDate)) {
        setError('終了日を正しく入力してください')
        return
      }
      end = tryMakeStamp(
        form.endDate,
        form.allDay ? null : form.endTime,
        form.endTz,
      )
      if (end === null) {
        setError(
          '終了日時を変換できませんでした。日付・時刻・タイムゾーンを確認してください',
        )
        return
      }
    }

    const next: Booking = {
      id: booking?.id ?? newId('bk'),
      kind: form.kind,
      title: trimmedTitle,
      start,
      end,
      status: form.status,
      payment: form.payment,
    }

    if (isTransportKind(form.kind)) {
      const from = buildPlace(form.fromName, '', form.fromAddress)
      const to = buildPlace(form.toName, '', form.toAddress)
      if (from !== undefined) next.from = from
      if (to !== undefined) next.to = to
    } else {
      const place = buildPlace(
        form.placeName,
        form.placeLocalName,
        form.placeAddress,
      )
      if (place !== undefined) next.place = place
    }

    if (form.confirmationNumber.trim() !== '') {
      next.confirmationNumber = form.confirmationNumber.trim()
    }
    if (form.provider.trim() !== '') {
      next.provider = form.provider.trim()
    }

    if (form.priceAmount.trim() !== '' && form.priceCurrency.trim() !== '') {
      const amount = Number(form.priceAmount)
      if (Number.isFinite(amount)) {
        const price: Money = { amount, currency: form.priceCurrency.trim() }
        next.price = price
      }
    }

    if (form.freeCancelUntil !== '' && isValidISODate(form.freeCancelUntil)) {
      next.freeCancelUntil = form.freeCancelUntil
    }
    if (form.note.trim() !== '') {
      next.note = form.note.trim()
    }

    // unverified/evidence は素通しする。実際に値が変わったフィールドを
    // unverified から外す判定は reducer(mergeUpdatedBooking)側の役目
    if (booking?.unverified !== undefined) next.unverified = booking.unverified
    if (booking?.evidence !== undefined) next.evidence = booking.evidence

    dispatch(
      booking === null
        ? { type: 'addBooking', booking: next }
        : { type: 'updateBooking', booking: next },
    )
    onClose()
  }

  const showPlace = !isTransportKind(form.kind)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl outline-none"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <header className="flex items-center justify-between gap-2">
          <h2
            id={titleId}
            className="flex items-center gap-2 text-lg font-bold text-gray-900"
          >
            <KindIcon kind={form.kind} size={18} className="text-cyan-600" />
            {booking === null ? '予約を追加' : '予約を編集'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={iconButtonClass}
            aria-label="フォームを閉じる"
          >
            <X size={16} />
          </button>
        </header>

        {error !== null ? (
          <p
            role="alert"
            className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {error}
          </p>
        ) : null}

        {/* 必須の3項目: 種別・タイトルは常時表示。日付は次の開始日時ブロックに含める */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className={labelClass}>種別</span>
            <select
              value={form.kind}
              onChange={(event) =>
                set('kind', event.target.value as BookingKind)
              }
              className={`${fieldClass} ${ufc('kind')}`}
            >
              {BOOKING_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {BOOKING_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            {unverifiedNote('kind')}
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>タイトル</span>
            <input
              type="text"
              required
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
              placeholder="例: ○○ホテル"
              className={`${fieldClass} ${ufc('title')}`}
            />
            {unverifiedNote('title')}
          </label>
        </div>

        {/* start は Booking 型上必須なので折りたためない。ただし time/tz には
            既定値(displayTz・10:00)を入れておき、開かなくても保存はできる */}
        <fieldset className="space-y-2 rounded-xl border border-gray-200 p-3">
          <legend className="px-1 text-sm font-semibold text-gray-700">
            開始日時
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className={labelClass}>日付</span>
              <input
                type="date"
                required
                value={form.date}
                onChange={(event) => set('date', event.target.value)}
                className={`${fieldClass} ${ufc('start')}`}
              />
            </label>
            {!form.allDay ? (
              <label className="block space-y-1">
                <span className={labelClass}>時刻</span>
                <input
                  type="time"
                  required
                  value={form.time}
                  onChange={(event) => set('time', event.target.value)}
                  className={`${fieldClass} ${ufc('start')}`}
                />
              </label>
            ) : null}
            <label className="block space-y-1">
              <span className={labelClass}>タイムゾーン</span>
              <select
                value={form.tz}
                onChange={(event) => set('tz', event.target.value)}
                className={`${fieldClass} ${ufc('start')}`}
              >
                {tzOptionsFor(form.tz).map((opt) => (
                  <option key={opt.tz} value={opt.tz}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(event) => set('allDay', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
            />
            終日の予定にする
          </label>
          {unverifiedNote('start')}
        </fieldset>

        <fieldset className="space-y-2 rounded-xl border border-gray-200 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <input
              type="checkbox"
              checked={form.hasEnd}
              onChange={(event) => set('hasEnd', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
            />
            {endLabelFor(form.kind)}を設定する
          </label>
          {form.hasEnd ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className={labelClass}>日付</span>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(event) => set('endDate', event.target.value)}
                  className={`${fieldClass} ${ufc('end')}`}
                />
              </label>
              {!form.allDay ? (
                <label className="block space-y-1">
                  <span className={labelClass}>時刻</span>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(event) => set('endTime', event.target.value)}
                    className={`${fieldClass} ${ufc('end')}`}
                  />
                </label>
              ) : null}
              <label className="block space-y-1">
                <span className={labelClass}>タイムゾーン</span>
                <select
                  value={form.endTz}
                  onChange={(event) => set('endTz', event.target.value)}
                  className={`${fieldClass} ${ufc('end')}`}
                >
                  {tzOptionsFor(form.endTz).map((opt) => (
                    <option key={opt.tz} value={opt.tz}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {unverifiedNote('end')}
        </fieldset>

        <details className="group rounded-xl border border-gray-200 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-gray-700">
            <ChevronDown
              size={14}
              className="transition group-open:rotate-180"
            />
            詳細(状況・金額・場所など)
          </summary>

          <div className="mt-3 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className={labelClass}>予約状況</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    set('status', event.target.value as BookingStatus)
                  }
                  className={`${fieldClass} ${ufc('status')}`}
                >
                  {BOOKING_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {BOOKING_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                {unverifiedNote('status')}
              </label>

              <label className="block space-y-1">
                <span className={labelClass}>支払状況</span>
                <select
                  value={form.payment}
                  onChange={(event) =>
                    set('payment', event.target.value as PaymentStatus)
                  }
                  className={`${fieldClass} ${ufc('payment')}`}
                >
                  {PAYMENT_STATUSES.map((payment) => (
                    <option key={payment} value={payment}>
                      {PAYMENT_STATUS_LABELS[payment]}
                    </option>
                  ))}
                </select>
                {unverifiedNote('payment')}
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className={labelClass}>確認番号</span>
                <input
                  type="text"
                  value={form.confirmationNumber}
                  onChange={(event) =>
                    set('confirmationNumber', event.target.value)
                  }
                  className={`${fieldClass} font-mono ${ufc('confirmationNumber')}`}
                />
                {unverifiedNote('confirmationNumber')}
              </label>

              <label className="block space-y-1">
                <span className={labelClass}>予約先/会社名</span>
                <input
                  type="text"
                  value={form.provider}
                  onChange={(event) => set('provider', event.target.value)}
                  className={`${fieldClass} ${ufc('provider')}`}
                />
                {unverifiedNote('provider')}
              </label>
            </div>

            <div className="space-y-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={labelClass}>金額</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={form.priceAmount}
                    onChange={(event) => set('priceAmount', event.target.value)}
                    className={`${fieldClass} ${ufc('price')}`}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>通貨コード</span>
                  <input
                    type="text"
                    placeholder="JPY"
                    value={form.priceCurrency}
                    onChange={(event) =>
                      set('priceCurrency', event.target.value.toUpperCase())
                    }
                    className={`${fieldClass} ${ufc('price')}`}
                  />
                </label>
              </div>
              {unverifiedNote('price')}
            </div>

            <label className="block max-w-xs space-y-1">
              <span className={labelClass}>無料キャンセル期限</span>
              <input
                type="date"
                value={form.freeCancelUntil}
                onChange={(event) => set('freeCancelUntil', event.target.value)}
                className={`${fieldClass} ${ufc('freeCancelUntil')}`}
              />
              {unverifiedNote('freeCancelUntil')}
            </label>

            <label className="block space-y-1">
              <span className={labelClass}>メモ</span>
              <textarea
                rows={3}
                value={form.note}
                onChange={(event) => set('note', event.target.value)}
                className={`${fieldClass} ${ufc('note')}`}
              />
              {unverifiedNote('note')}
            </label>

            {showPlace ? (
              <fieldset className="space-y-2 rounded-lg border border-gray-100 p-3">
                <legend className="px-1 text-xs font-semibold text-gray-500">
                  場所
                </legend>
                <label className="block space-y-1">
                  <span className={labelClass}>名称</span>
                  <input
                    type="text"
                    value={form.placeName}
                    onChange={(event) => set('placeName', event.target.value)}
                    className={`${fieldClass} ${ufc('place')}`}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>現地語表記</span>
                  <input
                    type="text"
                    value={form.placeLocalName}
                    onChange={(event) =>
                      set('placeLocalName', event.target.value)
                    }
                    className={fieldClass}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>住所</span>
                  <input
                    type="text"
                    value={form.placeAddress}
                    onChange={(event) =>
                      set('placeAddress', event.target.value)
                    }
                    className={`${fieldClass} ${ufc('place')}`}
                  />
                </label>
                {unverifiedNote('place')}
              </fieldset>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset className="space-y-2 rounded-lg border border-gray-100 p-3">
                  <legend className="px-1 text-xs font-semibold text-gray-500">
                    出発地
                  </legend>
                  <label className="block space-y-1">
                    <span className={labelClass}>名称</span>
                    <input
                      type="text"
                      value={form.fromName}
                      onChange={(event) => set('fromName', event.target.value)}
                      className={`${fieldClass} ${ufc('from')}`}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className={labelClass}>住所</span>
                    <input
                      type="text"
                      value={form.fromAddress}
                      onChange={(event) =>
                        set('fromAddress', event.target.value)
                      }
                      className={`${fieldClass} ${ufc('from')}`}
                    />
                  </label>
                  {unverifiedNote('from')}
                </fieldset>

                <fieldset className="space-y-2 rounded-lg border border-gray-100 p-3">
                  <legend className="px-1 text-xs font-semibold text-gray-500">
                    到着地
                  </legend>
                  <label className="block space-y-1">
                    <span className={labelClass}>名称</span>
                    <input
                      type="text"
                      value={form.toName}
                      onChange={(event) => set('toName', event.target.value)}
                      className={`${fieldClass} ${ufc('to')}`}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className={labelClass}>住所</span>
                    <input
                      type="text"
                      value={form.toAddress}
                      onChange={(event) => set('toAddress', event.target.value)}
                      className={`${fieldClass} ${ufc('to')}`}
                    />
                  </label>
                  {unverifiedNote('to')}
                </fieldset>
              </div>
            )}
          </div>
        </details>

        <footer className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={subtleButtonClass}>
            キャンセル
          </button>
          <button type="submit" className={primaryButtonClass}>
            保存
          </button>
        </footer>
      </form>
    </div>
  )
}
