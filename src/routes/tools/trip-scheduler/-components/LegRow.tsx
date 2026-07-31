import { useState } from 'react'
import {
  Bus,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Moon,
  Plane,
  TrainFront,
} from 'lucide-react'
import {
  formatMinutes,
  travelModeLabel,
} from '../../../../lib/trip-scheduler/travel'
import { cityName, getCity } from '../../../../lib/trip-scheduler/cities'
import { addDays } from '../../../../lib/trip-scheduler/dates'
import {
  dbTimetableUrl,
  googleFlightsUrl,
  googleMapsTransitUrl,
  kayakUrl,
  rome2rioUrl,
  skyscannerUrl,
} from '../../../../lib/trip-scheduler/travelLinks'
import { formatDays } from '../-lib/format'
import { DateLabel } from './DateLabel'
import type { ComponentType } from 'react'
import type { TripDispatch } from '../-lib/reducer'
import type {
  ResolvedLeg,
  TravelMode,
  TravelOption,
} from '../../../../lib/trip-scheduler/types'

const modeIcons: Record<TravelMode, ComponentType<{ size?: number }>> = {
  train: TrainFront,
  flight: Plane,
  bus: Bus,
  nightTrain: Moon,
}

function costLabel(option: TravelOption): string {
  if (option.nightCost > 0) {
    return `日中は消費しない / 泊を${option.nightCost}泊消費`
  }
  return `観光時間を ${formatDays(option.dayCost)}日ぶん消費`
}

const externalLinkClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500'

/** リンク群の小見出し(何を基準に探すリンクなのかを一言で) */
const linkGroupLabelClass = 'text-[11px] leading-relaxed text-gray-500'

interface LegRowProps {
  leg: ResolvedLeg
  /** ヨーロッパ到着日。移動日 (leg.dayIndex) から実際の日付を出すのに使う */
  startDate: string
  dispatch: TripDispatch
  /**
   * 滞在をドラッグしている間は畳む。行の高さを一定にすることで
   * 並べ替え中の当たり判定とプレビューのずれを抑える。
   */
  collapsed?: boolean
}

/**
 * 滞在と滞在のあいだの「見えないコスト」。
 * door-to-door 時間に応じた面積で見せ、クリックで手段を選び直せる。
 * 手段を決めたあとは、そのまま外部の検索サイトへ区間・日付つきで飛べる。
 */
