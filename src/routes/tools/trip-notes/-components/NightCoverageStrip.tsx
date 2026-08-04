/**
 * 「寝る場所カバレッジ」帯。Atlassian Statuspage の稼働率バーと同じ構造で、
 * 1セル = 1泊を横一列に並べる。読み取り専用(編集は日程タブへ誘導するだけ)。
 *
 * 色だけに頼らない設計にしている:
 * - 未確保は模様(斜めストライプ)+ アイコン + リングの3重で示す。
 *   色覚特性や白黒印刷、点滅ができない(前庭障害への配慮で点滅は使わない)環境でも
 *   「ここが危ない」が伝わるようにするため。
 * - 宿泊の確定/仮は塗りつぶし/破線という「形」の違いでも区別する。
 */

import { AlertTriangle, CheckCircle2, CircleDashed, Moon } from 'lucide-react'
import { formatDateJa } from '../../../../lib/trip-notes/datetime'
import { countTentativeNights } from '../../../../lib/trip-notes/nights'
import type { CSSProperties } from 'react'
import type { Booking, NightSlot } from '../../../../lib/trip-notes/types'

interface NightCoverageStripProps {
  nights: Array<NightSlot>
  /** NightSlot.bookingId から予約の status を引くために使う */
  bookings: Array<Booking>
  /** セルをクリックしたとき。親が日程タブの該当日へスクロールする */
  onSelectDate: (date: string) => void
}

/** セルの見た目を決める4状態。宿泊の確定/仮は bookings から status を引いて判定する */
type CellState =
  | { kind: 'confirmed'; booking: Booking | undefined }
  | { kind: 'tentative'; booking: Booking | undefined }
  | { kind: 'overnight'; booking: Booking | undefined }
  | { kind: 'uncovered' }

/** 週の切れ目を超えて数十泊あっても破綻しないよう、7泊ずつに割る */
const WEEK_LENGTH = 7
/** これを超えたら横スクロール + 週グルーピングへ切り替える */
const WEEK_MODE_THRESHOLD = 14

function resolveCellState(
  night: NightSlot,
  bookingMap: Map<string, Booking>,
): CellState {
  const booking =
    night.bookingId === undefined ? undefined : bookingMap.get(night.bookingId)

  if (night.covered === 'lodging') {
    // status が読めない(予約が見つからない)ときは、確定済みと誤表示するより
    // 仮押さえ側に倒すほうが安全
    return booking?.status === 'confirmed'
      ? { kind: 'confirmed', booking }
      : { kind: 'tentative', booking }
  }
  if (night.covered === 'overnight') {
    return { kind: 'overnight', booking }
  }
  return { kind: 'uncovered' }
}

function cellLabel(state: CellState): string {
  if (state.kind === 'uncovered') return '未確保'
  return state.booking?.title || state.booking?.place?.name || ''
}

/** スクリーンリーダー・キーボード操作でも状態が伝わるよう、必ず状態を含める */
function cellAriaLabel(night: NightSlot, state: CellState): string {
  const datePart = formatDateJa(night.date)
  const label = cellLabel(state)
  switch (state.kind) {
    case 'uncovered':
      return `${datePart} 未確保`
    case 'confirmed':
      return `${datePart} 宿泊確定${label === '' ? '' : `: ${label}`}`
    case 'tentative':
      return `${datePart} 宿泊仮${label === '' ? '' : `: ${label}`}`
    case 'overnight':
      return `${datePart} 夜行移動${label === '' ? '' : `: ${label}`}`
  }
}

/** 斜めストライプ模様。色を変えるだけで「夜行」と「未確保」を作り分ける */
function diagonalStripe(colorA: string, colorB: string): CSSProperties {
  return {
    backgroundImage: `repeating-linear-gradient(135deg, ${colorA} 0px, ${colorA} 6px, ${colorB} 6px, ${colorB} 12px)`,
  }
}

