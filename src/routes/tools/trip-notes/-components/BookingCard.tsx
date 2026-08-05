/**
 * 予約 1 件分のカード。タイムラインの主役。
 *
 * 移動系(飛行機・列車・バス・船・レンタカー)だけ formatDualTime で
 * 日本時間を併記する。「現地 14:20 発」だけだと、日本にいる家族と
 * 予定をすり合わせるたびに暗算が要るため。
 *
 * カードの縁と地色も予約状況(idea/held)で変える。BookingStatusBadge は
 * 一覧をざっと流し見したときに気付かれないくらい小さいので、カードの
 * 見た目そのものに「まだ確定していない」を語らせる。色だけに頼ると
 * 色覚特性や白黒印刷で idea/held/confirmed が見分けられなくなるため、
 * idea には破線ボーダーという形の違いも足す(StatusBadge.tsx 冒頭のコメント参照)。
 *
 * ■ なぜモーダルではなく、その場で開くのか
 *   AI が取り込んだ値を 1 つずつ確認する道は、これまで鉛筆 → 編集フォームしか
 *   なかった。だが利用者がしたいのは「直す」ことではなく「見て、合っていると
 *   確かめる」ことで、その操作に編集の入口を通らせるのは遠回りである。
 *   しかも編集フォームは全項目を入力欄として開くので、直すつもりの無い値まで
 *   触れる状態にしてしまい、確認しに来ただけの人が取り違えて書き換えられる。
 *   カードを押したら下に開く形なら、日程の並び(前後にどの予定があるか)を
 *   保ったまま中身を見られて、閉じれば元の一覧に戻る。編集は鉛筆に残したまま、
 *   「見るだけ」の道を別に用意する、というのがこの展開の趣旨。
 *
 * ■ 展開ビューの中心は「未確認フィールドの確認」
 *   単に詳細を出すだけなら情報の置き場所が増えるだけだが、ここでは未確認の
 *   フィールドごとに AI の抽出根拠(booking.evidence)を値の隣に並べる。
 *   根拠の引用がその場にあれば、元の予約確認メールを探して開き直さなくても
 *   「メールにこう書いてあった → 画面の値と一致している」をその場で照合して
 *   確認済みにできる。この「元メールに戻らなくてよい」がこの改善の値打ちで、
 *   evidence を切り詰めずに全文出しているのもそのため(照合が目的なので、
 *   truncate で末尾が消えると根拠として役に立たない)。
 */

import { useEffect, useId, useState } from 'react'
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Pencil,
  Trash2,
} from 'lucide-react'
import { googleCalendarUrl } from '../../../../lib/trip-notes/calendarLinks'
import {
  formatDateJa,
  formatDualTime,
  formatStamp,
  stampDate,
} from '../../../../lib/trip-notes/datetime'
import { isTransportKind } from '../../../../lib/trip-notes/nights'
import { bookingSearchLinks } from '../../../../lib/trip-notes/searchLinks'
import { copyText, formatMoney } from '../-lib/format'
import { iconButtonClass, unverifiedFieldClass } from '../-lib/styles'
import { BOOKING_KIND_LABELS, KindIcon } from './KindIcon'
import { SearchLinks } from './SearchLinks'
import {
  BOOKING_STATUS_LABELS,
  BookingStatusBadge,
  PAYMENT_STATUS_LABELS,
  PaymentStatusBadge,
} from './StatusBadge'
import type { ReactNode } from 'react'
import type {
  Booking,
  BookingStatus,
  FieldKey,
  Place,
  Stamp,
} from '../../../../lib/trip-notes/types'

/**
 * カード全体の縁・地色。confirmed/cancelled は現状どおり白地・実線グレーのまま
 * 変えない(cancelled は打ち消し線と opacity-60 だけで十分「見なくていい」が伝わる)。
 * status は 4 択の単一値なので、この対応表 1 つだけで済み、
 * cancelled が idea/held の装飾を誤って引きずる心配もない。
 */
const CARD_STATUS_CLASS: Record<BookingStatus, string> = {
  idea: 'border-dashed border-slate-300 bg-slate-50',
  held: 'border-amber-300 bg-amber-50',
  confirmed: 'border-gray-200 bg-white',
  cancelled: 'border-gray-200 bg-white',
}

