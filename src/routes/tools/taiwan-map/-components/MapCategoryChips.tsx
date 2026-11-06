/**
 * 地図の上端に重ねるジャンル（カテゴリ）の絞り込みチップ。
 *
 * 状態は一覧側の FilterBar と同じ URL の `category` だけを使う（自前の
 * state は持たない）ので、どちらで押しても両方のチップが同じ状態になる。
 * 各チップの色ドットはピンの色（categoryColors.ts）と同じで、凡例を兼ねる。
 *
 * MapView の中で描くので、地図チャンクの読み込み前・失敗時には出ない
 * （そのあいだは一覧側の FilterBar で絞り込める）。
 */

import { SPOT_CATEGORIES } from '../../../../lib/taiwan-map/types'
import { categoryColor } from '../-lib/categoryColors'
import { mapChipClass } from '../-lib/styles'
import type { SpotCategory } from '../../../../lib/taiwan-map/types'

type Props = {
  active: SpotCategory | undefined
  counts: ReadonlyMap<SpotCategory, number>
  onChange: (category: SpotCategory | undefined) => void
}

export function MapCategoryChips({ active, counts, onChange }: Props) {
  // 0 件のジャンルは押しても何も出ないので出さない（選択中のものは解除できるよう残す）
  const visible = SPOT_CATEGORIES.filter(
    (c) => (counts.get(c.id) ?? 0) > 0 || c.id === active,
  )
  if (visible.length === 0) return null
  return (
    // 外枠は地図の操作を奪わないよう pointer-events-none。チップの列だけが
    // 横スクロールとクリックを受ける。右側はズームボタンのぶん空ける
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 pt-2 pr-12 pl-2">
      <div
        role="group"
        aria-label="ジャンルで絞り込む"
        className="pointer-events-auto flex w-fit max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          aria-pressed={active === undefined}
          className={mapChipClass(active === undefined)}
          onClick={() => onChange(undefined)}
        >
          すべて
        </button>
        {visible.map((cat) => {
          const pressed = active === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              aria-pressed={pressed}
              className={mapChipClass(pressed)}
              onClick={() => onChange(pressed ? undefined : cat.id)}
            >
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white"
                style={{ background: categoryColor(cat.id) }}
              />
              {cat.name}
              <span className="text-[0.7rem] font-normal text-gray-500 tabular-nums">
                {counts.get(cat.id) ?? 0}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
