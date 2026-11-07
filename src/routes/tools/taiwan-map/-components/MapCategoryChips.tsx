/**
 * 地図の上端に重ねるジャンル（カテゴリ）の絞り込みチップ。
 *
 * 状態は URL の `category` だけを使う（自前の state は持たない）。
 * 各チップの色ドットはピンの色（categoryColors.ts）と同じで、凡例を兼ねる。
 *
 * デスクトップではジャンルの絞り込みはここだけ（一覧側には出さない）。
 * スマホは一覧と地図を切り替えるので、一覧側の FilterBar にも出す。
 * MapView の中で描くので、地図チャンクの読み込み前・失敗時には出ない。
 * スマホは 1 段の横スクロール（端をぼかす）、デスクトップは折り返す。
 */

import { SPOT_CATEGORIES } from '../../../../lib/taiwan-map/types'
import { categoryColor } from '../-lib/categoryColors'
import { chipCountClass, mapChipClass } from '../-lib/styles'
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
    // 外枠は地図の操作を奪わないよう pointer-events-none。チップだけが
    // クリックを受ける。右側はズーム・現在地ボタンのぶん空ける。
    // スマホ（lg 未満）は 1 段の横スクロールにする。折り返すと 2〜3 段に
    // なって地図の上を大きく隠すため。端で切れたチップがあることが分かるよう、
    // 左右の端を薄くぼかす（mask）。デスクトップは幅があるので折り返す
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 pt-2 pr-12 lg:pl-2">
      <div
        role="group"
        aria-label="ジャンルで絞り込む"
        className="pointer-events-auto flex gap-1.5 overflow-x-auto px-2 pb-1 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-20px),transparent)] [scrollbar-width:none] lg:pointer-events-none lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          aria-pressed={active === undefined}
          className={`pointer-events-auto ${mapChipClass(active === undefined)}`}
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
              className={`pointer-events-auto ${mapChipClass(pressed)}`}
              onClick={() => onChange(pressed ? undefined : cat.id)}
            >
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white"
                style={{ background: categoryColor(cat.id) }}
              />
              {cat.name}
              <span className={chipCountClass}>{counts.get(cat.id) ?? 0}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
