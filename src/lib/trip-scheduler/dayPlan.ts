import { addDays } from './dates'
import type { DerivedTrip, ResolvedLeg, StayWindow } from './types'

/**
 * 「1日 = 1マス」のカレンダー表現。
 *
 * derive の結果(泊ベースの滞在窓)を日ベースに展開するだけの純関数。
 * 曜日ストリップ(DayStrip)が主な利用者だが、日単位の見え方は
 * 将来の印刷ビューや共有画像でも使い回せるようにロジックだけを切り出す。
 */

export interface DayCell {
  /** 旅程開始からの日インデックス(startDate = 0) */
  dayIndex: number
  date: string
  /**
   * その日いる都市。
   * 昼行移動の日は [出発都市, 到着都市] の 2 つ、どの滞在にも属さない日は空。
   */
  cityIds: Array<string>
  /** その日に移動が発生する(昼行・夜行どちらも true) */
  travel: boolean
  /** その夜を移動そのもので過ごす(夜行列車・夜行バス) */
  overnight: boolean
}

type DayPlanSource = Pick<DerivedTrip, 'totalDays' | 'windows' | 'legs'>

/**
 * 旅程の全日を 1 日 1 セルに展開する。
 *
 * 到着日・出発日は「どちらの都市にもいる日」として両方を持たせる
 * (constraints の presenceOnDate と同じ緩い解釈に揃える)。
 */
export function buildDayPlan(
  startDate: string,
  derived: DayPlanSource,
): Array<DayCell> {
  const totalDays = Math.max(0, derived.totalDays)
  const cells: Array<DayCell> = []

  for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
    const legsToday = derived.legs.filter(
      (leg: ResolvedLeg) => leg.dayIndex === dayIndex,
    )
    cells.push({
      dayIndex,
      date: addDays(startDate, dayIndex),
      cityIds: derived.windows
        .filter(
          (w: StayWindow) => w.arriveDay <= dayIndex && dayIndex <= w.departDay,
        )
        .map((w) => w.cityId),
      travel: legsToday.length > 0,
      overnight: legsToday.some((leg) => leg.chosen.nightCost > 0),
    })
  }

  return cells
}
