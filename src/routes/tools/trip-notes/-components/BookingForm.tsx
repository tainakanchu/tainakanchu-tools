/**
 * 予約の追加・編集フォーム。
 *
 * 「入力コストで挫折させないこと」を最優先にする。常時見えるのは
 * 種別・タイトルと、Booking.start を組み立てるのに最低限要る
 * 日付/時刻/タイムゾーン/終日チェックだけ(start は型上 必須なので
 * ここだけは折りたためない)。確認番号・金額・場所などの付随情報は
 * すべて <details> の「詳細」に畳んでおき、開かなくても保存できるようにする。
 *
 * 時刻の入力は必ず date + time + IANA タイムゾーンの 3 点セットで受け取り、
 * tryMakeStamp() に通す。zdt 文字列を直接書かせると容易に壊れた Stamp を
 * 作れてしまうため。
 *
 * 冒頭には「AI に読ませて貼り付ける」を畳んで置いてある。設定タブの
 * AI インポート・ウィザードまで戻らなくても、日程タブで穴を見つけたその場で
 * 予約確認メールの内容を流し込めるようにするため。ただし既定は閉じたままにし、
 * 主役はあくまで手入力に置く。
 */

import { useId, useMemo, useState } from 'react'
import { ChevronDown, Sparkles, X } from 'lucide-react'
import { parseImportedJson } from '../../../../lib/trip-notes/aiImport'
import { buildImportPrompt } from '../../../../lib/trip-notes/aiPrompt'
import {
  COMMON_TIMEZONES,
  isValidISODate,
  tryMakeStamp,
  tryParseStamp,
} from '../../../../lib/trip-notes/datetime'
import { newId } from '../../../../lib/trip-notes/id'
import { isTransportKind } from '../../../../lib/trip-notes/nights'
import {
  BOOKING_KINDS,
  BOOKING_STATUSES,
  MAX_CHECK_IN_OPENS_MINUTES_BEFORE,
  MAX_DEADLINE_MINUTES_BEFORE,
  PAYMENT_STATUSES,
  isCheckInOpensMinutesBefore,
  isDeadlineMinutesBefore,
} from '../../../../lib/trip-notes/storage'
import { useDialogFocus } from '../-lib/focusTrap'
import {
  fieldClass,
  iconButtonClass,
  labelClass,
  primaryButtonClass,
  subtleButtonClass,
  unverifiedFieldClass,
} from '../-lib/styles'
import {
  AiServiceLinks,
  ImportIssueDetails,
  PromptCopyBlock,
} from './AiImportParts'
import { BOOKING_KIND_LABELS, KindIcon } from './KindIcon'
import { ReviewDialog } from './ReviewDialog'
import { BOOKING_STATUS_LABELS, PAYMENT_STATUS_LABELS } from './StatusBadge'
import type { FormEvent, ReactNode } from 'react'
import type { ImportResult } from '../../../../lib/trip-notes/aiImport'
import type {
  Booking,
  BookingKind,
  BookingStatus,
  FieldKey,
  Money,
  PaymentStatus,
  Place,
  Stamp,
  TripNotesState,
} from '../../../../lib/trip-notes/types'
import type { TripNotesDispatch } from '../-lib/reducer'

/**
 * <select> から返る値を型に戻すための番人。
 *
 * option は BOOKING_KINDS などから生成しているので、実際には妥当な値しか来ない。
 * それでも event.target.value の型は string でしかないので、アサーションで
 * 押し込むと、将来 option を手書きしたり値を打ち間違えたりしたときに、
 * 型としては通るのに実体は不正、という状態がそのまま Booking に入ってしまう。
 * 該当しない値が来たら「何もしない(今の選択を保つ)」に倒しておく。
 */
const BOOKING_KIND_SET = new Set<string>(BOOKING_KINDS)
const BOOKING_STATUS_SET = new Set<string>(BOOKING_STATUSES)
const PAYMENT_STATUS_SET = new Set<string>(PAYMENT_STATUSES)

function isBookingKind(value: string): value is BookingKind {
  return BOOKING_KIND_SET.has(value)
}

function isBookingStatus(value: string): value is BookingStatus {
  return BOOKING_STATUS_SET.has(value)
}

function isPaymentStatus(value: string): value is PaymentStatus {
  return PAYMENT_STATUS_SET.has(value)
}

interface BookingFormProps {
  /** 編集なら既存の予約、新規なら null */
  booking: Booking | null
  /** 新規のときの初期日付(YYYY-MM-DD)。null なら旅行開始日 */
  initialDate: string | null
  /** 新規のときの初期種別 */
  initialKind?: BookingKind
  state: TripNotesState
  displayTz: string
  dispatch: TripNotesDispatch
  onClose: () => void
}

interface FormState {
  kind: BookingKind
  title: string
  date: string
  time: string
  tz: string
  allDay: boolean
  hasEnd: boolean
  endDate: string
  endTime: string
  endTz: string
  status: BookingStatus
  payment: PaymentStatus
  confirmationNumber: string
  provider: string
  priceAmount: string
  priceCurrency: string
  freeCancelUntil: string
  /** オンラインチェックインが開く時刻(出発の何分前か)。空文字は「入力なし」 */
  onlineCheckInMinutes: string
  /** 搭乗手続きの締切(出発の何分前か)。空文字は「入力なし」 */
  checkInMinutes: string
  /** 受託手荷物の預け締切(出発の何分前か)。空文字は「入力なし」 */
  bagDropMinutes: string
  note: string
  placeName: string
  placeLocalName: string
  /** ラテン文字表記。外部の検索サイトに渡す用(types.ts の Place を参照) */
  placeLatinName: string
  placeAddress: string
  fromName: string
  fromLatinName: string
  fromAddress: string
  toName: string
  toLatinName: string
  toAddress: string
}