const OVERNIGHT_STRIPE = diagonalStripe(
  'rgba(255,255,255,0)',
  'rgba(255,255,255,0.35)',
)
// 未確保は「ハザードテープ」に寄せた強めのコントラストにして、遠目でも危険度が伝わるようにする
const UNCOVERED_STRIPE = diagonalStripe(
  'rgba(255,255,255,0.55)',
  'rgba(159,18,57,0.85)',
)

function cellButtonClass(state: CellState, snapStart: boolean): string {
  const base = `flex h-14 items-center justify-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${
    snapStart ? 'snap-start' : ''
  }`
  switch (state.kind) {
    case 'confirmed':
      return `${base} border-l border-white/60 bg-emerald-500 first:border-l-0`
    case 'tentative':
      // 破線の太い枠自体が「まだ仮」の合図であり、隣セルとの区切りも兼ねる
      return `${base} border-2 border-dashed border-amber-600 bg-amber-400`
    case 'overnight':
      return `${base} border-l border-white/60 bg-sky-400 first:border-l-0`
    case 'uncovered':
      return `${base} border-l border-white/60 bg-rose-500 ring-2 ring-inset ring-rose-700 first:border-l-0`
  }
}

function cellButtonStyle(state: CellState): CSSProperties | undefined {
  if (state.kind === 'overnight') return OVERNIGHT_STRIPE
  if (state.kind === 'uncovered') return UNCOVERED_STRIPE
  return undefined
}

/** 圧縮時にラベルを隠す度合い。未確保のラベルにはこの関数を使わない(常に残す) */
function labelVisibilityClass(visibility: 'always' | 'sm' | 'never'): string {
  if (visibility === 'always') return ''
  if (visibility === 'sm') return 'hidden sm:block'
  return 'hidden'
}

/**
 * 日付行・セル行・ラベル行の3段を同じ列数の grid で重ねて描画する。
 * 週モードでは週ごとに呼び出して、幅の違う最終週(7泊未満)も列がずれないようにする。
 */
