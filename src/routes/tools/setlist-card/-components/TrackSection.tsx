import { useMemo } from 'react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { formatBpm } from '../-lib/text'
import {
  iconButtonClass,
  sectionClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { DragEndEvent } from '@dnd-kit/core'
import type { Track } from '../-lib/types'

type Props = {
  tracks: Array<Track>
  onChange: (tracks: Array<Track>) => void
  onAdd: () => void
}

const inlineFieldClass =
  'w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-gray-100 placeholder:text-gray-600 hover:border-white/10 focus:border-cyan-500 focus:bg-gray-950 focus:outline-none'

/**
 * PointerSensor は pointerdown が touchstart より先に走って TouchSensor を無効化して
 * しまうので、既存ツールと同じく Mouse / Touch を分けて使う。
 */
export function TrackSection({ tracks, onChange, onAdd }: Props) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const ids = useMemo(() => tracks.map((t) => t.id), [tracks])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    onChange(arrayMove(tracks, from, to))
  }

  const update = (id: string, patch: Partial<Track>) =>
    onChange(tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={sectionTitleClass}>
          <span className="text-cyan-400">3.</span> 曲リスト
          <span className="text-sm font-normal text-gray-400">
            {tracks.length} 曲
          </span>
        </h2>
        <button type="button" className={subtleButtonClass} onClick={onAdd}>
          <Plus size={16} aria-hidden />
          曲を追加
        </button>
      </div>
      <p className="mt-2 text-sm text-gray-400">
        アーティスト名・曲名はそのまま書き換えられます。左のハンドル（⠿）で並べ替え。
      </p>

      {tracks.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-gray-500">
          まだ曲がありません。ファイルを読み込むか「曲を追加」から入力してください。
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="mt-4 max-h-[32rem] space-y-1 overflow-y-auto pr-1">
              {tracks.map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  onUpdate={(patch) => update(track.id, patch)}
                  onDelete={() =>
                    onChange(tracks.filter((t) => t.id !== track.id))
                  }
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </section>
  )
}

function TrackRow({
  track,
  index,
  onUpdate,
  onDelete,
}: {
  track: Track
  index: number
  onUpdate: (patch: Partial<Track>) => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id })

  const meta = [
    track.bpm !== undefined ? `${formatBpm(track.bpm)} BPM` : '',
    track.key ?? '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1.5 rounded-xl border border-white/5 bg-gray-950/60 px-1.5 py-1 ${
        isDragging ? 'relative z-10 opacity-60 shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="inline-flex h-8 w-6 shrink-0 cursor-grab touch-manipulation items-center justify-center rounded-lg text-gray-500 transition hover:bg-white/10 hover:text-gray-300 active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
        aria-label={`${index + 1} 曲目を並べ替え`}
      >
        <GripVertical size={16} aria-hidden />
      </button>
      <span className="w-6 shrink-0 text-right font-mono text-xs text-cyan-300/80 tabular-nums">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <input
          className={`${inlineFieldClass} font-semibold`}
          value={track.artist}
          placeholder="アーティスト"
          aria-label={`${index + 1} 曲目のアーティスト`}
          onChange={(event) => onUpdate({ artist: event.target.value })}
        />
        <input
          className={inlineFieldClass}
          value={track.title}
          placeholder="曲名"
          aria-label={`${index + 1} 曲目の曲名`}
          onChange={(event) => onUpdate({ title: event.target.value })}
        />
      </div>
      {meta ? (
        <span className="hidden shrink-0 font-mono text-[11px] text-gray-500 md:inline">
          {meta}
        </span>
      ) : null}
      <button
        type="button"
        className={iconButtonClass}
        onClick={onDelete}
        aria-label={`${index + 1} 曲目を削除`}
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </li>
  )
}
