/**
 * 絞り込みチップ。各軸 1 値で、選択中のチップをもう一度押すと解除する。
 *
 * 状態は URL にしか持たない（index.tsx の onChange が navigate する）。
 * チップは aria-pressed つきの button にして、スクリーンリーダーでも
 * 「押されている / いない」が読まれるようにしている。
 *
 * 都市・エリアのチップは、トップの「都市から探す」と同じく件数 0 のものを
 * 出さない（選択中のものは解除できるよう残す）。並びは CITIES の順
 * （北から南）とエリア定義の順。エリアは都市によって 10 前後まで増えるので、
 * 行の見出しを上に置いてチップは幅いっぱいに折り返す。
 */

import { visibleByCount } from '../../../../lib/taiwan-map/filter'
import {
  CITIES,
  SPOT_CATEGORIES,
  SPOT_LABELS,
  VISIT_STATUSES,
} from '../../../../lib/taiwan-map/types'
import { chipClass, sectionTitleClass } from '../-lib/styles'
import type { ReactNode } from 'react'
import type { TaiwanMapSearch } from '../../../../lib/taiwan-map/query'
import type {
  AreaId,
  CityId,
  TaiwanArea,
} from '../../../../lib/taiwan-map/types'

type Props = {
  search: TaiwanMapSearch
  /** 都市が 1 つに決まっているときのその都市のエリア */
  areas: ReadonlyArray<TaiwanArea>
  /** 都市ごとの総数。null（分からない）なら全都市を出す */
  cityCounts: ReadonlyMap<CityId, number> | null
  /** エリアごとの総数 */
  areaCounts: ReadonlyMap<AreaId, number>
  onChange: (patch: Partial<TaiwanMapSearch>) => void
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="space-y-1.5">
      <p className={sectionTitleClass}>{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

/** チップの中の件数。読み上げでは「台北 27 件」になるよう単位を隠して添える */
function Count({ n }: { n: number | undefined }) {
  if (n === undefined) return null
  return (
    <span className="text-[0.7rem] font-normal text-gray-500 tabular-nums">
      {n}
      <span className="sr-only"> 件</span>
    </span>
  )
}

export function FilterBar({
  search,
  areas,
  cityCounts,
  areaCounts,
  onChange,
}: Props) {
  const cities = visibleByCount(CITIES, cityCounts, search.city)
  const visibleAreas = visibleByCount(areas, areaCounts, search.area)
  return (
    <div className="space-y-3">
      <Row title="都市">
        {cities.map((city) => {
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
              <Count n={cityCounts?.get(city.id)} />
            </button>
          )
        })}
      </Row>

      {search.city !== undefined && visibleAreas.length > 0 && (
        <Row title="エリア">
          {visibleAreas.map((area) => {
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
                <Count n={areaCounts.get(area.id) ?? 0} />
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
