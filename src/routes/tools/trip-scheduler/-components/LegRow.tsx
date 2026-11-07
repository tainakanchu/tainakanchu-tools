import { useId, useState } from 'react'
import { Radio } from '../../../../components/ui'
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
import type { TripDispatch } from '../-lib/reducer'
import type {
  ResolvedLeg,
  TravelOption,
} from '../../../../lib/trip-scheduler/types'

function costLabel(option: TravelOption): string {
  if (option.nightCost > 0) {
    return `日中は使わず、泊を${option.nightCost}泊ぶん使います`
  }
  return `観光時間を${formatDays(option.dayCost)}日ぶん使います`
}

const externalLinkClass = 'btn btn-secondary btn-sm'

/** リンク群の小見出し(何を基準に探すリンクなのかを一言で) */
const linkGroupLabelClass = 'text-xs leading-relaxed text-ink-muted'

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
  const radioName = useId()
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
      className={`py-2 pl-12 pr-2 text-sm ${
        collapsed ? 'pointer-events-none opacity-40' : ''
      }`}
      aria-hidden={collapsed || undefined}
    >
      <div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 rounded-ui text-left"
          aria-expanded={expanded}
        >
          {/* 何曜日に移動するか(週末の混雑・月曜の休館日を避ける判断材料) */}
          <span>
            <DateLabel iso={travelDate} className="text-ink-muted" />
            {overnight ? 'の夜に' : 'に'}
            <span className="font-bold">
              {travelModeLabel[leg.chosen.mode]}
            </span>
            で移動
          </span>
          <span className="tabular-nums">
            {formatMinutes(leg.chosen.doorToDoorMinutes)}
          </span>
          <span className="text-xs text-ink-muted">
            {costLabel(leg.chosen)}
          </span>
          <span className="ml-auto text-xs font-medium underline decoration-rule decoration-[1.5px] underline-offset-4">
            {expanded ? '手段選びを閉じる' : '手段を変える'}
          </span>
        </button>

        {/* 移動が食う時間を面積で見せる(夜行は日中を食わないので幅ゼロ) */}
        <div
          className="mt-2 h-2 w-full overflow-hidden border border-ink bg-paper"
          aria-hidden
        >
          <div
            className={
              overnight ? 'h-full bg-riso-purple' : 'h-full bg-riso-grey'
            }
            style={{
              width: overnight ? '100%' : `${leg.chosen.dayCost * 100}%`,
            }}
          />
        </div>

        {expanded ? (
          <div className="mt-3 space-y-2">
            <fieldset>
              <legend className="text-xs text-ink-muted">
                {cityName(leg.fromCityId)}から{cityName(leg.toCityId)}
                への移動手段
              </legend>
              <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {leg.options.map((option) => (
                  <Radio
                    key={option.mode}
                    name={radioName}
                    checked={option.mode === leg.chosen.mode}
                    onChange={() =>
                      dispatch({
                        type: 'setLegMode',
                        fromCityId: leg.fromCityId,
                        toCityId: leg.toCityId,
                        mode: option.mode,
                      })
                    }
                    label={
                      <>
                        <span className="font-bold">
                          {travelModeLabel[option.mode]}
                        </span>
                        <span className="ml-2 tabular-nums">
                          {formatMinutes(option.doorToDoorMinutes)}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {costLabel(option)}
                        </span>
                        {option.nightCost > 0 ? (
                          <span className="block text-xs leading-relaxed">
                            宿1泊分が列車泊になり、翌朝から丸1日使えます(そのぶん総泊数から1泊使います)
                          </span>
                        ) : null}
                      </>
                    }
                  />
                ))}
              </div>
            </fieldset>

            {fromCity && toCity ? (
              <div className="border-t border-rule pt-3">
                <p className="text-xs font-bold">
                  この区間を実際に探す(別サイト)
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
                      Rome2Rio(全手段を比較)
                    </a>
                    <a
                      href={googleMapsTransitUrl(fromCity, toCity)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={externalLinkClass}
                      title="Google マップは URL での日付・時刻指定に対応していないため、時刻指定は開いた先で行ってください"
                    >
                      Google マップ(乗換経路)
                    </a>
                  </div>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  別タブで開きます。検索サイトの結果は、ここで表示している目安の所要時間と異なることがあります。
                  {hasFlightLinks
                    ? ''
                    : `${cityName(leg.fromCityId)}か${cityName(leg.toCityId)}に空港がないので、空路の検索は出していません。`}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}
