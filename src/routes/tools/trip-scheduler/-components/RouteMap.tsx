import { useMemo } from 'react'
import { Map as MapIcon } from 'lucide-react'
import { cityCatalog, cityName } from '../../../../lib/trip-scheduler/cities'
import {
  buildRouteNodes,
  buildRouteSegments,
  pointAlong,
  projectCities,
  segmentLength,
  segmentMidpoint,
} from '../../../../lib/trip-scheduler/geo'
import { travelModeLabel } from '../../../../lib/trip-scheduler/travel'
import { fallbackCityColor } from '../-lib/palette'
import { cardClass, sectionTitleClass } from '../-lib/styles'
import type { CityColor } from '../-lib/palette'
import type {
  RouteSegment,
  RouteStop,
} from '../../../../lib/trip-scheduler/geo'
import type {
  DerivedTrip,
  TravelMode,
  TripState,
} from '../../../../lib/trip-scheduler/types'

/**
 * SVG の内部座標。ヨーロッパは縦にやや長いので正方形より少し縦長に取る。
 * 実際の表示サイズは viewBox 任せ(親の幅に追従する)。
 */
const MAP_WIDTH = 440
const MAP_HEIGHT = 460
const MAP_PADDING = 34

/** カタログ都市の投影は旅程に依らず不変なので、モジュール読み込み時に1度だけ計算する */
const catalogPoints = projectCities(
  cityCatalog,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_PADDING,
)

/**
 * palette の Tailwind クラス → SVG 用の hex。
 * SVG は class では塗れないので、同じ色をここで hex に読み替える。
 */
const cityHexByDotClass: Record<string, string> = {
  'bg-sky-500': '#0ea5e9',
  'bg-emerald-500': '#10b981',
  'bg-amber-500': '#f59e0b',
  'bg-violet-500': '#8b5cf6',
  'bg-rose-500': '#f43f5e',
  'bg-teal-500': '#14b8a6',
  'bg-indigo-500': '#6366f1',
  'bg-orange-500': '#f97316',
  'bg-fuchsia-500': '#d946ef',
  'bg-lime-600': '#65a30d',
  'bg-gray-400': '#9ca3af',
}

interface LineStyle {
  stroke: string
  width: number
  /** 破線・点線パターン(実線は undefined) */
  dash?: string
  round?: boolean
}

/** 移動手段ごとの線種。鉄道=実線 / 飛行機=破線 / バス=点線 / 夜行=暗色の実線 */
const lineStyleByMode: Record<TravelMode, LineStyle> = {
  train: { stroke: '#475569', width: 2 },
  flight: { stroke: '#0891b2', width: 2, dash: '8 5' },
  bus: { stroke: '#64748b', width: 2, dash: '0.1 5', round: true },
  nightTrain: { stroke: '#312e81', width: 2.5 },
}

/** leg が解決できていない区間(カタログ外など)の線 */
const unknownLineStyle: LineStyle = {
  stroke: '#cbd5e1',
  width: 2,
  dash: '4 4',
}

const legendModes: Array<TravelMode> = ['train', 'flight', 'bus', 'nightTrain']

function lineStyleOf(mode: TravelMode | null): LineStyle {
  return mode ? lineStyleByMode[mode] : unknownLineStyle
}

function cityHex(color: CityColor | undefined): string {
  return cityHexByDotClass[(color ?? fallbackCityColor).dot] ?? '#9ca3af'
}

/** 進行方向の矢じり。線の途中に置くので、短すぎる線には載せない */
function arrowPoints(segment: RouteSegment, t: number): string {
  const length = segmentLength(segment)
  const tip = pointAlong(segment, t)
  const dx = (segment.to.x - segment.from.x) / length
  const dy = (segment.to.y - segment.from.y) / length
  const back = 9
  const half = 3.6
  const bx = tip.x - dx * back
  const by = tip.y - dy * back
  return [
    `${tip.x},${tip.y}`,
    `${bx - dy * half},${by + dx * half}`,
    `${bx + dy * half},${by - dx * half}`,
  ].join(' ')
}

/** ラベルが枠外にはみ出さないように、端の都市だけ寄せる向きを変える */
function labelAnchor(x: number): {
  anchor: 'start' | 'middle' | 'end'
  x: number
} {
  if (x < 72) return { anchor: 'start', x: x - 8 }
  if (x > MAP_WIDTH - 72) return { anchor: 'end', x: x + 8 }
  return { anchor: 'middle', x }
}

interface RouteMapProps {
  state: TripState
  derived: DerivedTrip
  colors: Map<string, CityColor>
}

/**
 * 訪問順の動線を薄い点群のうえに描く簡易マップ。
 * 外部の地図タイルは読まず、カタログ都市の緯度経度だけで
 * 「行ったり来たりしていないか」を目で確かめられる程度の粒度にとどめる。
 */
