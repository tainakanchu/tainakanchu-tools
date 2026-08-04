/**
 * 日程タイムライン。旅のしおりの中心画面。
 *
 * groupByDay で日付ごとに束ねた予約を縦積みで表示しつつ、
 * 未確保の夜は computeGapAlerts で洗い出して各日のセクションに差し込む。
 * 連続する未確保でも滞在地が同じ区間の初日は目立つカード、
 * 2 日目以降は控えめな 1 行にして、同じ警告を毎日フルサイズで並べない。
 *
 * 連泊中の宿・日をまたぐ移動も同じ考え方で扱う。開始日には BookingCard が
 * 出るので、2 日目以降は day.ongoing から OngoingRow という控えめな 1 行だけ
 * 出す。「この宿は今日も継続している」と分かればよく、詳細まで毎日繰り返す
 * 必要はない。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, Plus } from 'lucide-react'
import {
  diffDays,
  formatDateJa,
  formatStamp,
  stampDate,
} from '../../../../lib/trip-notes/datetime'
import { groupByDay } from '../../../../lib/trip-notes/derive'
import { isTransportKind } from '../../../../lib/trip-notes/nights'
import { computeGapAlerts } from '../../../../lib/trip-notes/uncovered-gaps'
import {
  cardClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import { BookingCard } from './BookingCard'
import { BookingForm } from './BookingForm'
import { ConfirmDialog } from './ConfirmDialog'
import { GapAlertCard } from './GapAlertCard'
import { KindIcon } from './KindIcon'
import type {
  Booking,
  BookingKind,
  TripNotesState,
} from '../../../../lib/trip-notes/types'
import type { TripNotesDispatch } from '../-lib/reducer'

interface SchedulePanelProps {
  state: TripNotesState
  displayTz: string
  dispatch: TripNotesDispatch
  /** 進捗タブから飛んできた日付。その日へスクロールしてハイライトする。null なら何もしない */
  focusDate: string | null
  /** ハイライト演出を開始したら呼ぶ(親が focusDate を null に戻す) */
  onFocusHandled: () => void
  /**
   * マウントと同時に予約追加フォームを開く。
   * オンボーディングの「予約を1件登録する」からの遷移で、
   * 「予約を追加」をもう一度押させないための入口。
   */
  openAddOnMount?: boolean
}

/** モーダルの開閉状態。編集対象は id だけを持ち、毎レンダー最新の Booking を引き直す */
type ModalState =
  | { mode: 'closed' }
  | { mode: 'add'; date: string | null; kind?: BookingKind }
  | { mode: 'edit'; bookingId: string }

const HIGHLIGHT_DURATION_MS = 2600

/**
 * その日の状態ラベル。終了日なら「チェックアウト/到着」、
 * それ以外は種別ごとに「滞在中(N泊目)/移動中/継続中」を返す。
 * N泊目のNは、チェックイン当日を 1 泊目として数える(利用者が宿の予約サイトで
 * 見慣れている数え方に合わせる)。
 *
 * 日付はその予約自身の現地日付で見る。date は groupByDay が現地日付で作った
 * 見出しなので、ここだけ表示タイムゾーンに変換すると、日をまたぐ移動の
 * 「到着」が 1 日ずれた見出しの下に出たり、泊数が 1 泊ずれたりする。
 */
function ongoingStatusLabel(
  booking: Booking,
  date: string,
  displayTz: string,
): string {
  const endDate = booking.end !== null ? stampDate(booking.end) : null
  const isLodging = booking.kind === 'lodging'

  if (endDate === date) {
    const time =
      booking.end !== null && !booking.end.allDay
        ? ` ${formatStamp(booking.end, displayTz)}`
        : ''
    return `${isLodging ? 'チェックアウト' : '到着'}${time}`
  }

  if (isLodging) {
    const nights = diffDays(stampDate(booking.start), date) + 1
    return `滞在中(${nights}泊目)`
  }
  if (isTransportKind(booking.kind)) return '移動中'
  return '継続中'
}

/**
 * 連泊中の宿・日をまたぐ移動を「その日どこにいるか」だけ示す簡易行。
 * BookingCard は開始日側にすでにあるので、ここでは詳細を繰り返さず、
 * 見た目もはっきり控えめにしてその日の本来の予定と混同されないようにする。
 */
