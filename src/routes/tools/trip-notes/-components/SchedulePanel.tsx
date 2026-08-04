/**
 * 日程タイムライン。旅のしおりの中心画面。
 *
 * groupByDay で日付ごとに束ねた予約を縦積みで表示しつつ、
 * computeNights を別途呼んで「寝る場所がない夜」を洗い出し、
 * 連続する未確保の夜は 1 枚の GapAlertCard にまとめて差し込む。
 * groupByDay 自身も night フィールドを持つが、日をまたいだ連続判定は
 * night 単体では分からないため、ここでは computeNights の結果を
 * 日付順に自前で走査してグルーピングする。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, Plus } from 'lucide-react'
import { addDays, formatDateJa } from '../../../../lib/trip-notes/datetime'
import { groupByDay } from '../../../../lib/trip-notes/derive'
import { computeNights } from '../../../../lib/trip-notes/nights'
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
import type {
  Booking,
  BookingKind,
  NightSlot,
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

interface GapGroup {
  dates: Array<string>
  areaLabel?: string
}

/** 未確保の夜の直前・直後にある宿泊予約から、大まかな滞在エリア名を推測する */
function guessAreaLabel(
  state: TripNotesState,
  nightsByDate: Map<string, NightSlot>,
  firstDate: string,
  lastDate: string,
): string | undefined {
  const before = nightsByDate.get(addDays(firstDate, -1))
  const after = nightsByDate.get(addDays(lastDate, 1))
  const beforeBooking =
    before?.covered === 'lodging'
      ? state.bookings.find((b) => b.id === before.bookingId)
      : undefined
  const afterBooking =
    after?.covered === 'lodging'
      ? state.bookings.find((b) => b.id === after.bookingId)
      : undefined
  return (
    beforeBooking?.place?.name ??
    beforeBooking?.title ??
    afterBooking?.place?.name ??
    afterBooking?.title
  )
}

/**
 * 未確保の夜を日付順にまとめる。8/4・8/5 のように連続して空いているなら
 * バラバラに2枚出さず1枚のカードにまとめて、警告の数に慣れさせない。
 */
function computeGapGroups(state: TripNotesState): Array<GapGroup> {
  const nights = computeNights(state)
  const nightsByDate = new Map(nights.map((n) => [n.date, n]))
  const groups: Array<GapGroup> = []
  let current: Array<string> = []

  const flush = () => {
    if (current.length === 0) return
    groups.push({
      dates: current,
      areaLabel: guessAreaLabel(
        state,
        nightsByDate,
        current[0],
        current[current.length - 1],
      ),
    })
    current = []
  }

  for (const night of nights) {
    if (night.covered === null) current.push(night.date)
    else flush()
  }
  flush()

  return groups
}

const HIGHLIGHT_DURATION_MS = 2600

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

  const dayGroups = useMemo(
    () => groupByDay(state.bookings, state, displayTz),
    [state, displayTz],
  )
  const gapGroups = useMemo(() => computeGapGroups(state), [state])
  const gapByStartDate = useMemo(
    () => new Map(gapGroups.map((gap) => [gap.dates[0], gap])),
    [gapGroups],
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
            const gap = gapByStartDate.get(day.date)
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
                  {day.bookings.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400">
                      この日の予定はまだありません
                    </p>
                  ) : (
                    day.bookings.map((booking) => (
                      <BookingCard
                        key={booking.id}
                        booking={booking}
                        displayTz={displayTz}
                        onEdit={() =>
                          setModalState({ mode: 'edit', bookingId: booking.id })
                        }
                        onDelete={() => handleDelete(booking)}
                        onVerifyAll={() =>
                          dispatch({ type: 'verifyAllFields', id: booking.id })
                        }
                      />
                    ))
                  )}

                  {gap !== undefined ? (
                    <GapAlertCard
                      dates={gap.dates}
                      areaLabel={gap.areaLabel}
                      onAddLodging={() =>
                        setModalState({
                          mode: 'add',
                          date: gap.dates[0],
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
