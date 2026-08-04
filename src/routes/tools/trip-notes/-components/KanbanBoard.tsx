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
 *
 * 複数選択でまとめて動かす道も、同じ考え方の上に乗せてある。
 * 選ぶ手段をチェックボックスにしたのは、修飾キー + クリック(Ctrl や Shift を
 * 押しながら選ぶ、表計算ソフトのやり方)がこの画面の利用者と噛み合わないためである。
 * 揺れる列車の中でスマホを片手で持っている利用者には押す修飾キーが無く、
 * ホバーで選択の可否を教えることもできない。触れば分かる場所に選択の印を出す。
 * 選んだあとの移動は、ドラッグでも上の一括操作バーでも
 * -lib/kanban.ts の dropToBulkAction を通って reducer に 1 アクション届くだけなので、
 * 1 枚のときと同じく、操作手段による挙動の差が生まれようがない。
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
import { subtleButtonClass } from '../-lib/styles'
import {
  KANBAN_AXIS_LABELS,
  axisOptions,
  buildKanbanColumns,
  currentDropId,
  dropToAction,
  dropToBulkAction,
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
    'スペースキーまたはEnterキーでカードをつかみます。左右の矢印キーで列を選び、もう一度スペースキーで確定、Escapeキーで取り消します。ドラッグせずに、カード内の選択メニューから変更することもできます。複数のカードのチェックボックスを入れてからつかむと、選んだカードがまとめて移動します。',
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

/**
 * 選択が空のときに使い回す集合。
 * 「解除したら毎回まっさらに戻る」ことを 1 か所で保証しておく。
 */
const NO_SELECTION: ReadonlySet<string> = new Set()

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

  /**
   * まとめて動かす対象の選択。
   *
   * TripNotesState には入れない。これは「どのカードにいま手を掛けているか」という
   * 画面の話でしかなく、保存すると共有URLにも他人の端末にも付いて回ってしまう。
   * Undo の対象にもしない(選択の取り消しに履歴を 1 手使うのは邪魔なだけである)。
   */
  const [markedIds, setMarkedIds] = useState<ReadonlySet<string>>(NO_SELECTION)

  /** いま盤面に出ているカード。列の並び(開始が早い順)をそのまま引き継ぐ */
  const boardBookings = useMemo(
    () => columns.flatMap((column) => column.bookings),
    [columns],
  )

  /**
   * 実際に効く選択は、毎回「いま盤面にあるカード」に絞り直したもの。
   *
   * 予約は削除でも AI 取り込みでも入れ替わるし、軸を支払状況に切り替えると
   * キャンセル済みのカードは盤から外れる(kanban.ts の bookingsForAxis)。
   * 消えたカードの id が選択に残ったままだと、画面に見えていないものが
   * 一括操作に巻き込まれる。掃除を副作用でやると取りこぼしうるので、
   * 描画のたびに絞り込む形にして、そもそも古い id が漏れ出す道を作らない。
   */
  const selectedIds = useMemo(() => {
    const alive = new Set<string>()
    for (const booking of boardBookings) {
      if (markedIds.has(booking.id)) alive.add(booking.id)
    }
    return alive
  }, [boardBookings, markedIds])

  const selectedBookings = useMemo(
    () => boardBookings.filter((booking) => selectedIds.has(booking.id)),
    [boardBookings, selectedIds],
  )

  const clearSelection = useCallback(() => setMarkedIds(NO_SELECTION), [])

  const toggleBooking = useCallback((id: string, selected: boolean) => {
    setMarkedIds((current) => {
      const next = new Set(current)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleColumn = useCallback((ids: Array<string>, selected: boolean) => {
    setMarkedIds((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (selected) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }, [])

  /**
   * つかんだカードで実際に動くもの。
   *
   * 選択済みのカードをつかんだら選択されている全部が動き、
   * 選択の外のカードをつかんだらその 1 枚だけが動く(選択はそのまま残す)。
   * 選択外をつかんだ瞬間に選択を作り直さないのは、せっかく入れたチェックが
   * 指の置き場所ひとつで消えると、拾い直しからやり直しになるためである。
   */
  const movingBookingsOf = useCallback(
    (id: string): Array<Booking> => {
      if (selectedIds.has(id)) return selectedBookings
      const one = boardBookings.find((booking) => booking.id === id)
      return one === undefined ? [] : [one]
    },
    [boardBookings, selectedBookings, selectedIds],
  )

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
      const moving = movingBookingsOf(activeIdText)
      if (moving.length === 0) return
      // ドラッグも一括操作バーも同じ dropToBulkAction を通す。
      // 1 枚だけを動かすときも同じ道を通るので、選択の有無で結果が変わらない
      const action = dropToBulkAction(moving, axis, String(over.id))
      if (action !== null) dispatch(action)
      // 選択ごと動かしたときだけ選択を解く。何に効いたのか分からないまま
      // チェックが残っていると、次の操作を誤爆させる。
      // 選択外の 1 枚を動かしただけなら、選んであったものには触らない
      if (selectedIds.has(activeIdText)) clearSelection()
    },
    [axis, clearSelection, dispatch, movingBookingsOf, selectedIds],
  )

  const handleDragCancel = useCallback(() => setActiveId(null), [])

  const announcements: Announcements = useMemo(() => {
    const titleOf = (id: string) =>
      bookings.find((b) => b.id === id)?.title ?? '予約'
    const columnLabelOf = (dropId: string) =>
      columns.find((c) => c.dropId === dropId)?.label ?? '列'
    /**
     * 読み上げの主語。複数枚なら題名ではなく件数で名乗る。
     * 目で見えていれば「掴んだカード以外も一緒に浮いている」ことは分かるが、
     * 読み上げだけで操作している人には、つかんだ 1 枚の題名しか流れないと
     * 残りが動いたことに気付けない。1 枚のときの文言は今までのまま変えない。
     */
    const subjectOf = (id: string) => {
      const count = movingBookingsOf(id).length
      return count > 1 ? `選択中の${count}件` : titleOf(id)
    }
    return {
      onDragStart: ({ active }) =>
        `${subjectOf(String(active.id))} をつかみました。左右の矢印キーで列を選びます`,
      onDragOver: ({ over }) =>
        over === null
          ? undefined
          : `${columnLabelOf(String(over.id))} の上にいます`,
      onDragEnd: ({ active, over }) =>
        over === null
          ? `${subjectOf(String(active.id))} を元の列に戻しました`
          : `${subjectOf(String(active.id))} を ${columnLabelOf(String(over.id))} に移しました`,
      onDragCancel: ({ active }) =>
        `${subjectOf(String(active.id))} の移動を取り消しました`,
    }
  }, [bookings, columns, movingBookingsOf])

  const activeBooking =
    activeId === null ? null : (bookings.find((b) => b.id === activeId) ?? null)

  /** ドラッグ中に一緒に動いているカード。動く分を全部薄くして対象を見せる */
  const movingIds = useMemo(
    () =>
      activeId === null
        ? NO_SELECTION
        : new Set(movingBookingsOf(activeId).map((booking) => booking.id)),
    [activeId, movingBookingsOf],
  )
  const movingCount = activeId === null ? 0 : movingIds.size

  /**
   * 一括操作バーからの適用。ドラッグと同じ dropToBulkAction を通す。
   * 適用したら選択を解くのは、何に効いたのか分からないまま選択が残ると
   * 次の操作を誤爆させるためである(移動先が現在地と同じで 1 件も動かなかった
   * ときも同じ。利用者としては「やった」つもりの操作なので、そこだけ
   * 選択が残ると解除し忘れに見える)。
   */
  const applyBulkDropId = useCallback(
    (dropId: string) => {
      const action = dropToBulkAction(selectedBookings, axis, dropId)
      if (action !== null) dispatch(action)
      clearSelection()
    },
    [axis, clearSelection, dispatch, selectedBookings],
  )

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
      {/*
        選択件数の読み上げ用。バーと一緒に現れる要素に role="status" を付けると、
        読み上げソフトによっては live region がその瞬間に生まれたせいで
        1 件目の選択を読み落とす。器だけは常に置いておき、中身を差し替える
      */}
      <p role="status" className="sr-only">
        {selectedIds.size > 0 ? `${selectedIds.size}件を選択中` : ''}
      </p>

      {/*
        一括操作バーは列の外に置く。列と同じ横スクロールの中に入れると、
        右端の列を見にいった利用者からバーが流れて消えてしまう
      */}
      {selectedIds.size > 0 ? (
        <BulkActionBar
          count={selectedIds.size}
          axis={axis}
          options={options}
          onApply={applyBulkDropId}
          onClear={clearSelection}
        />
      ) : null}

      {/* 横スクロール。列を潰して縦積みにはしない(それはただの一覧になる) */}
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {columns.map((column) => (
          <KanbanColumnView
            key={column.dropId}
            column={column}
            axis={axis}
            options={options}
            dispatch={dispatch}
            selectedIds={selectedIds}
            movingIds={movingIds}
            onToggleBooking={toggleBooking}
            onToggleColumn={toggleColumn}
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
            {/*
              つかんだ 1 枚の題名だけが浮いていると「これ 1 枚が動く」と読めるので、
              まとめて動かしているときは件数を載せる
            */}
            {movingCount > 1 ? (
              <span className="shrink-0 rounded-full bg-cyan-600 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                {movingCount}件
              </span>
            ) : null}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

interface BulkActionBarProps {
  count: number
  axis: KanbanAxis
  options: Array<{ value: string; label: string }>
  onApply: (dropId: string) => void
  onClear: () => void
}

/**
 * 選択が 1 件以上あるときだけ出る一括操作バー。
 *
 * 移動先は列と同じ選択肢(axisOptions)をそのまま使う。ここだけ別の呼び名や
 * 別の順番にすると、「確定」の列に入れたつもりが違う状態になったのではないか、
 * という疑いを利用者に持たせてしまう。
 */
function BulkActionBar({
  count,
  axis,
  options,
  onApply,
  onClear,
}: BulkActionBarProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2">
      <p className="text-sm font-semibold tabular-nums text-cyan-900">
        {count}件を選択中
      </p>
      {/*
        選んだ直後に選択が消える(適用したら解除する)ので、この <select> に
        現在値は無い。空の value を選ばせっぱなしにして、選んだ操作だけを拾う
      */}
      <select
        value=""
        onChange={(event) => {
          if (event.target.value !== '') onApply(event.target.value)
        }}
        aria-label={`選択中の${count}件の${KANBAN_AXIS_LABELS[axis]}をまとめて変える`}
        className="rounded-lg border border-cyan-300 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      >
        <option value="">まとめて移す先を選ぶ…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onClear}
        className={`${subtleButtonClass} bg-white py-1.5`}
      >
        選択を解除
      </button>
    </div>
  )
}

interface KanbanColumnViewProps {
  column: KanbanColumn
  axis: KanbanAxis
  options: Array<{ value: string; label: string }>
  dispatch: TripNotesDispatch
  selectedIds: ReadonlySet<string>
  movingIds: ReadonlySet<string>
  onToggleBooking: (id: string, selected: boolean) => void
  onToggleColumn: (ids: Array<string>, selected: boolean) => void
}

function KanbanColumnView({
  column,
  axis,
  options,
  dispatch,
  selectedIds,
  movingIds,
  onToggleBooking,
  onToggleColumn,
}: KanbanColumnViewProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.dropId })

  const columnIds = column.bookings.map((booking) => booking.id)
  const selectedCount = columnIds.filter((id) => selectedIds.has(id)).length
  const allSelected = columnIds.length > 0 && selectedCount === columnIds.length
  /** 一部だけ選ばれている状態。チェックボックスの中黒(indeterminate)で見せる */
  const someSelected = selectedCount > 0 && !allSelected

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
          <span className="flex min-w-0 items-center gap-1.5">
            {/*
              空の列には出さない。選ぶものが無い列にまで印を置いても、
              押せない操作が 4 つ並ぶだけになる
            */}
            {columnIds.length === 0 ? null : (
              <input
                type="checkbox"
                checked={allSelected}
                ref={(node) => {
                  if (node !== null) node.indeterminate = someSelected
                }}
                onChange={(event) =>
                  onToggleColumn(columnIds, event.currentTarget.checked)
                }
                aria-label={`${column.label}の${columnIds.length}件をすべて選ぶ`}
                className="h-4 w-4 shrink-0 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
              />
            )}
            <span className="truncate text-xs font-semibold text-gray-700">
              {column.label}
            </span>
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
              selected={selectedIds.has(booking.id)}
              moving={movingIds.has(booking.id)}
              onToggleSelected={onToggleBooking}
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
  selected: boolean
  /** いまドラッグで一緒に動いている最中かどうか */
  moving: boolean
  onToggleSelected: (id: string, selected: boolean) => void
}

function KanbanCard({
  booking,
  axis,
  options,
  dispatch,
  selected,
  moving,
  onToggleSelected,
}: KanbanCardProps) {
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
      className={`rounded-xl border bg-white p-2 shadow-sm ${
        selected ? 'border-cyan-400 ring-2 ring-cyan-200' : 'border-gray-200'
      } ${
        // つかんだ 1 枚だけでなく、一緒に動く選択済みのカードも薄くする。
        // どれが持ち上がっているのかを、落とす前に確かめられるようにする
        isDragging || moving ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start gap-1.5">
        {/*
          まとめて動かす対象の印。修飾キーやホバーではなくチェックボックスにしたのは、
          この画面が「揺れる列車の中でスマホを片手で持っている利用者」を
          想定しているためである(ファイル冒頭の解説を参照)。
          押す修飾キーが無く、ホバーで選択できることを伝える余地も無い
        */}
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) =>
            onToggleSelected(booking.id, event.currentTarget.checked)
          }
          aria-label={`${booking.title} をまとめて移す対象に選ぶ`}
          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
        />
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
