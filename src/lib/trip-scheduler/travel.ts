import type { City, TravelMode, TravelOption } from './types'

/**
 * 都市間移動の概算。
 *
 * 方針:
 * - 主キーは door-to-door(宿→宿)。乗車時間ではなく、駅・空港アクセスや
 *   チェックイン待ちを含めた「日程から実際に消える時間」で比較する。
 * - 座標からの大圏距離ベースの目安であり、実際の時刻表は反映しない。
 */

const EARTH_RADIUS_KM = 6371

export function greatCircleKm(a: City, b: City): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** 1日の活動可能時間(分)。9:00〜20:00 を想定 */
export const ACTIVITY_MINUTES_PER_DAY = 660

/** door-to-door 時間から「その日の活動時間をどれだけ食うか」を 0.25 刻みで出す */
export function dayCostOf(doorToDoorMinutes: number): number {
  const raw = doorToDoorMinutes / ACTIVITY_MINUTES_PER_DAY
  const snapped = Math.round(raw * 4) / 4
  return Math.min(1, Math.max(0.25, snapped))
}

/** モードごとのオーバーヘッド(駅/空港アクセス + 待ち時間、分) */
const OVERHEAD: Record<TravelMode, number> = {
  train: 60,
  flight: 210,
  bus: 60,
  nightTrain: 60,
}

function makeOption(mode: TravelMode, inVehicleMinutes: number): TravelOption {
  const rounded = Math.round(inVehicleMinutes / 5) * 5
  const doorToDoor = rounded + OVERHEAD[mode]
  const overnight = mode === 'nightTrain'
  return {
    mode,
    inVehicleMinutes: rounded,
    doorToDoorMinutes: doorToDoor,
    dayCost: overnight ? 0 : dayCostOf(doorToDoor),
    nightCost: overnight ? 1 : 0,
  }
}

/**
 * 距離帯ごとに現実的な移動手段の候補を生成する。
 * 平均速度は欧州の実勢に寄せた粗い値(高速鉄道160km/h、在来線90km/h、
 * バス75km/h、飛行機700km/h)。
 */
export function estimateOptions(from: City, to: City): Array<TravelOption> {
  const km = greatCircleKm(from, to)
  const options: Array<TravelOption> = []

  if (km <= 1100) {
    const speed = km >= 200 ? 160 : 90
    options.push(makeOption('train', (km / speed) * 60 + 20))
  }
  if (km >= 300) {
    options.push(makeOption('flight', (km / 700) * 60 + 40))
  }
  if (km <= 700) {
    options.push(makeOption('bus', (km / 75) * 60 + 15))
  }
  if (km >= 400 && km <= 1500) {
    // 夜行列車: 所要は長いが日中を食わず、宿1泊分が移動に置き換わる
    options.push(makeOption('nightTrain', Math.max(600, (km / 90) * 60)))
  }

  // 保険: 距離帯の隙間で空にならないように(実際には起きない想定)
  if (options.length === 0) {
    options.push(makeOption('flight', (km / 700) * 60 + 40))
  }

  return options.sort((a, b) => a.doorToDoorMinutes - b.doorToDoorMinutes)
}

/** 推奨手段: 日中を食わない夜行は別枠とし、昼行の中で door-to-door 最短を選ぶ */
export function recommendedOption(options: Array<TravelOption>): TravelOption {
  const daytime = options.filter((o) => o.nightCost === 0)
  return daytime[0] ?? options[0]
}

export const travelModeLabel: Record<TravelMode, string> = {
  train: '鉄道',
  flight: '飛行機',
  bus: 'バス',
  nightTrain: '夜行列車',
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}分`
  if (m === 0) return `${h}時間`
  return `${h}時間${m}分`
}
