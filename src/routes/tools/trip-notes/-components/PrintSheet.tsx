/**
 * 印刷用のしおり本体。
 *
 * 画面には出さず(hidden)、印刷したときだけ現れる(print:block)。
 *
 * ■ 何を載せるかの基準
 *   この紙の目的は「スマホが壊れても電池が切れても、これ 1 部で旅程を遂行できる」こと。
 *   だから載せるかどうかは、機能や見栄えではなく
 *   「端末が使えない場面で、紙のほうが速いか」だけで決めている。
 *   - 確認番号: カウンターで最初に聞かれる。等幅の枠付きにして、行の中で
 *     いちばん先に目が止まる形にする。
 *   - 場所の現地語表記(localName)と住所: 見せる相手は現地の人間なので、
 *     日本語の name より localName を太く大きく置く(types.ts の Place 参照)。
 *   - 搭乗手続き・手荷物の締切: データは「出発の何分前」で持っているが、
 *     紙の上では絶対時刻に直して出す。空港で暗算させない。
 *   - まだ払っていない予約の金額: 現地でいくら出すかは行動を変える。
 *   逆に、通貨別の予算合計(summarizeBudget)は載せない。あれは「あといくら要るか」を
 *   出発前に決めるための集計で、旅先の紙で見ても行動が変わらない。紙面は有限なので、
 *   旅先で使わない集計に行を割かない。無料キャンセル期限も同じ理由で載せない
 *   (出発前に画面で潰すもので、旅先の紙に残しても押せる手が無い)。
 *   キャンセル済みの予約も印刷しない。行かないと決めた予定は紙で見るものではない。
 *
 * ■ 華やかさをどこで作るか
 *   背景色はブラウザの既定では印刷されないので、地色に頼った装飾は紙の上で消える。
 *   モノクロ印刷でも階層が崩れないこと(StatusBadge.tsx 冒頭と同じ方針)も要る。
 *   そこで対比は「印刷しても消えないもの」だけで作っている:
 *   - 罫線の太さの語彙。表紙の二重線(2.5pt + 0.75pt) > 日付の帯(上 2pt / 下 0.75pt)
 *     > 節見出し(1.5pt) と太さで格を付ける。行の左罫線も、予約と締切のある行は
 *     2pt の実線、滞在中のような「行動を要求しない状態」の行は 0.75pt の破線にして、
 *     ページを縦に貫く 1 本の背骨が太さを変えながら流れるようにした。
 *   - 3 書体の使い分け。見出しは明朝(font-serif)、本文はゴシック、
 *     時刻と番号は等幅。役割が書体で分かれると、色が無くても層が読める。
 *   - 22pt(旅行名)から 6.5pt(項目名)までの文字サイズの落差。
 *   - 線画の lucide アイコン(SVG なのでモノクロでも綺麗に刷れる)。
 *   淡い地色を使うのは日付の帯だけで、そこも print-color-adjust を添えたうえで、
 *   地色が出なくても上下の罫線だけで帯だと分かる形にしてある。
 *
 * ■ 並び順は画面と同じにする
 *   日ごとの行は画面(SchedulePanel)と同じ dayTimeline() で組む。以前の印刷は
 *   継続行を日の先頭にまとめていたので、「12:00 チェックアウト」が朝 09:00 の
 *   予定より前に並び、同じ旅程が画面と紙で違う順に読めていた。
 *
 * ■ ページ割れ
 *   avoid は「行」と「見出し」に掛ける。1 日のまとまりごと avoid にすると、
 *   予定の多い日が 1 ページに収まらなくなった瞬間にブラウザが指定ごと無視して
 *   任意の位置で割るので、かえって制御が効かなくなる。
 *   見出しには break-after-avoid も足して、日付だけがページの末尾に取り残されるのを防ぐ。
 *
 *   紙の余白はこの要素の padding で作っている。styles.css の @page が margin: 0 で、
 *   これは原寸で刷る免許証レイアウトのための指定なので動かせない。
 *   その代わり 2 ページ目以降の上下は余白が付かない(padding は最初と最後のページに
 *   しか効かない)。@page 側を旅のしおりだけのために変えることはできないので、
 *   ここは既知の制約として残してある。
 */

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  LogOut,
  MapPinCheck,
  Moon,
  PhoneCall,
  ScrollText,
  Timer,
  XCircle,
} from 'lucide-react'
import {
  diffDays,
  formatDateJa,
  formatDualTime,
  formatStamp,
  stampDate,
  tryParseStamp,
} from '../../../../lib/trip-notes/datetime'
import { dayTimeline, groupByDay } from '../../../../lib/trip-notes/derive'
import { MILESTONE_LABELS } from '../../../../lib/trip-notes/milestones'
import {
  computeNights,
  countUncoveredNights,
  isTransportKind,
} from '../../../../lib/trip-notes/nights'
import { formatMoney, todayISO } from '../-lib/format'
import { KindIcon, TRAVEL_DOC_KIND_LABELS } from './KindIcon'
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  TRAVEL_DOC_STATUS_LABELS,
} from './StatusBadge'
import type { LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import type {
  Booking,
  BookingStatus,
  NightSlot,
  Place,
  TripNotesState,
} from '../../../../lib/trip-notes/types'

interface PrintSheetProps {
  state: TripNotesState
  displayTz: string
}

/**
 * 淡い地色を印刷させる指定。
 *
 * Tailwind の arbitrary property でも書けるが、-webkit- 付きの property 名は
 * クラス名の中で先頭のハイフンが負の値の記法と紛らわしいので、
 * 確実に両方が出る style 属性で当てる。
 * これが効かない環境でも読めるように、地色を敷く箇所には必ず罫線を添えること。
 */
const TINT_STYLE: CSSProperties = {
  printColorAdjust: 'exact',
  WebkitPrintColorAdjust: 'exact',
}

/** 時刻の列。ここを固定幅にすることで、日をまたいでも時刻が同じ位置に揃う */
const TIME_COL = 'w-[48pt] shrink-0'

/**
 * 行の左に引く罫線。ページを縦に貫く背骨で、太さがそのまま行の重さになる。
 * 予約と締切のある行は実線 2pt、行動を要求しない状態の行は破線 0.75pt。
 * 行の間に余白を空けずに積むので、太さの変化が 1 本の線の変化として読める。
 */
const SPINE_STRONG = 'border-l-[2pt] border-l-black'
const SPINE_WEAK = 'border-l-[0.75pt] border-dashed border-l-gray-400'

/**
 * 予約状況の刷り方。アイコンと枠の形は画面(StatusBadge.tsx)の語彙をそのまま使う。
 * 色は当てにできないので、確定は実線 + 塗りアイコン、仮押さえは左だけ太い罫線、
 * 検討中は破線、と形だけで 3 つを見分けられるようにしてある。
 *
 * cancelled は印刷しないが、状態が増えたときに付け忘れを tsc に拾わせたいので
 * Record として 4 つとも書いておく(derive.ts の集計器と同じ流儀)。
 */
const BOOKING_STATUS_PRINT: Record<
  BookingStatus,
  { icon: LucideIcon; className: string }
> = {
  idea: { icon: CircleDashed, className: 'border-dashed border-gray-500' },
  held: { icon: Clock, className: 'border-black border-l-[2pt]' },
  confirmed: { icon: CheckCircle2, className: 'border-black' },
  cancelled: { icon: XCircle, className: 'border-gray-400 line-through' },
}

/** 節の見出し。明朝 + 1.5pt の罫線で、日付の帯(2pt)より一段下の格に置く */
function SectionHeading({
  icon: Icon,
  title,
  note,
}: {
  icon: LucideIcon
  title: string
  note?: string
}) {
  return (
    <div className="mt-[16pt] flex break-inside-avoid items-center gap-[5pt] border-b-[1.5pt] border-black pb-[2pt] break-after-avoid">
      <Icon size={12} className="shrink-0" aria-hidden="true" />
      <h2 className="font-serif text-[12pt] font-bold">{title}</h2>
      {note !== undefined ? (
        <span className="text-[7.5pt] text-gray-600">{note}</span>
      ) : null}
    </div>
  )
}

/** 「確認番号 ABC-123」の枠。紙の上でいちばん探される値なので、行の中で一番強く囲う */
function CodeBox({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-[4pt] border-[0.75pt] border-black px-[4pt] py-[1pt]">
      <span className="text-[6.5pt] tracking-[0.1em] text-gray-600">
        {label}
      </span>
      <span className="font-mono text-[10pt] font-bold tracking-[0.06em]">
        {value}
      </span>
    </span>
  )
}

/**
 * 時刻の列。
 *
 * 移動系は formatDualTime で日本時間を併記する。返り値は
 * 「14:20 現地 / 21:20 JST」という 1 行の文字列だが、時刻の列は狭いので
 * ' / ' で区切って積む。区切りの文言が変わっても最悪 1 行に戻るだけで、
 * 表示が壊れることはない(分割に失敗した文字列がそのまま出る)。
 */
function TimeCell({
  text,
  strong,
}: {
  text: string
  /** その行の主時刻か。継続行の控えめな時刻は false */
  strong: boolean
}) {
  const lines = text.length === 0 ? [] : text.split(' / ')
  return (
    <div className="font-mono leading-[1.25]">
      {lines.map((line, index) => (
        <div
          key={`${index}:${line}`}
          className={
            index === 0
              ? strong
                ? 'text-[10.5pt] font-bold'
                : 'text-[9pt]'
              : 'text-[7pt] text-gray-700'
          }
        >
          {line}
        </div>
      ))}
    </div>
  )
}

/** その行に出す場所。宿泊・アクティビティは place 1 つ、移動は 発 / 着 の 2 つ */
interface RolePlace {
  /** 場所が 2 つ並ぶときだけ付ける肩書き */
  role: string | null
  place: Place
}

function rolePlacesOf(booking: Booking): Array<RolePlace> {
  if (booking.place !== undefined) {
    return [{ role: null, place: booking.place }]
  }
  const places: Array<RolePlace> = []
  if (booking.from !== undefined)
    places.push({ role: '発', place: booking.from })
  if (booking.to !== undefined) places.push({ role: '着', place: booking.to })
  return places
}

/** 場所の見出し行。BookingCard の summarizePlace と同じ言い回しに揃える */
function placeHeadline(booking: Booking): string | null {
  if (booking.place !== undefined) return booking.place.name
  if (booking.from !== undefined || booking.to !== undefined) {
    return `${booking.from?.name ?? '?'} → ${booking.to?.name ?? '?'}`
  }
  return null
}

/**
 * 搭乗手続き・手荷物の締切を絶対時刻に直す。
 *
 * データは「出発の何分前か」で持っている(types.ts の checkInClosesMinutesBefore 参照)。
 * 画面では残り時間として出せばよいが、紙は空港のカウンターの前で読むものなので、
 * 「出発の 45 分前」から暗算させずに時刻そのものを刷る。
 *
 * milestones.ts の deriveMilestones も同じ引き算をしているが、あちらは
 * 「いまより先のものだけ」を返す現在時刻依存の関数で、印刷には使えない
 * (刷った紙は旅行の最後まで有効で、過ぎた締切もそのまま紙の上に残る)。
 * ラベルだけは MILESTONE_LABELS を共有し、画面と紙で呼び名がずれないようにする。
 */
function deadlinesOf(
  booking: Booking,
  displayTz: string,
): Array<{ label: string; time: string }> {
  if (!isTransportKind(booking.kind) || booking.start.allDay) return []
  const start = tryParseStamp(booking.start)
  if (start === null) return []

  const sources = [
    ['bagDrop', booking.bagDropClosesMinutesBefore],
    ['checkIn', booking.checkInClosesMinutesBefore],
  ] as const

  const deadlines: Array<{ label: string; time: string }> = []
  for (const [kind, minutes] of sources) {
    if (minutes === undefined) continue
    // 分の引き算は Temporal に任せる。夏時間の切替を跨いでも実経過時間どおりになる
    const at = start.subtract({ minutes })
    deadlines.push({
      label: MILESTONE_LABELS[kind],
      time: formatStamp({ zdt: at.toString(), allDay: false }, displayTz),
    })
  }
  return deadlines
}

/**
 * その日に始まる予約 1 件分。紙の主役。
 *
 * 画面のカードと違って押せないので、押せば分かることは全部この場に開いておく。
 * 逆に truncate は使わない。紙には続きを見る手段が無く、切り詰めた時点で
 * その情報は永久に読めなくなるため、長い名前は素直に折り返させる。
 */
function BookingRow({
  booking,
  displayTz,
}: {
  booking: Booking
  displayTz: string
}) {
  const transport = isTransportKind(booking.kind)
  const status = BOOKING_STATUS_PRINT[booking.status]
  const StatusIcon = status.icon
  const headline = placeHeadline(booking)
  const places = rolePlacesOf(booking).filter(
    ({ place }) => place.localName !== undefined || place.address !== undefined,
  )
  const deadlines = deadlinesOf(booking, displayTz)

  /*
    終了時刻の出し方は、終わる日が始まる日と同じかどうかで変える。
    日をまたぐ予約(宿・夜行)は終了日側に必ず継続行が立つ(derive.ts の
    dayTimeline)ので、ここで時刻まで繰り返すと同じ事実が紙の 2 箇所に出る。
    その代わり「いつまで続くのか」だけは日付で添える。宿の行を見た人が
    何泊するのかを、ページをめくらずに掴めるようにするため。
  */
  const end = booking.end
  const endsSameDay =
    end !== null && stampDate(end) === stampDate(booking.start)
  const endTime = endsSameDay ? formatStamp(end, displayTz) : null
  const endDate =
    end !== null && !endsSameDay
      ? formatStamp(end, displayTz, { withDate: true })
      : null

  return (
    <div
      className={`flex break-inside-avoid gap-[8pt] py-[4pt] pl-[7pt] ${SPINE_STRONG}`}
    >
      <div className={TIME_COL}>
        <TimeCell
          text={
            transport
              ? formatDualTime(booking.start, displayTz)
              : formatStamp(booking.start, displayTz)
          }
          strong
        />
        {endTime !== null ? (
          <div className="mt-[1pt] font-mono text-[8pt] text-gray-700">
            ↓ {endTime}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-[6pt] gap-y-[2pt]">
          <KindIcon
            kind={booking.kind}
            size={12}
            className="shrink-0 self-center text-black"
          />
          <h3 className="text-[11pt] font-bold leading-[1.3]">
            {booking.title}
          </h3>
          <span
            className={`inline-flex items-center gap-[3pt] border-[0.75pt] px-[3pt] py-[0.5pt] text-[7.5pt] ${status.className}`}
          >
            <StatusIcon size={9} aria-hidden="true" />
            {BOOKING_STATUS_LABELS[booking.status]}
          </span>
          {/*
            支払状況は「まだ払っていない」ときだけ出す。完済の予約に完済と
            刷っても現地での行動は変わらないが、現地払い・未払いは
            「いくら用意してカウンターに立つか」に直結する
          */}
          {booking.payment !== 'paid' ? (
            <span className="text-[7.5pt] text-gray-700">
              {PAYMENT_STATUS_LABELS[booking.payment]}
              {booking.price !== undefined
                ? ` ${formatMoney(booking.price.amount, booking.price.currency)}`
                : ''}
            </span>
          ) : null}
        </div>

        {headline !== null ? (
          <p className="mt-[2pt] text-[9.5pt] leading-[1.35]">{headline}</p>
        ) : null}

        {places.map(({ role, place }) => (
          <p
            key={`${role ?? 'place'}:${place.name}`}
            className="mt-[1pt] leading-[1.35]"
          >
            {role !== null ? (
              <span className="mr-[3pt] border-[0.5pt] border-gray-500 px-[2pt] text-[6.5pt] text-gray-700">
                {role}
              </span>
            ) : null}
            {/*
              現地語表記は読む相手が現地の人間なので、日本語の表記より大きく太く。
              紙を差し出して指してもらう場面では、これが本体になる
            */}
            {place.localName !== undefined ? (
              <span className="text-[9pt] font-bold">{place.localName}</span>
            ) : null}
            {place.address !== undefined ? (
              <span className="text-[7.5pt] text-gray-700">
                {place.localName !== undefined ? ' / ' : ''}
                {place.address}
              </span>
            ) : null}
          </p>
        ))}

        {endDate !== null ? (
          <p className="mt-[1pt] text-[8pt] text-gray-700">{endDate} まで</p>
        ) : null}

        {deadlines.length > 0 ? (
          <p className="mt-[2pt] flex flex-wrap items-center gap-x-[8pt] text-[8.5pt] font-bold">
            <Timer size={10} className="shrink-0" aria-hidden="true" />
            {deadlines.map((deadline) => (
              <span key={deadline.label}>
                {deadline.label} {deadline.time}
              </span>
            ))}
          </p>
        ) : null}

        {booking.confirmationNumber !== undefined ||
        booking.provider !== undefined ? (
          <p className="mt-[3pt] flex flex-wrap items-center gap-[5pt]">
            {booking.confirmationNumber !== undefined ? (
              <CodeBox label="確認番号" value={booking.confirmationNumber} />
            ) : null}
            {booking.provider !== undefined ? (
              <span className="text-[8pt] text-gray-700">
                {booking.provider}
              </span>
            ) : null}
          </p>
        ) : null}

        {booking.note !== undefined && booking.note.length > 0 ? (
          <p className="mt-[2pt] text-[8pt] leading-[1.35] text-gray-700">
            メモ: {booking.note}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * その日について継続行が語ること。画面(SchedulePanel の ongoingStatus)と
 * 同じ規則で、締切のあるイベントか、行動を要求しないただの状態かを分ける。
 * あちらは export していないので判定を持ち直しているが、規則が割れると
 * 画面と紙で泊数や到着日がずれるので、変えるときは必ず両方を直すこと。
 */
type OngoingTone =
  | { tone: 'event'; label: string; icon: LucideIcon }
  | { tone: 'state'; label: string }

function ongoingToneOf(booking: Booking, date: string): OngoingTone {
  const isLodging = booking.kind === 'lodging'
  // date は groupByDay が現地日付で作った見出しなので、終了日も現地日付で見る
  if (booking.end !== null && stampDate(booking.end) === date) {
    return {
      tone: 'event',
      label: isLodging ? 'チェックアウト' : '到着',
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
 * 前日から続いている予約の 1 行。
 *
 * チェックアウト・到着は「その時刻までに動く必要がある」締切なので、
 * 予約の行と同じ太さの罫線と太字で受け止める。過ぎれば延泊料金が出る、
 * 旅行中もっとも硬い締切がこれである。
 * 滞在中・移動中・継続中は行動を要求しないただの状態なので、破線の細い罫線で
 * その日の予定に埋もれない程度に置くだけにする。
 */
function OngoingRow({
  booking,
  date,
  displayTz,
}: {
  booking: Booking
  date: string
  displayTz: string
}) {
  const status = ongoingToneOf(booking, date)
  const end = booking.end
  const time =
    status.tone === 'event' && end !== null && !end.allDay
      ? formatStamp(end, displayTz)
      : null

  return (
    <div
      className={`flex break-inside-avoid gap-[8pt] py-[3pt] pl-[7pt] ${
        status.tone === 'event' ? SPINE_STRONG : SPINE_WEAK
      }`}
    >
      <div className={TIME_COL}>
        <TimeCell text={time ?? ''} strong={false} />
      </div>
      <div
        className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-[5pt] ${
          status.tone === 'event'
            ? 'text-[9.5pt]'
            : 'text-[8.5pt] text-gray-600'
        }`}
      >
        {status.tone === 'event' ? (
          <status.icon size={11} className="shrink-0" aria-hidden="true" />
        ) : (
          <KindIcon
            kind={booking.kind}
            size={10}
            className="shrink-0 text-gray-500"
          />
        )}
        {/* 開始日の行と題名が完全一致するので、継続であることを記号でも示す */}
        <span>↳ {booking.title}</span>
        <span className={status.tone === 'event' ? 'font-bold' : ''}>
          {status.label}
        </span>
      </div>
    </div>
  )
}

/** その夜の寝る場所。日付の帯の右肩と、夜の一覧の両方で使う */
interface NightLabel {
  icon: LucideIcon
  text: string
  /** 寝る場所が無い夜。太字にして紙の上でも見落とさせない */
  alert: boolean
}

function nightLabelOf(
  night: NightSlot,
  bookings: Map<string, Booking>,
): NightLabel {
  const booking =
    night.bookingId === undefined ? undefined : bookings.get(night.bookingId)
  if (night.covered === 'lodging') {
    return {
      icon: CheckCircle2,
      // 呼び名は画面の寝る場所カバレッジ(NightCoverageStrip の cellLabel)に揃える。
      // 同じ夜を指しているのに画面と紙で宿の名前が違うと、突き合わせができなくなる
      text: booking?.title || booking?.place?.name || '宿泊',
      alert: false,
    }
  }
  if (night.covered === 'overnight') {
    return {
      icon: Moon,
      text: `${booking?.title ?? '夜行移動'}(車中泊)`,
      alert: false,
    }
  }
  return { icon: AlertTriangle, text: '未確保', alert: true }
}

/**
 * 夜の一覧。
 *
 * 日付の帯にも「今夜」を出しているので情報としては重なるが、両方置く。
 * 帯のほうはその日を読んでいる最中の視線の先にあり、こちらは
 * 「明後日どこに泊まるんだっけ」を旅程を遡らずに引くための表で、
 * 紙にはページをまたいで検索する手段が無い以上、役割が別物になる。
 */
function NightsSection({
  nights,
  bookings,
}: {
  nights: Array<NightSlot>
  /** NightSlot.bookingId から宿の名前を引くための索引 */
  bookings: Map<string, Booking>
}) {
  if (nights.length === 0) return null

  const uncovered = countUncoveredNights(nights)

  return (
    <section>
      <SectionHeading
        icon={Moon}
        title="夜の一覧"
        note={
          uncovered === 0
            ? `${nights.length}泊すべて確保済み`
            : `${nights.length}泊中 ${uncovered}泊が未確保`
        }
      />
      <ul className="mt-[3pt]">
        {nights.map((night) => {
          const label = nightLabelOf(night, bookings)
          const Icon = label.icon
          return (
            <li
              key={night.date}
              className={`flex break-inside-avoid items-center gap-[6pt] border-b-[0.5pt] border-gray-300 py-[2.5pt] pl-[6pt] ${
                label.alert
                  ? SPINE_STRONG
                  : 'border-l-[0.75pt] border-l-gray-300'
              }`}
            >
              <span className="w-[52pt] shrink-0 font-mono text-[9pt]">
                {formatDateJa(night.date)}
              </span>
              <Icon size={11} className="shrink-0" aria-hidden="true" />
              <span className={`text-[9pt] ${label.alert ? 'font-bold' : ''}`}>
                {label.text}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function PrintSheet({ state, displayTz }: PrintSheetProps) {
  // キャンセル済みは紙に残す価値がないので、印刷時だけ取り除く
  // (画面側のタイムライン表示には影響しない、この関数内だけの絞り込み)。
  // 継続行(ongoing)側は groupByDay がもともとキャンセル済みを外している。
  const days = groupByDay(state.bookings, state).map((day) => ({
    ...day,
    bookings: day.bookings.filter((b) => b.status !== 'cancelled'),
  }))

  const nights = computeNights(state)
  const uncoveredNights = countUncoveredNights(nights)
  const aliveCount = state.bookings.filter(
    (b) => b.status !== 'cancelled',
  ).length
  const bookingMap = new Map(state.bookings.map((b) => [b.id, b]))

  // 1 件も無ければフィールドごと存在しない(types.ts 参照)
  const travelDocs = state.travelDocs ?? []
  const hasTitle = state.tripTitle.length > 0

  return (
    <div className="hidden bg-white px-[40pt] py-[32pt] text-[9pt] leading-snug text-black print:block">
      {/*
        表紙にあたる帯。旅行名を 22pt の明朝で置き、期間・泊数・件数を
        その下に等幅で並べて、二重線で本文と切る。二重線は「ここから中身」を
        地色なしで宣言できる、印刷でいちばん確実な区切り
      */}
      <header className="break-inside-avoid break-after-avoid">
        {hasTitle ? (
          <p className="font-serif text-[8pt] tracking-[0.35em] text-gray-700">
            旅のしおり
          </p>
        ) : null}
        <h1 className="mt-[2pt] font-serif text-[22pt] font-bold leading-[1.2]">
          {hasTitle ? state.tripTitle : '旅のしおり'}
        </h1>
        <div className="mt-[4pt] flex flex-wrap items-baseline gap-x-[10pt] gap-y-[2pt] text-[9pt]">
          <span className="font-mono text-[11pt] font-bold">
            {formatDateJa(state.startDate)} 〜 {formatDateJa(state.endDate)}
          </span>
          <span>
            {nights.length}泊{nights.length + 1}日
          </span>
          <span>予約 {aliveCount}件</span>
          {uncoveredNights > 0 ? (
            <span className="inline-flex items-center gap-[3pt] font-bold">
              <AlertTriangle size={10} aria-hidden="true" />
              寝る場所が未確保の夜 {uncoveredNights}泊
            </span>
          ) : null}
        </div>
        <div className="mt-[6pt] border-t-[2.5pt] border-black" />
        <div className="mt-[1.5pt] border-t-[0.75pt] border-black" />
        <div className="mt-[3pt] flex flex-wrap justify-between gap-x-[10pt] text-[7pt] text-gray-600">
          <span>時刻はすべて現地時間。移動には日本時間(JST)を併記</span>
          <span>印刷日 {formatDateJa(todayISO())}</span>
        </div>
      </header>

      {days.map((day) => {
        const timeline = dayTimeline(day)
        // 旅行期間の何日目か。前泊など期間より前の日には番号を振らない
        const dayNumber = diffDays(state.startDate, day.date) + 1
        const night = day.night
        const nightLabel =
          night === null ? null : nightLabelOf(night, bookingMap)
        const NightIcon = nightLabel?.icon

        return (
          <section key={day.date}>
            {/*
              日付の帯。上を 2pt、下を 0.75pt にして「ここから 1 日が始まる」を
              罫線の非対称で示す。地色は補助でしかなく、刷られなくても帯として読める
            */}
            <div
              className="mt-[14pt] flex break-inside-avoid flex-wrap items-baseline justify-between gap-x-[8pt] gap-y-[2pt] border-t-[2pt] border-b-[0.75pt] border-black bg-gray-100 px-[5pt] py-[3pt] break-after-avoid"
              style={TINT_STYLE}
            >
              <div className="flex items-baseline gap-[6pt]">
                {dayNumber >= 1 ? (
                  <span className="border-[0.75pt] border-black px-[3pt] py-[0.5pt] font-mono text-[7.5pt] font-bold tracking-[0.08em]">
                    DAY {dayNumber}
                  </span>
                ) : null}
                <h2 className="font-serif text-[15pt] font-bold leading-none">
                  {formatDateJa(day.date)}
                </h2>
              </div>
              {nightLabel !== null && NightIcon !== undefined ? (
                <span className="flex items-center gap-[4pt] text-[8.5pt]">
                  <span className="text-[7pt] tracking-[0.15em] text-gray-700">
                    今夜
                  </span>
                  <NightIcon size={10} aria-hidden="true" />
                  <span className={nightLabel.alert ? 'font-bold' : ''}>
                    {nightLabel.text}
                  </span>
                </span>
              ) : null}
            </div>

            {timeline.length === 0 ? (
              <p
                className={`py-[4pt] pl-[7pt] text-[8.5pt] text-gray-500 ${SPINE_WEAK}`}
              >
                予定なし
              </p>
            ) : (
              timeline.map(({ row, booking }) =>
                row === 'ongoing' ? (
                  <OngoingRow
                    key={booking.id}
                    booking={booking}
                    date={day.date}
                    displayTz={displayTz}
                  />
                ) : (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    displayTz={displayTz}
                  />
                ),
              )
            )}
          </section>
        )
      })}

      <NightsSection nights={nights} bookings={bookingMap} />

      {/*
        旅行前の手続き(ビザ・eSIMなど)。緊急連絡先と同じく「電池が切れても
        通信できなくても読める紙」として持ち歩く情報なので、その直前に置く。
        1件も無ければセクションごと省く(紙面を無駄に伸ばさないため)。

        未取得のものも印刷に載せる: この印刷しおりは出発直前にも見返す前提の
        紙なので、取得済みだけに絞ると「印刷した時点で何が残っていたか」が
        紙の上からは分からなくなる。むしろ未取得のものが載っているほうが、
        紙を見返したときに「これはまだだった」と気付ける。
        参照番号と有効期間は必ず載せる(紙で持ち歩く目的そのものがそこにあるため)。
      */}
      {travelDocs.length > 0 ? (
        <section>
          <SectionHeading icon={ScrollText} title="旅行前の手続き" />
          <ul className="mt-[3pt]">
            {travelDocs.map((doc) => (
              <li
                key={doc.id}
                className="flex break-inside-avoid gap-[8pt] border-b-[0.5pt] border-gray-300 py-[3pt] pl-[6pt] border-l-[0.75pt] border-l-gray-300"
              >
                <span className="w-[52pt] shrink-0 text-[7.5pt] text-gray-700">
                  {TRAVEL_DOC_KIND_LABELS[doc.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-[6pt]">
                    <span className="text-[9.5pt] font-bold">{doc.title}</span>
                    {doc.region !== undefined ? (
                      <span className="text-[8pt] text-gray-700">
                        {doc.region}
                      </span>
                    ) : null}
                    <span className="border-[0.5pt] border-black px-[3pt] text-[7.5pt]">
                      {TRAVEL_DOC_STATUS_LABELS[doc.status]}
                    </span>
                  </div>
                  {doc.validFrom !== undefined ||
                  doc.validUntil !== undefined ? (
                    <p className="mt-[1pt] font-mono text-[8pt] text-gray-700">
                      有効期間 {doc.validFrom ?? '未定'} 〜{' '}
                      {doc.validUntil ?? '未定'}
                    </p>
                  ) : null}
                  {doc.referenceNumber !== undefined ? (
                    <p className="mt-[2pt]">
                      <CodeBox label="参照番号" value={doc.referenceNumber} />
                    </p>
                  ) : null}
                  {doc.note !== undefined && doc.note.length > 0 ? (
                    <p className="mt-[2pt] text-[8pt] text-gray-700">
                      メモ: {doc.note}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        緊急連絡先は電話をかけるための番号なので、番号そのものを等幅で
        いちばん大きく置く。慌てている人が押し間違えないことのほうが、
        紙面の統一より優先する
      */}
      <section>
        <SectionHeading icon={PhoneCall} title="緊急連絡先" />
        {state.emergencyContacts.length === 0 ? (
          <p className="mt-[3pt] text-[8.5pt] text-gray-600">
            緊急連絡先が未登録です。
          </p>
        ) : (
          <ul className="mt-[3pt]">
            {state.emergencyContacts.map((contact) => (
              <li
                key={contact.id}
                className="flex break-inside-avoid flex-wrap items-baseline gap-x-[8pt] border-b-[0.5pt] border-gray-300 py-[3pt] pl-[6pt] border-l-[0.75pt] border-l-gray-300"
              >
                <span className="w-[80pt] shrink-0 text-[9pt] font-bold">
                  {contact.label}
                </span>
                <span className="font-mono text-[11pt] font-bold tracking-[0.04em]">
                  {contact.value}
                </span>
                {contact.note !== undefined && contact.note.length > 0 ? (
                  <span className="text-[8pt] text-gray-700">
                    {contact.note}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
