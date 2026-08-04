/**
 * 「今」タブ。旅行中にスマホで開く画面。
 *
 * カウンターや改札で慌てて開く場面を想定し、一画面一情報に振り切る。
 * - 進行中の予約(current)と、次に来る予約(next)だけを大きく表示する。
 * - 残りの upcoming は「このあとの予定」として下に小さく流す。
 * - 確認番号は画面幅いっぱいで見せ、タップでコピーできるようにする。
 *   カウンターで「これです」とスマホごと渡す運用を想定しているため。
 * - 表示タイムゾーンの手動固定トグルを最上部に置く。機内モードで
 *   デバイスの時計が出発地のまま止まっている事故を防ぐための安全弁なので、
 *   予約が0件のときやエラー状態でも必ず見える位置に置く。
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlarmClock,
  ArrowRightCircle,
  CalendarPlus,
  CalendarX2,
  ChevronDown,
  CircleDot,
  Clock,
  Copy,
  IdCard,
  ListChecks,
  MapPin,
  Timer,
} from 'lucide-react'
import { findCurrentAndNext } from '../../../../lib/trip-notes/derive'
import {
  COMMON_TIMEZONES,
  formatDualTime,
  formatStamp,
  stampToEpoch,
  tryParseStamp,
} from '../../../../lib/trip-notes/datetime'
import { isTransportKind } from '../../../../lib/trip-notes/nights'
import { copyText, formatCountdown, mapsUrl } from '../-lib/format'
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import { BOOKING_KIND_LABELS, KindIcon, TravelDocIcon } from './KindIcon'
import { BookingStatusBadge, PaymentStatusBadge } from './StatusBadge'
import type { TripNotesDispatch } from '../-lib/reducer'
import type {
  Booking,
  Place,
  Stamp,
  TravelDoc,
  TripNotesState,
} from '../../../../lib/trip-notes/types'

interface NowPanelProps {
  state: TripNotesState
  /** 現在の表示タイムゾーン(state.pinnedTz ?? getDeviceTz() を親が解決済み) */
  displayTz: string
  dispatch: TripNotesDispatch
  /** 「日程を見る」から日程タブへ移動する */
  onGoToSchedule: () => void
}

/** 現在時刻の更新間隔。カウントダウンは分単位表示なので秒単位で更新する意味がない */
const NOW_TICK_MS = 60_000

/**
 * 進行中の予約の「終了まで」を強調に切り替えるしきい値。
 *
 * 基準に置いているのはチェックアウト。10:00〜12:00 に集中していて、過ぎると
 * 延泊料金という実害が出るのに、朝起きて最初にこの画面を開いた時点で
 * 「今日はもう時間がない」と気付けなければ強調する意味がない。起床から
 * 荷造り・精算・チェックアウトまでの段取りに要る時間を見込むと、1 時間では
 * 荷造りを始める前に気付けず、逆に半日にすると前夜から強調が出っぱなしになって
 * 効かなくなる。その間を取って 2 時間にしている。
 *
 * 移動の「到着まで」にも同じ値を使う。降りる支度を始める頃合いとしても
 * 2 時間は妥当で、種別ごとに値を散らすほどの差が無いため。
 */
const ENDING_SOON_MS = 2 * 60 * 60 * 1000

// --- Stamp のフォーマットを落ちないようにするラッパー ---
// findCurrentAndNext は start が壊れている予約をそもそも除外するが、
// 保存データの破損や end 側の壊れは起こりうるので、表示側でも二重に防ぐ。

function safeFormatDualTime(stamp: Stamp, displayTz: string): string {
  return tryParseStamp(stamp) === null
    ? '時刻不明'
    : formatDualTime(stamp, displayTz)
}

function safeFormatStamp(
  stamp: Stamp,
  displayTz: string,
  opts: Parameters<typeof formatStamp>[2],
): string {
  return tryParseStamp(stamp) === null
    ? '時刻不明'
    : formatStamp(stamp, displayTz, opts)
}

