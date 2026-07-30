import { BarChart3, Zap } from 'lucide-react'
import { formatMinutes } from '../../../../lib/trip-scheduler/travel'
import { formatDays } from '../-lib/format'
import { cardClass, sectionTitleClass } from '../-lib/styles'
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
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <BarChart3 size={18} className="text-cyan-600" />
        この案の指標
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl bg-gray-50 px-3 py-2">
            <dt className="text-xs text-gray-500">{item.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {metrics.oneNightStayCount > 0 ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Zap size={15} className="mt-0.5 shrink-0" />
          <span>
            駆け足注意: 1泊しかしない都市が {metrics.oneNightStayCount}
            つあります。到着日と出発日で観光がほとんど残りません。
          </span>
        </p>
      ) : null}
    </section>
  )
}
