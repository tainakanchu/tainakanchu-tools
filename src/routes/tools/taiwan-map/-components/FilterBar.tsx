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
 *
 * ジャンル・状態・気持ちのチップも、今の条件で押すと 0 件になるものは出さない
 * （ラベルをまだ誰にも付けていなければ、気持ちの行ごと出ない）。
 *
 * ジャンルの絞り込みは地図の上のチップ（MapCategoryChips）が受け持つ。
 * デスクトップは地図が常に横にあるのでここには出さず、地図と切り替えになる
 * スマホでだけ一覧側にも出す（showCategory）。
 *
 * スマホ（collapsible）では、都市だけを常に出し、エリア・ジャンル・状態は
 * 「絞り込み」ボタンで開く。全部を並べると、スポットが 1 件も見えないまま
 * 画面が埋まってしまうため。
 * - 開いた中でチップを押したら（= 一覧が変わったら）自動で閉じる。開いた
 *   ままだと、押した結果が画面の下に押し出されて見えない
 * - 閉じているあいだは、今かかっている条件を「大稻埕・迪化街 ×」のような
 *   外せるチップでボタンの横に並べる（数だけでは何で絞っているか分からない）
 */

import { useId, useState } from 'react'
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import { visibleByCount } from '../../../../lib/taiwan-map/filter'
import {
  CITIES,
  SPOT_CATEGORIES,
  SPOT_LABELS,
  VISIT_STATUSES,
} from '../../../../lib/taiwan-map/types'
import {
  actionButtonClass,
  chipClass,
  chipCountClass,
  sectionTitleClass,
} from '../-lib/styles'
import { categoryName, labelDef, statusName } from './Badges'
import type { ReactNode } from 'react'
import type { TaiwanMapSearch } from '../../../../lib/taiwan-map/query'
import type {
  AreaId,
  CityId,
  SpotCategory,
  SpotLabel,
  TaiwanArea,
  VisitStatus,
} from '../../../../lib/taiwan-map/types'