export function RouteMap({ state, derived, colors }: RouteMapProps) {
  const { segments, nodes } = useMemo(() => {
    const legByFromStayId = new Map(
      derived.legs.map((leg) => [leg.fromStayId, leg]),
    )
    // 同一都市が隣接すると leg が無い。その場合の手段は null のまま渡す
    const stops: Array<RouteStop> = state.stays.map((stay) => ({
      cityId: stay.cityId,
      mode: legByFromStayId.get(stay.id)?.chosen.mode ?? null,
    }))
    return {
      segments: buildRouteSegments(stops, catalogPoints),
      nodes: buildRouteNodes(stops, catalogPoints),
    }
  }, [state.stays, derived.legs])

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <MapIcon size={18} className="text-cyan-600" />
        ルートマップ
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        訪問順に線でつないだ動線です。位置は緯度経度の概算なので、実際の線路や航路ではありません。
      </p>

      {state.stays.length < 2 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          滞在を2件以上追加すると、訪問順の動線がここに出ます。
        </p>
      ) : (
        <>
          <div className="mt-4">
            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              className="mx-auto block h-auto w-full max-w-[440px]"
              role="img"
              aria-label={`訪問順のルートマップ: ${nodes
                .map((node) => cityName(node.cityId))
                .join(' → ')}`}
            >
              <rect
                x="0.5"
                y="0.5"
                width={MAP_WIDTH - 1}
                height={MAP_HEIGHT - 1}
                rx="16"
                fill="#f8fafc"
                stroke="#e5e7eb"
              />

              {/* カタログ全都市。点群そのものがヨーロッパの形の手がかりになる */}
              <g>
                {cityCatalog.map((city) => {
                  const point = catalogPoints.get(city.id)
                  if (!point) return null
                  return (
                    <circle
                      key={city.id}
                      cx={point.x}
                      cy={point.y}
                      r="2.4"
                      fill="#cbd5e1"
                    >
                      <title>{city.name}</title>
                    </circle>
                  )
                })}
              </g>

              {/* 動線 */}
              <g>
                {segments.map((segment) => {
                  const style = lineStyleOf(segment.mode)
                  const overnight = segment.mode === 'nightTrain'
                  const length = segmentLength(segment)
                  const mid = segmentMidpoint(segment)
                  // 夜行は中点に月を置くので、矢印は重ならない位置までずらす
                  const arrowT = overnight ? 0.76 : 0.56
                  const title = `${cityName(segment.fromCityId)} → ${cityName(
                    segment.toCityId,
                  )}${segment.mode ? ` / ${travelModeLabel[segment.mode]}` : ''}`
                  return (
                    <g key={segment.key}>
                      <title>{title}</title>
                      <line
                        x1={segment.from.x}
                        y1={segment.from.y}
                        x2={segment.to.x}
                        y2={segment.to.y}
                        stroke={style.stroke}
                        strokeWidth={style.width}
                        strokeDasharray={style.dash}
                        strokeLinecap={style.round ? 'round' : 'butt'}
                      />
                      {length > (overnight ? 52 : 30) ? (
                        <polygon
                          points={arrowPoints(segment, arrowT)}
                          fill={style.stroke}
                        />
                      ) : null}
                      {overnight ? <MoonBadge cx={mid.x} cy={mid.y} /> : null}
                    </g>
                  )
                })}
              </g>

              {/* 訪問都市: 都市色の丸 + 訪問順の番号 + 都市名 */}
              <g>
                {nodes.map((node) => {
                  const fill = cityHex(colors.get(node.cityId))
                  const badge = node.orders.join('/')
                  const wide = badge.length > 1
                  const badgeWidth = wide ? 12 + badge.length * 5 : 18
                  const label = labelAnchor(node.point.x)
                  const below = node.point.y < MAP_HEIGHT - 46
                  return (
                    <g key={node.cityId}>
                      <title>
                        {`${cityName(node.cityId)}(${node.orders.join('・')}番目)`}
                      </title>
                      {wide ? (
                        <rect
                          x={node.point.x - badgeWidth / 2}
                          y={node.point.y - 9}
                          width={badgeWidth}
                          height="18"
                          rx="9"
                          fill={fill}
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                      ) : (
                        <circle
                          cx={node.point.x}
                          cy={node.point.y}
                          r="9"
                          fill={fill}
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                      )}
                      <text
                        x={node.point.x}
                        y={node.point.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="10"
                        fontWeight="700"
                        fill="#ffffff"
                      >
                        {badge}
                      </text>
                      <text
                        x={label.x}
                        y={node.point.y + (below ? 22 : -15)}
                        textAnchor={label.anchor}
                        fontSize="11"
                        fontWeight="600"
                        fill="#334155"
                        stroke="#f8fafc"
                        strokeWidth="3"
                        paintOrder="stroke"
                      >
                        {cityName(node.cityId)}
                      </text>
                    </g>
                  )
                })}
              </g>
            </svg>
          </div>

          <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-gray-500">
            {legendModes.map((mode) => {
              const style = lineStyleByMode[mode]
              return (
                <li key={mode} className="flex items-center gap-1.5">
                  <svg width="28" height="14" aria-hidden="true">
                    <line
                      x1="1"
                      y1="7"
                      x2="27"
                      y2="7"
                      stroke={style.stroke}
                      strokeWidth={style.width}
                      strokeDasharray={style.dash}
                      strokeLinecap={style.round ? 'round' : 'butt'}
                    />
                    {mode === 'nightTrain' ? (
                      <MoonBadge cx={14} cy={7} r={6} />
                    ) : null}
                  </svg>
                  {travelModeLabel[mode]}
                </li>
              )
            })}
            <li className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />
              候補都市
            </li>
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * 夜行区間の目印。線の中点と凡例で使う。
 * 月の形はサイト内で見慣れた lucide の Moon と同じパスをそのまま置く。
 */
function MoonBadge({ cx, cy, r = 8 }: { cx: number; cy: number; r?: number }) {
  const glyph = r * 1.5
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={lineStyleByMode.nightTrain.stroke}
        stroke="#ffffff"
        strokeWidth={r / 5.3}
      />
      <g
        transform={`translate(${cx - glyph / 2}, ${cy - glyph / 2}) scale(${glyph / 24})`}
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill="#ffffff" />
      </g>
    </g>
  )
}
