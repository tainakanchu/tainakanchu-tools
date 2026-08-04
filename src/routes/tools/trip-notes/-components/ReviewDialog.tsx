/**
 * AI取り込みの最終確認ダイアログ。
 *
 * 「日時とタイムゾーンだけ」に確認範囲を絞っているのは、ここを間違えると
 * 利用者が実際に列車や飛行機に乗り遅れるという実害に直結するから。
 * タイトルや料金を打ち間違えても旅先で困ることは少ないが、
 * 出発時刻やタイムゾーンの誤りは即座に行程を崩す。だからこの1点だけを
 * 「取り込む前に必ず人間の目を通す」必須の関門にし、それ以外のフィールドは
 * 取り込んだあとに黄色い下線(unverified)で気付けるようにして後回しにする。
 *
 * ただし「必ず目を通す」は「1件ずつ入力欄を開かせる」とは違う。
 * 予約ごとにフォームを展開して確認していく作りだと、10件取り込んだだけで
 * 数十回のクリックになり、利用者は中身を読まずに閉じる癖が付く。
 * そこで全件の日時とタイムゾーンを常時表示の一覧にして目視で見渡せるようにし、
 * 確定は「すべて確認して取り込む」の1回で済ませる。入力欄は直したい予約だけ
 * 開けばよい。読ませる情報量は落とさず、操作回数だけを落とすのが狙い。
 *
 * 併せて「一括承認するにしても、ここだけは見て」を目立たせる。
 * タイムゾーンを補完した予約・抽出根拠が無い予約・旅行期間から外れた予約は
 * 一覧の先頭に寄せ、理由のラベルを付ける。
 */

import { useId, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import {
  COMMON_TIMEZONES,
  isValidISODate,
  parseStamp,
  tryMakeStamp,
} from '../../../../lib/trip-notes/datetime'
import { useDialogFocus } from '../-lib/focusTrap'
import {
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
  /** 旅行期間。開始日がここから外れている予約を要確認として先頭へ寄せる */
  tripStartDate: string
  tripEndDate: string
  /** AI がタイムゾーンを返さず補完した予約の id(aiImport の tzFallbackIds) */
  tzFallbackIds: Array<string>
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
  /** 入力欄を開いているか。既定は閉じていて、サマリ行だけが見えている */
  expanded: boolean
  start: DateTimeFieldState
  /** 元の予約に終了日時が無ければ null のまま(このダイアログでは新設しない) */
  end: DateTimeFieldState | null
}

/**
 * 一括承認する前に特に見てほしい理由。
 * どれも「AI の読み取りが怪しい」ではなく「人間にしか判断できない」ものに絞る。
 */
type AttentionReason = 'tz-fallback' | 'no-evidence' | 'out-of-trip'

const ATTENTION_LABELS: Record<AttentionReason, string> = {
  'tz-fallback': 'タイムゾーンを補完',
  'no-evidence': '抽出根拠なし',
  'out-of-trip': '旅行期間外',
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
    expanded: false,
    start: stampToField(booking.start, displayTz),
    end: booking.end === null ? null : stampToField(booking.end, displayTz),
  }
}

/** フォームの入力値から Stamp を作り直す。不正なら null(呼び出し側が確定を止める) */
function fieldToStamp(field: DateTimeFieldState): Stamp | null {
  return tryMakeStamp(field.date, field.allDay ? null : field.time, field.tz)
}

/** サマリ行に出す1行。実際に確定される値をそのまま見せる */
function describeField(field: DateTimeFieldState): string {
  const date = field.date === '' ? '日付なし' : field.date
  const time = field.allDay ? '終日' : field.time
  return `${date} ${time} / ${field.tz}`
}

/**
 * 日付が旅行期間から外れているか。
 * 期間そのものが未設定・不正なときは判定しない(全件に警告が付いて意味を失う)。
 */