export function LegRow({
  leg,
  startDate,
  dispatch,
  collapsed = false,
}: LegRowProps) {
  const [open, setOpen] = useState(false)
  const ChosenIcon = modeIcons[leg.chosen.mode]
  const overnight = leg.chosen.nightCost > 0

  const fromCity = getCity(leg.fromCityId)
  const toCity = getCity(leg.toCityId)
  const travelDate = addDays(startDate, leg.dayIndex)

  // 空路3サイトは「両端に空港があり、日付が正しい」ときだけ URL を作れる(= 揃って出る/揃って消える)。
  const skyscannerHref =
    fromCity && toCity ? skyscannerUrl(fromCity, toCity, travelDate) : null
  const googleFlightsHref =
    fromCity && toCity ? googleFlightsUrl(fromCity, toCity, travelDate) : null
  const kayakHref =
    fromCity && toCity ? kayakUrl(fromCity, toCity, travelDate) : null
  const hasFlightLinks = Boolean(
    skyscannerHref || googleFlightsHref || kayakHref,
  )

  // 鉄道は DB(ドイツ鉄道)国際版が日付つきで開ける。
  // 鉄道候補が出ない区間(海越えなど)では出しても意味がないので隠す。
  const hasRailOption = leg.options.some(
    (option) => option.mode === 'train' || option.mode === 'nightTrain',
  )
  const dbHref =
    fromCity && toCity && hasRailOption
      ? dbTimetableUrl(
          fromCity,
          toCity,
          travelDate,
          // 夜行は夕方以降の発を見たいので開始時刻をずらす
          overnight ? '18:00' : '09:00',
        )
      : null

  const hasDatedLinks = hasFlightLinks || Boolean(dbHref)

  // ドラッグ中は開いていた手段選びも畳む。全ての移動行の高さが揃うので、
  // 並べ替え時の「1つぶん動かす距離」の計算がずれない。
  const expanded = open && !collapsed

  return (
    <li
      className={`relative pl-4 ${
        collapsed ? 'pointer-events-none opacity-40' : ''
      }`}
      aria-hidden={collapsed || undefined}
    >
      <div className="absolute left-[7px] top-0 h-full w-px bg-gray-200" />
      <div
        className={`ml-4 rounded-xl border px-3 py-2 ${
          overnight
            ? 'border-indigo-200 bg-indigo-50/60'
            : 'border-gray-200 bg-gray-50'
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
          aria-expanded={expanded}
        >
          {/* 何曜日に移動するか(週末の混雑・月曜の休館日を避ける判断材料) */}
          <span className="text-xs text-gray-500">
            <DateLabel iso={travelDate} />
            {overnight ? ' 夜発' : ' 移動'}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
              overnight ? 'text-indigo-700' : 'text-gray-700'
            }`}
          >
            <ChosenIcon size={16} />
            {travelModeLabel[leg.chosen.mode]}
          </span>
          <span className="text-sm tabular-nums text-gray-600">
            {formatMinutes(leg.chosen.doorToDoorMinutes)}
          </span>
          <span className="text-xs text-gray-500">{costLabel(leg.chosen)}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-cyan-700">
            手段を変える
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {/* 移動が食う時間を面積で見せる(夜行は日中を食わないので幅ゼロ) */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
          <div
            className={
              overnight
                ? 'h-full bg-indigo-400'
                : 'h-full bg-[repeating-linear-gradient(45deg,#9ca3af_0px,#9ca3af_4px,#e5e7eb_4px,#e5e7eb_8px)]'
            }
            style={{
              width: overnight ? '100%' : `${leg.chosen.dayCost * 100}%`,
            }}
          />
        </div>

        {expanded ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-500">
              {cityName(leg.fromCityId)} → {cityName(leg.toCityId)} の移動手段
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {leg.options.map((option) => {
                const Icon = modeIcons[option.mode]
                const selected = option.mode === leg.chosen.mode
                return (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: 'setLegMode',
                        fromCityId: leg.fromCityId,
                        toCityId: leg.toCityId,
                        mode: option.mode,
                      })
                    }
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      selected
                        ? 'border-cyan-500 bg-cyan-50 ring-1 ring-cyan-300'
                        : 'border-gray-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/40'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-medium text-gray-800">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon size={15} />
                        {travelModeLabel[option.mode]}
                      </span>
                      <span className="tabular-nums text-gray-600">
                        {formatMinutes(option.doorToDoorMinutes)}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-gray-500">
                      {costLabel(option)}
                    </span>
                    {option.nightCost > 0 ? (
                      <span className="mt-1 block text-xs leading-relaxed text-indigo-700">
                        宿1泊分が列車泊になり、翌朝から丸1日使えます(そのぶん総泊数から1泊消費)
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {fromCity && toCity ? (
              <div className="border-t border-gray-200 pt-3">
                <p className="text-xs font-medium text-gray-600">
                  この区間を実際に探す
                </p>
                {hasDatedLinks ? (
                  <div className="mt-2">
                    <p className={linkGroupLabelClass}>
                      移動日(
                      <DateLabel iso={travelDate} />
                      )で探す
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {dbHref ? (
                        <a
                          href={dbHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={externalLinkClass}
                          title="DB(ドイツ鉄道)の欧州時刻検索。区間と移動日が入った状態で開くので、あとは検索ボタンを押すだけです"
                        >
                          <ExternalLink size={12} className="shrink-0" />
                          DB 欧州時刻表(鉄道)
                        </a>
                      ) : null}
                      {skyscannerHref ? (
                        <a
                          href={skyscannerHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={externalLinkClass}
                        >
                          <ExternalLink size={12} className="shrink-0" />
                          Skyscanner(空路)
                        </a>
                      ) : null}
                      {googleFlightsHref ? (
                        <a
                          href={googleFlightsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={externalLinkClass}
                        >
                          <ExternalLink size={12} className="shrink-0" />
                          Google フライト(空路)
                        </a>
                      ) : null}
                      {kayakHref ? (
                        <a
                          href={kayakHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={externalLinkClass}
                        >
                          <ExternalLink size={12} className="shrink-0" />
                          Kayak(空路)
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3">
                  <p className={linkGroupLabelClass}>
                    区間を調べる(日付はサイト側で選択)
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <a
                      href={rome2rioUrl(fromCity, toCity)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={externalLinkClass}
                      title="Rome2Rio は URL での日付指定に対応していないため、開いた先で移動日を選んでください"
                    >
                      <ExternalLink size={12} className="shrink-0" />
                      Rome2Rio(全手段を比較)
                    </a>
                    <a
                      href={googleMapsTransitUrl(fromCity, toCity)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={externalLinkClass}
                      title="Google マップは URL での日付・時刻指定に対応していないため、時刻指定は開いた先で行ってください"
                    >
                      <ExternalLink size={12} className="shrink-0" />
                      Google マップ(乗換経路)
                    </a>
                  </div>
                </div>

                <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                  別タブで開きます。※検索サイトの結果は、ここで表示している目安の所要時間と異なることがあります。
                  {hasFlightLinks
                    ? ''
                    : `(${cityName(leg.fromCityId)}・${cityName(leg.toCityId)} のどちらかに空港がないため空路検索は省略)`}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}
