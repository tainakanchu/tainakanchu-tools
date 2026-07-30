/**
 * 旅程パズルのデータモデル。
 *
 * 設計原則:
 * - 内部の正規形は「泊 (night)」。日数・日付・実質観光日数はすべて導出値。
 * - `stays`(訪問順の滞在リスト)が単一の真実。夜の帰属や移動 leg は derive で計算する。
 * - 不変条件: Σ stay.nights + Σ 夜行移動 = totalNights
 */

export type TravelMode = 'train' | 'flight' | 'bus' | 'nightTrain'

/**
 * 陸続きの塊。海を越える区間に鉄道/バス候補を出さないための分類。
 * 'continental' = 欧州大陸本土(海底トンネル・橋で繋がる範囲を含む)
 */
export type Landmass =
  | 'continental'
  | 'britain'
  | 'ireland'
  | 'malta'
  | 'santorini'

export interface City {
  id: string
  name: string
  /** 英語名。外部の移動検索サイト(Rome2Rio / Google Maps)へのリンクに使う */
  enName: string
  country: string
  /** 主要空港の IATA コード。空港がない都市は null(= 空路検索リンクを出さない) */
  iata: string | null
  lat: number
  lng: number
  /** 属する陸塊。陸路(鉄道/バス/夜行)候補の可否判定に使う */
  landmass: Landmass
}

export interface Stay {
  id: string
  cityId: string
  nights: number
}

export type ConstraintSeverity = 'must' | 'want'

export type Constraint = {
  id: string
  enabled: boolean
  severity: ConstraintSeverity
} & (
  | {
      kind: 'stayNights'
      cityId: string
      min: number | null
      max: number | null
    }
  | { kind: 'presenceOnDate'; cityId: string; date: string }
  | { kind: 'order'; beforeCityId: string; afterCityId: string }
  | { kind: 'mustVisit'; cityId: string }
)

export type ConstraintKind = Constraint['kind']

/** 都市ペアのキー。訪問順を並べ替えても移動手段の選択が生き残るように leg は都市ペアで持つ */
export type LegKey = `${string}>${string}`

export interface TripState {
  schemaVersion: 1
  /** ヨーロッパ到着日 (YYYY-MM-DD) */
  startDate: string
  /** ヨーロッパ出発日 (YYYY-MM-DD) */
  endDate: string
  /** 航空券で確定している到着都市 */
  inCityId: string | null
  /** 航空券で確定している出発都市 */
  outCityId: string | null
  /** 行き先候補プール(まだ日程に入れていない都市) */
  poolCityIds: Array<string>
  /** 訪問順の滞在リスト(単一の真実) */
  stays: Array<Stay>
  /** 都市ペアごとの移動手段の選択(未選択なら推奨手段) */
  legModes: Record<string, TravelMode>
  constraints: Array<Constraint>
}

/** 移動手段の見積もり。door-to-door(宿→宿)を主キーにする */
export interface TravelOption {
  mode: TravelMode
  /** 宿→宿の実所要(分)。乗車時間 + 駅/空港アクセス + チェックイン等 */
  doorToDoorMinutes: number
  /** 乗車・搭乗そのものの時間(分) */
  inVehicleMinutes: number
  /** その日の活動時間をどれだけ食うか (0 / 0.5 / 1)。夜行は 0 */
  dayCost: number
  /** 泊を消費するか(夜行 = 1) */
  nightCost: number
}

/** 導出された leg(隣接する滞在間の移動) */
export interface ResolvedLeg {
  key: LegKey
  fromStayId: string
  toStayId: string
  fromCityId: string
  toCityId: string
  chosen: TravelOption
  options: Array<TravelOption>
  /** 移動が発生する日 (day index, 出発都市の最終日) */
  dayIndex: number
}

export interface StayWindow {
  stayId: string
  cityId: string
  nights: number
  /** 到着日 (day index: startDate = 0) */
  arriveDay: number
  /** 出発日 (day index) */
  departDay: number
  arriveDate: string
  departDate: string
  /** 移動で削られた分を引いた実質観光日数(小数) */
  effectiveDays: number
}

export interface Violation {
  /** 制約由来なら constraint の id。組み込みチェックは 'builtin:xxx' */
  constraintId: string
  severity: ConstraintSeverity
  message: string
  /** ハイライト対象の滞在 */
  stayIds: Array<string>
}

export interface DerivedTrip {
  totalNights: number
  totalDays: number
  /** 夜行移動が消費する泊数 */
  overnightLegNights: number
  assignedNights: number
  /** 未割り当て泊数(マイナス = 超過) */
  unassignedNights: number
  legs: Array<ResolvedLeg>
  windows: Array<StayWindow>
  violations: Array<Violation>
  metrics: TripMetrics
}

export interface TripMetrics {
  /** 移動回数(夜行含む) */
  legCount: number
  /** 荷造り回数 = 宿が変わる回数 */
  packingCount: number
  /** 総移動時間(door-to-door, 分) */
  totalTravelMinutes: number
  /** 実質観光日数の合計 */
  totalEffectiveDays: number
  /** 1泊しかしない都市の数(駆け足度) */
  oneNightStayCount: number
}