function isOutOfTrip(
  date: string,
  startDate: string,
  endDate: string,
): boolean {
  if (!isValidISODate(date)) return false
  if (!isValidISODate(startDate) || !isValidISODate(endDate)) return false
  return date < startDate || date > endDate
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
  tripStartDate,
  tripEndDate,
  tzFallbackIds,
  onConfirm,
  onCancel,
}: ReviewDialogProps) {
  const [edits, setEdits] = useState<Array<BookingEditState>>(() =>
    bookings.map((booking) => makeInitialEdit(booking, displayTz)),
  )
  const titleId = useId()
  const detailIdPrefix = useId()

  const tzFallbackSet = new Set(tzFallbackIds)

  /** 要確認の理由。日付は編集中の値で見るので、直せばその場でラベルが消える */
  function attentionOf(
    booking: Booking,
    startDate: string,
  ): Array<AttentionReason> {
    const reasons: Array<AttentionReason> = []
    if (tzFallbackSet.has(booking.id)) reasons.push('tz-fallback')
    if (booking.evidence?.start === undefined) reasons.push('no-evidence')
    if (isOutOfTrip(startDate, tripStartDate, tripEndDate)) {
      reasons.push('out-of-trip')
    }
    return reasons
  }

  // 表示順は開いた時点で固定する。入力に応じて並べ替えると、日付を直した瞬間に
  // 行が画面外へ動いて「いま何を直していたか」を見失う
  const [order] = useState<Array<number>>(() =>
    bookings
      .map((_, index) => index)
      .toSorted((a, b) => {
        const score = (i: number): number => {
          const field = stampToField(bookings[i].start, displayTz)
          return attentionOf(bookings[i], field.date).length > 0 ? 1 : 0
        }
        return score(b) - score(a)
      }),
  )

  // Esc・初期フォーカス・フォーカスの循環・閉じたあとの復帰をまとめて任せる。
  // Esc は、旅先で片手操作しているときに日時を編集しかけた状態のまま
  // 誤操作で確定させないための最後の逃げ道でもある。
  const panelRef = useDialogFocus<HTMLDivElement>({ onClose: onCancel })

  function patchEdit(
    index: number,
    patch: (edit: BookingEditState) => BookingEditState,
  ): void {
    setEdits((prev) =>
      prev.map((edit, i) => (i === index ? patch(edit) : edit)),
    )
  }

  function updateStart(
    index: number,
    patch: Partial<DateTimeFieldState>,
  ): void {
    patchEdit(index, (edit) => ({
      ...edit,
      start: { ...edit.start, ...patch },
    }))
  }

  function updateEnd(index: number, patch: Partial<DateTimeFieldState>): void {
    patchEdit(index, (edit) =>
      edit.end === null ? edit : { ...edit, end: { ...edit.end, ...patch } },
    )
  }

  function toggleExcluded(index: number): void {
    patchEdit(index, (edit) => ({ ...edit, excluded: !edit.excluded }))
  }

  function toggleExpanded(index: number): void {
    patchEdit(index, (edit) => ({ ...edit, expanded: !edit.expanded }))
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

  const includedCount = edits.filter((edit) => !edit.excluded).length
  const attentionCount = bookings.filter(
    (booking, index) =>
      attentionOf(booking, edits[index].start.date).length > 0,
  ).length

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
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-gray-200 p-4 sm:p-5">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-gray-800">
              日時とタイムゾーンの確認
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              下の一覧が、そのまま取り込まれる日時とタイムゾーンです。目を通して問題なければ
              まとめて取り込めます。直したい予約だけ「日時を直す」を開いてください。
              それ以外の項目は取り込んだあと、黄色い下線が付いた状態で確認できます。
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
          {attentionCount > 0 && (
            <p
              role="status"
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              {bookings.length}件のうち{attentionCount}
              件は特に確認してください。一覧の先頭にまとめ、理由のラベルを付けています。
            </p>
          )}

          <ul className="space-y-2">
            {order.map((index) => {
              const booking = bookings[index]
              const edit = edits[index]
              const startInvalid =
                !edit.excluded && fieldToStamp(edit.start) === null
              const endInvalid =
                !edit.excluded &&
                edit.end !== null &&
                fieldToStamp(edit.end) === null
              // 値が壊れている予約は畳ませない。畳んだまま確定ボタンだけが
              // 無効になっていると、何を直せばいいのか分からなくなる
              const open = edit.expanded || startInvalid || endInvalid
              const reasons = attentionOf(booking, edit.start.date)
              const tzListId = `review-tz-${booking.id}`
              const detailId = `${detailIdPrefix}-${booking.id}`

              return (
                <li
                  key={booking.id}
                  className={`rounded-2xl border bg-white p-3 shadow-sm sm:p-4 ${
                    reasons.length > 0
                      ? 'border-amber-300 bg-amber-50/40'
                      : 'border-gray-200'
                  } ${edit.excluded ? 'opacity-50' : ''}`}
                >
                  <datalist id={tzListId}>
                    {COMMON_TIMEZONES.map((option) => (
                      <option key={option.tz} value={option.tz}>
                        {option.label}
                      </option>
                    ))}
                  </datalist>

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <KindIcon kind={booking.kind} />
                        <span className="truncate font-semibold text-gray-800">
                          {booking.title}
                        </span>
                        {reasons.map((reason) => (
                          <span
                            key={reason}
                            className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                          >
                            {ATTENTION_LABELS[reason]}
                          </span>
                        ))}
                      </div>

                      <dl className="mt-1.5 space-y-0.5 text-xs">
                        <div className="flex gap-2">
                          <dt className="w-8 shrink-0 text-gray-500">開始</dt>
                          <dd className="font-mono text-gray-800">
                            {describeField(edit.start)}
                          </dd>
                        </div>
                        {edit.end !== null && (
                          <div className="flex gap-2">
                            <dt className="w-8 shrink-0 text-gray-500">終了</dt>
                            <dd className="font-mono text-gray-800">
                              {describeField(edit.end)}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(index)}
                        aria-expanded={open}
                        aria-controls={detailId}
                        aria-label={`${booking.title} の日時を直す`}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
                      >
                        {open ? (
                          <ChevronUp size={13} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={13} aria-hidden="true" />
                        )}
                        日時を直す
                      </button>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={edit.excluded}
                          onChange={() => toggleExcluded(index)}
                        />
                        取り込まない
                      </label>
                    </div>
                  </div>

                  {/*
                    閉じているときは中身ごと描画しない。hidden 属性で隠すだけだと
                    focusTrap が中の入力欄をフォーカス可能とみなし、Tab で
                    見えない欄に飛んでしまう。器の div は aria-controls の
                    参照先として残す
                  */}
                  <div id={detailId}>
                    {open && (
                      <>
                        <fieldset
                          className="mt-3 space-y-1.5"
                          disabled={edit.excluded}
                        >
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
                                  updateStart(index, {
                                    allDay: e.target.checked,
                                  })
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
                                    updateEnd(index, {
                                      allDay: e.target.checked,
                                    })
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
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 p-4 sm:p-5">
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
            aria-label={`${includedCount}件すべての日時とタイムゾーンを確認済みとして取り込む`}
          >
            すべて確認して取り込む({includedCount}件)
          </button>
        </div>
      </div>
    </div>
  )
}