function safeCountdown(stamp: Stamp, nowMs: number): string | null {
  return tryParseStamp(stamp) === null
    ? null
    : formatCountdown(stampToEpoch(stamp) - nowMs)
}

function tzLabel(tz: string): string {
  return COMMON_TIMEZONES.find((option) => option.tz === tz)?.label ?? tz
}

/** 選択肢に現在のタイムゾーンが無ければ先頭に足す。旅行先が一覧の対象外でも選べるようにする */
function tzOptions(currentTz: string) {
  if (COMMON_TIMEZONES.some((option) => option.tz === currentTz)) {
    return COMMON_TIMEZONES
  }
  return [
    { tz: currentTz, label: `現在のタイムゾーン (${currentTz})` },
    ...COMMON_TIMEZONES,
  ]
}

export function NowPanel({
  state,
  displayTz,
  dispatch,
  onGoToSchedule,
}: NowPanelProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const { current, next, upcoming } = useMemo(
    () => findCurrentAndNext(state.bookings, nowMs),
    [state.bookings, nowMs],
  )

  const hasAnyBooking = state.bookings.length > 0
  const hasNothingToShow = current.length === 0 && upcoming.length === 0
  // next は upcoming の先頭と同じものなので、下の一覧では重複させない
  const laterUpcoming = upcoming.slice(1)

  return (
    // 旅行中にスマホで開く一画面一情報の画面なので、main を広げても
    // ここだけは横に伸ばさず中央寄せの読みやすい幅に留める
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <TzControl state={state} displayTz={displayTz} dispatch={dispatch} />

      {!hasAnyBooking ? (
        <EmptyState onGoToSchedule={onGoToSchedule} />
      ) : hasNothingToShow ? (
        <OutOfRangeState onGoToSchedule={onGoToSchedule} />
      ) : (
        <>
          {current.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className={sectionTitleClass}>
                <CircleDot
                  size={16}
                  className="text-emerald-600"
                  aria-hidden="true"
                />
                今
              </h2>
              {current.map((booking) => (
                <BookingHero
                  key={booking.id}
                  booking={booking}
                  displayTz={displayTz}
                  variant="current"
                  nowMs={nowMs}
                />
              ))}
            </section>
          )}

          {next && (
            <section className="flex flex-col gap-3">
              <h2 className={sectionTitleClass}>
                <ArrowRightCircle
                  size={16}
                  className="text-cyan-600"
                  aria-hidden="true"
                />
                次の予定
              </h2>
              <BookingHero
                booking={next}
                displayTz={displayTz}
                variant="next"
                nowMs={nowMs}
              />
            </section>
          )}

          {laterUpcoming.length > 0 && (
            <UpcomingList bookings={laterUpcoming} displayTz={displayTz} />
          )}
        </>
      )}

      {/*
        手続きの控え(取得済みかつ参照番号があるものだけ)。予約の有無や
        現在地の判定と関係なく成り立つ情報なので、上の3分岐(空/期間外/
        表示あり)の外側、画面のいちばん下に固定で置く。分岐の内側にまで
        置こうとすると同じ呼び出しを3か所に書く羽目になり、後から欄を
        増やすときに1か所直し忘れる事故のもとになる。
        中で0件なら null を返すので、この位置に固定で置いても
        「予約がまだありません」の空状態の下に余計な空白が出ることはない
      */}
      <TravelDocRecap docs={state.travelDocs ?? []} />
    </div>
  )
}

// --- タイムゾーン固定トグル ---