/**
 * FieldKey 1 つ 1 つの日本語ラベル。展開ビューの見出しと、
 * 未確認フィールドの確認行の両方で使う。
 *
 * ■ なぜ BookingForm から借りずにここへ置くのか
 *   BookingForm もフィールド名を日本語で持っているが、あちらのラベルは
 *   「入力欄 1 つ」に付いていて、FieldKey 単位では存在しない。
 *   start は日付・時刻・タイムゾーンの 3 欄、price は金額・通貨コードの 2 欄、
 *   place は名称・現地語表記・住所の 3 欄に割れており、end に至っては
 *   種別によって「チェックアウト日時 / 到着日時 / 終了日時」と文言が変わる
 *   (BookingForm の endLabelFor)。つまり借りられる対応表が向こうに無く、
 *   作るにはフォームの入力欄の構造そのものを組み替えることになる。
 *   代わりに、値のほうのラベル(種別・予約状況・支払状況)は既存の
 *   BOOKING_KIND_LABELS / BOOKING_STATUS_LABELS / PAYMENT_STATUS_LABELS を
 *   そのまま使い回し、そちらは二重定義しない。
 *   文言は BookingForm の入力欄と揃えてある。ここで確認した項目を
 *   あとから鉛筆で直しに行ったとき、同じ名前の欄を探せるようにするため。
 *   Record を全キーで埋めておけば、FieldKey が増えたときに型検査で気付ける。
 */
const FIELD_LABELS: Record<FieldKey, string> = {
  kind: '種別',
  title: 'タイトル',
  start: '開始日時',
  end: '終了日時',
  from: '出発地',
  to: '到着地',
  place: '場所',
  status: '予約状況',
  payment: '支払状況',
  confirmationNumber: '確認番号',
  provider: '予約先/会社名',
  price: '金額',
  freeCancelUntil: '無料キャンセル期限',
  checkInClosesMinutesBefore: '搭乗手続きの締切',
  bagDropClosesMinutesBefore: '受託手荷物を預ける締切',
  note: 'メモ',
}

/** 値が入っていないフィールドの表示。空欄のまま出すと「読み飛ばした」と区別が付かない */
const EMPTY_VALUE = '未入力'

interface BookingCardProps {
  booking: Booking
  displayTz: string
  /**
   * 展開しているか。状態は SchedulePanel が持つ(カードは表示だけを受け持つ)。
   * 開いたまま並べ替えや再描画が起きても状態が飛ばないようにするため。
   */
  expanded: boolean
  /** 本文領域を押したときの開閉 */
  onToggleExpand: () => void
  onEdit: () => void
  onDelete: () => void
  /**
   * この予約の未確認フィールドをまとめて確認済みにする。
   * 未確認が残っているときだけカードにボタンが出る。
   */
  onVerifyAll: () => void
  /** 未確認フィールドを 1 つだけ確認済みにする(展開ビューの各行から) */
  onVerifyField: (field: FieldKey) => void
}

function formatTime(
  kind: Booking['kind'],
  stamp: Stamp,
  displayTz: string,
): string {
  return isTransportKind(kind)
    ? formatDualTime(stamp, displayTz)
    : formatStamp(stamp, displayTz)
}

/**
 * 展開ビューの日時。折りたたみ時と違って日付まで出す。
 *
 * カードは「その予約が始まる日」の見出しの下にあるので折りたたみ時は時刻だけで
 * 足りるが、展開して終了日時まで見るときは、日をまたぐ夜行列車や連泊の宿で
 * 「何日の 07:00 なのか」が分からないと確認にならない。
 * 日付はその予約自身の現地日付で出す(表示タイムゾーンに寄せると、
 * 日をまたぐ移動の到着日が 1 日ずれて見える)。
 */
function formatDateTime(
  kind: Booking['kind'],
  stamp: Stamp,
  displayTz: string,
): string {
  return `${formatDateJa(stampDate(stamp))} ${formatTime(kind, stamp, displayTz)}`
}

/** 場所 1 件を 1 行の文字列にする。確認行のように 1 行で足りる場所で使う */
function placeText(place: Place | undefined): string {
  if (place === undefined) return EMPTY_VALUE
  const extra = [place.localName, place.address].filter(
    (value): value is string => value !== undefined && value !== '',
  )
  return extra.length === 0 ? place.name : `${place.name}(${extra.join(' / ')})`
}

/**
 * 未確認フィールドの「いま画面に入っている値」。
 *
 * 確認行はこの値と evidence の引用を並べるためのものなので、
 * ここで生の ISO 文字列や内部のコード値が出ると照合の役に立たない。
 * Stamp は formatDateTime、種別や状況は既存のラベル表に通す。
 */