function OngoingRow({
  booking,
  date,
  displayTz,
  onEdit,
}: {
  booking: Booking
  date: string
  displayTz: string
  onEdit: () => void
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      // 連泊中は同じ予約が複数日にまたがって ongoing 行を出すため、
      // BookingCard 側と同じ「<タイトル> を編集」だけだとラベルが日をまたいで重複し、
      // スクリーンリーダー利用者やテストがどの行を指しているか判別できなくなる。
      // 開始日を付けて日付ごとに一意にする(既存の「この日に追加」ボタンの
      // 「${formatDateJa(day.date)}に予約を追加」と同じ、日付を頭に付ける流儀)
      aria-label={`${formatDateJa(date)}の${booking.title}を編集`}
      className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-3 py-2 text-left text-xs text-gray-500 transition hover:bg-gray-100"
    >
      <KindIcon
        kind={booking.kind}
        size={13}
        className="shrink-0 text-gray-400"
      />
      {/*
        タイトルだけを単独の要素にすると、開始日の BookingCard 側の見出しと
        文字列が完全一致してしまい、画面を見ている人にも支援技術にも
        「同じ名前の別要素が2つ以上ある」状態になって紛らわしい。
        先頭に継続を表す記号を足して「前日から続いている行」だと分かるようにする
      */}
      <span className="min-w-0 flex-1 truncate">↳ {booking.title}</span>
      <span className="shrink-0 text-gray-400">
        {ongoingStatusLabel(booking, date, displayTz)}
      </span>
    </button>
  )
}

