/**
 * 日程タイムライン。旅のしおりの中心画面。
 *
 * groupByDay で日付ごとに束ねた予約を縦積みで表示しつつ、
 * 未確保の夜は computeGapAlerts で洗い出して各日のセクションに差し込む。
 * 連続する未確保でも滞在地が同じ区間の初日は目立つカード、
 * 2 日目以降は控えめな 1 行にして、同じ警告を毎日フルサイズで並べない。
 *
 * 連泊中の宿・日をまたぐ移動も同じ考え方で扱う。開始日には BookingCard が
 * 出るので、2 日目以降は day.ongoing から OngoingRow という 1 行だけ出す。
 * 「この宿は今日も継続している」と分かればよく、詳細まで毎日繰り返す
 * 必要はない。
 *
 * ただし、その 1 行を一律で控えめにしていたのは行き過ぎだった。継続行には
 * 性質の違う 2 種類が混ざっている。チェックアウト・到着は「その時刻までに
 * 何かをする必要がある」イベントで締切を持つが、滞在中・移動中・継続中は
 * ただそうであるだけで行動を要求しない状態でしかない。この 2 つを同じ
 * 破線グレーの 1 行にしていたので、過ぎれば延泊料金が発生する旅行中もっとも
 * 硬い締切が、「滞在中(2泊目)」とまったく同じ見た目で並んでいた。
 * 締切のあるほうだけ持ち上げ、状態の行は今までどおり控えめに置く。
 *
 * その簡易行とカードは、見た目は別物でも同じ 1 本の時間軸に並べる
 * (derive.ts の dayTimeline)。行の種類でまとめて出すと、12:00 チェックアウトの
 * 簡易行が朝 09:00 のカードより前に出て、書いてある時刻と並び順が食い違う。
 *
 * カードの開閉状態(どの予約を展開しているか)もここが持つ。カード自身に
 * 持たせると、日付の並べ替えや再描画でカードが作り直されたときに黙って
 * 閉じてしまうため。保存はしない。開いたかどうかは「いま確認している最中」と
 * いう一時的な文脈でしかなく、次にアプリを開いたときまで引きずる意味が無い。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, LogOut, MapPinCheck, Plus } from 'lucide-react'
import {
  diffDays,
  formatDateJa,
  formatStamp,
  stampDate,
} from '../../../../lib/trip-notes/datetime'
import { dayTimeline, groupByDay } from '../../../../lib/trip-notes/derive'
import { isTransportKind } from '../../../../lib/trip-notes/nights'
import { computeGapAlerts } from '../../../../lib/trip-notes/uncovered-gaps'
import {
  cardClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import { BookingCard } from './BookingCard'
import { BookingForm } from './BookingForm'
import { ConfirmDialog } from './ConfirmDialog'
import { GapAlertCard } from './GapAlertCard'
import { KindIcon } from './KindIcon'
import type { LucideIcon } from 'lucide-react'
import type {
  Booking,
  BookingKind,
  TripNotesState,
} from '../../../../lib/trip-notes/types'
import type { TripNotesDispatch } from '../-lib/reducer'

interface SchedulePanelProps {
  state: TripNotesState
  displayTz: string
  dispatch: TripNotesDispatch
  /** 進捗タブから飛んできた日付。その日へスクロールしてハイライトする。null なら何もしない */
  focusDate: string | null
  /** ハイライト演出を開始したら呼ぶ(親が focusDate を null に戻す) */
  onFocusHandled: () => void
  /**
   * マウントと同時に予約追加フォームを開く。
   * オンボーディングの「予約を1件登録する」からの遷移で、
   * 「予約を追加」をもう一度押させないための入口。
   */
  openAddOnMount?: boolean
}

/** モーダルの開閉状態。編集対象は id だけを持ち、毎レンダー最新の Booking を引き直す */
type ModalState =
  | { mode: 'closed' }
  | { mode: 'add'; date: string | null; kind?: BookingKind }
  | { mode: 'edit'; bookingId: string }

const HIGHLIGHT_DURATION_MS = 2600