function fieldValueText(
  booking: Booking,
  field: FieldKey,
  displayTz: string,
): string {
  switch (field) {
    case 'kind':
      return BOOKING_KIND_LABELS[booking.kind]
    case 'title':
      return booking.title
    case 'start':
      return formatDateTime(booking.kind, booking.start, displayTz)
    case 'end':
      return booking.end === null
        ? EMPTY_VALUE
        : formatDateTime(booking.kind, booking.end, displayTz)
    case 'from':
      return placeText(booking.from)
    case 'to':
      return placeText(booking.to)
    case 'place':
      return placeText(booking.place)
    case 'status':
      return BOOKING_STATUS_LABELS[booking.status]
    case 'payment':
      return PAYMENT_STATUS_LABELS[booking.payment]
    case 'confirmationNumber':
      return booking.confirmationNumber ?? EMPTY_VALUE
    case 'provider':
      return booking.provider ?? EMPTY_VALUE
    case 'price':
      return booking.price === undefined
        ? EMPTY_VALUE
        : formatMoney(booking.price.amount, booking.price.currency)
    case 'freeCancelUntil':
      return booking.freeCancelUntil === undefined
        ? EMPTY_VALUE
        : formatDateJa(booking.freeCancelUntil)
    case 'checkInClosesMinutesBefore':
      return booking.checkInClosesMinutesBefore === undefined
        ? EMPTY_VALUE
        : `出発の${booking.checkInClosesMinutesBefore}分前`
    case 'bagDropClosesMinutesBefore':
      return booking.bagDropClosesMinutesBefore === undefined
        ? EMPTY_VALUE
        : `出発の${booking.bagDropClosesMinutesBefore}分前`
    case 'note':
      return booking.note ?? EMPTY_VALUE
  }
}

interface PlaceSummary {
  text: string
  fields: Array<FieldKey>
}

/** カードに出す場所の要約。宿泊・アクティビティは place、移動は from → to */
function summarizePlace(booking: Booking): PlaceSummary | null {
  if (booking.place !== undefined) {
    return { text: booking.place.name, fields: ['place'] }
  }
  if (booking.from !== undefined || booking.to !== undefined) {
    const from = booking.from?.name ?? '?'
    const to = booking.to?.name ?? '?'
    return { text: `${from} → ${to}`, fields: ['from', 'to'] }
  }
  return null
}