function NightRow({
  nights,
  bookingMap,
  labelVisibility,
  snapCells,
  onSelectDate,
}: {
  nights: Array<NightSlot>
  bookingMap: Map<string, Booking>
  labelVisibility: 'always' | 'sm' | 'never'
  snapCells: boolean
  onSelectDate: (date: string) => void
}) {
  const cells = nights.map((night) => ({
    night,
    state: resolveCellState(night, bookingMap),
  }))
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${nights.length}, minmax(0, 1fr))`,
  }
  const hiddenClass = labelVisibilityClass(labelVisibility)

  return (
    <div>
      <div className="grid" style={gridStyle}>
        {cells.map(({ night }) => (
          <span
            key={night.date}
            className={`truncate px-0.5 text-center text-[11px] text-gray-500 ${hiddenClass}`}
          >
            {formatDateJa(night.date)}
          </span>
        ))}
      </div>

      <div
        className="grid overflow-hidden rounded-lg ring-1 ring-black/5"
        style={gridStyle}
      >
        {cells.map(({ night, state }) => (
          <button
            key={night.date}
            type="button"
            onClick={() => onSelectDate(night.date)}
            aria-label={cellAriaLabel(night, state)}
            className={cellButtonClass(state, snapCells)}
            style={cellButtonStyle(state)}
          >
            {state.kind === 'overnight' ? (
              <Moon size={14} className="text-white" aria-hidden="true" />
            ) : null}
            {state.kind === 'uncovered' ? (
              <AlertTriangle
                size={16}
                className="text-white"
                aria-hidden="true"
              />
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid" style={gridStyle}>
        {cells.map(({ night, state }) => {
          const uncovered = state.kind === 'uncovered'
          return (
            <span
              key={night.date}
              className={`truncate px-0.5 text-center text-[10px] ${
                uncovered
                  ? 'font-medium text-rose-700'
                  : `text-gray-500 ${hiddenClass}`
              }`}
            >
              {cellLabel(state)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function chunkIntoWeeks(nights: Array<NightSlot>): Array<Array<NightSlot>> {
  const weeks: Array<Array<NightSlot>> = []
  for (let i = 0; i < nights.length; i += WEEK_LENGTH) {
    weeks.push(nights.slice(i, i + WEEK_LENGTH))
  }
  return weeks
}

export function NightCoverageStrip({
  nights,
  bookings,
  onSelectDate,
}: NightCoverageStripProps) {
  const bookingMap = new Map(bookings.map((b) => [b.id, b]))
  const uncoveredCount = nights.filter((n) => n.covered === null).length
  // 仮のままの夜の数え方は lib 側(nights.ts)と共有する。
  // セルの色は「何で寝るか(宿・夜行移動・無し)」を、ここの一言は
  // 「どれだけ確定しているか」を答えていて、問いが別なので数え直さない。
  // とくに夜行移動のセルは色としては空色のままだが、その便がまだ確定していなければ
  // ここでは仮に数える(取っていない夜行便は確保できた夜ではない)
  const tentativeCount = countTentativeNights(nights, bookings)
  const isEmpty = nights.length === 0
  const allCovered = !isEmpty && uncoveredCount === 0
  // 「確保できています」と言い切ってよいのは、全泊が確定しているときだけ
  const allConfirmed = allCovered && tentativeCount === 0
  const weekMode = nights.length > WEEK_MODE_THRESHOLD

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-gray-800">
          寝る場所カバレッジ
        </h3>
        {isEmpty ? null : allConfirmed ? (
          <p className="flex items-center gap-1 text-sm font-medium text-emerald-700">
            <CheckCircle2 size={15} aria-hidden="true" />
            {nights.length}泊すべて寝る場所が確保できています
          </p>
        ) : allCovered ? (
          <p className="flex items-center gap-1 text-sm font-medium text-amber-700">
            <CircleDashed size={15} aria-hidden="true" />
            {nights.length}泊中 {nights.length - tentativeCount}泊が確定、
            {tentativeCount}泊は仮
          </p>
        ) : (
          <p className="flex items-center gap-1 text-sm font-medium text-rose-700">
            <AlertTriangle size={15} aria-hidden="true" />
            {nights.length}泊中 {uncoveredCount}泊が未確保
          </p>
        )}
      </div>

      {isEmpty ? (
        <p className="text-sm text-gray-500">旅行期間を設定してください</p>
      ) : weekMode ? (
        <div className="overflow-x-auto pb-1">
          <div className="flex snap-x gap-4">
            {chunkIntoWeeks(nights).map((week, index) => (
              <div
                key={week[0]?.date ?? index}
                className={`w-64 shrink-0 ${
                  index > 0 ? 'border-l border-gray-200 pl-4' : ''
                }`}
              >
                <p className="mb-1 truncate text-[11px] font-medium text-gray-500">
                  {formatDateJa(week[0].date)}〜
                  {formatDateJa(week[week.length - 1].date)}
                </p>
                <NightRow
                  nights={week}
                  bookingMap={bookingMap}
                  labelVisibility="never"
                  snapCells
                  onSelectDate={onSelectDate}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <NightRow
          nights={nights}
          bookingMap={bookingMap}
          labelVisibility={nights.length > 7 ? 'sm' : 'always'}
          snapCells={false}
          onSelectDate={onSelectDate}
        />
      )}

      {isEmpty ? null : (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
            宿泊確定
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border-2 border-dashed border-amber-600 bg-amber-400" />
            宿泊仮
          </li>
          <li className="flex items-center gap-1.5">
            <Moon size={12} className="text-sky-500" aria-hidden="true" />
            夜行移動
          </li>
          <li className="flex items-center gap-1.5">
            <AlertTriangle
              size={12}
              className="text-rose-600"
              aria-hidden="true"
            />
            未確保
          </li>
        </ul>
      )}
    </div>
  )
}
