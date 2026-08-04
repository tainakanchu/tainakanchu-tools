/**
 * 予約状況 / 支払状況のカンバン。
 *
 * ドラッグ&ドロップは「速い人が速く動かすための道」であって、唯一の道にはしない。
 * カードの中に <select> を置いて同じ変更ができるようにしてあるのは、
 * 画面読み上げやキーボードだけの利用者に加えて、
 * 揺れる列車の中でスマホを片手で持っている利用者にも効くためである。
 * どちらの操作も -lib/kanban.ts の dropToAction を通って reducer に 1 アクション届くだけなので、
 * 操作手段による挙動の差が生まれようがなく、Undo 1 回で元の列に戻せる。
 *
 * 狭い画面では列を横スクロールで並べる。列を縦に積むと
 * 「どの列に何件あるか」というカンバン唯一の取り柄が消えてしまう。
 */

import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { formatDateJa, stampDate } from '../../../../lib/trip-notes/datetime'
import { formatMoney } from '../-lib/format'
import {
  KANBAN_AXIS_LABELS,
  axisOptions,
  buildKanbanColumns,
  currentDropId,
  dropToAction,
  isColumnDropId,
} from '../-lib/kanban'
import { BookingStatusBadge, PaymentStatusBadge } from './StatusBadge'
import { KindIcon } from './KindIcon'
import type {
  Announcements,
  ClientRect,
  CollisionDetection,
  DragEndEvent,
  DragStartEvent,
  KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import type { KanbanAxis, KanbanColumn } from '../-lib/kanban'
import type { TripNotesDispatch } from '../-lib/reducer'
import type { Booking } from '../../../../lib/trip-notes/types'

/**
 * マウスは 6px 動かすまでドラッグにしない(カード内の <select> のクリックを奪わないため)。
 * タッチは 200ms 長押ししてから(押してすぐ動かした指は列の横スクロールに渡す)。
 * PointerSensor は pointerdown が touchstart より先に走って TouchSensor を
 * 無効化してしまうので使わない(旅程パズルの TripDragArea と同じ判断)。
 */
const MOUSE_ACTIVATION_DISTANCE = 6
const TOUCH_ACTIVATION_DELAY_MS = 200
const TOUCH_ACTIVATION_TOLERANCE = 8

const screenReaderInstructions = {
  draggable:
    'スペースキーまたはEnterキーでカードをつかみます。左右の矢印キーで列を選び、もう一度スペースキーで確定、Escapeキーで取り消します。ドラッグせずに、カード内の選択メニューから変更することもできます。',
}

/**
 * 矢印キー 1 回で隣の列へ飛ばす座標取得。
 *
 * dnd-kit の既定の座標取得は矢印キー 1 回で 25px しか動かさないので、
 * 幅 16rem の列を 1 つ渡るのに 10 回以上叩くことになる。
 * それでは「キーボードでも操作できる」とは言えないため、列の実測位置を見て
 * 一足飛びに隣の列の中央へ移す。上下キーは列の中の並べ替えに意味がないので何もしない。
 */
const columnCoordinateGetter: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context },
) => {
  const direction =
    event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0
  if (direction === 0) return undefined

  const dragged = context.collisionRect
  if (dragged === null) return undefined

  // 列の droppable だけを左から順に並べる。カード自体は droppable ではないが、
  // 将来ほかの droppable が増えても巻き込まないよう id で絞っておく
  const columns: Array<{ id: string; rect: ClientRect }> = []
  for (const container of context.droppableContainers.getEnabled()) {
    const id = String(container.id)
    if (!isColumnDropId(id)) continue
    const rect = context.droppableRects.get(container.id)
    if (rect === undefined) continue
    columns.push({ id, rect })
  }
  if (columns.length === 0) return undefined
  const ordered = columns.toSorted((a, b) => a.rect.left - b.rect.left)

  const draggedCenterX = dragged.left + dragged.width / 2
  const overId = context.over === null ? null : String(context.over.id)
  let index = overId === null ? -1 : ordered.findIndex((c) => c.id === overId)
  if (index === -1) {
    // どの列にも重なっていないときは、カードの中心に一番近い列から数える
    let best = Number.POSITIVE_INFINITY
    index = 0
    for (let i = 0; i < ordered.length; i++) {
      const rect = ordered[i].rect
      const distance = Math.abs(rect.left + rect.width / 2 - draggedCenterX)
      if (distance < best) {
        best = distance
        index = i
      }
    }
  }

  const next =
    ordered[Math.min(ordered.length - 1, Math.max(0, index + direction))]
  event.preventDefault()
  // 返す値は現在の座標からの差分で動かす。dnd-kit の
  // sortableKeyboardCoordinates と同じく、座標系の原点を自分で決めない
  return {
    x:
      currentCoordinates.x +
      (next.rect.left + next.rect.width / 2 - draggedCenterX),
    y: currentCoordinates.y,
  }
}

