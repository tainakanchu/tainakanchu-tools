/**
 * 「今」タブ。旅行中にスマホで開く画面。
 *
 * カウンターや改札で慌てて開く場面を想定し、一画面一情報に振り切る。
 * - 画面の主役は「次に来る時刻」ただ 1 つ。利用者が知りたいのは予約ではなく
 *   時刻なので、予約をマイルストーン(オンラインチェックイン開始・手荷物を
 *   預ける締切・搭乗手続きの締切・出発・到着・チェックイン開始・チェックアウト)
 *   に分解して近い順に並べ、いちばん近い 1 つだけを大きなカウントダウンで出す。
 *   導出の規則は milestones.ts にあり、この画面はその並びを描くだけにしてある。
 * - 大きなカウントダウンは画面にただ 1 つだけ置く。2 つ並ぶと、どちらが
 *   いま効いている数字なのか読み解く時間が要る。進行中の予約の「終了まで」は
 *   カード内の小さなチップに留める(EndingCountdown 参照)。
 * - 進行中の予約(current)と次の予約(next)はカードとして残す。時刻の主役は
 *   上のマイルストーンに移ったので、カードが担うのは確認番号・場所・メモという
 *   「その場で人に見せるもの」である。
 * - 確認番号は画面幅いっぱいで見せ、タップでコピーできるようにする。
 *   カウンターで「これです」とスマホごと渡す運用を想定しているため。
 * - 表示タイムゾーンの手動固定トグルを最上部に置く。機内モードで
 *   デバイスの時計が出発地のまま止まっている事故を防ぐための安全弁なので、
 *   予約が0件のときやエラー状態でも必ず見える位置に置く。
 *
 * 形の使い分け(この画面で強さを増やさないための取り決め):
 * - 青インクの枠で囲むのは「次に来る時刻」の先頭 1 件と、今・次の予約カードだけ。
 *   続きのマイルストーンや終日の予定は罫で区切った行にして、箱を積まない。
 * - ピンクの薄網＋ピンクの枠は「時間切れが近いこと」(締切間近・終了間近)だけ。
 *   締切系(手荷物・搭乗手続き)とそれ以外の区別には色を使わず、ラベルの太さで付ける。
 *   色を増やすほど「どれが危険なのか」が薄まるため。
 */