/**
 * 入力欄 1 つ 1 つが、どの FieldKey の「未確認」に対応するか。
 *
 * AI が貼り込んだ値を人が書き換えたら、その場で黄色い下線を外すのに使う。
 * 追加モードにはまだ予約の id が無く「確認済みにする」ボタンを出せないので、
 * ここで外さないと下線を消す手段が無くなってしまう。
 * Record を全キーで埋めておけば、FormState に欄を足したときに型検査で気付ける。
 */
const FIELD_OF: Record<keyof FormState, FieldKey> = {
  kind: 'kind',
  title: 'title',
  date: 'start',
  time: 'start',
  tz: 'start',
  allDay: 'start',
  hasEnd: 'end',
  endDate: 'end',
  endTime: 'end',
  endTz: 'end',
  status: 'status',
  payment: 'payment',
  confirmationNumber: 'confirmationNumber',
  provider: 'provider',
  priceAmount: 'price',
  priceCurrency: 'price',
  freeCancelUntil: 'freeCancelUntil',
  onlineCheckInMinutes: 'onlineCheckInOpensMinutesBefore',
  checkInMinutes: 'checkInClosesMinutesBefore',
  bagDropMinutes: 'bagDropClosesMinutesBefore',
  note: 'note',
  placeName: 'place',
  placeLocalName: 'place',
  placeLatinName: 'place',
  placeAddress: 'place',
  fromName: 'from',
  fromLatinName: 'from',
  fromAddress: 'from',
  toName: 'to',
  toLatinName: 'to',
  toAddress: 'to',
}

interface StampFields {
  date: string
  time: string
  tz: string
}

/** 既存の Stamp をフォームの date/time/tz に戻す。壊れていたら安全側の既定値 */
function stampToFields(stamp: Stamp, fallbackTz: string): StampFields {
  const zdt = tryParseStamp(stamp)
  if (zdt === null) return { date: '', time: '10:00', tz: fallbackTz }
  return {
    date: zdt.toPlainDate().toString(),
    time: `${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`,
    tz: zdt.timeZoneId,
  }
}

function buildInitialForm(
  booking: Booking | null,
  initialDate: string | null,
  initialKind: BookingKind | undefined,
  state: TripNotesState,
  displayTz: string,
): FormState {
  if (booking !== null) {
    const start = stampToFields(booking.start, displayTz)
    const end =
      booking.end !== null ? stampToFields(booking.end, start.tz) : null
    return {
      kind: booking.kind,
      title: booking.title,
      date: start.date,
      time: start.time,
      tz: start.tz,
      allDay: booking.start.allDay,
      hasEnd: booking.end !== null,
      endDate: end?.date ?? start.date,
      endTime: end?.time ?? start.time,
      endTz: end?.tz ?? start.tz,
      status: booking.status,
      payment: booking.payment,
      confirmationNumber: booking.confirmationNumber ?? '',
      provider: booking.provider ?? '',
      priceAmount:
        booking.price !== undefined ? String(booking.price.amount) : '',
      priceCurrency: booking.price?.currency ?? '',
      freeCancelUntil: booking.freeCancelUntil ?? '',
      onlineCheckInMinutes:
        booking.onlineCheckInOpensMinutesBefore !== undefined
          ? String(booking.onlineCheckInOpensMinutesBefore)
          : '',
      checkInMinutes:
        booking.checkInClosesMinutesBefore !== undefined
          ? String(booking.checkInClosesMinutesBefore)
          : '',
      bagDropMinutes:
        booking.bagDropClosesMinutesBefore !== undefined
          ? String(booking.bagDropClosesMinutesBefore)
          : '',
      note: booking.note ?? '',
      placeName: booking.place?.name ?? '',
      placeLocalName: booking.place?.localName ?? '',
      placeLatinName: booking.place?.latinName ?? '',
      placeAddress: booking.place?.address ?? '',
      fromName: booking.from?.name ?? '',
      fromLatinName: booking.from?.latinName ?? '',
      fromAddress: booking.from?.address ?? '',
      toName: booking.to?.name ?? '',
      toLatinName: booking.to?.latinName ?? '',
      toAddress: booking.to?.address ?? '',
    }
  }

  const date = initialDate ?? state.startDate
  return {
    kind: initialKind ?? 'lodging',
    title: '',
    date,
    time: '10:00',
    tz: displayTz,
    allDay: false,
    hasEnd: false,
    endDate: date,
    endTime: '10:00',
    endTz: displayTz,
    status: BOOKING_STATUSES[0],
    payment: PAYMENT_STATUSES[0],
    confirmationNumber: '',
    provider: '',
    priceAmount: '',
    priceCurrency: '',
    freeCancelUntil: '',
    onlineCheckInMinutes: '',
    checkInMinutes: '',
    bagDropMinutes: '',
    note: '',
    placeName: '',
    placeLocalName: '',
    placeLatinName: '',
    placeAddress: '',
    fromName: '',
    fromLatinName: '',
    fromAddress: '',
    toName: '',
    toLatinName: '',
    toAddress: '',
  }
}

/**
 * タイムゾーン select の選択肢。COMMON_TIMEZONES(44 ゾーン) に無い値が
 * 既存データに入っていても選択肢として残し、編集時に値を失わせない。
 */
function tzOptionsFor(current: string) {
  if (COMMON_TIMEZONES.some((opt) => opt.tz === current))
    return COMMON_TIMEZONES
  return [{ tz: current, label: `${current}(現在の設定)` }, ...COMMON_TIMEZONES]
}

/**
 * 「出発の何分前か」の欄に並べるボタン 1 つ。
 * 値は必ず分で持ち、ラベルだけを項目に合った単位で書く
 * (単位を分にそろえる理由は MinutesBeforeField のコメントを参照)。
 */
interface MinutesPreset {
  minutes: number
  label: string
}

/**
 * 締切の入力欄に並べる「よくある値」。実在する規定に多いものから選んである。
 * 30/45 分前は国内線、60 分前は国際線の標準、90 分前は大型機や
 * 混む空港に多い。ここに無い値(75 分前など)も現実にあるので、
 * プリセットだけにせず自由入力を必ず残す。
 */