export function SchedulePanel({
  state,
  displayTz,
  dispatch,
  focusDate,
  onFocusHandled,
  openAddOnMount = false,
}: SchedulePanelProps) {
  // 日程タブは表示中しかマウントされないので、開くかどうかは初期値で決めれば足りる
  const [modalState, setModalState] = useState<ModalState>(() =>
    openAddOnMount ? { mode: 'add', date: null } : { mode: 'closed' },
  )
  const [highlightDate, setHighlightDate] = useState<string | null>(null)
  const [bulkVerifyOpen, setBulkVerifyOpen] = useState(false)
  const dayRefs = useRef(new Map<string, HTMLElement>())

  // 未確認が 1 件でも残っている予約の数。一括解除ボタンの表示と、
  // 「何件に効くのか」の提示に使う
  const unverifiedCount = useMemo(
    () =>
      state.bookings.filter(
        (b) => b.unverified !== undefined && b.unverified.length > 0,
      ).length,
    [state.bookings],
  )

  const dayGroups = useMemo(() => groupByDay(state.bookings, state), [state])
  const gapAlerts = useMemo(() => computeGapAlerts(state), [state])
  const gapByDate = useMemo(
    () => new Map(gapAlerts.map((alert) => [alert.date, alert])),
    [gapAlerts],
  )

  const editingBooking =
    modalState.mode === 'edit'
      ? (state.bookings.find((b) => b.id === modalState.bookingId) ?? null)
      : null

  const closeModal = () => setModalState({ mode: 'closed' })

  // focusDate が来たら該当日へスクロールしてハイライトを点ける
  useEffect(() => {
    if (focusDate === null) return
    const el = dayRefs.current.get(focusDate)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setHighlightDate(focusDate)
    onFocusHandled()
  }, [focusDate, onFocusHandled])

  // ハイライトの消灯は focusDate ではなく highlightDate に紐付ける。
  // 点灯と同じ effect に置くと、直後の onFocusHandled() で focusDate が
  // null に戻った瞬間に cleanup がタイマーを消してしまい、
  // 消灯が一度も走らずにリングが出っぱなしになる。
  useEffect(() => {
    if (highlightDate === null) return
    const timer = window.setTimeout(
      () => setHighlightDate(null),
      HIGHLIGHT_DURATION_MS,
    )
    return () => window.clearTimeout(timer)
  }, [highlightDate])

  // Esc で閉じる・フォーカスをモーダル内に閉じ込める・閉じたら元の位置に戻す、は
  // BookingForm 側の useDialogFocus が引き受ける(ここでは二重に登録しない)

  function handleDelete(booking: Booking) {
    const ok = window.confirm(
      `「${booking.title}」を削除します。よろしいですか?`,
    )
    if (!ok) return
    dispatch({ type: 'removeBooking', id: booking.id })
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={sectionTitleClass}>
          <CalendarDays size={18} className="text-cyan-600" />
          日程タイムライン
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/*
            AI 取り込み直後は全予約の全フィールドが未確認になる。1 つずつ外すのは
            現実的ではないので、一覧の入口にまとめて外す出口を置く。ただし
            「黄色い下線を根拠に旅程を見直す」機能そのものを一度で消す操作なので、
            必ず確認ダイアログを挟む
          */}
          {unverifiedCount > 0 ? (
            <button
              type="button"
              onClick={() => setBulkVerifyOpen(true)}
              className={subtleButtonClass}
              aria-label={`未確認の項目が残る${unverifiedCount}件の予約を、まとめて確認済みにする`}
            >
              <Check size={15} aria-hidden="true" />
              未確認をすべて解除({unverifiedCount}件)
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setModalState({ mode: 'add', date: null })}
            className={primaryButtonClass}
          >
            <Plus size={16} aria-hidden="true" />
            予約を追加
          </button>
        </div>
      </div>

      {state.bookings.length === 0 ? (
        <div
          className={`${cardClass} flex flex-col items-center gap-3 py-10 text-center`}
        >
          <CalendarDays
            size={32}
            className="text-gray-300"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-gray-700">
            まだ予約がありません
          </p>
          <p className="max-w-sm text-xs text-gray-500">
            宿泊・移動・アクティビティの予約を追加すると、ここに日ごとのタイムラインが並びます。
          </p>
          <button
            type="button"
            onClick={() => setModalState({ mode: 'add', date: null })}
            className={primaryButtonClass}
          >
            <Plus size={16} aria-hidden="true" />
            最初の予約を追加
          </button>
        </div>
      ) : (
        <ol className="space-y-6">
          {dayGroups.map((day) => {
            const gap = gapByDate.get(day.date)
            const highlighted = highlightDate === day.date
            return (
              <li
                key={day.date}
                ref={(el) => {
                  if (el) dayRefs.current.set(day.date, el)
                  else dayRefs.current.delete(day.date)
                }}
                className={`scroll-mt-20 rounded-2xl transition ${
                  highlighted ? 'ring-2 ring-cyan-400 ring-offset-2' : ''
                }`}
              >
                <div className="sticky top-16 z-10 flex items-center justify-between gap-2 bg-white/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/80">
                  <h3 className="text-sm font-bold text-gray-800">
                    {formatDateJa(day.date)}
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setModalState({ mode: 'add', date: day.date })
                    }
                    className={subtleButtonClass}
                    aria-label={`${formatDateJa(day.date)}に予約を追加`}
                  >
                    <Plus size={14} aria-hidden="true" />
                    この日に追加
                  </button>
                </div>

                <div className="mt-2 space-y-2">
                  {day.bookings.length === 0 && day.ongoing.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400">
                      この日の予定はまだありません
                    </p>
                  ) : (
                    <>
                      {/*
                        滞在の継続 → その日の新しい予定、の順。
                        「今日はどこにいるか」が先に分かったほうが読みやすい
                      */}
                      {day.ongoing.map((booking) => (
                        <OngoingRow
                          key={booking.id}
                          booking={booking}
                          date={day.date}
                          displayTz={displayTz}
                          onEdit={() =>
                            setModalState({
                              mode: 'edit',
                              bookingId: booking.id,
                            })
                          }
                        />
                      ))}
                      {day.bookings.map((booking) => (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          displayTz={displayTz}
                          onEdit={() =>
                            setModalState({
                              mode: 'edit',
                              bookingId: booking.id,
                            })
                          }
                          onDelete={() => handleDelete(booking)}
                          onVerifyAll={() =>
                            dispatch({ type: 'verifyAllFields', id: booking.id })
                          }
                        />
                      ))}
                    </>
                  )}

                  {gap !== undefined ? (
                    <GapAlertCard
                      rangeDates={gap.rangeDates}
                      areaLabel={gap.areaLabel}
                      variant={gap.variant}
                      onAddLodging={() =>
                        setModalState({
                          mode: 'add',
                          date: gap.date,
                          kind: 'lodging',
                        })
                      }
                    />
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {modalState.mode !== 'closed' ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal()
          }}
        >
          <BookingForm
            booking={modalState.mode === 'edit' ? editingBooking : null}
            initialDate={modalState.mode === 'add' ? modalState.date : null}
            initialKind={
              modalState.mode === 'add' ? modalState.kind : undefined
            }
            state={state}
            displayTz={displayTz}
            dispatch={dispatch}
            onClose={closeModal}
          />
        </div>
      ) : null}

      {bulkVerifyOpen ? (
        <ConfirmDialog
          title="未確認をすべて解除しますか?"
          description={`${unverifiedCount}件の予約に付いている黄色い下線が消え、AI が入力した値と自分で確認した値の区別が付かなくなります。取り消したいときは「元に戻す」で1回ぶん戻せます。`}
          confirmLabel="すべて解除する"
          confirmAriaLabel={`${unverifiedCount}件の予約の未確認をすべて解除する`}
          onConfirm={() => {
            dispatch({ type: 'verifyAllUnverified' })
            setBulkVerifyOpen(false)
          }}
          onCancel={() => setBulkVerifyOpen(false)}
        />
      ) : null}
    </section>
  )
}