export function BookingCard({
  booking,
  displayTz,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onVerifyAll,
  onVerifyField,
}: BookingCardProps) {
  const detailsId = useId()
  const unverified = booking.unverified ?? []
  const isUnverified = (...fields: Array<FieldKey>) =>
    fields.some((field) => unverified.includes(field))
      ? unverifiedFieldClass
      : ''
  const cancelled = booking.status === 'cancelled'
  const statusClass = CARD_STATUS_CLASS[booking.status]
  const place = summarizePlace(booking)
  /**
   * 検索リンクを出すのは idea/held だけ。confirmed はもう予約が取れているので
   * 「どこで探すか」自体が不要になっており、cancelled は行かないと決めた予定なので
   * リンクを出すと「まだ探している」ように見えて紛らわしい。
   */
  const searchLinks =
    booking.status === 'idea' || booking.status === 'held'
      ? bookingSearchLinks(booking)
      : []

  const timeLabel = formatTime(booking.kind, booking.start, displayTz)
  const endLabel =
    booking.end !== null
      ? formatTime(booking.kind, booking.end, displayTz)
      : null

  return (
    <div
      className={`rounded-2xl border p-3 shadow-sm transition sm:p-4 ${statusClass} ${
        cancelled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 ${isUnverified('kind')}`}
        >
          <KindIcon kind={booking.kind} size={16} />
        </span>

        <div className="min-w-0 flex-1">
          {/*
            開閉の当たり判定は見出し・時刻・場所の塊ごと。「カードを押したら開く」に
            いちばん近く、かつ入れ子の interactive を作らずに済む範囲がここになる。

            見出し(h4)でボタンを包むのは disclosure の定石(WAI-ARIA の accordion)で、
            逆にすると支援技術に見出しとして拾われない(ボタンの中の文字は
            まとめてボタンの名前に畳まれるため)。中身を span だけで組んでいるのも
            同じ理由の裏返しで、button が入れられるのは phrasing content だけなので
            h4/p をそのまま押し込むと不正な入れ子になる。

            「確認済みにする」(一括)・鉛筆・ゴミ箱・検索リンクはすべてこのボタンの
            外に出してある。button の中に button や a を置くのは不正な HTML で、
            押しても手前のどちらが反応するか決まらない
          */}
          <h4 className="min-w-0">
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={expanded}
              aria-controls={detailsId}
              className="flex w-full cursor-pointer items-start gap-2 rounded-lg text-left transition hover:bg-gray-500/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={`truncate text-sm font-semibold text-gray-900 ${
                      cancelled ? 'line-through' : ''
                    } ${isUnverified('title')}`}
                  >
                    {booking.title}
                  </span>
                  {unverified.length > 0 ? (
                    <span
                      className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                      title="AI が入力したまま未確認のフィールドがあります"
                    >
                      未確認 {unverified.length}件
                    </span>
                  ) : null}
                </span>

                <span
                  className={`mt-0.5 block text-xs text-gray-600 ${isUnverified('start', 'end')}`}
                >
                  {timeLabel}
                  {endLabel !== null ? `〜${endLabel}` : ''}
                </span>

                {place !== null ? (
                  <span
                    className={`mt-1 block truncate text-xs text-gray-500 ${isUnverified(...place.fields)}`}
                  >
                    {place.text}
                  </span>
                ) : null}
              </span>

              <ChevronDown
                size={16}
                aria-hidden="true"
                className={`mt-0.5 shrink-0 text-gray-400 transition-transform ${
                  expanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </h4>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <BookingStatusBadge status={booking.status} size="sm" />
            <PaymentStatusBadge payment={booking.payment} size="sm" />
            {/*
              1 フィールドずつ「確認済みにする」を押させると、AI 取り込み直後の
              予約は 10 回近い操作になる。カードの表示だけで内容を見終えた人の
              ために、予約単位でまとめて外す出口を並べておく。
              見出しの行から状況バッジの行へ移したのは、上が開閉ボタンになって
              入れ子の button を作れなくなったため。同じ amber の語彙で
              「未確認 N件」のチップと呼応するので、離れても対応は読める
            */}
            {unverified.length > 0 ? (
              <button
                type="button"
                onClick={onVerifyAll}
                aria-label={`${booking.title} の未確認 ${unverified.length}件をすべて確認済みにする`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
              >
                <Check size={11} aria-hidden="true" />
                確認済みにする
              </button>
            ) : null}
          </div>

          {searchLinks.length > 0 ? (
            <div className="mt-2">
              <SearchLinks links={searchLinks} />
            </div>
          ) : null}

          {/*
            確認番号は展開すると「タップでコピーできる形」で出し直すので、
            開いている間はこの行を出さない。同じ番号が 2 か所に並ぶと、
            現地の受付でどちらを見せればよいのか一瞬迷わせる
          */}
          {booking.confirmationNumber !== undefined && !expanded ? (
            <p
              className={`mt-1.5 font-mono text-[11px] text-gray-500 ${isUnverified('confirmationNumber')}`}
            >
              確認番号: {booking.confirmationNumber}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className={iconButtonClass}
            aria-label={`${booking.title} を編集`}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={`${iconButtonClass} hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600`}
            aria-label={`${booking.title} を削除`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/*
        閉じている間は中身ごと描かない。hidden で残す手もあるが、
        閉じたカードの本文がページ内検索や読み上げに引っかかると、
        画面に見えていない予約の住所やメモが混ざって読めなくなる
      */}
      {expanded ? (
        <BookingDetails
          id={detailsId}
          booking={booking}
          displayTz={displayTz}
          unverified={unverified}
          onVerifyField={onVerifyField}
        />
      ) : null}
    </div>
  )
}

/**
 * 展開したときだけ出る中身。
 *
 * いちばん上が未確認フィールドの確認で、そのあとに日時・場所・付随情報が続く。
 * 順番は「いま何をしに開いたか」で決めている。折りたたみの時点でタイトル・時刻・
 * 場所は見えているので、わざわざ開く動機は多くの場合「未確認の値を確かめたい」
 * ほうにある。
 */
function BookingDetails({
  id,
  booking,
  displayTz,
  unverified,
  onVerifyField,
}: {
  id: string
  booking: Booking
  displayTz: string
  unverified: Array<FieldKey>
  onVerifyField: (field: FieldKey) => void
}) {
  const isUnverified = (field: FieldKey) =>
    unverified.includes(field) ? unverifiedFieldClass : ''

  return (
    <div id={id} className="mt-3 space-y-3 border-t border-gray-200 pt-3">
      {unverified.length > 0 ? (
        <UnverifiedChecklist
          booking={booking}
          displayTz={displayTz}
          unverified={unverified}
          onVerifyField={onVerifyField}
        />
      ) : null}

      <dl className="space-y-1.5 text-xs">
        <DetailRow
          label={FIELD_LABELS.start}
          valueClass={isUnverified('start')}
        >
          {formatDateTime(booking.kind, booking.start, displayTz)}
        </DetailRow>
        {booking.end !== null ? (
          <DetailRow label={FIELD_LABELS.end} valueClass={isUnverified('end')}>
            {formatDateTime(booking.kind, booking.end, displayTz)}
          </DetailRow>
        ) : null}

        {/*
          場所は name だけで済ませず、現地語表記と住所も出す。現地語表記は
          「タクシー運転手に画面を見せる」ための表記(types.ts の Place)で、
          これまで編集フォームの入力欄にしか出ていなかった。日程を開いた
          その場で見せられるなら、現地でフォームを開き直す必要が無くなる
        */}
        <PlaceRow
          label={FIELD_LABELS.from}
          place={booking.from}
          valueClass={isUnverified('from')}
        />
        <PlaceRow
          label={FIELD_LABELS.to}
          place={booking.to}
          valueClass={isUnverified('to')}
        />
        <PlaceRow
          label={FIELD_LABELS.place}
          place={booking.place}
          valueClass={isUnverified('place')}
        />

        {booking.provider !== undefined ? (
          <DetailRow
            label={FIELD_LABELS.provider}
            valueClass={isUnverified('provider')}
          >
            {booking.provider}
          </DetailRow>
        ) : null}
        {booking.price !== undefined ? (
          <DetailRow
            label={FIELD_LABELS.price}
            valueClass={isUnverified('price')}
          >
            {formatMoney(booking.price.amount, booking.price.currency)}
          </DetailRow>
        ) : null}
        {booking.freeCancelUntil !== undefined ? (
          <DetailRow
            label={FIELD_LABELS.freeCancelUntil}
            valueClass={isUnverified('freeCancelUntil')}
          >
            {formatDateJa(booking.freeCancelUntil)}
          </DetailRow>
        ) : null}
        {booking.note !== undefined ? (
          <DetailRow
            label={FIELD_LABELS.note}
            valueClass={isUnverified('note')}
          >
            <span className="whitespace-pre-wrap">{booking.note}</span>
          </DetailRow>
        ) : null}
      </dl>

      {booking.confirmationNumber !== undefined ? (
        <ConfirmationNumberRow
          value={booking.confirmationNumber}
          valueClass={isUnverified('confirmationNumber')}
        />
      ) : null}

      <CalendarAddLink booking={booking} />
    </div>
  )
}

/**
 * この予約 1 件を Google カレンダーに登録するリンク。
 *
 * ■ なぜ展開ビューの末尾なのか
 *   折りたたみ時には出さない。カードの 1 行 1 行は「次に何をすればよいか」を
 *   読む場所で、そこに常時出す操作ではないからである(検索リンクと違い、
 *   予約が確定していても消えないので、出しっぱなしにすると全カードに 1 行増える)。
 *   詳細をひととおり見終えたあとに来るので、置き場所は中身の最後にする。
 *
 * ■ 検索リンク(探す:)と同じ行に混ぜない
 *   見た目は同じチップだが、あちらは「まだ取れていない予約をどこで探すか」で、
 *   こちらは「取れている予約を自分のカレンダーへ写す」。並べると
 *   予約サイトの 1 つに見える。
 *
 * ■ 設定タブの .ics との使い分け
 *   一括で入れるなら .ics のほうが速い。ただしスマホの Google カレンダーアプリは
 *   .ics を取り込めないので、スマホしか手元にないときはこのリンクが唯一の道になる
 *   (calendarLinks.ts の冒頭を参照)。
 */
function CalendarAddLink({ booking }: { booking: Booking }) {
  // 行かないと決めた予定をカレンダーに入れる意味はない(.ics 側の扱いと揃える)
  if (booking.status === 'cancelled') return null

  const url = googleCalendarUrl(booking)
  // 開始時刻が壊れている予約は登録しようがないので、リンクごと出さない
  if (url === null) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 transition hover:border-cyan-400 hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
      >
        <ExternalLink size={11} aria-hidden="true" />
        Googleカレンダーに追加
      </a>
    </div>
  )
}

/** 展開ビューの 1 行。ラベルと値を左右に並べる */
function DetailRow({
  label,
  valueClass,
  children,
}: {
  label: string
  /** 未確認なら黄色い下線(折りたたみ時のカードと同じ語彙) */
  valueClass: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
      <dt className="w-24 shrink-0 text-gray-500">{label}</dt>
      <dd className={`min-w-0 flex-1 break-words text-gray-800 ${valueClass}`}>
        {children}
      </dd>
    </div>
  )
}

/** 場所 1 件。name の下に現地語表記と住所を添える。場所が無ければ行ごと出さない */
function PlaceRow({
  label,
  place,
  valueClass,
}: {
  label: string
  place: Place | undefined
  valueClass: string
}) {
  if (place === undefined) return null

  return (
    <DetailRow label={label} valueClass={valueClass}>
      <span className="block">{place.name}</span>
      {place.localName !== undefined ? (
        <span className="block text-gray-600">{place.localName}</span>
      ) : null}
      {place.address !== undefined ? (
        <span className="block text-gray-500">{place.address}</span>
      ) : null}
    </DetailRow>
  )
}

/**
 * 未確認フィールドの確認リスト。この展開ビューの主役。
 *
 * 1 行に「フィールド名 + いまの値 + AI の抽出根拠 + 確認済みにするボタン」を
 * まとめる。根拠を同じ行に置くのは、確認とは値と出所の照合だからで、
 * 引用が無ければ結局は元の予約確認メールを開き直すことになり、
 * その場で確認するための画面という前提が崩れる。
 * 根拠が無いフィールド(AI が引用を返さなかったもの)は引用の行だけ落とす。
 * その場合はメールを見に行くしかないが、「根拠が無い」ことが見えるので、
 * どれを疑うべきかの手がかりにはなる。
 */
function UnverifiedChecklist({
  booking,
  displayTz,
  unverified,
  onVerifyField,
}: {
  booking: Booking
  displayTz: string
  unverified: Array<FieldKey>
  onVerifyField: (field: FieldKey) => void
}) {
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-2.5">
      <h5 className="text-[11px] font-semibold text-amber-800">
        AI が入力したまま未確認の項目({unverified.length}件)
      </h5>
      <p className="mt-0.5 text-[11px] text-amber-800/80">
        引用と見比べて、合っていれば確認済みにしてください。
      </p>

      <ul className="mt-2 space-y-1.5">
        {unverified.map((field) => {
          const label = FIELD_LABELS[field]
          const evidence = booking.evidence?.[field]
          return (
            <li
              key={field}
              className="rounded-lg border border-amber-200 bg-white p-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-xs">
                  <span className="font-semibold text-gray-800">{label}</span>
                  <span className="mx-1 text-gray-400">:</span>
                  <span className="break-words text-gray-800">
                    {fieldValueText(booking, field, displayTz)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => onVerifyField(field)}
                  aria-label={`${booking.title} の${label}を確認済みにする`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                >
                  <Check size={11} aria-hidden="true" />
                  確認済みにする
                </button>
              </div>

              {/*
                引用は切り詰めない。照合が目的なので、末尾が消えると
                「メールにそう書いてあったか」を判断できなくなる
              */}
              {evidence !== undefined ? (
                <p className="mt-1 border-l-2 border-amber-300 pl-2 text-[11px] leading-relaxed break-words whitespace-pre-wrap text-gray-600">
                  {evidence}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-gray-400">
                  AI からの引用はありません
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * 確認番号。タップでクリップボードへ写す。
 * カウンターや改札で読み上げる値なので、手で打ち直させない
 * (「今」タブの ConfirmationButton と同じ流儀。あちらは画面の主役なので
 * 全幅の大きな数字だが、ここは詳細の 1 行なので大きさだけ落としてある)。
 */
function ConfirmationNumberRow({
  value,
  valueClass,
}: {
  value: string
  valueClass: string
}) {
  const [copied, setCopied] = useState(false)

  // コピー成功の表示は2秒で自動的に消す。消し忘れた古いタイマーが
  // 次のコピーの表示を巻き戻さないよう、依存が変わるたびに張り直す
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          void copyText(value).then((ok) => {
            if (ok) setCopied(true)
          })
        }}
        aria-label={`確認番号 ${value} をタップしてコピー`}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-cyan-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider break-all text-gray-900 transition hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${valueClass}`}
      >
        <Copy size={12} aria-hidden="true" />
        {value}
      </button>
      <span
        role="status"
        aria-live="polite"
        className="text-[11px] font-medium text-gray-500"
      >
        {copied ? 'コピーしました' : 'タップして確認番号をコピー'}
      </span>
    </div>
  )
}
