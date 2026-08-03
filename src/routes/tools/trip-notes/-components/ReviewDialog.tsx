/**
 * AI取り込みの最終確認ダイアログ。
 *
 * 「日時とタイムゾーンだけ」に確認範囲を絞っているのは、ここを間違えると
 * 利用者が実際に列車や飛行機に乗り遅れるという実害に直結するから。
 * タイトルや料金を打ち間違えても旅先で困ることは少ないが、
 * 出発時刻やタイムゾーンの誤りは即座に行程を崩す。だからこの1点だけを
 * 「取り込む前に必ず人間の目を通す」必須の関門にし、それ以外のフィールドは
 * 取り込んだあとに黄色い下線(unverified)で気付けるようにして後回しにする。
 */

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  COMMON_TIMEZONES,
  parseStamp,
  tryMakeStamp,
} from '../../../../lib/trip-notes/datetime'
import {
  cardClass,
  fieldClass,
  labelClass,
  primaryButtonClass,
  subtleButtonClass,
} from '../-lib/styles'
import { KindIcon } from './KindIcon'
import type { Booking, FieldKey, Stamp } from '../../../../lib/trip-notes/types'

interface ReviewDialogProps {
  /** 取り込み候補。ここで日時とタイムゾーンだけを確定させる */
  bookings: Array<Booking>
  displayTz: string
  /** 確定した予約を返す。親が dispatch する */
  onConfirm: (bookings: Array<Booking>) => void
  onCancel: () => void
}

/** 日時編集フォーム1個分(開始 or 終了)の入力値 */
interface DateTimeFieldState {
  date: string
  time: string
  tz: string
  allDay: boolean
}

interface BookingEditState {
  /** true なら onConfirm の結果から除外する */
  excluded: boolean
  start: DateTimeFieldState
  /** 元の予約に終了日時が無ければ null のまま(このダイアログでは新設しない) */
  end: DateTimeFieldState | null
}

/**
 * Stamp をフォームの初期値に変換する。
 * 保存済みの Stamp は必ず parseBooking を通っているので通常は壊れていないが、
 * 予期しない値でダイアログごと壊れるのは避けたいので保険で try/catch する。
 */
function stampToField(stamp: Stamp, fallbackTz: string): DateTimeFieldState {
  try {
    const zdt = parseStamp(stamp)
    return {
      date: zdt.toPlainDate().toString(),
      time: `${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`,
      tz: zdt.timeZoneId,
      allDay: stamp.allDay,
    }
  } catch {
    return { date: '', time: '00:00', tz: fallbackTz, allDay: false }
  }
}

function makeInitialEdit(
  booking: Booking,
  displayTz: string,
): BookingEditState {
  return {
    excluded: false,
    start: stampToField(booking.start, displayTz),
    end: booking.end === null ? null : stampToField(booking.end, displayTz),
  }
}

/** フォームの入力値から Stamp を作り直す。不正なら null(呼び出し側が確定を止める) */
function fieldToStamp(field: DateTimeFieldState): Stamp | null {
  return tryMakeStamp(field.date, field.allDay ? null : field.time, field.tz)
}

/**
 * unverified から 'start' / 'end' を取り除く。
 * このダイアログを通った予約は、変更の有無にかかわらず日時を人間が見た
 * ことになるので、確定時には必ず外す。空配列になったらプロパティごと落とす
 * (reducer 側の withoutUnverified と同じ規則)。
 */
function stripDateTimeFromUnverified(
  unverified: Array<FieldKey> | undefined,
): Array<FieldKey> | undefined {
  if (unverified === undefined) return undefined
  const next = unverified.filter((key) => key !== 'start' && key !== 'end')
  return next.length === 0 ? undefined : next
}