interface KanbanBoardProps {
  bookings: Array<Booking>
  axis: KanbanAxis
  dispatch: TripNotesDispatch
}

export function KanbanBoard({ bookings, axis, dispatch }: KanbanBoardProps) {
  const columns = useMemo(
    () => buildKanbanColumns(bookings, axis),
    [bookings, axis],
  )
  const options = useMemo(() => axisOptions(axis), [axis])
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: MOUSE_ACTIVATION_DISTANCE },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_ACTIVATION_DELAY_MS,
        tolerance: TOUCH_ACTIVATION_TOLERANCE,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinateGetter }),
  )

  /**
   * 列は大きいので、指が乗っている列を素直に採る pointerWithin を優先する。
   * キーボード操作にはポインタが無く pointerWithin が常に空になるので、
   * そのときだけ closestCorners に落とす(closestCenter だと縦に長い列で
   * 端のカードが隣の列の中心に吸われる)。
   */
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const within = pointerWithin(args)
    return within.length > 0 ? within : closestCorners(args)
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const over = event.over
      if (over === null) return
      const activeIdText = String(event.active.id)
      const booking = bookings.find((b) => b.id === activeIdText)
      if (booking === undefined) return
      const action = dropToAction(booking, axis, String(over.id))
      if (action !== null) dispatch(action)
    },
    [axis, bookings, dispatch],
  )

  const handleDragCancel = useCallback(() => setActiveId(null), [])

  const announcements: Announcements = useMemo(() => {
    const titleOf = (id: string) =>
      bookings.find((b) => b.id === id)?.title ?? '予約'
    const columnLabelOf = (dropId: string) =>
      columns.find((c) => c.dropId === dropId)?.label ?? '列'
    return {
      onDragStart: ({ active }) =>
        `${titleOf(String(active.id))} をつかみました。左右の矢印キーで列を選びます`,
      onDragOver: ({ over }) =>
        over === null
          ? undefined
          : `${columnLabelOf(String(over.id))} の上にいます`,
      onDragEnd: ({ active, over }) =>
        over === null
          ? `${titleOf(String(active.id))} を元の列に戻しました`
          : `${titleOf(String(active.id))} を ${columnLabelOf(String(over.id))} に移しました`,
      onDragCancel: ({ active }) =>
        `${titleOf(String(active.id))} の移動を取り消しました`,
    }
  }, [bookings, columns])

  const activeBooking =
    activeId === null ? null : (bookings.find((b) => b.id === activeId) ?? null)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* 横スクロール。列を潰して縦積みにはしない(それはただの一覧になる) */}
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {columns.map((column) => (
          <KanbanColumnView
            key={column.dropId}
            column={column}
            axis={axis}
            options={options}
            dispatch={dispatch}
          />
        ))}
      </div>
      <DragOverlay>
        {activeBooking === null ? null : (
          <div className="flex items-center gap-1.5 rounded-xl border border-cyan-300 bg-white px-2.5 py-2 text-sm font-medium shadow-lg">
            <KindIcon
              kind={activeBooking.kind}
              size={14}
              className="shrink-0 text-gray-500"
            />
            <span className="truncate">{activeBooking.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

interface KanbanColumnViewProps {
  column: KanbanColumn
  axis: KanbanAxis
  options: Array<{ value: string; label: string }>
  dispatch: TripNotesDispatch
}

function KanbanColumnView({
  column,
  axis,
  options,
  dispatch,
}: KanbanColumnViewProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.dropId })

  return (
    <section
      ref={setNodeRef}
      // 件数を名前に含める。読み上げでは列見出しのバッジまで辿り着かないことがある
      aria-label={`${column.label} ${column.bookings.length}件`}
      className={`flex w-64 shrink-0 snap-start flex-col rounded-xl border p-2 transition ${
        isOver
          ? 'border-cyan-400 bg-cyan-50 ring-2 ring-cyan-200'
          : 'border-gray-200 bg-gray-50'
      }`}
    >
      <header className="px-1">
        <p className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-700">
            {column.label}
          </span>
          <span className="rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600">
            {column.bookings.length}
          </span>
        </p>
        {column.totals.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {column.totals.map((total) => (
              <li
                key={total.currency}
                className="text-[11px] font-semibold tabular-nums text-gray-700"
              >
                {formatMoney(total.amount, total.currency)}
              </li>
            ))}
          </ul>
        ) : null}
        {column.untotaledCount > 0 ? (
          <p className="mt-0.5 text-[10px] text-gray-400">
            {column.untotaledCount}件は金額未入力
          </p>
        ) : null}
      </header>

      <ul className="mt-2 flex-1 space-y-2">
        {column.bookings.length === 0 ? (
          <li
            aria-hidden="true"
            className="rounded-xl border border-dashed border-gray-300 px-2 py-4 text-center text-[11px] text-gray-400"
          >
            ここにドロップ
          </li>
        ) : (
          column.bookings.map((booking) => (
            <KanbanCard
              key={booking.id}
              booking={booking}
              axis={axis}
              options={options}
              dispatch={dispatch}
            />
          ))
        )}
      </ul>
    </section>
  )
}