/**
 * 継続行がその日について語ること。
 *
 * tone は「締切のあるイベントか、行動を要求しないただの状態か」の区別で、
 * 呼び出し側はこれだけを見て行の見た目を選ぶ。ラベルの文字列から
 * 「チェックアウトで始まるか」を判定し直す手もあるが、それは文言を少し
 * 変えた瞬間に静かに壊れるので、判別できる形で返す。
 * アイコンを持つのがイベント側だけなのは、状態側には「滞在中」を
 * 言い当てる絵が無く、そこは今までどおり種別の KindIcon で足りるため。
 */
type OngoingStatus =
  | { tone: 'event'; label: string; icon: LucideIcon }
  | { tone: 'state'; label: string }

/**
 * その日の状態。終了日なら「チェックアウト/到着」というイベント、
 * それ以外は種別ごとに「滞在中(N泊目)/移動中/継続中」という状態を返す。
 * N泊目のNは、チェックイン当日を 1 泊目として数える(利用者が宿の予約サイトで
 * 見慣れている数え方に合わせる)。
 *
 * 日付はその予約自身の現地日付で見る。date は groupByDay が現地日付で作った
 * 見出しなので、ここだけ表示タイムゾーンに変換すると、日をまたぐ移動の
 * 「到着」が 1 日ずれた見出しの下に出たり、泊数が 1 泊ずれたりする。
 */
function ongoingStatus(
  booking: Booking,
  date: string,
  displayTz: string,
): OngoingStatus {
  const endDate = booking.end !== null ? stampDate(booking.end) : null
  const isLodging = booking.kind === 'lodging'

  if (endDate === date) {
    const time =
      booking.end !== null && !booking.end.allDay
        ? ` ${formatStamp(booking.end, displayTz)}`
        : ''
    return {
      tone: 'event',
      label: `${isLodging ? 'チェックアウト' : '到着'}${time}`,
      /*
        宿は「部屋から出る」ので LogOut。移動側は種別を問わず MapPinCheck で
        「着いた」だけを表す。列車やバスの到着に飛行機の PlaneLanding を
        出すわけにはいかず、かといって種別ごとに絵を割り振ると、隣に出ている
        はずの KindIcon と役割が重なって「なぜ2つ絵があるのか」になる。
        種別は KindIcon に任せ、ここは中立の1つに寄せる
      */
      icon: isLodging ? LogOut : MapPinCheck,
    }
  }

  if (isLodging) {
    const nights = diffDays(stampDate(booking.start), date) + 1
    return { tone: 'state', label: `滞在中(${nights}泊目)` }
  }
  if (isTransportKind(booking.kind)) return { tone: 'state', label: '移動中' }
  return { tone: 'state', label: '継続中' }
}

/**
 * 連泊中の宿・日をまたぐ移動を「その日どこにいるか」だけ示す簡易行。
 * BookingCard は開始日側にすでにあるので、ここでは詳細を繰り返さない。
 *
 * 状態(滞在中・移動中・継続中)は行動を要求しないので、その日の本来の予定と
 * 混同されないようはっきり控えめに置く。イベント(チェックアウト・到着)は
 * 締切なので、同じ小ささのまま「イベントだと分かる」ところまで持ち上げる。
 */
