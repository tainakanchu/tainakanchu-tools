import { useMemo } from 'react'
import { Moon } from 'lucide-react'
import { cityName } from '../../../../lib/trip-scheduler/cities'
import { travelModeLabel } from '../../../../lib/trip-scheduler/travel'
import { formatDays } from '../-lib/format'
import { fallbackCityColor } from '../-lib/palette'
import { emptyClass, panelClass, sectionTitleClass } from '../-lib/styles'
import { DateLabel } from './DateLabel'
import { DayStrip } from './DayStrip'
import type { CityColor } from '../-lib/palette'
import type {
  DerivedTrip,
  TripState,
} from '../../../../lib/trip-scheduler/types'

type Segment =
  | {
      kind: 'stay'
      key: string
      grow: number
      cityId: string
      nights: number
      arriveDate: string
      effectiveDays: number
      violated: boolean
    }
  | {
      kind: 'leg'
      key: string
      grow: number
      overnight: boolean
      title: string
    }
  | { kind: 'gap'; key: string; grow: number; nights: number }

interface TimelineProps {
  state: TripState
  derived: DerivedTrip
  colors: Map<string, CityColor>
}

/**
 * 横一列の可視化。
 * 滞在は泊数ぶんの幅、移動は日中を食うぶんのくさび、夜行は幅を取らない月マーカー。
 * 横棒本体は幅が要るのでデスクトップのみ。日ごとのストリップ(DayStrip)は
 * 曜日を見るための主役なのでモバイルでも常時表示する。
 */
export function Timeline({ state, derived, colors }: TimelineProps) {
  const segments = useMemo<Array<Segment>>(() => {
    const violatedStayIds = new Set(
      derived.violations.flatMap((violation) => violation.stayIds),
    )
    const windowByStayId = new Map(derived.windows.map((w) => [w.stayId, w]))
    const legByFromStayId = new Map(
      derived.legs.map((leg) => [leg.fromStayId, leg]),
    )

    const result: Array<Segment> = []
    for (const stay of state.stays) {
      const stayWindow = windowByStayId.get(stay.id)
      result.push({
        kind: 'stay',
        key: stay.id,
        grow: Math.max(1, stay.nights),
        cityId: stay.cityId,
        nights: stay.nights,
        arriveDate: stayWindow?.arriveDate ?? state.startDate,
        effectiveDays: stayWindow?.effectiveDays ?? 0,
        violated: violatedStayIds.has(stay.id),
      })
      const leg = legByFromStayId.get(stay.id)
      if (!leg) continue
      const overnight = leg.chosen.nightCost > 0
      result.push({
        kind: 'leg',
        key: `leg-${stay.id}`,
        grow: overnight ? 0 : Math.max(0.25, leg.chosen.dayCost),
        overnight,
        title: `${cityName(leg.fromCityId)}から${cityName(leg.toCityId)}へ${
          travelModeLabel[leg.chosen.mode]
        }で移動`,
      })
    }
    if (derived.unassignedNights > 0) {
      result.push({
        kind: 'gap',
        key: 'unassigned',
        grow: derived.unassignedNights,
        nights: derived.unassignedNights,
      })
    }
    return result
  }, [state.stays, state.startDate, derived])

  return (
    <section className={`${panelClass} min-w-0`}>
      <h2 className={sectionTitleClass}>タイムライン</h2>

      {segments.length === 0 ? (
        <p className={`mt-4 ${emptyClass}`}>
          滞在を追加するとここに横棒で並びます。
        </p>
      ) : (
        <div className="mt-4 hidden overflow-x-auto md:block">
          <div className="min-w-[640px]">
            {/* 日付目盛り(各滞在の到着日) */}
            <div className="flex items-end gap-1">
              {segments.map((segment) => (
                <div
                  key={`tick-${segment.key}`}
                  style={{ flexGrow: segment.grow, flexBasis: 0 }}
                  className={
                    segment.kind === 'leg' && segment.overnight
                      ? 'w-6 shrink-0 grow-0'
                      : 'min-w-0'
                  }
                >
                  {segment.kind === 'stay' ? (
                    <DateLabel
                      iso={segment.arriveDate}
                      className="block truncate text-xs text-ink-muted"
                    />
                  ) : null}
                </div>
              ))}
            </div>

            {/* 本体 */}
            <div className="mt-1 flex items-stretch gap-1">
              {segments.map((segment) => {
                if (segment.kind === 'stay') {
                  const color = colors.get(segment.cityId) ?? fallbackCityColor
                  return (
                    <div
                      key={segment.key}
                      style={{ flexGrow: segment.grow, flexBasis: 0 }}
                      title={`${cityName(segment.cityId)} ${segment.nights}泊、実質観光 ${formatDays(segment.effectiveDays)}日`}
                      className={`ink-line flex min-w-0 flex-col justify-center px-2 py-3 ${color.bar} ${color.text} ${
                        segment.violated
                          ? 'outline-[3px] outline-offset-1 outline-pink'
                          : ''
                      }`}
                    >
                      <span className="truncate text-sm font-bold">
                        {cityName(segment.cityId)}
                      </span>
                      <span className="truncate text-xs">
                        {segment.nights}泊
                      </span>
                    </div>
                  )
                }

                if (segment.kind === 'leg') {
                  if (segment.overnight) {
                    return (
                      <div
                        key={segment.key}
                        title={`${segment.title}(夜行で1泊ぶん使います)`}
                        className="ink-line flex w-6 shrink-0 grow-0 items-center justify-center bg-riso-purple text-paper"
                      >
                        {/* 凡例の「夜行」と同じ月の印。ここでは記号が区間の種類を表す */}
                        <Moon size={14} aria-hidden />
                      </div>
                    )
                  }
                  return (
                    <div
                      key={segment.key}
                      style={{ flexGrow: segment.grow, flexBasis: 0 }}
                      title={segment.title}
                      className="min-w-[6px] border-[1.5px] border-dashed border-ink bg-paper"
                    />
                  )
                }

                return (
                  <div
                    key={segment.key}
                    style={{ flexGrow: segment.grow, flexBasis: 0 }}
                    title={`未割り当て ${segment.nights}泊`}
                    className="flex min-w-0 items-center justify-center border-[1.5px] border-dashed border-ink-muted bg-paper px-2 py-3 text-xs text-ink-muted"
                  >
                    <span className="truncate">
                      未割り当て {segment.nights}泊
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
              <span>
                到着 <DateLabel iso={state.startDate} />
              </span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-4 border-[1.5px] border-dashed border-ink" />
                  移動
                </span>
                <span className="flex items-center gap-1">
                  <Moon size={12} aria-hidden />
                  夜行
                </span>
              </span>
              <span>
                帰国 <DateLabel iso={state.endDate} />
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 日ごと(曜日つき)。横棒より粒度が細かく、モバイルでもここだけは見える */}
      <div className="mt-4 md:mt-5 md:border-t md:border-rule md:pt-4">
        <h3 className="text-sm font-bold">日ごと(曜日つき)</h3>
        <div className="mt-2">
          <DayStrip
            startDate={state.startDate}
            derived={derived}
            colors={colors}
          />
        </div>
      </div>
    </section>
  )
}