function TzControl({
  state,
  displayTz,
  dispatch,
}: {
  state: TripNotesState
  displayTz: string
  dispatch: TripNotesDispatch
}) {
  const isPinned = state.pinnedTz !== null

  return (
    <div className={`${cardClass} border-cyan-300 bg-cyan-50/50`}>
      <div className={sectionTitleClass}>
        <Clock size={16} className="text-cyan-700" aria-hidden="true" />
        表示タイムゾーン
      </div>

      <div
        className="mt-2 flex overflow-hidden rounded-full border border-gray-300 bg-white text-sm"
        role="group"
        aria-label="タイムゾーンの決め方"
      >
        <button
          type="button"
          onClick={() => dispatch({ type: 'setPinnedTz', tz: null })}
          aria-pressed={!isPinned}
          className={`min-h-11 flex-1 px-3 py-2 font-medium transition ${
            !isPinned
              ? 'bg-cyan-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          デバイスの時計に従う
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'setPinnedTz', tz: state.pinnedTz ?? displayTz })
          }
          aria-pressed={isPinned}
          className={`min-h-11 flex-1 px-3 py-2 font-medium transition ${
            isPinned
              ? 'bg-cyan-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          タイムゾーンを固定する
        </button>
      </div>

      {/*
        機内モードでデバイスの時計が出発地のままでも気付けるように、
        「今どちらのモードで、実際のtz名が何か」を色に頼らず常に文字で出す。
      */}
      <p className="mt-2 text-xs text-gray-600">
        {isPinned ? '固定中: ' : 'デバイス依存: '}
        {tzLabel(displayTz)} ({displayTz})
      </p>

      {isPinned && (
        <div className="mt-2">
          <label
            htmlFor="now-panel-tz-select"
            className="text-xs font-medium text-gray-600"
          >
            固定するタイムゾーン
          </label>
          <select
            id="now-panel-tz-select"
            value={state.pinnedTz ?? displayTz}
            onChange={(event) =>
              dispatch({ type: 'setPinnedTz', tz: event.target.value })
            }
            className={`${fieldClass} mt-1`}
          >
            {tzOptions(state.pinnedTz ?? displayTz).map((option) => (
              <option key={option.tz} value={option.tz}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

// --- 予約カード(今/次で共通) ---

function BookingHero({
  booking,
  displayTz,
  variant,
  nowMs,
}: {
  booking: Booking
  displayTz: string
  variant: 'current' | 'next'
  /**
   * カウントダウン表示に使う。next は開始まで、current は終了までを出すので、
   * どちらの variant でも要る
   */
  nowMs: number
}) {
  const accent =
    variant === 'current'
      ? 'border-emerald-300 bg-emerald-50/40'
      : 'border-cyan-300 bg-cyan-50/40'

  return (
    <article className={`${cardClass} ${accent}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600">
          <KindIcon kind={booking.kind} size={18} />
          {BOOKING_KIND_LABELS[booking.kind]}
        </div>
        <div className="flex items-center gap-1.5">
          <BookingStatusBadge status={booking.status} size="sm" />
          <PaymentStatusBadge payment={booking.payment} size="sm" />
        </div>
      </div>

      <h3 className="mt-2 text-xl font-bold text-gray-900">{booking.title}</h3>

      {variant === 'next' && (
        <p
          className="mt-1 text-2xl font-extrabold text-cyan-700"
          aria-live="polite"
        >
          {safeCountdown(booking.start, nowMs) ?? '時刻不明'}
        </p>
      )}

      <p className="mt-1 text-lg font-semibold text-gray-800">
        {safeFormatDualTime(booking.start, displayTz)}
        {booking.end !== null && (
          <>
            <span className="mx-1.5 text-gray-400" aria-hidden="true">
              →
            </span>
            {safeFormatDualTime(booking.end, displayTz)}
          </>
        )}
      </p>

      {variant === 'current' && (
        <EndingCountdown booking={booking} nowMs={nowMs} />
      )}

      {booking.confirmationNumber && (
        <ConfirmationButton value={booking.confirmationNumber} />
      )}

      <PlacesBlock booking={booking} />

      {booking.note && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm break-words text-amber-900">
          {booking.note}
        </p>
      )}
    </article>
  )
}

/**
 * 進行中の予約が終わるまでの残り時間。
 *
 * カウントダウンは長らく「次」の開始時刻にしか無く、進行中のカードは
 * 15:00 → 11:00 と時刻を並べるだけだった。旅行中もっとも硬い締切である
 * チェックアウトが、画面のどこにもカウントダウンとして出ていなかったので足す。
 *
 * ただし「次」のカウントダウン(ラベル無しの mt-1 text-2xl font-extrabold
 * text-cyan-700 の大きな数字)と同じ強さで 2 つ並ぶと、どちらが開始で
 * どちらが終了なのか読み解けなくなる。4 点で描き分ける。
 * - 位置: 「次」は時刻の行の上。こちらは下に置く。
 *   「15:00 → 11:00」を読んでから「チェックアウトまで あと2時間」と読める順
 * - 形: 「次」は裸の数字。こちらは枠付きのインラインのチップにして、
 *   カード幅いっぱいに広がらないようにする
 * - 大きさ: 「次」の text-2xl より一段小さい text-base
 * - ラベル: 「次」はラベルを持たないが、こちらは必ずラベルを伴わせて、
 *   何までの残り時間なのかが単体で読めるようにする
 *
 * aria-live は付けない。NOW_TICK_MS が 60 秒なので、「次」とこちらの両方に
 * 付けると 1 分ごとに 2 か所が読み上げられ、どちらの数字なのか分からないまま
 * 音だけが増える。live region は内容が変わるたびに読み上げるものなので、
 * 「しきい値を跨いだ瞬間」という本当に意味のある変化だけを伝えることはできず、
 * 毎分の更新をすべて読み上げてしまう。割に合わないので live region は
 * 「次」の 1 つに留め、こちらはラベル込みの通常のテキスト
 * (「チェックアウトまで あと2時間」)にして、読みに行けば正しく読める形にする。
 *
 * 強調に rose を選んだのは、この「今」タブでは cyan が「次」のカウントダウンと
 * 操作、emerald が進行中のカード、amber が booking.note のブロック
 * (すぐ下に全幅で出る)に埋まっていて空いておらず、かつチェックアウト超過は
 * 実際にお金が出ていく事故なので、このコードベースで危険を表す rose が
 * 意味の上でも合うため。それでも色だけに頼らず、枠の太さ(border → border-2)、
 * アイコン(Timer → AlarmClock)、数字の太さ(font-bold → font-extrabold)も
 * 一緒に変えて、色が見えなくても差が分かるようにする。
 */
function EndingCountdown({
  booking,
  nowMs,
}: {
  booking: Booking
  nowMs: number
}) {
  const end = booking.end
  if (end === null) return null
  // 終日の終了は時刻を持たず、暦の上では現地 00:00 になる。そこへカウントダウンを
  // 出すと、実際の締切とずれた数字を自信たっぷりに見せることになるので、
  // 時刻が分からないものには残り時間を出さない
  if (end.allDay) return null

  // 壊れた Stamp では計算しない(safeCountdown と同じ扱い)。null で
  // なかった時点で stampToEpoch も投げないことが保証される
  const countdown = safeCountdown(end, nowMs)
  if (countdown === null) return null

  const label =
    booking.kind === 'lodging'
      ? 'チェックアウトまで'
      : isTransportKind(booking.kind)
        ? '到着まで'
        : '終了まで'

  // 境界は強調側に含める。ちょうど 2 時間を「まだ余裕がある」側に置く理由が無い
  const soon = stampToEpoch(end) - nowMs <= ENDING_SOON_MS
  const Icon = soon ? AlarmClock : Timer

  return (
    <p
      className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-base ${
        soon
          ? 'border-2 border-rose-400 bg-rose-50 text-rose-800'
          : 'border border-gray-300 bg-white text-gray-700'
      }`}
    >
      <Icon size={16} className="shrink-0" aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
      <span className={soon ? 'font-extrabold' : 'font-bold'}>{countdown}</span>
    </p>
  )
}

/**
 * 確認番号。カウンターや改札でスマホごと見せる主役なので、画面幅いっぱいの
 * 大きさで出し、タップでクリップボードにコピーできるようにする。
 */
function ConfirmationButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  // コピー成功の表示は2秒で自動的に消す。消し忘れた古いタイマーが
  // 次のコピーの表示を巻き戻さないよう、依存が変わるたびに張り直す。
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  const handleClick = () => {
    void copyText(value).then((ok) => {
      if (ok) setCopied(true)
    })
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleClick}
        aria-label={`確認番号 ${value} をタップしてコピー`}
        className="block w-full rounded-xl border-2 border-cyan-300 bg-white px-3 py-4 text-center font-mono text-4xl font-bold tracking-wider break-all text-gray-900 shadow-sm transition hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 sm:text-5xl"
      >
        {value}
      </button>
      <p
        className="mt-1 flex items-center justify-center gap-1 text-xs font-medium text-gray-500"
        role="status"
        aria-live="polite"
      >
        <Copy size={12} aria-hidden="true" />
        {copied ? 'コピーしました' : 'タップして確認番号をコピー'}
      </p>
    </div>
  )
}

/** 移動なら from/to、宿泊・アクティビティなら place。両方あるものはすべて出す */
function PlacesBlock({ booking }: { booking: Booking }) {
  const items: Array<{ label: string; place: Place }> = []
  if (booking.from) items.push({ label: '出発', place: booking.from })
  if (booking.to) items.push({ label: '到着', place: booking.to })
  if (booking.place) items.push({ label: '場所', place: booking.place })
  if (items.length === 0) return null

  return (
    <div className="mt-3 flex flex-col gap-2">
      {items.map((item) => (
        <PlaceCard key={item.label} label={item.label} place={item.place} />
      ))}
    </div>
  )
}

/**
 * 場所1件分。タクシー運転手に見せる用途を想定し、現地語表記(localName)を
 * いちばん大きく出す。ローマ字の name は補足として小さく添える。
 */
function PlaceCard({ label, place }: { label: string; place: Place }) {
  const hasLocalName =
    place.localName !== undefined && place.localName.length > 0
  const mapHref = mapsUrl({
    lat: place.lat,
    lng: place.lng,
    address: place.address,
    name: place.name,
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      {hasLocalName ? (
        <>
          <p className="text-2xl font-bold break-words text-gray-900">
            {place.localName}
          </p>
          <p className="text-sm text-gray-600">{place.name}</p>
        </>
      ) : (
        <p className="text-xl font-bold break-words text-gray-900">
          {place.name}
        </p>
      )}
      {place.address && (
        <p className="mt-1 text-base break-words text-gray-700">
          {place.address}
        </p>
      )}
      <a
        href={mapHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-cyan-300 px-3 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
      >
        <MapPin size={16} aria-hidden="true" />
        地図で開く
      </a>
    </div>
  )
}

// --- このあとの予定(小さく流す一覧) ---

function UpcomingList({
  bookings,
  displayTz,
}: {
  bookings: Array<Booking>
  displayTz: string
}) {
  return (
    <section>
      <h2 className={sectionTitleClass}>
        <ListChecks size={16} className="text-gray-500" aria-hidden="true" />
        このあとの予定
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {bookings.map((booking) => (
          <li key={booking.id} className={`${cardClass} p-3`}>
            <div className="flex items-center gap-2">
              <KindIcon
                kind={booking.kind}
                size={16}
                className="shrink-0 text-gray-500"
              />
              <span className="text-sm font-medium text-gray-500">
                {safeFormatStamp(booking.start, displayTz, {
                  withDate: true,
                  inDisplayTz: true,
                })}
              </span>
              <span className="ml-auto shrink-0">
                <BookingStatusBadge status={booking.status} size="sm" />
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-gray-900">
              {booking.title}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

// --- 手続きの控え ---

/**
 * 取得済み(status === 'done')かつ参照番号(referenceNumber)がある手続きだけを
 * 控えとして出す。入国審査の窓口やスマホの通信設定画面で、ビザ番号や eSIM の
 * ICCID がその場で要ることがあるためで、まだ取得していない・番号が無いものは
 * ここに出しても押したり見せたりする対象がないので載せない。
 *
 * 「今」タブの主役はあくまで今と次の予定なので、<details> で常時は畳んでおく。
 * ConfirmationButton(次の予定の確認番号)のような画面幅いっぱいの巨大表示には
 * しない。あちらは「カウンターでこれです、とスマホごと見せる」1点突破の主役だが、
 * こちらは複数件を並べて見比べる一覧性のほうが大事なので、小さくまとめる。
 */
function TravelDocRecap({ docs }: { docs: Array<TravelDoc> }) {
  const withReference = docs.filter(
    (doc) =>
      doc.status === 'done' &&
      doc.referenceNumber !== undefined &&
      doc.referenceNumber.length > 0,
  )
  if (withReference.length === 0) return null

  return (
    <details className={`${cardClass} group`}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-gray-700">
        <ChevronDown
          size={14}
          className="shrink-0 transition group-open:rotate-180"
          aria-hidden="true"
        />
        <IdCard
          size={16}
          className="shrink-0 text-gray-500"
          aria-hidden="true"
        />
        手続きの控え
        <span className="text-xs font-normal text-gray-400">
          {withReference.length}件
        </span>
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {withReference.map((doc) => (
          <li key={doc.id} className="rounded-lg border border-gray-200 p-2">
            <div className="flex items-center gap-1.5">
              <TravelDocIcon
                kind={doc.kind}
                size={14}
                className="shrink-0 text-gray-500"
              />
              <span className="text-sm font-medium text-gray-800">
                {doc.title}
                {doc.region !== undefined && doc.region.length > 0 ? (
                  <span className="ml-1 font-normal text-gray-500">
                    ({doc.region})
                  </span>
                ) : null}
              </span>
            </div>
            {/* 選択してコピーしやすいよう等幅にし、select-all で1タップの範囲選択を促す */}
            <p className="mt-0.5 font-mono text-sm text-gray-900 select-all">
              {doc.referenceNumber}
            </p>
            {doc.validFrom !== undefined || doc.validUntil !== undefined ? (
              <p className="mt-0.5 text-xs text-gray-500">
                有効期間: {doc.validFrom ?? '未定'} 〜{' '}
                {doc.validUntil ?? '未定'}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  )
}

// --- 空状態 ---

function EmptyState({ onGoToSchedule }: { onGoToSchedule: () => void }) {
  return (
    <div
      className={`${cardClass} flex flex-col items-center gap-3 py-10 text-center`}
    >
      <CalendarPlus size={32} className="text-gray-300" aria-hidden="true" />
      <p className="text-base font-semibold text-gray-700">
        予約がまだありません
      </p>
      <p className="text-sm text-gray-500">
        日程タブから予約を追加すると、ここに「今」と「次」が表示されます。
      </p>
      <button
        type="button"
        onClick={onGoToSchedule}
        className={primaryButtonClass}
      >
        日程タブで追加する
      </button>
    </div>
  )
}

function OutOfRangeState({ onGoToSchedule }: { onGoToSchedule: () => void }) {
  return (
    <div
      className={`${cardClass} flex flex-col items-center gap-3 py-10 text-center`}
    >
      <CalendarX2 size={32} className="text-gray-300" aria-hidden="true" />
      <p className="text-base font-semibold text-gray-700">
        表示できる予定がありません
      </p>
      <p className="text-sm text-gray-500">
        旅行の期間外か、すべての予定が終了しています。日程タブで確認してください。
      </p>
      <button
        type="button"
        onClick={onGoToSchedule}
        className={subtleButtonClass}
      >
        日程を見る
      </button>
    </div>
  )
}