export function ReviewDialog({
  bookings,
  displayTz,
  onConfirm,
  onCancel,
}: ReviewDialogProps) {
  const [edits, setEdits] = useState<Array<BookingEditState>>(() =>
    bookings.map((booking) => makeInitialEdit(booking, displayTz)),
  )
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc で閉じる。旅先で片手操作しているときに、日時を編集しかけた状態のまま
  // 誤操作で確定させないための最後の逃げ道。
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  function updateStart(
    index: number,
    patch: Partial<DateTimeFieldState>,
  ): void {
    setEdits((prev) =>
      prev.map((edit, i) =>
        i === index ? { ...edit, start: { ...edit.start, ...patch } } : edit,
      ),
    )
  }

  function updateEnd(index: number, patch: Partial<DateTimeFieldState>): void {
    setEdits((prev) =>
      prev.map((edit, i) =>
        i === index && edit.end !== null
          ? { ...edit, end: { ...edit.end, ...patch } }
          : edit,
      ),
    )
  }

  function toggleExcluded(index: number): void {
    setEdits((prev) =>
      prev.map((edit, i) =>
        i === index ? { ...edit, excluded: !edit.excluded } : edit,
      ),
    )
  }

  // 除外していない予約のうち、日時が1件でも解釈できなければ確定させない。
  // 「一部だけ反映して残りは元のまま」を許すと、どれが未反映かを
  // 利用者が旅先で見分けられなくなる。
  const allValid = edits.every((edit) => {
    if (edit.excluded) return true
    if (fieldToStamp(edit.start) === null) return false
    if (edit.end !== null && fieldToStamp(edit.end) === null) return false
    return true
  })

  function handleConfirm(): void {
    if (!allValid) return
    const result: Array<Booking> = []
    edits.forEach((edit, index) => {
      if (edit.excluded) return
      const booking = bookings[index]
      // allValid で保証済みだが、型上は null もありうるため元の値へのフォールバックを残す
      const startStamp = fieldToStamp(edit.start) ?? booking.start
      const endStamp =
        edit.end === null ? null : (fieldToStamp(edit.end) ?? booking.end)
      result.push({
        ...booking,
        start: startStamp,
        end: endStamp,
        unverified: stripDateTimeFromUnverified(booking.unverified),
      })
    })
    onConfirm(result)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="日時とタイムゾーンの確認"
        tabIndex={-1}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-gray-200 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              日時とタイムゾーンの確認
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              ここでは日時とタイムゾーンだけを確認します。それ以外の項目は取り込んだあと、
              黄色い下線が付いた状態で確認できます。
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="閉じる"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {bookings.map((booking, index) => {
            const edit = edits[index]
            const startInvalid =
              !edit.excluded && fieldToStamp(edit.start) === null
            const endInvalid =
              !edit.excluded &&
              edit.end !== null &&
              fieldToStamp(edit.end) === null
            const tzListId = `review-tz-${booking.id}`

            return (
              <div
                key={booking.id}
                className={`${cardClass} ${edit.excluded ? 'opacity-50' : ''}`}
              >
                <datalist id={tzListId}>
                  {COMMON_TIMEZONES.map((option) => (
                    <option key={option.tz} value={option.tz}>
                      {option.label}
                    </option>
                  ))}
                </datalist>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <KindIcon kind={booking.kind} />
                    <span className="truncate font-semibold text-gray-800">
                      {booking.title}
                    </span>
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={edit.excluded}
                      onChange={() => toggleExcluded(index)}
                    />
                    取り込まない
                  </label>
                </div>

                <fieldset className="mt-3 space-y-1.5" disabled={edit.excluded}>
                  <legend className={labelClass}>開始日時</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <input
                      type="date"
                      value={edit.start.date}
                      onChange={(e) =>
                        updateStart(index, { date: e.target.value })
                      }
                      className={fieldClass}
                      aria-label={`${booking.title} の開始日`}
                    />
                    <input
                      type="time"
                      value={edit.start.time}
                      disabled={edit.excluded || edit.start.allDay}
                      onChange={(e) =>
                        updateStart(index, { time: e.target.value })
                      }
                      className={fieldClass}
                      aria-label={`${booking.title} の開始時刻`}
                    />
                    <input
                      type="text"
                      list={tzListId}
                      value={edit.start.tz}
                      onChange={(e) =>
                        updateStart(index, { tz: e.target.value })
                      }
                      className={fieldClass}
                      placeholder="IANAタイムゾーン名"
                      aria-label={`${booking.title} の開始タイムゾーン`}
                    />
                    <label className="flex items-center gap-1.5 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={edit.start.allDay}
                        onChange={(e) =>
                          updateStart(index, { allDay: e.target.checked })
                        }
                      />
                      終日
                    </label>
                  </div>
                  {startInvalid && (
                    <p
                      role="alert"
                      className="text-xs font-medium text-rose-600"
                    >
                      開始日時を解釈できません。日付・時刻・タイムゾーンを見直してください
                    </p>
                  )}
                  {booking.evidence?.start !== undefined && (
                    <blockquote className="border-l-4 border-gray-300 pl-2 text-xs text-gray-600">
                      {booking.evidence.start}
                    </blockquote>
                  )}
                </fieldset>

                {edit.end !== null && (
                  <fieldset
                    className="mt-3 space-y-1.5"
                    disabled={edit.excluded}
                  >
                    <legend className={labelClass}>終了日時</legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <input
                        type="date"
                        value={edit.end.date}
                        onChange={(e) =>
                          updateEnd(index, { date: e.target.value })
                        }
                        className={fieldClass}
                        aria-label={`${booking.title} の終了日`}
                      />
                      <input
                        type="time"
                        value={edit.end.time}
                        disabled={edit.excluded || edit.end.allDay}
                        onChange={(e) =>
                          updateEnd(index, { time: e.target.value })
                        }
                        className={fieldClass}
                        aria-label={`${booking.title} の終了時刻`}
                      />
                      <input
                        type="text"
                        list={tzListId}
                        value={edit.end.tz}
                        onChange={(e) =>
                          updateEnd(index, { tz: e.target.value })
                        }
                        className={fieldClass}
                        placeholder="IANAタイムゾーン名"
                        aria-label={`${booking.title} の終了タイムゾーン`}
                      />
                      <label className="flex items-center gap-1.5 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={edit.end.allDay}
                          onChange={(e) =>
                            updateEnd(index, { allDay: e.target.checked })
                          }
                        />
                        終日
                      </label>
                    </div>
                    {endInvalid && (
                      <p
                        role="alert"
                        className="text-xs font-medium text-rose-600"
                      >
                        終了日時を解釈できません。日付・時刻・タイムゾーンを見直してください
                      </p>
                    )}
                    {booking.evidence?.end !== undefined && (
                      <blockquote className="border-l-4 border-gray-300 pl-2 text-xs text-gray-600">
                        {booking.evidence.end}
                      </blockquote>
                    )}
                  </fieldset>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 p-4 sm:p-5">
          <button
            type="button"
            className={subtleButtonClass}
            onClick={onCancel}
          >
            キャンセル
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            onClick={handleConfirm}
            disabled={!allValid}
          >
            確定して取り込む
          </button>
        </div>
      </div>
    </div>
  )
}
