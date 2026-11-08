import { Txt } from '@/components/Txt'

/** お気に入りの切り替え。状態は aria-pressed と ★/☆ の形で示す */
export function FavButton({
  pressed,
  label,
  onToggle,
}: {
  pressed: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${label}をお気に入り`}
      onClick={onToggle}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-lg leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 dark:focus-visible:outline-cyan-400 ${
        pressed
          ? 'border-amber-500 bg-amber-400 text-gray-900'
          : 'border-gray-300 bg-white text-gray-400 hover:text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
      }`}
    >
      <span aria-hidden="true">{pressed ? '★' : '☆'}</span>
    </button>
  )
}

/** 友達の選択を示す小さな札。破線の枠で、お気に入り(塗り)と形で区別する */
export function FriendTags({ names }: { names: ReadonlyArray<string> }) {
  if (names.length === 0) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {names.map((name) => (
        <span
          key={name}
          className="rounded-sm border border-dashed border-gray-800 px-1 text-[11px] leading-4 text-gray-900 dark:border-gray-300 dark:text-gray-100"
        >
          <Txt text={name} />
        </span>
      ))}
    </span>
  )
}