const DEADLINE_PRESETS: Array<MinutesPreset> = [
  { minutes: 30, label: '30分前' },
  { minutes: 45, label: '45分前' },
  { minutes: 60, label: '60分前' },
  { minutes: 90, label: '90分前' },
]

/**
 * オンラインチェックインが開く時刻の「よくある値」。この 3 つしか置かない。
 *
 * 航空会社が公開している開放時刻は 24 / 48 / 72 時間前にほぼ収まる
 * (24 時間前がもっとも多く、上級会員や一部の運賃で 48 / 72 時間前に前倒しになる)。
 * 締切のように「その空港だけ 75 分前」という刻みは無いので、
 * 選択肢を増やしても押す前に読む手間が増えるだけになる。
 * それでも自由入力を残すのは、まれに 30 時間前のような値を出す会社があるため。
 */
const CHECK_IN_OPEN_PRESETS: Array<MinutesPreset> = [
  { minutes: 24 * 60, label: '24時間前' },
  { minutes: 48 * 60, label: '48時間前' },
  { minutes: 72 * 60, label: '72時間前' },
]

/**
 * 「出発の何分前か」の入力欄の値を Booking の値に変換する。
 * 空欄は「入力なし」(undefined)、妥当でない値は 'invalid' を返して
 * 呼び出し元に入力の修正を促させる。
 *
 * 妥当性の判定を storage.ts と共有しているのは、ここで通した値が
 * そのまま保存されるため。フォームの許す範囲が保存側より広いと
 * 「入力できたのに次回起動で消えている締切」ができてしまう。
 * 判定そのものを引数で受けるのは、上限だけが項目で違うから
 * (締切は 24 時間、オンラインチェックインの開放は 72 時間。
 * storage.ts の MAX_DEADLINE_MINUTES_BEFORE / MAX_CHECK_IN_OPENS_MINUTES_BEFORE)。
 * 広いほうの判定で締切まで通してしまうと、フォームと保存側の食い違いが
 * 締切の欄にだけ復活する。
 */
function parseMinutesBeforeInput(
  raw: string,
  isValid: (value: unknown) => value is number,
): number | undefined | 'invalid' {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  return isValid(value) ? value : 'invalid'
}

/**
 * 「何分前か」を時間に直した読み(例: 1440 → '24時間前')。時間ちょうどに
 * ならない値と、1 時間そこそこの値では null を返す。
 *
 * 45 分を「0.75時間前」と出しても読みにくくなるだけで、換算が効くのは
 * オンラインチェックインの開放のように桁が増えたときだけだから。
 */
function hoursBeforeLabel(minutes: number): string | null {
  if (!Number.isInteger(minutes) || minutes < 120 || minutes % 60 !== 0) {
    return null
  }
  return `${minutes / 60}時間前`
}

function endLabelFor(kind: BookingKind): string {
  if (kind === 'lodging') return 'チェックアウト日時'
  if (isTransportKind(kind)) return '到着日時'
  return '終了日時'
}

/**
 * 空文字を undefined に丸め込みつつ Place を組み立てる。name が空なら Place ごと無し。
 *
 * 引数をオブジェクトで受けるのは、同じ型(string)の欄が並ぶため。位置引数だと
 * 現地語表記の欄を持たない出発地・到着地の呼び出しが buildPlace(name, '', '', address)
 * のような形になり、どの空文字がどの欄なのかを数えないと読めなくなる。
 * しかも取り違えても型が同じなので検査では気付けない。
 */
function buildPlace(fields: {
  name: string
  localName?: string
  latinName?: string
  address?: string
}): Place | undefined {
  const trimmedName = fields.name.trim()
  if (trimmedName === '') return undefined
  const place: Place = { name: trimmedName }
  const trimmedLocal = fields.localName?.trim() ?? ''
  if (trimmedLocal !== '') place.localName = trimmedLocal
  const trimmedLatin = fields.latinName?.trim() ?? ''
  if (trimmedLatin !== '') place.latinName = trimmedLatin
  const trimmedAddress = fields.address?.trim() ?? ''
  if (trimmedAddress !== '') place.address = trimmedAddress
  return place
}