function OngoingRow({
  booking,
  date,
  displayTz,
  onEdit,
}: {
  booking: Booking
  date: string
  displayTz: string
  onEdit: () => void
}) {
  const status = ongoingStatus(booking, date, displayTz)

  /*
    イベント行を持ち上げたいが、色で持ち上げることはできない。
    この日程タブの amber は GapAlertCard(未確保の夜)が押さえていて、とくに
    その continuation バリアント
    (border border-amber-200/80 bg-amber-50/60 px-3 py-1.5 text-xs)は、
    OngoingRow とほぼ同じ大きさ・形の 1 行として同じ日のセクションに並ぶ。
    ここで amber を使うと「宿が取れていない警告」と見分けが付かなくなる。
    cyan / sky はブランド・リンク・プライマリ操作の専用色(-lib/styles.ts)で、
    rose は危険、emerald は良好。チェックアウトはそのどれでもない
    「時刻の決まった事実」なので、当てられる色が残っていない。

    そこで色はニュートラル(slate)のまま据え置き、色以外の signal を重ねる。
    実線に戻す・左だけ太い罫線・淡い地色・濃い文字・時刻の太字・意味のある
    アイコン、の 6 つ。左だけ太い罫線は StatusBadge の
    TRAVEL_DOC_STATUS_STYLES で既に使っている「形で系統を分ける」語彙なので、
    新しい語彙を増やさずそれに倣う。

    その上で、BookingCard より目立たせないことを守る。その日の主役はその日に
    始まる予約で、あちらは rounded-2xl + 白地 + shadow-sm + 大きな見出し。
    こちらは text-xs・px-3 py-2・rounded-xl という小ささを状態行と揃えたまま、
    shadow や大きな文字には手を出さない
  */
  const rowClass =
    status.tone === 'event'
      ? 'border-slate-300 border-l-4 border-l-slate-500 bg-slate-50 text-gray-700 hover:bg-slate-100'
      : 'border-dashed border-gray-200 bg-gray-50/60 text-gray-500 hover:bg-gray-100'

  return (
    <button
      type="button"
      onClick={onEdit}
      // 連泊中は同じ予約が複数日にまたがって ongoing 行を出すため、
      // BookingCard 側と同じ「<タイトル> を編集」だけだとラベルが日をまたいで重複し、
      // スクリーンリーダー利用者やテストがどの行を指しているか判別できなくなる。
      // 開始日を付けて日付ごとに一意にする(既存の「この日に追加」ボタンの
      // 「${formatDateJa(day.date)}に予約を追加」と同じ、日付を頭に付ける流儀)。
      //
      // さらに状態そのものもラベルに含める。aria-label はボタン内のテキストを
      // まるごと覆い隠すので、これが無いと「チェックアウト 12:00」が
      // スクリーンリーダーには一切届かない。締切を目立たせるのは視覚だけの
      // 話ではないので、読み上げ側にも同じ情報が渡るようにする
      aria-label={`${formatDateJa(date)}の${booking.title}(${status.label})を編集`}
      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${rowClass}`}
    >
      {status.tone === 'event' ? (
        <status.icon
          size={13}
          className="shrink-0 text-slate-600"
          aria-hidden="true"
        />
      ) : (
        <KindIcon
          kind={booking.kind}
          size={13}
          className="shrink-0 text-gray-400"
        />
      )}
      {/*
        タイトルだけを単独の要素にすると、開始日の BookingCard 側の見出しと
        文字列が完全一致してしまい、画面を見ている人にも支援技術にも
        「同じ名前の別要素が2つ以上ある」状態になって紛らわしい。
        先頭に継続を表す記号を足して「前日から続いている行」だと分かるようにする
      */}
      <span className="min-w-0 flex-1 truncate">↳ {booking.title}</span>
      <span
        className={
          status.tone === 'event'
            ? 'shrink-0 font-bold text-gray-900'
            : 'shrink-0 text-gray-400'
        }
      >
        {status.label}
      </span>
    </button>
  )
}

export function SchedulePanel({
  state,
  displayTz,
  dispatch,
  focusDate,
  onFocusHandled,
  openAddOnMount = false,
}: SchedulePanelProps) {
  // 日程タブは表示中しかマウントされないので、開くかどうかは初期値で決めれば足りる
  const [modalState, setModalState] = useState<ModalState>(() =>
    openAddOnMount ? { mode: 'add', date: null } : { mode: 'closed' },
  )
  const [highlightDate, setHighlightDate] = useState<string | null>(null)
  const [bulkVerifyOpen, setBulkVerifyOpen] = useState(false)
  /**
   * 展開中の予約 id。予約 id で持てるのは、カードがその予約の開始日にしか
   * 出ないため(2 日目以降は OngoingRow という別の行になる)。
   * 同じ予約のカードが 2 つの日に並ぶことは無いので、日付との組にする必要が無い。
   */
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const dayRefs = useRef(new Map<string, HTMLElement>())

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  // 未確認が 1 件でも残っている予約の数。一括解除ボタンの表示と、
  // 「何件に効くのか」の提示に使う
  const unverifiedCount = useMemo(
    () =>
      state.bookings.filter(
        (b) => b.unverified !== undefined && b.unverified.length > 0,
      ).length,
    [state.bookings],
  )

  const dayGroups = useMemo(() => groupByDay(state.bookings, state), [state])
  const gapAlerts = useMemo(() => computeGapAlerts(state), [state])
  const gapByDate = useMemo(
    () => new Map(gapAlerts.map((alert) => [alert.date, alert])),
    [gapAlerts],
  )

  const editingBooking =
    modalState.mode === 'edit'
      ? (state.bookings.find((b) => b.id === modalState.bookingId) ?? null)
      : null

  const closeModal = () => setModalState({ mode: 'closed' })

  // focusDate が来たら該当日へスクロールしてハイライトを点ける
  useEffect(() => {
    if (focusDate === null) return
    const el = dayRefs.current.get(focusDate)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setHighlightDate(focusDate)
    onFocusHandled()
  }, [focusDate, onFocusHandled])

  // ハイライトの消灯は focusDate ではなく highlightDate に紐付ける。
  // 点灯と同じ effect に置くと、直後の onFocusHandled() で focusDate が
  // null に戻った瞬間に cleanup がタイマーを消してしまい、
  // 消灯が一度も走らずにリングが出っぱなしになる。
  useEffect(() => {
    if (highlightDate === null) return
    const timer = window.setTimeout(
      () => setHighlightDate(null),
      HIGHLIGHT_DURATION_MS,
    )
    return () => window.clearTimeout(timer)
  }, [highlightDate])

  // Esc で閉じる・フォーカスをモーダル内に閉じ込める・閉じたら元の位置に戻す、は
  // BookingForm 側の useDialogFocus が引き受ける(ここでは二重に登録しない)

  function handleDelete(booking: Booking) {
    const ok = window.confirm(
      `「${booking.title}」を削除します。よろしいですか?`,
    )
    if (!ok) return
    dispatch({ type: 'removeBooking', id: booking.id })
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={sectionTitleClass}>
          <CalendarDays size={18} className="text-cyan-600" />
          日程タイムライン
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/*
            AI 取り込み直後は全予約の全フィールドが未確認になる。1 つずつ外すのは
            現実的ではないので、一覧の入口にまとめて外す出口を置く。ただし
            「黄色い下線を根拠に旅程を見直す」機能そのものを一度で消す操作なので、
            必ず確認ダイアログを挟む
          */}
          {unverifiedCount > 0 ? (
            <button
              type="button"
              onClick={() => setBulkVerifyOpen(true)}
              className={subtleButtonClass}
              aria-label={`未確認の項目が残る${unverifiedCount}件の予約を、まとめて確認済みにする`}
            >
              <Check size={15} aria-hidden="true" />
              未確認をすべて解除({unverifiedCount}件)
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setModalState({ mode: 'add', date: null })}
            className={primaryButtonClass}
          >
            <Plus size={16} aria-hidden="true" />
            予約を追加
          </button>
        </div>
      </div>

      {state.bookings.length === 0 ? (
        <div
          className={`${cardClass} flex flex-col items-center gap-3 py-10 text-center`}
        >
          <CalendarDays
            size={32}
            className="text-gray-300"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-gray-700">
            まだ予約がありません
          </p>
          <p className="max-w-sm text-xs text-gray-500">
            宿泊・移動・アクティビティの予約を追加すると、ここに日ごとのタイムラインが並びます。
          </p>
          <button
            type="button"
            onClick={() => setModalState({ mode: 'add', date: null })}
            className={primaryButtonClass}
          >
            <Plus size={16} aria-hidden="true" />
            最初の予約を追加
          </button>
        </div>
      ) : (
        <ol className="space-y-6">
          {dayGroups.map((day) => {
            const gap = gapByDate.get(day.date)
            const highlighted = highlightDate === day.date
            const timeline = dayTimeline(day)
            return (
              <li
                key={day.date}
                ref={(el) => {
                  if (el) dayRefs.current.set(day.date, el)
                  else dayRefs.current.delete(day.date)
                }}
                className={`scroll-mt-20 rounded-2xl transition ${
                  highlighted ? 'ring-2 ring-cyan-400 ring-offset-2' : ''
                }`}
              >
                <div className="sticky top-16 z-10 flex items-center justify-between gap-2 bg-white/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/80">
                  <h3 className="text-sm font-bold text-gray-800">
                    {formatDateJa(day.date)}
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setModalState({ mode: 'add', date: day.date })
                    }
                    className={subtleButtonClass}
                    aria-label={`${formatDateJa(day.date)}に予約を追加`}
                  >
                    <Plus size={14} aria-hidden="true" />
                    この日に追加
                  </button>
                </div>

                <div className="mt-2 space-y-2">
                  {timeline.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400">
                      この日の予定はまだありません
                    </p>
                  ) : (
                    /*
                      継続の簡易行とその日のカードは、見た目も要素も違うが
                      同じ 1 本の時間軸に並べる(dayTimeline)。継続行を先頭に
                      まとめていたころは、12:00 チェックアウトの行が朝の予定より
                      前に出て、時刻の前後と表示順が食い違っていた
                    */
                    timeline.map(({ row, booking }) =>
                      row === 'ongoing' ? (
                        <OngoingRow
                          key={booking.id}
                          booking={booking}
                          date={day.date}
                          displayTz={displayTz}
                          onEdit={() =>
                            setModalState({
                              mode: 'edit',
                              bookingId: booking.id,
                            })
                          }
                        />
                      ) : (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          displayTz={displayTz}
                          expanded={expandedIds.has(booking.id)}
                          onToggleExpand={() => toggleExpanded(booking.id)}
                          onEdit={() =>
                            setModalState({
                              mode: 'edit',
                              bookingId: booking.id,
                            })
                          }
                          onDelete={() => handleDelete(booking)}
                          onVerifyAll={() =>
                            dispatch({
                              type: 'verifyAllFields',
                              id: booking.id,
                            })
                          }
                          onVerifyField={(field) =>
                            dispatch({
                              type: 'verifyField',
                              id: booking.id,
                              field,
                            })
                          }
                        />
                      ),
                    )
                  )}

                  {gap !== undefined ? (
                    <GapAlertCard
                      rangeDates={gap.rangeDates}
                      areaLabel={gap.areaLabel}
                      variant={gap.variant}
                      onAddLodging={() =>
                        setModalState({
                          mode: 'add',
                          date: gap.date,
                          kind: 'lodging',
                        })
                      }
                    />
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {modalState.mode !== 'closed' ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal()
          }}
        >
          <BookingForm
            booking={modalState.mode === 'edit' ? editingBooking : null}
            initialDate={modalState.mode === 'add' ? modalState.date : null}
            initialKind={
              modalState.mode === 'add' ? modalState.kind : undefined
            }
            state={state}
            displayTz={displayTz}
            dispatch={dispatch}
            onClose={closeModal}
          />
        </div>
      ) : null}

      {bulkVerifyOpen ? (
        <ConfirmDialog
          title="未確認をすべて解除しますか?"
          description={`${unverifiedCount}件の予約に付いている黄色い下線が消え、AI が入力した値と自分で確認した値の区別が付かなくなります。取り消したいときは「元に戻す」で1回ぶん戻せます。`}
          confirmLabel="すべて解除する"
          confirmAriaLabel={`${unverifiedCount}件の予約の未確認をすべて解除する`}
          onConfirm={() => {
            dispatch({ type: 'verifyAllUnverified' })
            setBulkVerifyOpen(false)
          }}
          onCancel={() => setBulkVerifyOpen(false)}
        />
      ) : null}
    </section>
  )
}
