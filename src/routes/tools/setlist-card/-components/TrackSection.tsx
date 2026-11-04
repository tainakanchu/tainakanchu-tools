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
import { EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react'
import {
  CUSTOM_MAX,
  HIDE_TARGETS,
  REDACT_STYLES,
  customText,
  hiddenFor,
  hiddenOf,
  hideTargetOf,
  isHidden,
} from '../-lib/redact'
import { formatBpm } from '../-lib/text'
import {
  choiceClass,
  fieldClass,
  iconButtonClass,
  sectionClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { DragEndEvent } from '@dnd-kit/core'
import type { RedactOptions } from '../-lib/redact'
import type { Track } from '../-lib/types'

type Props = {
  tracks: Array<Track>
  onChange: (tracks: Array<Track>) => void
  onAdd: () => void
  redact: RedactOptions
  onRedactChange: (next: RedactOptions) => void
  /** BPM・Key を画像に出しているか（「BPM・Key も隠す」の注記用） */
  showMeta: boolean
}

/** 隠した欄: 斜めの縞で「伏せてある」ことを見せる（文字はそのまま書き換えられる） */
const redactedFieldClass =
  'bg-[repeating-linear-gradient(135deg,rgba(251,191,36,0.10)_0_6px,transparent_6px_12px)] text-gray-400 italic'

const smallChoice = (active: boolean) =>
  `${choiceClass(active)} items-center! px-2.5! py-1! text-xs`

/** 画像ではこう出る、の短い説明（エディタの行に添える。見えている欄は「アーティスト」「曲名」） */
function previewOf(track: Track, redact: RedactOptions): string {
  const h = hiddenOf(track)
  const label =
    redact.style === 'id'
      ? 'ID'
      : redact.style === 'qmark'
        ? '???'
        : redact.style === 'custom'
          ? customText(redact.custom)
          : redact.style === 'bar'
            ? '黒塗り'
            : 'ぐちゃぐちゃ'
  if (redact.style === 'custom' && h.artist && h.title) return label
  const artist = h.artist ? label : 'アーティスト'
  const title = h.title ? label : '曲名'
  return `${artist} — ${title}`
}

const inlineFieldClass =
  'w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-gray-100 placeholder:text-gray-600 hover:border-white/10 focus:border-cyan-500 focus:bg-gray-950 focus:outline-none'

/**
 * PointerSensor は pointerdown が touchstart より先に走って TouchSensor を無効化して
 * しまうので、既存ツールと同じく Mouse / Touch を分けて使う。
 */
export function TrackSection({
  tracks,
  onChange,
  onAdd,
  redact,
  onRedactChange,
  showMeta,
}: Props) {
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
      <p className="mt-1 text-sm text-gray-400">
        <EyeOff
          size={14}
          aria-hidden
          className="mr-1 inline-block align-[-2px] text-amber-300/80"
        />
        「隠す」は、再生したことは見せつつ、未発表の曲名などを伏せたいときに使います。
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
                  redact={redact}
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

      {hiddenCount > 0 ? (
        <RedactSettings
          redact={redact}
          onChange={onRedactChange}
          count={hiddenCount}
          showMeta={showMeta}
        />
      ) : null}
    </section>
  )
}

/** 隠した曲の見せ方（全曲共通） */
function RedactSettings({
  redact,
  onChange,
  count,
  showMeta,
}: {
  redact: RedactOptions
  onChange: (next: RedactOptions) => void
  count: number
  showMeta: boolean
}) {
  const set = (patch: Partial<RedactOptions>) =>
    onChange({ ...redact, ...patch })
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold text-gray-100">
          隠した曲の見せ方
        </h3>
        <span className="text-xs text-gray-400">{count} 曲を隠しています</span>
      </div>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="隠した曲の見せ方"
      >
        {REDACT_STYLES.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={redact.style === option.id}
            className={smallChoice(redact.style === option.id)}
            onClick={() => set({ style: option.id })}
          >
            {option.label}
          </button>
        ))}
      </div>
      {redact.style === 'custom' ? (
        <label className="block space-y-1">
          <span className="text-xs text-gray-400">
            隠した欄に出す文字（{CUSTOM_MAX} 文字まで）
          </span>
          <input
            className={`${fieldClass} max-w-xs`}
            value={redact.custom}
            maxLength={CUSTOM_MAX * 2}
            placeholder="Unreleased"
            onChange={(event) => set({ custom: event.target.value })}
          />
        </label>
      ) : null}
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-gray-200 has-[:checked]:border-cyan-400/70 has-[:checked]:bg-cyan-500/10">
        <input
          type="checkbox"
          className="accent-cyan-500"
          checked={redact.hideMeta}
          onChange={(event) => set({ hideMeta: event.target.checked })}
        />
        BPM・Key も隠す
      </label>
      <p className="text-xs leading-relaxed text-gray-500">
        番号と時刻はそのまま出します。隠した曲のレーベルは出しません。
        {!showMeta && redact.hideMeta
          ? ' いまは BPM・Key を画像に出していません。'
          : ''}
        黒塗り・ぐちゃぐちゃ・？？？の長さは曲名の長さとは関係なく決まります。
      </p>
    </div>
  )
}