export function BookingForm({
  booking,
  initialDate,
  initialKind,
  state,
  displayTz,
  dispatch,
  onClose,
}: BookingFormProps) {
  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm(booking, initialDate, initialKind, state, displayTz),
  )
  const [error, setError] = useState<string | null>(null)
  // AI から貼り込んだ値の未確認リスト。貼り込んでいなければ null。
  // booking.unverified(保存済みのもの)とは別に持つ。追加モードには
  // まだ予約が無いし、編集モードでは「貼り込んだ直後の状態」を
  // 保存前から下線で見せたいため
  const [aiUnverified, setAiUnverified] = useState<Array<FieldKey> | null>(null)
  const [aiEvidence, setAiEvidence] = useState<
    Partial<Record<FieldKey, string>> | undefined
  >(undefined)
  const [aiText, setAiText] = useState('')
  const [aiResult, setAiResult] = useState<ImportResult | null>(null)
  // 編集モードで 1 件読み取れたときの保留。上書きの確認を取ってから反映する
  const [pendingOverwrite, setPendingOverwrite] = useState<Booking | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const titleId = useId()
  // レビューを重ねている間は自分の Esc / Tab を止める。
  // 止めないと Esc 一度でレビューごとフォームまで閉じてしまう
  const panelRef = useDialogFocus<HTMLDivElement>({
    onClose,
    paused: reviewOpen,
  })

  // 画面に出ている表示タイムゾーンをプロンプトの基準にする。
  // AiImportPanel と同じ根拠(前提がずれると AI が年や時差を取り違える)
  const prompt = useMemo(
    () => buildImportPrompt(state, { deviceTz: displayTz }),
    [state, displayTz],
  )

  // unverified は毎レンダー booking(親から渡される最新の予約)から読む。
  // フォームの入力値はローカル state で保持しているので、「確認済みにする」を
  // 押しても入力途中の他フィールドが巻き戻らない
  const unverified = aiUnverified ?? booking?.unverified ?? []
  const ufc = (field: FieldKey) =>
    unverified.includes(field) ? unverifiedFieldClass : ''

  function set<TKey extends keyof FormState>(
    key: TKey,
    value: FormState[TKey],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
    // 人が書き換えた欄は、その時点で目を通したことになるので未確認から外す
    // (reducer の mergeUpdatedBooking が保存時にやっているのと同じ考え方)
    const field = FIELD_OF[key]
    setAiUnverified((prev) => {
      if (prev === null || !prev.includes(field)) return prev
      return prev.filter((entry) => entry !== field)
    })
  }

  /** AI 入力の注記 + 確認ボタン。unverified に無いフィールドでは何も出さない */
  function unverifiedNote(field: FieldKey): ReactNode {
    if (!unverified.includes(field)) return null
    const bookingId = booking?.id
    // 「確認済みにする」は保存済みの予約にしか効かない(dispatch に id が要る)。
    // 貼り込んだ直後の値はまだ保存されていないので、注記だけを出して
    // 「欄を直せば下線が消える」に委ねる
    const canVerify = bookingId !== undefined && aiUnverified === null
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-amber-700">
        <span>AI が入力した値です。内容を確認してください。</span>
        {canVerify ? (
          <button
            type="button"
            onClick={() =>
              dispatch({ type: 'verifyField', id: bookingId, field })
            }
            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium text-amber-800 transition hover:bg-amber-100"
          >
            確認済みにする
          </button>
        ) : null}
      </p>
    )
  }

  /** 読み取れた 1 件をフォームの各欄へ流し込む */
  function applyParsed(parsed: Booking): void {
    setForm(buildInitialForm(parsed, null, undefined, state, displayTz))
    setAiUnverified(parsed.unverified ?? [])
    setAiEvidence(parsed.evidence)
    setPendingOverwrite(null)
    setError(null)
  }

  function handleParse(): void {
    const result = parseImportedJson(aiText, displayTz)
    setAiResult(result)
    setPendingOverwrite(null)
    // 複数件はフォームに収まらないので、まとめて取り込みの導線に回す。
    // 0 件のときは issues だけを見せる
    if (result.bookings.length !== 1) return

    const parsed = result.bookings[0]
    // 編集モードでの扱い:
    // 使えるようにはするが、いま入力されている内容を丸ごと置き換えることに
    // なるので、その場では反映せず確認を挟む。追加モードだけに閉じてしまうと
    // 「手で作った予約の骨組みに確認メールの中身を流し込む」ができなくなり、
    // かといって黙って上書きすると入力中の値が予告なく消える。
    if (booking === null) applyParsed(parsed)
    else setPendingOverwrite(parsed)
  }

  /** まとめて取り込みの確定。フォームで 1 件作る話ではなくなるので、そのまま閉じる */
  function handleBulkConfirm(confirmed: Array<Booking>): void {
    setReviewOpen(false)
    if (confirmed.length === 0) return
    dispatch({ type: 'importBookings', bookings: confirmed })
    onClose()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedTitle = form.title.trim()
    if (trimmedTitle === '') {
      setError('タイトルを入力してください')
      return
    }
    if (!isValidISODate(form.date)) {
      setError('日付を正しく入力してください')
      return
    }

    const start = tryMakeStamp(
      form.date,
      form.allDay ? null : form.time,
      form.tz,
    )
    if (start === null) {
      setError(
        '開始日時を変換できませんでした。日付・時刻・タイムゾーンを確認してください',
      )
      return
    }

    let end: Stamp | null = null
    if (form.hasEnd) {
      if (!isValidISODate(form.endDate)) {
        setError('終了日を正しく入力してください')
        return
      }
      end = tryMakeStamp(
        form.endDate,
        form.allDay ? null : form.endTime,
        form.endTz,
      )
      if (end === null) {
        setError(
          '終了日時を変換できませんでした。日付・時刻・タイムゾーンを確認してください',
        )
        return
      }
    }

    // オンラインチェックインの開始と締切は移動系のときだけ効く。空欄は
    // 「入力なし」としてそのまま通すが、入っているのに妥当でない値は
    // 黙って落とさず入力を直してもらう。締切は過ぎると取り返しがつかない情報なので、
    // 「保存したのに入っていない」に気付けないまま当日を迎えるのがいちばん困る
    const checkInOpens = parseMinutesBeforeInput(
      form.onlineCheckInMinutes,
      isCheckInOpensMinutesBefore,
    )
    const checkInCloses = parseMinutesBeforeInput(
      form.checkInMinutes,
      isDeadlineMinutesBefore,
    )
    const bagDropCloses = parseMinutesBeforeInput(
      form.bagDropMinutes,
      isDeadlineMinutesBefore,
    )
    if (isTransportKind(form.kind)) {
      // 上限が違うのでメッセージも分ける。1 本にまとめて「1〜4320 分」と書くと、
      // 締切の欄に 2000 と入れた人には数字が範囲内に見えてしまい、
      // どの欄を直せばよいのか画面から読み取れなくなる
      if (checkInOpens === 'invalid') {
        setError(
          `オンラインチェックイン開始は 1〜${MAX_CHECK_IN_OPENS_MINUTES_BEFORE} 分の整数(出発の何分前か)で入力してください`,
        )
        return
      }
      if (checkInCloses === 'invalid' || bagDropCloses === 'invalid') {
        setError(
          `締切は 1〜${MAX_DEADLINE_MINUTES_BEFORE} 分の整数(出発の何分前か)で入力してください`,
        )
        return
      }
    }

    const next: Booking = {
      id: booking?.id ?? newId('bk'),
      kind: form.kind,
      title: trimmedTitle,
      start,
      end,
      status: form.status,
      payment: form.payment,
    }

    if (isTransportKind(form.kind)) {
      const from = buildPlace({
        name: form.fromName,
        latinName: form.fromLatinName,
        address: form.fromAddress,
      })
      const to = buildPlace({
        name: form.toName,
        latinName: form.toLatinName,
        address: form.toAddress,
      })
      if (from !== undefined) next.from = from
      if (to !== undefined) next.to = to
      // 種別を宿泊などに変えたときは、入力欄が消えるのと一緒に値も落とす。
      // 見えない欄に値が残り続けると、消したつもりの締切や開始時刻が生き残る
      if (typeof checkInOpens === 'number') {
        next.onlineCheckInOpensMinutesBefore = checkInOpens
      }
      if (typeof checkInCloses === 'number') {
        next.checkInClosesMinutesBefore = checkInCloses
      }
      if (typeof bagDropCloses === 'number') {
        next.bagDropClosesMinutesBefore = bagDropCloses
      }
    } else {
      const place = buildPlace({
        name: form.placeName,
        localName: form.placeLocalName,
        latinName: form.placeLatinName,
        address: form.placeAddress,
      })
      if (place !== undefined) next.place = place
    }

    if (form.confirmationNumber.trim() !== '') {
      next.confirmationNumber = form.confirmationNumber.trim()
    }
    if (form.provider.trim() !== '') {
      next.provider = form.provider.trim()
    }

    if (form.priceAmount.trim() !== '' && form.priceCurrency.trim() !== '') {
      const amount = Number(form.priceAmount)
      if (Number.isFinite(amount)) {
        const price: Money = { amount, currency: form.priceCurrency.trim() }
        next.price = price
      }
    }

    if (form.freeCancelUntil !== '' && isValidISODate(form.freeCancelUntil)) {
      next.freeCancelUntil = form.freeCancelUntil
    }
    if (form.note.trim() !== '') {
      next.note = form.note.trim()
    }

    // unverified/evidence は素通しする。実際に値が変わったフィールドを
    // unverified から外す判定は reducer(mergeUpdatedBooking)側の役目。
    // AI から貼り込んだぶんがあればそちらを優先する(貼り込んだ値は
    // 人が確認するまで黄色い下線を残す)
    const carriedUnverified = aiUnverified ?? booking?.unverified
    if (carriedUnverified !== undefined && carriedUnverified.length > 0) {
      next.unverified = carriedUnverified
    }
    const carriedEvidence = aiEvidence ?? booking?.evidence
    if (carriedEvidence !== undefined) next.evidence = carriedEvidence

    dispatch(
      booking === null
        ? { type: 'addBooking', booking: next }
        : { type: 'updateBooking', booking: next },
    )
    onClose()
  }

  const showPlace = !isTransportKind(form.kind)
  // オンラインチェックインの開始も締切も移動系だけの概念。宿やアクティビティに
  // これらの欄を出しても入れるものが無く、詳細の丈だけが伸びる
  const showCheckInTimes = isTransportKind(form.kind)
  const parsedCount = aiResult?.bookings.length ?? 0

  return (
    <>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl outline-none"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <header className="flex items-center justify-between gap-2">
            <h2
              id={titleId}
              className="flex items-center gap-2 text-lg font-bold text-gray-900"
            >
              <KindIcon kind={form.kind} size={18} className="text-cyan-600" />
              {booking === null ? '予約を追加' : '予約を編集'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className={iconButtonClass}
              aria-label="フォームを閉じる"
            >
              <X size={16} />
            </button>
          </header>

          {error !== null ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </p>
          ) : null}

          {/*
            AI に読ませて貼り付ける導線。既定は閉じておく。
            手で 1 件足したいだけの人にとっては通り道でしかないので、
            開かない限りフォームの見た目をほとんど変えない大きさに留める
          */}
          <details className="group rounded-xl border border-cyan-200 bg-cyan-50/50 p-3">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-cyan-800">
              <ChevronDown
                size={14}
                className="transition group-open:rotate-180"
              />
              <Sparkles size={14} aria-hidden="true" />
              AI に読ませて貼り付ける
            </summary>

            <div className="mt-3 space-y-3">
              <PromptCopyBlock prompt={prompt} copyLabel="プロンプトをコピー" />
              <AiServiceLinks compact />
              <p className="text-xs leading-relaxed text-gray-600">
                コピーしたプロンプトを AI に貼り、
                <strong className="font-semibold text-gray-800">
                  予約確認メールや PDF を添付して実行
                </strong>
                してください。出てきた JSON をそのまま下に貼り付けます。
              </p>

              <textarea
                value={aiText}
                onChange={(event) => setAiText(event.target.value)}
                rows={4}
                placeholder="AI の出力をそのまま貼り付け"
                aria-label="AI が返した JSON を貼り付ける"
                className={`${fieldClass} resize-y bg-white font-mono text-xs leading-relaxed`}
              />
              <button
                type="button"
                onClick={handleParse}
                className={subtleButtonClass}
              >
                読み取る
              </button>

              {aiResult !== null ? (
                <div className="space-y-2">
                  {parsedCount === 0 ? (
                    <p
                      role="status"
                      className="text-sm font-medium text-rose-700"
                    >
                      予約を読み取れませんでした。下の「問題の詳細」を確認してください
                    </p>
                  ) : null}

                  {parsedCount === 1 && pendingOverwrite === null ? (
                    <p
                      role="status"
                      className="text-sm font-medium text-emerald-700"
                    >
                      1件を読み取って、下のフォームに反映しました
                    </p>
                  ) : null}

                  {/* 編集モードだけ通る枝。上書きの直前に一度止める */}
                  {pendingOverwrite !== null ? (
                    <div
                      role="alert"
                      className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                    >
                      <p>
                        1件を読み取りました。反映すると、いま入力されている内容は
                        AI が読み取った値で置き換わります。
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => applyParsed(pendingOverwrite)}
                          className={primaryButtonClass}
                        >
                          上書きして反映する
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingOverwrite(null)}
                          className={subtleButtonClass}
                        >
                          やめる
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/*
                    1 件だけフォームに入れて残りを捨てるのは不自然なので、
                    複数件は既存の一括取り込み(日時とタイムゾーンのレビュー付き)へ流す
                  */}
                  {parsedCount > 1 ? (
                    <div className="space-y-2 rounded-xl border border-cyan-300 bg-white px-3 py-2 text-sm text-gray-700">
                      <p className="font-medium text-gray-800">
                        {parsedCount}件見つかりました。まとめて取り込みますか?
                      </p>
                      <p className="text-xs text-gray-500">
                        このフォームには1件しか入りません。日時とタイムゾーンを確認したうえで、まとめて取り込めます。
                      </p>
                      <button
                        type="button"
                        onClick={() => setReviewOpen(true)}
                        className={primaryButtonClass}
                        aria-label={`${parsedCount}件をまとめて取り込む`}
                      >
                        まとめて取り込む({parsedCount}件)
                      </button>
                    </div>
                  ) : null}

                  <ImportIssueDetails issues={aiResult.issues} />
                </div>
              ) : null}
            </div>
          </details>

          {/* 必須の3項目: 種別・タイトルは常時表示。日付は次の開始日時ブロックに含める */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>種別</span>
              <select
                value={form.kind}
                onChange={(event) => {
                  const next = event.target.value
                  if (isBookingKind(next)) set('kind', next)
                }}
                className={`${fieldClass} ${ufc('kind')}`}
              >
                {BOOKING_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {BOOKING_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
              {unverifiedNote('kind')}
            </label>

            <label className="block space-y-1">
              <span className={labelClass}>タイトル</span>
              <input
                type="text"
                required
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                placeholder="例: ○○ホテル"
                className={`${fieldClass} ${ufc('title')}`}
              />
              {unverifiedNote('title')}
            </label>
          </div>

          {/* start は Booking 型上必須なので折りたためない。ただし time/tz には
            既定値(displayTz・10:00)を入れておき、開かなくても保存はできる */}
          <fieldset className="space-y-2 rounded-xl border border-gray-200 p-3">
            <legend className="px-1 text-sm font-semibold text-gray-700">
              開始日時
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className={labelClass}>日付</span>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(event) => set('date', event.target.value)}
                  className={`${fieldClass} ${ufc('start')}`}
                />
              </label>
              {!form.allDay ? (
                <label className="block space-y-1">
                  <span className={labelClass}>時刻</span>
                  <input
                    type="time"
                    required
                    value={form.time}
                    onChange={(event) => set('time', event.target.value)}
                    className={`${fieldClass} ${ufc('start')}`}
                  />
                </label>
              ) : null}
              <label className="block space-y-1">
                <span className={labelClass}>タイムゾーン</span>
                <select
                  value={form.tz}
                  onChange={(event) => set('tz', event.target.value)}
                  className={`${fieldClass} ${ufc('start')}`}
                >
                  {tzOptionsFor(form.tz).map((opt) => (
                    <option key={opt.tz} value={opt.tz}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(event) => set('allDay', event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
              />
              終日の予定にする
            </label>
            {unverifiedNote('start')}
          </fieldset>

          <fieldset className="space-y-2 rounded-xl border border-gray-200 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={form.hasEnd}
                onChange={(event) => set('hasEnd', event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
              />
              {endLabelFor(form.kind)}を設定する
            </label>
            {form.hasEnd ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block space-y-1">
                  <span className={labelClass}>日付</span>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(event) => set('endDate', event.target.value)}
                    className={`${fieldClass} ${ufc('end')}`}
                  />
                </label>
                {!form.allDay ? (
                  <label className="block space-y-1">
                    <span className={labelClass}>時刻</span>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(event) => set('endTime', event.target.value)}
                      className={`${fieldClass} ${ufc('end')}`}
                    />
                  </label>
                ) : null}
                <label className="block space-y-1">
                  <span className={labelClass}>タイムゾーン</span>
                  <select
                    value={form.endTz}
                    onChange={(event) => set('endTz', event.target.value)}
                    className={`${fieldClass} ${ufc('end')}`}
                  >
                    {tzOptionsFor(form.endTz).map((opt) => (
                      <option key={opt.tz} value={opt.tz}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            {unverifiedNote('end')}
          </fieldset>

          <details className="group rounded-xl border border-gray-200 p-3">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-gray-700">
              <ChevronDown
                size={14}
                className="transition group-open:rotate-180"
              />
              詳細(状況・金額・場所など)
            </summary>

            <div className="mt-3 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={labelClass}>予約状況</span>
                  <select
                    value={form.status}
                    onChange={(event) => {
                      const next = event.target.value
                      if (isBookingStatus(next)) set('status', next)
                    }}
                    className={`${fieldClass} ${ufc('status')}`}
                  >
                    {BOOKING_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {BOOKING_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                  {unverifiedNote('status')}
                </label>

                <label className="block space-y-1">
                  <span className={labelClass}>支払状況</span>
                  <select
                    value={form.payment}
                    onChange={(event) => {
                      const next = event.target.value
                      if (isPaymentStatus(next)) set('payment', next)
                    }}
                    className={`${fieldClass} ${ufc('payment')}`}
                  >
                    {PAYMENT_STATUSES.map((payment) => (
                      <option key={payment} value={payment}>
                        {PAYMENT_STATUS_LABELS[payment]}
                      </option>
                    ))}
                  </select>
                  {unverifiedNote('payment')}
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={labelClass}>確認番号</span>
                  <input
                    type="text"
                    value={form.confirmationNumber}
                    onChange={(event) =>
                      set('confirmationNumber', event.target.value)
                    }
                    className={`${fieldClass} font-mono ${ufc('confirmationNumber')}`}
                  />
                  {unverifiedNote('confirmationNumber')}
                </label>

                <label className="block space-y-1">
                  <span className={labelClass}>予約先/会社名</span>
                  <input
                    type="text"
                    value={form.provider}
                    onChange={(event) => set('provider', event.target.value)}
                    className={`${fieldClass} ${ufc('provider')}`}
                  />
                  {unverifiedNote('provider')}
                </label>
              </div>

              <div className="space-y-1">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className={labelClass}>金額</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={form.priceAmount}
                      onChange={(event) =>
                        set('priceAmount', event.target.value)
                      }
                      className={`${fieldClass} ${ufc('price')}`}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className={labelClass}>通貨コード</span>
                    <input
                      type="text"
                      placeholder="JPY"
                      value={form.priceCurrency}
                      onChange={(event) =>
                        set('priceCurrency', event.target.value.toUpperCase())
                      }
                      className={`${fieldClass} ${ufc('price')}`}
                    />
                  </label>
                </div>
                {unverifiedNote('price')}
              </div>

              <label className="block max-w-xs space-y-1">
                <span className={labelClass}>無料キャンセル期限</span>
                <input
                  type="date"
                  value={form.freeCancelUntil}
                  onChange={(event) =>
                    set('freeCancelUntil', event.target.value)
                  }
                  className={`${fieldClass} ${ufc('freeCancelUntil')}`}
                />
                {unverifiedNote('freeCancelUntil')}
              </label>

              {showCheckInTimes && (
                <fieldset className="space-y-3 rounded-lg border border-gray-100 p-3">
                  <legend className="px-1 text-xs font-semibold text-gray-500">
                    オンラインチェックイン・搭乗手続きの時刻(出発の何分前か)
                  </legend>
                  {/*
                    時刻ではなく「何分前か」を入れてもらう。予約確認書も
                    航空会社の規定も「出発の 60 分前まで」「出発の 24 時間前から」
                    という書き方をしており、絶対時刻に直させると、出発時刻を
                    直したときにこちらだけが古いまま残る(types.ts の Booking を参照)。

                    並びは時系列にする。オンラインチェックインが開くのがいちばん早く、
                    次に手荷物、最後に搭乗手続きが締まる。人が動く順に読める
                  */}
                  <p className="text-xs text-gray-500">
                    どれも空港・航空会社・路線(国内線/国際線)によって違います。
                    オンラインチェックインが開く時刻は運賃や会員資格でも変わります。
                    予約確認書やマイページに書かれていれば、その値を優先してください。
                  </p>
                  <MinutesBeforeField
                    label="オンラインチェックイン開始"
                    value={form.onlineCheckInMinutes}
                    onChange={(value) => set('onlineCheckInMinutes', value)}
                    presets={CHECK_IN_OPEN_PRESETS}
                    max={MAX_CHECK_IN_OPENS_MINUTES_BEFORE}
                    unverifiedClass={ufc('onlineCheckInOpensMinutesBefore')}
                    note={unverifiedNote('onlineCheckInOpensMinutesBefore')}
                  />
                  <MinutesBeforeField
                    label="受託手荷物を預ける締切"
                    value={form.bagDropMinutes}
                    onChange={(value) => set('bagDropMinutes', value)}
                    presets={DEADLINE_PRESETS}
                    max={MAX_DEADLINE_MINUTES_BEFORE}
                    unverifiedClass={ufc('bagDropClosesMinutesBefore')}
                    note={unverifiedNote('bagDropClosesMinutesBefore')}
                  />
                  <MinutesBeforeField
                    label="搭乗手続きの締切"
                    value={form.checkInMinutes}
                    onChange={(value) => set('checkInMinutes', value)}
                    presets={DEADLINE_PRESETS}
                    max={MAX_DEADLINE_MINUTES_BEFORE}
                    unverifiedClass={ufc('checkInClosesMinutesBefore')}
                    note={unverifiedNote('checkInClosesMinutesBefore')}
                  />
                </fieldset>
              )}

              <label className="block space-y-1">
                <span className={labelClass}>メモ</span>
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={(event) => set('note', event.target.value)}
                  className={`${fieldClass} ${ufc('note')}`}
                />
                {unverifiedNote('note')}
              </label>

              {showPlace ? (
                <fieldset className="space-y-2 rounded-lg border border-gray-100 p-3">
                  <legend className="px-1 text-xs font-semibold text-gray-500">
                    場所
                  </legend>
                  <label className="block space-y-1">
                    <span className={labelClass}>名称</span>
                    <input
                      type="text"
                      value={form.placeName}
                      onChange={(event) => set('placeName', event.target.value)}
                      className={`${fieldClass} ${ufc('place')}`}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className={labelClass}>現地語表記</span>
                    <input
                      type="text"
                      value={form.placeLocalName}
                      onChange={(event) =>
                        set('placeLocalName', event.target.value)
                      }
                      className={fieldClass}
                    />
                  </label>
                  <LatinNameField
                    value={form.placeLatinName}
                    onChange={(value) => set('placeLatinName', value)}
                  />
                  <label className="block space-y-1">
                    <span className={labelClass}>住所</span>
                    <input
                      type="text"
                      value={form.placeAddress}
                      onChange={(event) =>
                        set('placeAddress', event.target.value)
                      }
                      className={`${fieldClass} ${ufc('place')}`}
                    />
                  </label>
                  {unverifiedNote('place')}
                </fieldset>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset className="space-y-2 rounded-lg border border-gray-100 p-3">
                    <legend className="px-1 text-xs font-semibold text-gray-500">
                      出発地
                    </legend>
                    <label className="block space-y-1">
                      <span className={labelClass}>名称</span>
                      <input
                        type="text"
                        value={form.fromName}
                        onChange={(event) =>
                          set('fromName', event.target.value)
                        }
                        className={`${fieldClass} ${ufc('from')}`}
                      />
                    </label>
                    <LatinNameField
                      value={form.fromLatinName}
                      onChange={(value) => set('fromLatinName', value)}
                    />
                    <label className="block space-y-1">
                      <span className={labelClass}>住所</span>
                      <input
                        type="text"
                        value={form.fromAddress}
                        onChange={(event) =>
                          set('fromAddress', event.target.value)
                        }
                        className={`${fieldClass} ${ufc('from')}`}
                      />
                    </label>
                    {unverifiedNote('from')}
                  </fieldset>

                  <fieldset className="space-y-2 rounded-lg border border-gray-100 p-3">
                    <legend className="px-1 text-xs font-semibold text-gray-500">
                      到着地
                    </legend>
                    <label className="block space-y-1">
                      <span className={labelClass}>名称</span>
                      <input
                        type="text"
                        value={form.toName}
                        onChange={(event) => set('toName', event.target.value)}
                        className={`${fieldClass} ${ufc('to')}`}
                      />
                    </label>
                    <LatinNameField
                      value={form.toLatinName}
                      onChange={(value) => set('toLatinName', value)}
                    />
                    <label className="block space-y-1">
                      <span className={labelClass}>住所</span>
                      <input
                        type="text"
                        value={form.toAddress}
                        onChange={(event) =>
                          set('toAddress', event.target.value)
                        }
                        className={`${fieldClass} ${ufc('to')}`}
                      />
                    </label>
                    {unverifiedNote('to')}
                  </fieldset>
                </div>
              )}
            </div>
          </details>

          <footer className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className={subtleButtonClass}
            >
              キャンセル
            </button>
            <button type="submit" className={primaryButtonClass}>
              保存
            </button>
          </footer>
        </form>
      </div>

      {/*
        レビューはパネルの外(兄弟)に置く。role="dialog" を入れ子にすると
        支援技術からはどちらが手前か分からなくなるうえ、フォーカスの罠も
        重なってしまう。重ねている間は上の useDialogFocus を paused で降ろしてある
      */}
      {reviewOpen && aiResult !== null ? (
        <ReviewDialog
          bookings={aiResult.bookings}
          displayTz={displayTz}
          tripStartDate={state.startDate}
          tripEndDate={state.endDate}
          tzFallbackIds={aiResult.tzFallbackIds}
          onConfirm={handleBulkConfirm}
          onCancel={() => setReviewOpen(false)}
        />
      ) : null}
    </>
  )
}

/**
 * ラテン文字表記の入力欄 1 つ。場所・出発地・到着地の 3 箇所で使う。
 *
 * 説明文を付けているのは、この欄だけ「画面に出すための表記」ではないから。
 * 現地語表記(タクシー運転手に見せる用)の隣に無印の欄が並ぶと、
 * 同じく人に見せる別表記だと読まれ、日本語や現地語が入ってしまう。
 * それでは外部サイトに渡す文字列としての役目を果たさない。
 * 部品として切り出したのは、この説明を 3 箇所に書き写して片方だけ
 * 直し忘れる形にしないため。
 *
 * 未確認(黄色い下線)の扱いは付けていない。未確認は FieldKey 単位
 * (place / from / to)で、名称や住所と同じ欄の一部として既に注記が出る。
 */
function LatinNameField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>ラテン文字表記</span>
      <input
        type="text"
        value={value}
        placeholder="Hong Kong"
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      />
      <span className="block text-xs font-normal text-gray-500">
        Rome2Rio や Google
        マップなど外部の検索サイトに渡す用。日本語の地名のままだと検索が空振りします。
        空港などを除けば、施設名より都市名のほうが当たります。
      </span>
    </label>
  )
}

/**
 * 「出発の何分前か」の入力欄 1 つ。よくある値のボタンと自由入力を並べる。
 * 締切(搭乗手続き・受託手荷物)とオンラインチェックインの開始で共用する。
 *
 * ボタンだけにしないのは、この手の時刻が空港・航空会社ごとに違い、プリセットに
 * 収まらない値が現実にあるため(DEADLINE_PRESETS のコメント参照)。
 * 逆に自由入力だけにすると、旅行前の忙しいときに数字を打つ手間で
 * 入力そのものを諦める。両方置いて、押しても打ってもよい形にする。
 * プリセットと上限を引数で受けるのは、現実的な値の並びも許す範囲も項目で
 * 違うため(締切は 30〜90 分、開始は 24〜72 時間)。
 *
 * 「分前」の単位は入力欄の外に文字として置く。placeholder に入れると
 * 値を打った瞬間に消えてしまい、あとから見返したときに
 * 「60」が分なのか時刻なのか分からなくなる。
 *
 * ■ 持つ値は分にそろえ、見せ方だけ時間にする
 *   オンラインチェックインの開始は 1440 のような大きな値になり、分のまま
 *   出されても桁を数えないと何時間前なのか読めない。かといって項目ごとに
 *   単位を変えると、締切の 60(分)と開始の 60(時間)が同じ数字で別の意味を
 *   持つことになり、「開いてから締まるまでどれだけあるか」を引き算で出すことも
 *   できなくなる。だから保存する値は必ず分にして、プリセットのラベルと
 *   入力欄の脇の換算だけを時間表記にする。換算を入力欄の脇にも出しておけば、
 *   プリセットを押さずに 1440 と手で打った人にも同じ読みやすさが届く。
 */
function MinutesBeforeField({
  label,
  value,
  onChange,
  presets,
  max,
  unverifiedClass,
  note,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  /** 「よくある値」のボタン。値は分、ラベルは項目に合った単位 */
  presets: Array<MinutesPreset>
  /** 入力欄の上限。項目で違う(storage.ts の 2 つの定数) */
  max: number
  /** AI が埋めたまま未確認なら黄色い下線のクラス */
  unverifiedClass: string
  note: ReactNode
}) {
  const hours = hoursBeforeLabel(Number(value.trim()))

  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className={labelClass}>{label}</span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            step={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={`${fieldClass} max-w-28 ${unverifiedClass}`}
          />
          <span className="shrink-0 text-sm text-gray-600">分前</span>
          {hours !== null ? (
            <span className="shrink-0 text-xs text-gray-500">= {hours}</span>
          ) : null}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((preset) => {
          const selected = value.trim() === String(preset.minutes)
          return (
            <button
              key={preset.minutes}
              type="button"
              onClick={() => onChange(String(preset.minutes))}
              aria-pressed={selected}
              className={`min-h-9 rounded-full border px-3 py-1 text-xs font-medium transition ${
                selected
                  ? 'border-cyan-600 bg-cyan-600 text-white'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {preset.label}
            </button>
          )
        })}
        {value !== '' && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="min-h-9 rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100"
          >
            クリア
          </button>
        )}
      </div>
      {note}
    </div>
  )
}
