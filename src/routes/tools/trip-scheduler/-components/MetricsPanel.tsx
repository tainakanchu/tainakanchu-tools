import { Note } from '../../../../components/ui'
import { formatMinutes } from '../../../../lib/trip-scheduler/travel'
import { formatDays } from '../-lib/format'
import {
  panelClass,
  ruledListClass,
  ruledRowClass,
  sectionTitleClass,
} from '../-lib/styles'
import type { DerivedTrip } from '../../../../lib/trip-scheduler/types'

interface MetricsPanelProps {
  derived: DerivedTrip
}

/** 「この案はどれくらい詰め込みすぎか」を数字で見る */
export function MetricsPanel({ derived }: MetricsPanelProps) {
  const { metrics } = derived
  const items: Array<{ label: string; value: string }> = [
    { label: '移動回数', value: `${metrics.legCount}回` },
    { label: '荷造り回数', value: `${metrics.packingCount}回` },
    { label: '総移動時間', value: formatMinutes(metrics.totalTravelMinutes) },
    {
      label: '実質観光日数',
      value: `${formatDays(metrics.totalEffectiveDays)}日`,
    },
    { label: '1泊だけの都市', value: `${metrics.oneNightStayCount}都市` },
  ]

  return (
    <section className={panelClass}>
      <h2 className={sectionTitleClass}>この案の指標</h2>
      <dl className={`mt-3 ${ruledListClass}`}>
        {items.map((item) => (
          <div
            key={item.label}
            className={`${ruledRowClass} flex items-baseline justify-between gap-4 py-2`}
          >
            <dt className="text-sm text-ink-muted">{item.label}</dt>
            <dd className="text-base font-bold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      {metrics.oneNightStayCount > 0 ? (
        <Note tone="warn" className="mt-4">
          1泊しかしない都市が {metrics.oneNightStayCount}
          つあります。到着日と出発日で観光がほとんど残らないので、駆け足になります。
        </Note>
      ) : null}
    </section>
  )
}