type Props = {
  search: TaiwanMapSearch
  /** 都市が 1 つに決まっているときのその都市のエリア */
  areas: ReadonlyArray<TaiwanArea>
  /** 都市ごとの総数。null（分からない）なら全都市を出す */
  cityCounts: ReadonlyMap<CityId, number> | null
  /** エリアごとの総数 */
  areaCounts: ReadonlyMap<AreaId, number>
  /** ジャンル以外の条件で数えたジャンルごとの件数。null なら全部出す */
  categoryCounts: ReadonlyMap<SpotCategory, number> | null
  /** 状態以外の条件で数えた訪問状況ごとの件数。null なら全部出す */
  statusCounts: ReadonlyMap<VisitStatus, number> | null
  /** ラベル以外の条件で数えた気持ちラベルごとの件数。null なら全部出す */
  labelCounts: ReadonlyMap<SpotLabel, number> | null
  /** ジャンルの行を出すか（地図のチップが見えていない画面だけ true） */
  showCategory: boolean
  /** 都市以外を「絞り込み」ボタンで開閉するか（スマホ） */
  collapsible: boolean
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
    <span className={chipCountClass}>
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
  categoryCounts,
  statusCounts,
  labelCounts,
  showCategory,
  collapsible,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  /** 開閉パネルの中のチップを押したとき。結果が見えるようパネルを閉じる */
  const select = (patch: Partial<TaiwanMapSearch>) => {
    onChange(patch)
    if (collapsible) setOpen(false)
  }

  const cities = visibleByCount(CITIES, cityCounts, search.city)
  const visibleAreas =
    search.city !== undefined
      ? visibleByCount(areas, areaCounts, search.area)
      : []
  const categories = showCategory
    ? visibleByCount(SPOT_CATEGORIES, categoryCounts, search.category)
    : []
  // 状態が 1 種類しか残らないなら、押しても一覧は変わらないので行ごと出さない
  const statusCandidates = visibleByCount(
    VISIT_STATUSES,
    statusCounts,
    search.status,
  )
  const statuses =
    statusCandidates.length > 1 || search.status !== undefined
      ? statusCandidates
      : []
  const labels = visibleByCount(SPOT_LABELS, labelCounts, search.label)
  const stateTitle =
    statuses.length > 0 && labels.length > 0
      ? '状態・気持ち'
      : labels.length > 0
        ? '気持ち'
        : '状態'

  const hasSecondary =
    visibleAreas.length > 0 ||
    categories.length > 0 ||
    statuses.length > 0 ||
    labels.length > 0
  /** 開閉ボタンに出す、都市以外にかかっている条件の数 */
  const activeCount = [
    search.area,
    showCategory ? search.category : undefined,
    search.status,
    search.label,
  ].filter((v) => v !== undefined).length

  /** 閉じているときに並べる、今かかっている条件（都市以外） */
  const activeChips: Array<{
    key: string
    label: string
    clear: Partial<TaiwanMapSearch>
  }> = []
  if (search.area !== undefined) {
    activeChips.push({
      key: 'area',
      label: areas.find((a) => a.id === search.area)?.name ?? search.area,
      clear: { area: undefined },
    })
  }
  if (showCategory && search.category !== undefined) {
    activeChips.push({
      key: 'category',
      label: categoryName(search.category),
      clear: { category: undefined },
    })
  }
  if (search.status !== undefined) {
    activeChips.push({
      key: 'status',
      label: statusName(search.status),
      clear: { status: undefined },
    })
  }
  if (search.label !== undefined) {
    const l = labelDef(search.label)
    activeChips.push({
      key: 'label',
      label: `${l.mark} ${l.name}`,
      clear: { label: undefined },
    })
  }

  const secondary = (
    <>
      {visibleAreas.length > 0 && (
        <Row title="エリア">
          {visibleAreas.map((area) => {
            const pressed = search.area === area.id
            return (
              <button
                key={area.id}
                type="button"
                aria-pressed={pressed}
                className={chipClass(pressed)}
                onClick={() => select({ area: pressed ? undefined : area.id })}
              >
                {area.name}
                <Count n={areaCounts.get(area.id) ?? 0} />
              </button>
            )
          })}
        </Row>
      )}

      {categories.length > 0 && (
        <Row title="やりたいこと">
          {categories.map((cat) => {
            const pressed = search.category === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={pressed}
                className={chipClass(pressed)}
                onClick={() =>
                  select({ category: pressed ? undefined : cat.id })
                }
              >
                {cat.name}
                <Count n={categoryCounts?.get(cat.id)} />
              </button>
            )
          })}
        </Row>
      )}

      {(statuses.length > 0 || labels.length > 0) && (
        <Row title={stateTitle}>
          {statuses.map((s) => {
            const pressed = search.status === s.id
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={pressed}
                // 未訪問・気になるは破線（バッジ・地図のピンと同じ形）
                className={chipClass(pressed, s.id === 'want_to_go')}
                onClick={() => select({ status: pressed ? undefined : s.id })}
              >
                {s.name}
                <Count n={statusCounts?.get(s.id)} />
              </button>
            )
          })}
          {labels.map((l) => {
            const pressed = search.label === l.id
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={pressed}
                className={chipClass(pressed)}
                onClick={() => select({ label: pressed ? undefined : l.id })}
              >
                <span aria-hidden>{l.mark}</span>
                {l.name}
                <Count n={labelCounts?.get(l.id)} />
              </button>
            )
          })}
        </Row>
      )}
    </>
  )

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

      {hasSecondary &&
        (collapsible ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                className={actionButtonClass}
                onClick={() => setOpen((v) => !v)}
              >
                <SlidersHorizontal size={14} aria-hidden />
                絞り込み
                {activeCount > 0 && (
                  <span className="rounded-full bg-cyan-600 px-1.5 text-xs leading-5 font-semibold text-white tabular-nums dark:bg-cyan-400 dark:text-gray-950">
                    {activeCount}
                    <span className="sr-only"> 件の条件</span>
                  </span>
                )}
                <ChevronDown
                  size={14}
                  aria-hidden
                  className={`transition ${open ? 'rotate-180' : ''}`}
                />
              </button>
              {!open &&
                activeChips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    // かかっている条件 = 選んでいる絞り込みなので塗り（styles.ts のチップの約束）
                    className="inline-flex min-h-8 items-center gap-1 rounded-full border border-cyan-600 bg-cyan-600 py-1 pr-2 pl-3 text-sm font-semibold text-white transition hover:border-cyan-700 hover:bg-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-cyan-400 dark:bg-cyan-400 dark:text-gray-950 dark:hover:border-cyan-300 dark:hover:bg-cyan-300 focus-visible:outline-cyan-500 dark:focus-visible:outline-cyan-400"
                    aria-label={`「${c.label}」の条件を外す`}
                    onClick={() => onChange(c.clear)}
                  >
                    {c.label}
                    <X size={14} aria-hidden />
                  </button>
                ))}
            </div>
            <div id={panelId} hidden={!open} className="space-y-3">
              {secondary}
            </div>
          </>
        ) : (
          secondary
        ))}
    </div>
  )
}