interface KanbanCardProps {
  booking: Booking
  axis: KanbanAxis
  options: Array<{ value: string; label: string }>
  dispatch: TripNotesDispatch
}

function KanbanCard({ booking, axis, options, dispatch }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({
      id: booking.id,
      attributes: { roleDescription: '予約カード' },
    })

  const price = booking.price
  // 日付は日程タブの見出しと同じその予約自身の現地日付。
  // カードの日付だけ端末のタイムゾーンで出すと、日程タブへ移ったときに 1 日ずれる
  const dateLabel = formatDateJa(stampDate(booking.start))

  /** ドラッグでもセレクトでも同じ読み替えを通す */
  const applyDropId = (dropId: string) => {
    const action = dropToAction(booking, axis, dropId)
    if (action !== null) dispatch(action)
  }

  return (
    <li
      ref={setNodeRef}
      className={`rounded-xl border border-gray-200 bg-white p-2 shadow-sm ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start gap-1.5">
        {/*
          つかむ場所をカード全体ではなく取っ手に限るのは、
          カードの中に <select> があるためである。カード全体をドラッグ可能にすると
          セレクトを開こうとした指がドラッグとして解釈されうる
        */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          aria-label={`${booking.title} をつかんで別の${KANBAN_AXIS_LABELS[axis]}に移す`}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded text-gray-400 transition hover:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-500"
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
            <KindIcon
              kind={booking.kind}
              size={14}
              className="shrink-0 text-gray-500"
            />
            <span className="truncate">{booking.title}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">{dateLabel}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* もう一方の軸。2 軸が独立していることをカードの上で見せる */}
            {axis === 'status' ? (
              <PaymentStatusBadge payment={booking.payment} size="sm" />
            ) : (
              <BookingStatusBadge status={booking.status} size="sm" />
            )}
            {price === undefined ? null : (
              <span className="text-xs font-semibold tabular-nums text-gray-700">
                {formatMoney(price.amount, price.currency)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ドラッグできない環境のための同等手段。option の値は列の id そのもの */}
      <select
        value={currentDropId(booking, axis)}
        onChange={(event) => applyDropId(event.target.value)}
        aria-label={`${booking.title} の${KANBAN_AXIS_LABELS[axis]}`}
        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </li>
  )
}