function TrackRow({
  track,
  index,
  redact,
  onUpdate,
  onDelete,
}: {
  track: Track
  index: number
  redact: RedactOptions
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
  const hidden = hiddenOf(track)
  const target = hideTargetOf(track)
  const n = index + 1

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-1.5 rounded-xl border px-1.5 py-1 ${
        target
          ? 'border-amber-300/25 bg-amber-300/[0.04]'
          : 'border-white/5 bg-gray-950/60'
      } ${isDragging ? 'relative z-10 opacity-60 shadow-lg' : ''}`}
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
          className={`${inlineFieldClass} font-semibold ${hidden.artist ? redactedFieldClass : ''}`}
          value={track.artist}
          placeholder="アーティスト"
          aria-label={`${index + 1} 曲目のアーティスト`}
          onChange={(event) => onUpdate({ artist: event.target.value })}
        />
        <input
          className={`${inlineFieldClass} ${hidden.title ? redactedFieldClass : ''}`}
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
        aria-pressed={target !== null}
        className={`inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
          target
            ? 'border-amber-300/60 bg-amber-300/15 text-amber-100 hover:bg-amber-300/25'
            : 'border-white/15 text-gray-300 hover:border-amber-300/60 hover:bg-amber-300/10 hover:text-amber-100'
        }`}
        onClick={() =>
          onUpdate({ hidden: target ? undefined : hiddenFor('both') })
        }
        aria-label={target ? `${n} 曲目を隠すのをやめる` : `${n} 曲目を隠す`}
        title={
          target
            ? '画像で伏せています。押すと元に戻します'
            : '画像ではアーティスト名・曲名を伏せます（文字は残ります）'
        }
      >
        <EyeOff size={14} aria-hidden />
        隠す
      </button>
      <button
        type="button"
        className={iconButtonClass}
        onClick={onDelete}
        aria-label={`${index + 1} 曲目を削除`}
      >
        <Trash2 size={14} aria-hidden />
      </button>
      {target ? (
        <div className="flex basis-full flex-wrap items-center gap-1.5 pb-1 pl-[3.75rem]">
          <span className="text-xs text-gray-400">隠す欄</span>
          {HIDE_TARGETS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={target === option.id}
              aria-label={`${n} 曲目: ${option.label}隠す`}
              className={smallChoice(target === option.id)}
              onClick={() => onUpdate({ hidden: hiddenFor(option.id) })}
            >
              {option.label}
            </button>
          ))}
          <span className="min-w-0 truncate text-xs text-gray-500">
            画像では「{previewOf(track, redact)}」
          </span>
        </div>
      ) : null}
    </li>
  )
}
