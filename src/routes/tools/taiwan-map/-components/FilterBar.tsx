/**
 * 絞り込みチップ。各軸 1 値で、選択中のチップをもう一度押すと解除する。
 *
 * 状態は URL にしか持たない（index.tsx の onChange が navigate する）。
 * チップは aria-pressed つきの button にして、スクリーンリーダーでも
 * 「押されている / いない」が読まれるようにしている。
 */

import {
  CITIES,
  SPOT_CATEGORIES,
  SPOT_LABELS,
  VISIT_STATUSES,
} from '../../../../lib/taiwan-map/types'
import { chipClass, sectionTitleClass } from '../-lib/styles'
import type { ReactNode } from 'react'
import type { TaiwanMapSearch } from '../../../../lib/taiwan-map/query'
import type { TaiwanArea } from '../../../../lib/taiwan-map/types'

type Props = {
  search: TaiwanMapSearch
  /** 都市が 1 つに決まっているときのその都市のエリア */
  areas: ReadonlyArray<TaiwanArea>
  onChange: (patch: Partial<TaiwanMapSearch>) => void
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={title}
      className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3"
    >
      <p className={`${sectionTitleClass} shrink-0 sm:w-24 sm:pt-1.5`}>
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

export function FilterBar({ search, areas, onChange }: Props) {
  return (
    <div className="space-y-3">
      <Row title="都市">
        {CITIES.map((city) => {
          const pressed = search.city === city.id
          return (
            <button
              key={city.id}
              type="button"
              aria-pressed={pressed}
              className={chipClass(pressed)}
              // 都市を変えたら、前の都市のエリア指定は意味を失うので外す
              onClick={() =>
                onChange({
                  city: pressed ? undefined : city.id,
                  area: undefined,
                })
              }
            >
              {city.name}
            </button>
          )
        })}
      </Row>

      {search.city !== undefined && areas.length > 0 && (
        <Row title="エリア">
          {areas.map((area) => {
            const pressed = search.area === area.id
            return (
              <button
                key={area.id}
                type="button"
                aria-pressed={pressed}
                className={chipClass(pressed)}
                onClick={() =>
                  onChange({ area: pressed ? undefined : area.id })
                }
              >
                {area.name}
              </button>
            )
          })}
        </Row>
      )}

      <Row title="やりたいこと">
        {SPOT_CATEGORIES.map((cat) => {
          const pressed = search.category === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              aria-pressed={pressed}
              className={chipClass(pressed)}
              onClick={() =>
                onChange({ category: pressed ? undefined : cat.id })
              }
            >
              {cat.name}
            </button>
          )
        })}
      </Row>

      <Row title="状態・気持ち">
        {VISIT_STATUSES.map((s) => {
          const pressed = search.status === s.id
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={pressed}
              className={chipClass(pressed)}
              onClick={() => onChange({ status: pressed ? undefined : s.id })}
            >
              {s.name}
            </button>
          )
        })}
        {SPOT_LABELS.map((l) => {
          const pressed = search.label === l.id
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={pressed}
              className={chipClass(pressed)}
              onClick={() => onChange({ label: pressed ? undefined : l.id })}
            >
              <span aria-hidden>{l.mark}</span>
              {l.name}
            </button>
          )
        })}
      </Row>
    </div>
  )
}