import { useEffect, useId, useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, X } from 'lucide-react'
import type { FormEvent } from 'react'
import {
  Badge,
  Panel,
  SegmentedControl,
  buttonClass,
} from '../../../../components/ui'
import { findCurrentAndNext } from '../../../../lib/trip-notes/derive'
import {
  DEADLINE_SOON_MS,
  MILESTONE_LABELS,
  deriveMilestones,
  isCheckInOpen,
  isDeadlineMilestone,
  isOnlineCheckInOpen,
} from '../../../../lib/trip-notes/milestones'
import {
  COMMON_TIMEZONES,
  formatDualTime,
  formatStamp,
  stampToEpoch,
  tryParseStamp,
} from '../../../../lib/trip-notes/datetime'
import { isTransportKind } from '../../../../lib/trip-notes/nights'
import { newId } from '../../../../lib/trip-notes/id'
import { estimateCurrentPlaces } from '../../../../lib/trip-notes/whereabouts'
import {
  sortWishesForDisplay,
  splitWishesForNow,
} from '../../../../lib/trip-notes/wishes'
import { copyText, formatCountdown, mapsUrl } from '../-lib/format'
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import { BOOKING_KIND_LABELS } from './KindIcon'
import { BookingStatusBadge, PaymentStatusBadge } from './StatusBadge'
import type { Milestone } from '../../../../lib/trip-notes/milestones'
import type { CurrentPlaceGuess } from '../../../../lib/trip-notes/whereabouts'
import type { TripNotesDispatch } from '../-lib/reducer'
import type {
  Booking,
  CountryInfo,
  Place,
  Stamp,
  TravelDoc,
  TripNotesState,
  Wish,
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

/**
 * 大きく出す 1 件のあとに続けるマイルストーンの件数。
 *
 * この一覧は「このあと何時に何があるか」の見通しであって、旅程の全量ではない。
 * 1 件の予約が最大 4 つの時刻(手荷物・搭乗手続き・出発・到着)に分かれるので、
 * 上限を置かないと 1 週間の旅程で数十行になり、下にある手続きの控えまで
 * スクロールしないと辿り着けなくなる。当日から翌日にかけての見通しに要る量として
 * 5 件で切り、あふれた分は日程タブへ送る(件数は必ず画面に出して、
 * 「これで全部だ」と誤解させない)。
 */
const MILESTONE_LIST_MAX = 5

/**
 * 締切が迫っているか。境界は強調側に含める(ENDING_SOON_MS と同じ流儀で、
 * ちょうど 45 分を「まだ余裕がある」側に置く理由が無い)。
 *
 * オンラインチェックインの開放時刻はこの強調の対象にならない。
 * isDeadlineMilestone が false を返すので自動的に外れるが、これは
 * 種類を足したときの書き忘れではなく意図した除外である。開放に乗り遅れて
 * 失うのは席の選択肢だけで、その便には乗れる。ピンクの強調は「いま列に並べ」
 * という 1 つの行動を促すためのもので、そこに「そのうちやればよいこと」を
 * 混ぜると、本当に危ない締切と見分けが付かなくなって強調そのものが効かなくなる
 * (milestones.ts の DEADLINE_KINDS も同じ理由で 2 つに絞ってある)。
 */
function isDeadlineSoon(milestone: Milestone, nowMs: number): boolean {
  return (
    isDeadlineMilestone(milestone.kind) &&
    milestone.atMs - nowMs <= DEADLINE_SOON_MS
  )
}

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

  const milestones = useMemo(
    () => deriveMilestones(state.bookings, nowMs),
    [state.bookings, nowMs],
  )

  // いまどの町にいるか。やりたいことの持ち上げと、クイック追加のプリセットの両方が使う
  const placeGuess = useMemo(
    () => estimateCurrentPlaces(state, nowMs),
    [state, nowMs],
  )

  const hasAnyBooking = state.bookings.length > 0
  const hasNothingToShow = current.length === 0 && upcoming.length === 0

  /*
    終日の予定はマイルストーンにならない(現地 00:00 へのカウントダウンは
    実際とずれた数字になるため。milestones.ts 参照)。時刻を持たないというだけで
    予定が「今」タブから消えてよいわけではないので、マイルストーンを 1 つも
    出せなかった予約だけを別の一覧で拾う。
    next はカードで大きく出しているので、ここでは重複させない。
  */
  const milestoneBookingIds = new Set(milestones.map((m) => m.bookingId))
  const timelessUpcoming = upcoming.filter(
    (booking) =>
      booking.id !== next?.id && !milestoneBookingIds.has(booking.id),
  )

  return (
    // 旅行中にスマホで開く一画面一情報の画面なので、主役の列（次に来る時刻・次の予定）は
    // 横に伸ばさず読みやすい幅に留める。広い画面では、予約と関係なく成り立つ控え
    // （やりたいこと・手続き・国の情報）を右の列に回し、右半分が空かないようにする。
    // スマホでは 1 列で、控えは主役のあとに続く
    <div className="grid w-full gap-x-12 gap-y-8 pb-8 lg:grid-cols-[minmax(0,48rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-8">
        <TzControl state={state} displayTz={displayTz} dispatch={dispatch} />

        {!hasAnyBooking ? (
          <EmptyState onGoToSchedule={onGoToSchedule} />
        ) : hasNothingToShow ? (
          <OutOfRangeState onGoToSchedule={onGoToSchedule} />
        ) : (
          <>
            {current.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className={sectionTitleClass}>今</h2>
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

            <MilestoneSection
              milestones={milestones}
              displayTz={displayTz}
              nowMs={nowMs}
              onGoToSchedule={onGoToSchedule}
            />

            {next && (
              <section className="flex flex-col gap-3">
                <h2 className={sectionTitleClass}>次の予定</h2>
                <BookingHero
                  booking={next}
                  displayTz={displayTz}
                  variant="next"
                  nowMs={nowMs}
                />
              </section>
            )}

            {timelessUpcoming.length > 0 && (
              <UpcomingList bookings={timelessUpcoming} displayTz={displayTz} />
            )}
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        {/*
        やりたいこと。予約の有無と関係なく成り立つので、上の3分岐の外側に置く
        (下の 2 つの控えと同じ理由)。控えより上にあるのは、こちらだけが
        「その場で押して状態が変わる」ものだからである。プラグ形状や参照番号は
        必要になったときに開けばよいが、やりたいことは歩きながら思い出して
        1 行足す道具なので、開く手間の手前に置く。
        マイルストーンのヒーローより下なのは変えない。この画面の主役は
        あくまで「次に来る時刻」で、そこは動かさない
      */}
        <WishSection
          wishes={state.wishes ?? []}
          guess={placeGuess}
          dispatch={dispatch}
        />
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
        {/*
        国・地域の情報も、手続きの控えとまったく同じ理由でここに置く
        (予約や現在地の判定と関係なく成り立つ参照用の情報)。
        手続きの控えの下にしたのは、印刷しおりの並び(旅行前の手続き →
        国・地域の情報 → 緊急連絡先)と揃えるため。同じ控えが画面と紙で違う順に
        出てくると、紙で見た順に画面を辿れなくなる
      */}
        <CountryInfoRecap countryInfos={state.countryInfos ?? []} />
      </div>
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
  const titleId = useId()
  const label = tzLabel(displayTz)
  const tzText = label === displayTz ? displayTz : `${label}（${displayTz}）`

  return (
    // 箱にはしない。この画面で囲むのは「次に来る時刻」の先頭と予約カードだけにして、
    // 設定の帯が主役より強く見えないようにする
    <section className="flex flex-col gap-2">
      <h2 id={titleId} className={sectionTitleClass}>
        表示タイムゾーン
      </h2>

      <SegmentedControl
        labelledBy={titleId}
        value={isPinned ? 'pinned' : 'device'}
        onChange={(mode) =>
          dispatch({
            type: 'setPinnedTz',
            tz: mode === 'device' ? null : (state.pinnedTz ?? displayTz),
          })
        }
        options={[
          { value: 'device', label: 'デバイスの時計に従う' },
          { value: 'pinned', label: 'タイムゾーンを固定する' },
        ]}
        className="self-start"
      />

      {/*
        機内モードでデバイスの時計が出発地のままでも気付けるように、
        「今どちらのモードで、実際のtz名が何か」を色に頼らず常に文字で出す。
      */}
      <p className="text-sm text-ink-muted">
        {isPinned
          ? `${tzText}に固定して表示しています`
          : `デバイスの時計どおり、${tzText}で表示しています`}
      </p>

      {isPinned && (
        <div className="field mt-1 max-w-sm">
          <label htmlFor="now-panel-tz-select" className="field-label">
            固定するタイムゾーン
          </label>
          <select
            id="now-panel-tz-select"
            value={state.pinnedTz ?? displayTz}
            onChange={(event) =>
              dispatch({ type: 'setPinnedTz', tz: event.target.value })
            }
            className={fieldClass}
          >
            {tzOptions(state.pinnedTz ?? displayTz).map((option) => (
              <option key={option.tz} value={option.tz}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  )
}

// --- 予約カード(今/次で共通) ---

/**
 * 進行中の予約と次の予約のカード。
 *
 * 開始までのカウントダウンはここには無い。「次の予定の開始」もマイルストーンの
 * 1 つとして上のセクションが担うようになったので、ここに残すと同じ数字が
 * 画面に 2 回出る。このカードの役目は、時刻ではなく確認番号・場所・メモという
 * 「その場で人に見せるもの」を大きく出すことに絞ってある。
 */
function BookingHero({
  booking,
  displayTz,
  variant,
  nowMs,
}: {
  booking: Booking
  displayTz: string
  variant: 'current' | 'next'
  /** 「終了まで」と「受付中」の判定に使う(BookingStateChips 参照) */
  nowMs: number
}) {
  return (
    <Panel as="article" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="palt text-sm font-medium text-ink-muted">
          {BOOKING_KIND_LABELS[booking.kind]}
        </p>
        <div className="flex items-center gap-1.5">
          <BookingStatusBadge status={booking.status} />
          <PaymentStatusBadge payment={booking.payment} />
        </div>
      </div>

      <h3 className="mt-2 text-xl font-bold break-words text-ink">
        {booking.title}
      </h3>

      {/* 発着の時刻は時刻表として読む所なので、en dash で詰める */}
      <p className="mt-1 text-lg font-bold text-ink tabular-nums">
        {safeFormatDualTime(booking.start, displayTz)}
        {booking.end !== null && (
          <>–{safeFormatDualTime(booking.end, displayTz)}</>
        )}
      </p>

      <BookingStateChips booking={booking} variant={variant} nowMs={nowMs} />

      {booking.confirmationNumber && (
        <ConfirmationButton value={booking.confirmationNumber} />
      )}

      <PlacesBlock booking={booking} />

      {booking.note && (
        <div className="mt-4 border-t border-rule pt-3">
          <p className="text-xs font-medium text-ink-muted">メモ</p>
          <p className="mt-0.5 text-sm break-words text-ink">{booking.note}</p>
        </div>
      )}
    </Panel>
  )
}

/**
 * 予約カードに添える「いまの状態」のチップ。
 *
 * CurrentStateChips から名前と責務を変えた。扱うチップが進行中の予約だけの
 * ものではなくなったためである。宿のチェックイン受付中は建物に入ったあとの話
 * なので進行中のカードに出るが、オンラインチェックイン受付中は飛行機に乗る前
 * ——つまり「次の予定」のカードに出る。同じ「受付中」でも出る場所が逆になるので、
 * variant で呼び分けるのをやめて、どちらのカードからも同じように呼べる器にし、
 * 「どのチップがどの状態で出るか」の判断をこの 1 か所に集めた。
 *
 * variant を見るのは「終了までの残り時間」だけ。あれは終わりが走っている
 * 予約にしか無い値で、まだ始まっていない予定に出しても意味を成さない。
 * 受付中の 2 つを variant で絞らないのは、判定関数自身が時刻で答えを出す
 * ためである(isOnlineCheckInOpen は出発済みの予約では false、isCheckInOpen は
 * 開始前の予約では false)。ここで二重に絞ると、同じ規則が判定関数と画面の
 * 2 か所に分かれて、片方だけ直す事故のもとになる。
 *
 * どれも出ないことがあるので、その場合は余白ごと消えるように器から返す。
 */
function BookingStateChips({
  booking,
  variant,
  nowMs,
}: {
  booking: Booking
  variant: 'current' | 'next'
  nowMs: number
}) {
  const checkInOpen = isCheckInOpen(booking, nowMs)
  const onlineCheckInOpen = isOnlineCheckInOpen(booking, nowMs)
  const ending =
    variant === 'current' ? endingCountdownOf(booking, nowMs) : null
  if (!checkInOpen && !onlineCheckInOpen && ending === null) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {checkInOpen && <OpenStateChip label="チェックイン受付中" />}
      {onlineCheckInOpen && (
        <OpenStateChip label="オンラインチェックイン受付中" />
      )}
      {ending !== null && <EndingCountdown ending={ending} />}
    </div>
  )
}

/**
 * 「もう始まっている」ことを示すチップ(宿のチェックイン受付中 /
 * オンラインチェックイン受付中)。
 *
 * 「開始まであと◯」は開始時刻を過ぎた瞬間に意味を失うが、そこで黙って消すと、
 * 利用者がいちばん知りたい「もう入れるのか」「もう席を取れるのか」が画面から
 * 消える。過ぎたマイルストーンを一覧から落とす代わりに、いまの状態として
 * 言い換える(milestones.ts が過ぎた時刻を落としつつ isCheckInOpen /
 * isOnlineCheckInOpen を別に返しているのは、この言い換えのためにある)。
 *
 * 2 つを 1 つの器にまとめたのは、利用者から見れば同じ事実(もうできる)だから。
 * 見た目が割れていると「片方には別の意味があるのか」と読ませてしまうので、
 * 違うのはラベルだけにする。
 *
 * カウントダウンではないので数字を持たない。状態の札なので Badge で出す。
 * オンラインチェックインの札は「次の予定」のカードの中に出るが、これは意味の
 * 衝突ではない。予定そのものはまだ先で、この手続きだけがもう始まっている、
 * という 2 つの事実をそのまま映している。
 */
function OpenStateChip({ label }: { label: string }) {
  return (
    <Badge tone="solid" className="font-bold">
      {label}
    </Badge>
  )
}

interface EndingCountdownInfo {
  label: string
  countdown: string
  /** 残りが ENDING_SOON_MS 以下 */
  soon: boolean
}

/**
 * 進行中の予約が終わるまでの残り時間。表示する値が無ければ null。
 *
 * 終日の終了は時刻を持たず、暦の上では現地 00:00 になる。そこへカウントダウンを
 * 出すと、実際の締切とずれた数字を自信たっぷりに見せることになるので、
 * 時刻が分からないものには残り時間を出さない(milestones.ts が終日から
 * マイルストーンを作らないのと同じ判断)。
 */
function endingCountdownOf(
  booking: Booking,
  nowMs: number,
): EndingCountdownInfo | null {
  const end = booking.end
  if (end === null) return null
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
  return { label, countdown, soon: stampToEpoch(end) - nowMs <= ENDING_SOON_MS }
}

/**
 * 進行中の予約が終わるまでの残り時間のチップ。
 *
 * 画面でいちばん大きなカウントダウンは、上の「次に来る時刻」のマイルストーン
 * ただ 1 つに決めてある。ここで同じ強さの数字を出すと、どちらがいま効いている
 * 数字なのか読み解く時間が要る。3 点で描き分ける。
 * - 位置: マイルストーンは独立したセクション。こちらは進行中カードの中で、
 *   「15:00–11:00」の時刻の行を読んだ直後に来る位置に置く
 * - 形: マイルストーンはカードいっぱいの裸の数字。こちらは枠付きのインラインの
 *   チップにして、カード幅いっぱいに広がらないようにする
 * - 大きさ: マイルストーンの text-4xl に対してこちらは text-base
 *
 * そもそも同じ数字が両方に出ることは無い。進行中の予約からはマイルストーンを
 * 作らない規則にしてあり(milestones.ts 冒頭を参照)、「到着まで」
 * 「チェックアウトまで」はここでしか出ない。上下で数字が食い違って見える
 * 事故を、見た目ではなく導出の規則の側で防いでいる。
 *
 * aria-live は付けない。NOW_TICK_MS が 60 秒なので、マイルストーンとこちらの
 * 両方に付けると 1 分ごとに 2 か所が読み上げられ、どちらの数字なのか
 * 分からないまま音だけが増える。live region は内容が変わるたびに読み上げる
 * ものなので、「しきい値を跨いだ瞬間」という本当に意味のある変化だけを
 * 伝えることはできず、毎分の更新をすべて読み上げてしまう。割に合わないので
 * live region は画面にただ 1 つ(マイルストーンの大きなカウントダウン)に留め、
 * こちらはラベル込みの通常のテキスト(「チェックアウトまで あと2時間」)にして、
 * 読みに行けば正しく読める形にする。
 *
 * 強調はピンクの薄網とピンクの枠。この画面でピンクを使うのは「時間切れが近い」
 * ことだけに決めてあり(冒頭の取り決め)、チェックアウト超過は実際にお金が
 * 出ていく事故なので意味の上でも合う。それでも色だけに頼らず、枠の太さ
 * (border → border-2)も一緒に変えて、色が見えなくても差が分かるようにする。
 */
function EndingCountdown({ ending }: { ending: EndingCountdownInfo }) {
  const { label, countdown, soon } = ending

  return (
    <p
      className={`inline-flex items-baseline gap-1.5 rounded-ui px-2.5 py-1 text-base text-ink ${
        soon
          ? 'border-2 border-pink bg-pink-wash'
          : 'border border-ink bg-paper'
      }`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="font-bold">{countdown}</span>
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
        className="block w-full rounded-ui border-2 border-ink bg-paper px-3 py-4 text-center font-mono text-4xl font-bold break-all text-ink transition hover:bg-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:text-5xl"
      >
        {value}
      </button>
      <p
        className="mt-1 text-center text-xs font-medium text-ink-muted"
        role="status"
        aria-live="polite"
      >
        {copied ? 'コピーしました' : 'タップして確認番号をコピー'}
      </p>
    </div>
  )
}

/**
 * 移動なら from/to、宿泊・アクティビティなら place。両方あるものはすべて出す。
 * カードの中にもう一段の箱は作らず、罫で区切った行として並べる。
 */
function PlacesBlock({ booking }: { booking: Booking }) {
  const items: Array<{ label: string; place: Place }> = []
  if (booking.from) items.push({ label: '出発', place: booking.from })
  if (booking.to) items.push({ label: '到着', place: booking.to })
  if (booking.place) items.push({ label: '場所', place: booking.place })
  if (items.length === 0) return null

  return (
    <div className="mt-4">
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
    <div className="border-t border-rule py-3 last:pb-0">
      <p className="palt text-xs font-medium text-ink-muted">{label}</p>
      {hasLocalName ? (
        <>
          <p className="text-2xl font-bold break-words text-ink">
            {place.localName}
          </p>
          <p className="text-sm text-ink-muted">{place.name}</p>
        </>
      ) : (
        <p className="text-xl font-bold break-words text-ink">{place.name}</p>
      )}
      {place.address && (
        <p className="mt-1 text-base break-words text-ink">{place.address}</p>
      )}
      <a
        href={mapHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`${buttonClass('secondary', 'sm')} mt-2 min-h-11`}
      >
        地図で開く
        <span className="text-xs font-normal text-ink-muted">（別サイト）</span>
      </a>
    </div>
  )
}

// --- 次に来る時刻(この画面の主役) ---

/**
 * マイルストーンのセクション。いちばん近い 1 件だけを枠で大きく、
 * 続きは罫で区切った行の一覧にする(同じ箱を縦に積むと、どれが主役か読めなくなる)。
 * 1 件も無ければセクションごと出さない(見出しだけが残ると、
 * 「次が無い」のか「壊れている」のか区別が付かない)。
 */
function MilestoneSection({
  milestones,
  displayTz,
  nowMs,
  onGoToSchedule,
}: {
  milestones: Array<Milestone>
  displayTz: string
  nowMs: number
  onGoToSchedule: () => void
}) {
  if (milestones.length === 0) return null

  const [primary, ...rest] = milestones
  const shown = rest.slice(0, MILESTONE_LIST_MAX)
  const hiddenCount = rest.length - shown.length

  return (
    <section className="flex flex-col gap-3">
      <h2 className={sectionTitleClass}>次に来る時刻</h2>

      <MilestoneHero milestone={primary} displayTz={displayTz} nowMs={nowMs} />

      {shown.length > 0 && (
        <ul className="ink-line-t ink-line-b">
          {shown.map((milestone) => (
            <MilestoneRow
              key={`${milestone.bookingId}-${milestone.kind}`}
              milestone={milestone}
              displayTz={displayTz}
              nowMs={nowMs}
            />
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onGoToSchedule}
          className={`${buttonClass('quiet', 'sm')} self-start`}
        >
          ほか {hiddenCount} 件を日程で見る
        </button>
      )}
    </section>
  )
}

/**
 * いちばん近いマイルストーン。この画面でただ 1 つの大きなカウントダウン。
 *
 * 何の時刻なのかを必ずラベルで添える。「あと45分」だけでは、手荷物を預ける
 * 締切なのか出発なのかで取るべき行動がまるで違う。
 * 予約の題名は小さく添えるに留める。どの予約の話かは 2 番目に知りたいことで、
 * ここで大きく出すと肝心の残り時間と競合する。
 */
function MilestoneHero({
  milestone,
  displayTz,
  nowMs,
}: {
  milestone: Milestone
  displayTz: string
  nowMs: number
}) {
  const soon = isDeadlineSoon(milestone, nowMs)

  return (
    <article
      className={`${cardClass} ${
        soon ? 'border-2 border-pink bg-pink-wash' : 'panel-wash'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="palt text-sm font-bold text-ink">
          {MILESTONE_LABELS[milestone.kind]}
        </p>
        <BookingStatusBadge status={milestone.booking.status} />
      </div>

      {/*
        画面でただ 1 つの live region。毎分の更新で読み上げが二重にならないよう、
        ここ以外にはカウントダウンの live region を置かない(EndingCountdown 参照)
      */}
      <p className="mt-1 text-4xl font-bold text-ink" aria-live="polite">
        {formatCountdown(milestone.atMs - nowMs)}
      </p>

      <p className="mt-1 text-lg font-bold text-ink tabular-nums">
        {safeFormatDualTime(milestone.at, displayTz)}
      </p>

      <p className="mt-1 truncate text-sm text-ink-muted">
        {milestone.booking.title}
      </p>
    </article>
  )
}

/**
 * 2 番目以降のマイルストーン 1 行。時刻と何の時刻かが分かれば足りる。
 * 箱にはせず、上の罫で区切った行として並べる。
 *
 * 締切系はラベルを太字にする。迫っているものだけピンクの薄網と左の太い罫を足し、
 * 「締切間近」と文字でも添えるので、色が見えなくても締切だと分かる。
 */
function MilestoneRow({
  milestone,
  displayTz,
  nowMs,
}: {
  milestone: Milestone
  displayTz: string
  nowMs: number
}) {
  const deadline = isDeadlineMilestone(milestone.kind)
  const soon = isDeadlineSoon(milestone, nowMs)

  return (
    <li
      className={`flex items-start gap-3 border-t border-rule py-3 first:border-t-0 ${
        soon ? 'border-l-4 border-l-pink bg-pink-wash px-3' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-ink">
          <span className="font-medium text-ink-muted tabular-nums">
            {safeFormatStamp(milestone.at, displayTz, {
              withDate: true,
              inDisplayTz: true,
            })}
          </span>
          <span className={deadline ? 'font-bold' : 'font-medium'}>
            {MILESTONE_LABELS[milestone.kind]}
          </span>
          {soon ? (
            <span className="text-xs font-bold text-ink">締切間近</span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          {milestone.booking.title}
        </p>
      </div>
      <BookingStatusBadge status={milestone.booking.status} />
    </li>
  )
}

// --- 終日の予定(時刻を持たないので、マイルストーンにできないもの) ---

/**
 * 終日の予定だけを流す一覧。
 *
 * 時刻を持たない予定に残り時間は出せない(終日の Stamp は現地 00:00 で、
 * そこへカウントダウンを出すと実際とずれた数字になる)。かといって
 * 「今」タブから消してしまうと、その日に予定があること自体が見えなくなるので、
 * 日付と題名だけの控えめな一覧としてここに残す。
 */
function UpcomingList({
  bookings,
  displayTz,
}: {
  bookings: Array<Booking>
  displayTz: string
}) {
  return (
    <section>
      <h2 className={sectionTitleClass}>このあとの終日の予定</h2>
      <ul className="ink-line-t ink-line-b mt-3">
        {bookings.map((booking) => (
          <li
            key={booking.id}
            className="flex items-start gap-3 border-t border-rule py-3 first:border-t-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-muted tabular-nums">
                {safeFormatStamp(booking.start, displayTz, {
                  withDate: true,
                  inDisplayTz: true,
                })}
              </p>
              <p className="mt-0.5 truncate text-sm font-bold text-ink">
                {booking.title}
              </p>
            </div>
            <BookingStatusBadge status={booking.status} />
          </li>
        ))}
      </ul>
    </section>
  )
}

// --- やりたいこと ---

/**
 * 滞在先でやりたいこと。
 *
 * ■ この画面が答えるべきこと
 *   「いま滞在中の町でやりたいことが『今』のところで見られる」ことと、
 *   「思い付いたその場で足せる」ことの 2 つだけである。編集(メモ・URL・場所の
 *   付け替え)はここではやらない。歩きながら片手で使う画面に編集フォームを置くと、
 *   1 行足すための入口が編集画面と紛れて、いちばん多い操作が遠くなる。
 *   編集は設定タブが受け持つ。
 *
 * ■ 当たらなかったぶんを隠さない
 *   いまの町の推定(whereabouts.ts)は外れることがある。だから他の町のぶんも
 *   場所を書いていないぶんも <details> で必ず開ける形で残す。件数を summary に
 *   出すのは、畳まれた中に何件あるかが見えないと「消えた」と読めてしまうため。
 *   詳しくは wishes.ts の「マッチは持ち上げであってフィルタではない」を参照。
 *
 * ■ 推定できないときは束ねない
 *   旅行前や移動中は突き合わせる相手がいない。そこで「ここでやりたいこと(0件)」と
 *   空の見出しを出すと、画面はやりたいことが無いように見えるのに、折りたたみの中には
 *   全部入っている、といういちばん分かりにくい状態になる。推定できないときは
 *   素直に 1 本の列にする。
 */
function WishSection({
  wishes,
  guess,
  dispatch,
}: {
  wishes: Array<Wish>
  guess: CurrentPlaceGuess
  dispatch: TripNotesDispatch
}) {
  const { here, elsewhere, anywhere } = splitWishesForNow(wishes, guess)
  // area は candidates が空でない限り必ず入る(whereabouts.ts)。
  // ここで見たいのは「いまの町として名乗れる名前があるか」なので area で判定する
  const area = guess.area
  const grouped = area !== null

  return (
    <section className="ink-line-t pt-4">
      <h2 className={sectionTitleClass}>やりたいこと</h2>

      {grouped ? (
        /*
          推定した町を必ず文字で出す。見出しに埋め込まず 1 行に分けているのは、
          これが事実ではなく推定だからである。「いまは〜とみて」と書いてあれば、
          外れているときに利用者が「だから出ていないのか」と自力で辿り着ける。
          黙って並べ替えるだけだと、何を基準に選ばれた一覧なのか分からない
        */
        <p className="mt-1 text-xs text-ink-muted">
          いまは<span className="font-medium text-ink">{area}</span>
          とみて、この町の分を先に出しています
        </p>
      ) : null}

      {grouped ? (
        <WishList
          wishes={here}
          dispatch={dispatch}
          listLabel="いまの町のやりたいこと"
          emptyText="この町のやりたいことはまだありません。下の欄から1行足せます"
        />
      ) : (
        <WishList
          wishes={sortWishesForDisplay(wishes)}
          dispatch={dispatch}
          listLabel="やりたいこと"
          showArea
          emptyText="行きたい店や見たいものを1行だけ書いておくと、その町にいるときに上に出ます"
        />
      )}

      <QuickAddWish presetArea={area} dispatch={dispatch} />

      {/*
        折りたたみを出すのは束ねているときだけ。推定できていないときは
        上の 1 本の一覧に全部入っているので、ここで足すと同じ行が二度出る
      */}
      {grouped && elsewhere.length > 0 ? (
        <WishDetails
          label="他の町のやりたいこと"
          wishes={elsewhere}
          dispatch={dispatch}
          showArea
        />
      ) : null}
      {grouped && anywhere.length > 0 ? (
        <WishDetails
          label="場所を決めていないもの"
          wishes={anywhere}
          dispatch={dispatch}
        />
      ) : null}
    </section>
  )
}

/** 折りたたみに入れた束。件数は必ず summary に出す(畳んだ中身が見えないため) */
function WishDetails({
  label,
  wishes,
  dispatch,
  showArea = false,
}: {
  label: string
  wishes: Array<Wish>
  dispatch: TripNotesDispatch
  showArea?: boolean
}) {
  const undone = wishes.filter((wish) => !wish.done).length

  return (
    <details className="group mt-3 border-t border-rule pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-ink">
        <ChevronDown
          size={14}
          className="shrink-0 transition group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
        {label}
        {/* 総数ではなく未完了の数を先に出す。ここで知りたいのは「まだ残っているか」 */}
        <span className="text-xs font-normal text-ink-muted">
          未完了{undone}件 / 全{wishes.length}件
        </span>
      </summary>
      <WishList
        wishes={wishes}
        dispatch={dispatch}
        listLabel={label}
        showArea={showArea}
      />
    </details>
  )
}

function WishList({
  wishes,
  dispatch,
  listLabel,
  showArea = false,
  emptyText,
}: {
  wishes: Array<Wish>
  dispatch: TripNotesDispatch
  /** 一覧の名前。束が 3 つ並ぶので、読み上げでどれを聞いているのか分かるようにする */
  listLabel: string
  showArea?: boolean
  emptyText?: string
}) {
  if (wishes.length === 0) {
    return emptyText === undefined ? null : (
      <p className="mt-2 text-sm text-ink-muted">{emptyText}</p>
    )
  }

  return (
    <ul aria-label={listLabel} className="mt-2 flex flex-col gap-1">
      {wishes.map((wish) => (
        <WishRow
          key={wish.id}
          wish={wish}
          dispatch={dispatch}
          showArea={showArea}
        />
      ))}
    </ul>
  )
}

/**
 * 1 行。行そのものをチェックボックスのラベルにして、どこを押しても済みが切り替わるようにする。
 * 歩きながら片手で押す操作なので、当たり判定は大きいほどよい。
 * 押し間違えても Undo が効く(reducer.ts の履歴)ので、確認は挟まない。
 *
 * 参考リンクだけはラベルの外に出す。中に入れるとリンクを押したつもりで
 * 済みが切り替わる(label の中のリンクはブラウザによって挙動が割れる)。
 */
function WishRow({
  wish,
  dispatch,
  showArea,
}: {
  wish: Wish
  dispatch: TripNotesDispatch
  showArea: boolean
}) {
  const area = wish.area?.trim() ?? ''

  return (
    <li className="flex items-start gap-2 rounded-ui px-1 py-1.5 hover:bg-wash">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={wish.done}
          onChange={() => dispatch({ type: 'toggleWishDone', id: wish.id })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
        />
        <span className="min-w-0 flex-1">
          <span
            className={
              wish.done
                ? 'text-sm text-ink-muted line-through'
                : 'text-sm text-ink'
            }
          >
            {wish.title}
          </span>
          {showArea && area !== '' ? (
            <span className="ml-1.5 text-xs text-ink-muted">{area}</span>
          ) : null}
          {wish.note !== undefined && wish.note.length > 0 ? (
            <span className="block text-xs text-ink-muted">{wish.note}</span>
          ) : null}
        </span>
      </label>
      {wish.url !== undefined && wish.url.length > 0 ? (
        <a
          href={wish.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${wish.title} のリンクを開く`}
          className="mt-0.5 shrink-0 rounded-ui p-1 text-ink-muted transition hover:bg-wash hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      ) : null}
    </li>
  )
}

/**
 * クイック追加。
 *
 * ■ 1 行で終わらせる
 *   「追加しやすさ」がこの機能の半分なので、入力欄・場所・保存を別々の手順にしない。
 *   欄に打って改行(または＋)で 1 件入る。場所の欄も種別の欄も出さない。
 *   足りない情報はあとから設定タブで足せるが、思い付いた瞬間に足せなかったものは
 *   二度と入らない。
 *
 * ■ 場所は自動で入れる。ただし黙って入れない
 *   いまの町の推定(whereabouts.ts)を場所の既定値にする。ここが自動でないと、
 *   「今」タブで足したのに「今」タブに出てこないという裏切りが起きる。
 *   一方で、推定は外れることがあるうえ、外れたまま保存されると
 *   本人にも気付けない。だから何が入るのかをチップで見せ、1 タップで外せるようにする。
 *   外した状態は「場所なし = どこでも」で、これはこれで正しい選択肢である
 *   (「本屋に入る」に町の指定は要らない)。
 *   推定できないときはチップごと出さない。選べない既定値の存在を説明しても、
 *   画面が 1 行増えるだけになる。
 */
function QuickAddWish({
  presetArea,
  dispatch,
}: {
  presetArea: string | null
  dispatch: TripNotesDispatch
}) {
  const [title, setTitle] = useState('')
  const [useArea, setUseArea] = useState(true)

  const area = presetArea !== null && useArea ? presetArea : null

  const handleAdd = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (trimmed.length === 0) return
    dispatch({
      type: 'addWish',
      wish: {
        id: newId('w'),
        title: trimmed,
        ...(area !== null ? { area } : {}),
        done: false,
      },
    })
    setTitle('')
    // 場所の入り切りは次の 1 件にも引き継ぐ。同じ町のことを続けて足す場面のほうが多い
  }

  return (
    <form onSubmit={handleAdd} className="mt-3 flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="やりたいことを追加"
          placeholder="やりたいことを追加"
          className={fieldClass}
        />
        <button
          type="submit"
          className={subtleButtonClass}
          disabled={title.trim().length === 0}
        >
          追加
        </button>
      </div>
      {presetArea !== null ? (
        <div>
          {useArea ? (
            <button
              type="button"
              onClick={() => setUseArea(false)}
              aria-label={`場所の指定「${presetArea}」を外す`}
              className="chip"
            >
              {presetArea}
              {/* 押すと外れることを示す印。読み上げは aria-label が担う */}
              <X size={12} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setUseArea(true)}
              className="chip"
            >
              場所を{presetArea}にする
            </button>
          )}
        </div>
      ) : null}
    </form>
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
    <details className="group ink-line-t pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-ink">
        <ChevronDown
          size={14}
          className="shrink-0 transition group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
        手続きの控え
        <span className="text-xs font-normal text-ink-muted">
          {withReference.length}件
        </span>
      </summary>
      <ul className="mt-2">
        {withReference.map((doc) => (
          <li key={doc.id} className="border-t border-rule py-2">
            <div>
              <span className="text-sm font-medium text-ink">
                {doc.title}
                {doc.region !== undefined && doc.region.length > 0 ? (
                  <span className="ml-1 font-normal text-ink-muted">
                    ({doc.region})
                  </span>
                ) : null}
              </span>
            </div>
            {/* 選択してコピーしやすいよう等幅にし、select-all で1タップの範囲選択を促す */}
            <p className="mt-0.5 font-mono text-sm text-ink select-all">
              {doc.referenceNumber}
            </p>
            {doc.validFrom !== undefined || doc.validUntil !== undefined ? (
              <p className="mt-0.5 text-xs text-ink-muted">
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

// --- 国・地域の情報の控え ---

/** 未入力の欄を弾く。保存側で空文字は落ちるが、古い保存データや共有URL経由の値まで信用しない */
function hasText(value: string | undefined): value is string {
  return value !== undefined && value.length > 0
}

/**
 * 訪問先の国・地域の基本情報の控え。
 *
 * TravelDocRecap と同じく <details> で常時は畳んでおく(この画面の主役は
 * 今と次の予定で、こちらは「要るときに引く」参照用のため)。0 件なら
 * セクションごと返さないのも同じ。
 *
 * ■ 中の並び: 緊急通報番号が先頭
 *   この控えがいちばん切迫した状況で開かれるのは緊急通報番号を引くときである。
 *   プラグ形状を探しているときに番号が 1 行ぶん上にあっても何も困らないが、
 *   逆(番号を探しているときにプラグの行を読み飛ばす)は困る。
 *   欄のラベル(警察 / 救急・消防)も必ず値と一緒に出す。国によって番号の
 *   分かれ方が違うので、番号だけ並べるといちばん慌てているときに
 *   どちらが何なのかを読み解かせることになる(types.ts の CountryInfo 参照)。
 *
 * ■ tel: のリンクにしない
 *   1 タップで発信できる利得より、スクロール中の誤タップで緊急通報を
 *   鳴らしてしまう事故のほうが重い。かけ直して謝れば済む相手ではないし、
 *   緊急通報番号はどの国も 3 桁前後で、読み取って自分で押す手間はごく小さい。
 *   TravelDocRecap の参照番号と同じ等幅 + select-all に留める。太さだけは
 *   参照番号より上げてある。この控えの中で探す速さが要るのはここだけで、
 *   畳んだ <details> を開いた直後に目が止まる場所にしておきたいため。
 *
 * ■ note(自由記述)は出さない
 *   TravelDocRecap がメモを載せていないのと同じで、この控えは「その場で引く値」
 *   に絞る。自由記述は設定タブと印刷しおりのほうで読める。
 */
function CountryInfoRecap({
  countryInfos,
}: {
  countryInfos: Array<CountryInfo>
}) {
  if (countryInfos.length === 0) return null

  return (
    <details className="group ink-line-t pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-ink">
        <ChevronDown
          size={14}
          className="shrink-0 transition group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
        国・地域の情報
        <span className="text-xs font-normal text-ink-muted">
          {countryInfos.length}件
        </span>
      </summary>
      <ul className="mt-2">
        {countryInfos.map((info) => (
          <CountryInfoRow key={info.id} info={info} />
        ))}
      </ul>
    </details>
  )
}

/**
 * 国 1 件分。値が入っている欄だけを出す。
 *
 * 空の欄を「未入力」と書いて並べることはしない。この控えは持ち物の
 * チェックリストではなく参照用なので、無い情報の存在を主張しても
 * 行数が増えて、入っている値を探す目が空振りする回数が増えるだけである。
 */
function CountryInfoRow({ info }: { info: CountryInfo }) {
  const numbers: Array<{ label: string; value: string }> = []
  if (hasText(info.emergencyPolice)) {
    numbers.push({ label: '警察', value: info.emergencyPolice })
  }
  if (hasText(info.emergencyAmbulance)) {
    numbers.push({ label: '救急・消防', value: info.emergencyAmbulance })
  }

  // プラグ・電圧・チップは 1 行にまとめる。どれも「思い出せなければ困るが、
  // 思い出すのに 1 秒あれば足りる」種類の値なので、行を分けて主張させない。
  // 電圧だけラベルを付けないのは、値そのものが '230V 50Hz' と名乗っているため。
  const facts: Array<string> = []
  if (hasText(info.plugTypes)) facts.push(`プラグ ${info.plugTypes}`)
  if (hasText(info.voltage)) facts.push(info.voltage)
  if (hasText(info.tipping)) facts.push(`チップ ${info.tipping}`)

  return (
    <li className="border-t border-rule py-2">
      <p className="text-sm font-medium text-ink">{info.name}</p>
      {numbers.length > 0 ? (
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {numbers.map((number) => (
            <span
              key={number.label}
              className="inline-flex items-baseline gap-1"
            >
              <span className="text-xs text-ink-muted">{number.label}</span>
              {/* 参照番号と同じく、等幅 + select-all で1タップの範囲選択を促す */}
              <span className="font-mono text-sm font-bold text-ink select-all">
                {number.value}
              </span>
            </span>
          ))}
        </p>
      ) : null}
      {facts.length > 0 ? (
        <p className="mt-0.5 text-xs text-ink-muted">{facts.join('、')}</p>
      ) : null}
    </li>
  )
}

// --- 空状態 ---

function EmptyState({ onGoToSchedule }: { onGoToSchedule: () => void }) {
  return (
    <div className={`${cardClass} flex flex-col items-start gap-3`}>
      <p className="text-base font-bold text-ink">予約がまだありません</p>
      <p className="text-sm text-ink-muted">
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
    <div className={`${cardClass} flex flex-col items-start gap-3`}>
      <p className="text-base font-bold text-ink">表示できる予定がありません</p>
      <p className="text-sm text-ink-muted">
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
