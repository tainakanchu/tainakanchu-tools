import { useId, useMemo } from 'react'
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
import {
  CUSTOM_MAX,
  HIDE_TARGETS,
  REDACT_STYLES,
  hiddenFor,
  hiddenOf,
  hideTargetOf,
  isHidden,
} from '../-lib/redact'
import { SegmentedControl, Switch } from '../../../../components/ui'
import { Field } from './ui'
import type { DragEndEvent } from '@dnd-kit/core'
import type { RedactOptions } from '../-lib/redact'
import type { Track } from '../-lib/types'

type Props = {
  tracks: Array<Track>
  onChange: (tracks: Array<Track>) => void
  onAdd: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 曲リスト。ふだんは「14 曲」と「編集」の 1 行で、開くと並べ替え・隠す・削除・追加。
 * PointerSensor は pointerdown が touchstart より先に走って TouchSensor を無効化して
 * しまうので、既存ツールと同じく Mouse / Touch を分けて使う。
 */
export function TrackSection({
  tracks,
  onChange,
  onAdd,
  open,
  onOpenChange,
}: Props) {
  const panelId = useId()
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
  const hiddenCount = tracks.filter(isHidden).length

  return (
    <div>
      <button
        type="button"
        className="slc-disclosure"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
      >
        <span>
          <span className="mono">{tracks.length}</span> 曲
          {hiddenCount > 0 ? (
            <span className="text-(--muted)">
              {'、'}
              <span className="mono">{hiddenCount}</span> 曲を隠す
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-(--muted)">編集</span>
      </button>

      <div id={panelId} hidden={!open} className="pb-3">
        {tracks.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ol className="lg:max-h-[60vh] lg:overflow-y-auto lg:overscroll-contain">
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
        ) : null}
        <button
          type="button"
          className="btn btn-quiet mt-2 w-full"
          onClick={onAdd}
        >
          曲を追加
        </button>
      </div>
    </div>
  )
}

/** 隠した曲の見せ方（全曲共通。詳細設定に置く） */
export function RedactSettings({
  redact,
  onChange,
}: {
  redact: RedactOptions
  onChange: (next: RedactOptions) => void
}) {
  const set = (patch: Partial<RedactOptions>) =>
    onChange({ ...redact, ...patch })
  return (
    <Field label="隠した曲の見せ方">
      <SegmentedControl
        full
        label="隠した曲の見せ方"
        value={redact.style}
        options={REDACT_STYLES.map((o) => ({ value: o.id, label: o.label }))}
        onChange={(style) => set({ style })}
      />
      {redact.style === 'custom' ? (
        <input
          className="input"
          aria-label={`隠した欄に出す文字（${CUSTOM_MAX} 文字まで）`}
          value={redact.custom}
          maxLength={CUSTOM_MAX * 2}
          placeholder="Unreleased"
          onChange={(event) => set({ custom: event.target.value })}
        />
      ) : null}
      <Switch
        label="BPM と Key も隠す"
        checked={redact.hideMeta}
        onChange={(hideMeta) => set({ hideMeta })}
        title="番号と時刻はそのまま。隠した曲のレーベルは出さない"
      />
    </Field>
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

  const hidden = hiddenOf(track)
  const target = hideTargetOf(track)
  const n = index + 1

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`slc-track ${isDragging ? 'relative z-10 opacity-70' : ''}`}
      data-hidden={target !== null}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="slc-grip"
        aria-label={`${n} 曲目を並べ替え`}
      />
      <span className="mono text-[12px] text-(--muted)">
        {String(n).padStart(2, '0')}
      </span>
      <div className="grid min-w-0 py-1">
        <input
          className={`slc-track-field font-semibold ${hidden.artist ? 'italic' : ''}`}
          value={track.artist}
          placeholder="アーティスト"
          aria-label={`${n} 曲目のアーティスト`}
          onChange={(event) => onUpdate({ artist: event.target.value })}
        />
        <input
          className={`slc-track-field ${hidden.title ? 'italic' : ''}`}
          value={track.title}
          placeholder="曲名"
          aria-label={`${n} 曲目の曲名`}
          onChange={(event) => onUpdate({ title: event.target.value })}
        />
      </div>
      <button
        type="button"
        aria-pressed={target !== null}
        className="btn btn-quiet px-2!"
        onClick={() =>
          onUpdate({ hidden: target ? undefined : hiddenFor('both') })
        }
        aria-label={target ? `${n} 曲目を隠すのをやめる` : `${n} 曲目を隠す`}
        title="画像では名前を伏せる（文字は残る）"
      >
        {target ? '隠し中' : '隠す'}
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={onDelete}
        aria-label={`${n} 曲目を削除`}
        title="削除"
      >
        削除
      </button>
      {target ? (
        <div className="col-span-5 pb-2 pl-[60px]">
          <SegmentedControl
            size="sm"
            label={`${n} 曲目で隠す欄`}
            value={target}
            options={HIDE_TARGETS.map((o) => ({
              value: o.id,
              label: o.label.replace('だけ', ''),
            }))}
            onChange={(id) => onUpdate({ hidden: hiddenFor(id) })}
          />
        </div>
      ) : null}
    </li>
  )
}
