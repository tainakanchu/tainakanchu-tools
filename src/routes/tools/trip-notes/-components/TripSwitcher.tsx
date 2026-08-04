/**
 * 旅程セレクタ。ヘッダーの見出しの隣に置く。
 *
 * 「いまどの旅程を編集しているか」は、複数の旅程を持てるようになった瞬間から
 * 画面のどこかに常時出ていないといけない情報になる。だからタブや設定の中ではなく
 * 見出しの真横に置き、開かなくても現在地(旅程名と期間)が読めるようにしている。
 *
 * 複製・名前変更・削除をこのメニューにまとめたのは、どれも「いま開いている旅程」への
 * 操作だからである。設定タブに散らすと、対象がどの旅程なのかが操作の場所からは
 * 読み取れなくなる。
 *
 * <select> ではなくボタン + メニューにしているのは、行に期間とチェックを添えたい、
 * かつ一覧の下に旅程そのものへの操作を並べたいため。
 * 代わりに Esc・外側クリック・aria-expanded / aria-haspopup を自前で用意する。
 */

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { formatRangeShort } from '../-lib/format'
import { subtleButtonClass } from '../-lib/styles'
import type { TripLibrary } from '../../../../lib/trip-notes/trips'

interface TripSwitcherProps {
  library: TripLibrary
  onSelect: (id: string) => void
  onCreate: () => void
  onDuplicate: () => void
  onRename: () => void
  onDelete: () => void
}

/** 名前を付けていない旅程にも、一覧で指し示せる呼び名を与える */
export function tripLabel(title: string): string {
  return title.trim().length > 0 ? title.trim() : '名称未設定'
}

/** 期間が壊れている(Temporal が解釈できない)ときは黙って何も出さない */
function rangeLabel(startDate: string, endDate: string): string | null {
  try {
    return formatRangeShort(startDate, endDate)
  } catch {
    return null
  }
}

const menuItemClass =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-500'

export function TripSwitcher({
  library,
  onSelect,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
}: TripSwitcherProps) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const containerRef = useRef<HTMLDivElement>(null)

  const activeTitle = tripLabel(
    library.trips.find((trip) => trip.id === library.activeTripId)?.state
      .tripTitle ?? '',
  )

  // Esc と外側クリックで閉じる。
  // pointerdown で見るのは、メニュー項目を押した指の click より先に
  // 閉じてしまわないようにしつつ、外側の操作には即座に反応させるため
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
    }
    const handlePointerDown = (event: PointerEvent) => {
      const container = containerRef.current
      if (container === null) return
      if (event.target instanceof Node && container.contains(event.target)) {
        return
      }
      setOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  /** メニュー項目は押したら必ず閉じる。開きっぱなしで結果が隠れると何が起きたか分からない */
  const runAndClose = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <div ref={containerRef} className="relative print:hidden">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={`${subtleButtonClass} max-w-[14rem]`}
      >
        <span className="truncate">{activeTitle}</span>
        <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="旅程の切り替えと操作"
          className="absolute left-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {/*
            role="menu" の子は menuitem 系でなければならないので、
            並べるための ul / li は role="none" で意味を消す
            (見た目のための入れ物であって、読み上げに出す要素ではない)
          */}
          <ul role="none" className="max-h-64 overflow-y-auto">
            {library.trips.map((trip) => {
              const isActive = trip.id === library.activeTripId
              const range = rangeLabel(trip.state.startDate, trip.state.endDate)
              return (
                <li key={trip.id} role="none">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => runAndClose(() => onSelect(trip.id))}
                    className={`${menuItemClass} ${isActive ? 'font-semibold text-cyan-800' : ''}`}
                  >
                    <Check
                      size={14}
                      aria-hidden="true"
                      className={`shrink-0 ${isActive ? 'text-cyan-600' : 'invisible'}`}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {tripLabel(trip.state.tripTitle)}
                    </span>
                    {range !== null ? (
                      <span className="shrink-0 text-xs font-normal text-gray-500">
                        {range}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>

          <hr className="my-1 border-gray-200" />

          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onDuplicate)}
            className={menuItemClass}
          >
            <Copy size={14} aria-hidden="true" className="shrink-0" />
            複製
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onRename)}
            className={menuItemClass}
          >
            <Pencil size={14} aria-hidden="true" className="shrink-0" />
            名前を変える
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onDelete)}
            className={`${menuItemClass} text-rose-700 hover:bg-rose-50`}
          >
            <Trash2 size={14} aria-hidden="true" className="shrink-0" />
            削除
          </button>

          <hr className="my-1 border-gray-200" />

          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onCreate)}
            className={menuItemClass}
          >
            <Plus size={14} aria-hidden="true" className="shrink-0" />
            新しい旅程を作る
          </button>
        </div>
      ) : null}
    </div>
  )
}
