/**
 * 旅程を iCalendar(.ics)として書き出す純関数。
 *
 * このツールは一切ネットワークに出ない(searchLinks.ts と同じ方針)。
 * Google Calendar API を叩いてイベントを作るのではなく、ブラウザの中で .ics を
 * 組み立てて利用者にダウンロードさせ、取り込みは各自のカレンダーの
 * インポート機能に任せる。API 連携が無いので、認証も、トークンの保管も、
 * 「どの端末で認可したか」の管理も、このツールには一切現れない。
 *
 * ■ 時刻付きイベントを UTC(20260923T181500Z)で出す理由
 *   Stamp は「現地の壁時計時刻 + IANA タイムゾーン」だが、同時に正確な瞬間でもある
 *   (datetime.ts)。だから UTC に落として出せば、VTIMEZONE ブロックを 1 つも
 *   書かずに済む。TZID を使う書き方にすると、旅程に出てくる IANA 名の数だけ
 *   VTIMEZONE 定義が必要になり、その中身は各ゾーンの夏時間の切替規則
 *   (何月の第何日曜の何時に何分ずらすか)を年ごとに書き下したものになる。
 *   IANA の規則は国の都合で毎年変わるので、書き下した瞬間から腐りはじめる。
 *   1 時間ずれた予定を出すくらいなら、規則を持たない表現を選ぶ。
 *   結果として予定は「閲覧者のカレンダーのタイムゾーン」で表示されるが、
 *   飛行機や列車についてはそれが正しい挙動である。パリ 20:15 発の便は
 *   日本にいる家族のカレンダーでは 9/24 03:15 に見えるべきで、
 *   その瞬間に日本の空を飛んでいることに変わりはない。
 *
 * ■ 終日は VALUE=DATE で出す(UTC に落とさない)
 *   「6/12 は終日フリー」はどのタイムゾーンで見ても 6/12 の話で、暦の日付そのものが
 *   事実である(derive.ts と同じ考え方)。UTC の瞬間に落とすと、時差の向きによって
 *   閲覧者の画面で前日や翌日に化ける。
 *
 * ■ UID を予約 id から作る理由
 *   UID は「同じ予定かどうか」をカレンダー側が判断する唯一の手がかりである。
 *   書き出すたびに新しい UID を振ると、旅程を直して入れ直すたびに古い予定が
 *   残り、同じ便が 3 つ並ぶ。予約 id は端末ローカルで安定しているので、
 *   `<id>@tainakanchu-tools` にしておけば再インポートは上書きとして扱われうる。
 *   (Google カレンダーの取り込みが実際に上書きするかは相手の実装次第なので、
 *   UI 側では「取り込み専用のカレンダーを 1 つ作る」ことも案内している。)
 *
 * ■ 既定のアラームを全イベントに付けない理由
 *   カレンダーの通知は利用者が自分の生活に合わせて設定しているものである。
 *   取り込んだ旅程だけが独自の時刻で鳴りはじめると、消す作業が予定の数だけ発生する。
 *   ここで付けるのは、利用者が予約に対して明示的に入力した締切
 *   (搭乗手続き・受託手荷物)だけに限る。これは「知らないと乗れない」種類の
 *   情報で、カレンダー側の既定通知では代替できない。
 *
 * ■ evidence(AI の抽出根拠)を載せない理由
 *   evidence は予約確認メールからの引用で、1 件で数百文字になることもある。
 *   目的は画面上での照合(BookingCard の展開ビュー)であって、カレンダーの
 *   予定の説明欄に置いても読まれない。共有URLから除外しているのと同じ判断で、
 *   ここでも持ち出さない。
 */

import { addDays, isValidISODate, stampDate, tryParseStamp } from './datetime'
import type {
  Booking,
  BookingKind,
  Place,
  Stamp,
  TravelDoc,
  TripNotesState,
} from './types'

/** PRODID はこのファイルを作ったソフトの識別子。RFC 5545 の必須フィールド */
const PRODID = '-//tainakanchu tools//旅のしおり//JA'

/** UID の右側。メールアドレス形式が慣例なので、ドメインらしき文字列を置く */
const UID_DOMAIN = 'tainakanchu-tools'

/** 1 行の上限。RFC 5545 は「CRLF を除いて 75 オクテット」と定めている */
const MAX_LINE_OCTETS = 75

/**
 * 種別ごとの絵文字。カレンダーの一覧は 1 行の文字列しか出ないので、
 * 先頭の 1 文字で「飛行機か宿か」が分かるだけで見つけやすさが変わる。
 * ただし絵文字だけに意味を持たせない(タイトルは必ずそのまま続けて出す)。
 * Record を全キーで埋めておけば、種別が増えたときに型検査で気付ける。
 */
const KIND_EMOJI: Record<BookingKind, string> = {
  lodging: '🏨',
  flight: '✈️',
  train: '🚄',
  bus: '🚌',
  ferry: '⛴️',
  car: '🚗',
  activity: '🎫',
  other: '📍',
}

// --- 行の組み立て ---

/** 符号位置 1 つが UTF-8 で何オクテットになるか */
function utf8Size(codePoint: number): number {
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  if (codePoint < 0x10000) return 3
  return 4
}

/**
 * 75 オクテットで行を折る(RFC 5545 の folding)。継続行は先頭に空白 1 つを置く。
 *
 * 文字数ではなくバイト数で数えるのが肝。日本語のタイトルは 1 文字 3 オクテットなので、
 * 75 文字で折ると 200 オクテット超の行ができあがり、厳密なパーサに弾かれる。
 * 逆に、オクテットで数えていても分割位置を文字の途中に置くと UTF-8 の
 * バイト列が割れて文字化けするので、符号位置単位で積み上げる
 * (for...of は符号位置単位で回るため、絵文字のサロゲートペアも割れない)。
 * 継続行の先頭の空白も 75 オクテットに数えるので、2 行目以降の中身は 74 まで。
 */
function foldLine(line: string): string {
  const chunks: Array<string> = []
  let current = ''
  let octets = 0
  let limit = MAX_LINE_OCTETS

  for (const char of line) {
    const size = utf8Size(char.codePointAt(0) ?? 0)
    if (octets + size > limit) {
      chunks.push(current)
      current = ''
      octets = 0
      // 2 行目以降は先頭の空白 1 オクテットぶんだけ中身を減らす
      limit = MAX_LINE_OCTETS - 1
    }
    current += char
    octets += size
  }
  chunks.push(current)

  return chunks.join('\r\n ')
}

/**
 * TEXT 値のエスケープ。
 * バックスラッシュを最初に処理しないと、後から足したエスケープの
 * バックスラッシュまで二重にしてしまう。
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** TEXT 値を持つ 1 行。折りは最後にまとめてかける */
function textLine(name: string, value: string): string {
  return `${name}:${escapeText(value)}`
}

// --- 日時の書式 ---

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

/** UTC の DATE-TIME 形式 'YYYYMMDDTHHMMSSZ' */
function formatIcsUtc(epochMs: number): string {
  const zdt =
    Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO('UTC')
  return `${pad(zdt.year, 4)}${pad(zdt.month, 2)}${pad(zdt.day, 2)}T${pad(zdt.hour, 2)}${pad(zdt.minute, 2)}${pad(zdt.second, 2)}Z`
}

/** 'YYYY-MM-DD' → DATE 形式 'YYYYMMDD' */
function formatIcsDate(iso: string): string {
  return iso.replace(/-/g, '')
}

/**
 * 時刻付きイベントの「終わりの瞬間」。
 *
 * 終わりだけが終日(時刻が分からない)の予約では、その現地の日の終わり
 * (翌日 00:00)まで伸ばす。終日 Stamp が指しているのは現地 00:00 なので、
 * そのまま使うと「最終日の未明に終わる」帯になり、最後の 1 日が消える。
 */
function endInstantMs(end: Stamp): number | null {
  const zdt = tryParseStamp(end)
  if (zdt === null) return null
  return end.allDay
    ? zdt.startOfDay().add({ days: 1 }).epochMilliseconds
    : zdt.epochMilliseconds
}

/**
 * 予約 1 件をカレンダーの「帯」に落としたもの。
 * .ics の DTSTART/DTEND と、Google カレンダーのイベント作成URLの dates は
 * 書式が同じなので、どちらもこの 1 か所で決める(calendarLinks.ts が再利用する)。
 * 2 つの書き出し経路で宿のチェックアウト日の扱いが食い違わないようにするため。
 */
export interface EventWindow {
  allDay: boolean
  /** allDay なら 'YYYYMMDD'、そうでなければ UTC の 'YYYYMMDDTHHMMSSZ' */
  start: string
  /**
   * 終わり。allDay の場合は排他(この日は含まれない)。
   * 時刻付きで終わりが無い/壊れている予約では null。
   */
  end: string | null
}

/**
 * 予約から帯を作る。開始が壊れた Stamp なら null(時刻が読めない予定は出せない)。
 *
 * ■ 終日の終わりを「終了日の翌日」にする理由
 *   iCalendar の DTEND は排他で、指定した日そのものは帯に含まれない。
 *   宿の予約は end がチェックアウト日なので、素直に DTEND = チェックアウト日に
 *   すると、帯はチェックアウト前日の夜までで切れる。だが利用者はその朝まで
 *   その宿に居るので、カレンダーの上でもチェックアウト日に宿の名前が出ていて
 *   ほしい(「明日の朝どこで起きるのか」がカレンダーだけで分かる)。
 *   そこで終了日の翌日を DTEND にして、終了日を含む帯にする。
 *   終日のアクティビティが複数日にまたがる場合も同じ理屈で、
 *   「終了日まで含む」のほうが人間の読み方に合う。
 */
function bookingEventWindow(booking: Booking): EventWindow | null {
  const start = tryParseStamp(booking.start)
  if (start === null) return null

  if (booking.start.allDay) {
    const startDate = stampDate(booking.start)
    const endStamp = booking.end
    const rawEndDate =
      endStamp === null || tryParseStamp(endStamp) === null
        ? null
        : stampDate(endStamp)
    // 終わりが無い/開始より前という壊れたデータなら、開始日 1 日ぶんの帯にする
    const lastDate =
      rawEndDate !== null && rawEndDate >= startDate ? rawEndDate : startDate
    return {
      allDay: true,
      start: formatIcsDate(startDate),
      end: formatIcsDate(addDays(lastDate, 1)),
    }
  }

  const startMs = start.epochMilliseconds
  const endMs = booking.end === null ? null : endInstantMs(booking.end)
  // DTEND は DTSTART より後でなければならない。壊れたデータで前後が
  // 逆転しているときは、イベントごと弾かれるより終わりを落とすほうがよい
  const usableEndMs = endMs !== null && endMs > startMs ? endMs : null

  return {
    allDay: false,
    start: formatIcsUtc(startMs),
    end: usableEndMs === null ? null : formatIcsUtc(usableEndMs),
  }
}

// --- イベントの中身 ---

/**
 * LOCATION に出す場所。
 * 移動は出発地(その時刻に人が居るべき場所は到着地ではなく出発地)、
 * 宿泊・アクティビティは place。移動の予約には place が入らず、
 * 宿泊・アクティビティには from が入らないので、この優先順だけで両方賄える。
 */
function eventPlace(booking: Booking): Place | undefined {
  return booking.from ?? booking.place
}

function locationText(place: Place | undefined): string | null {
  if (place === undefined) return null
  const name = place.name.trim()
  const address = place.address?.trim()
  const parts = [name, address].filter(
    (part): part is string => part !== undefined && part !== '',
  )
  return parts.length === 0 ? null : parts.join(' ')
}

/**
 * DESCRIPTION に入れる情報。現地で必要になる順に並べる。
 * evidence は載せない(このファイル冒頭の設計判断を参照)。
 */
function descriptionText(booking: Booking): string | null {
  const lines: Array<string> = []

  if (booking.confirmationNumber !== undefined) {
    lines.push(`確認番号: ${booking.confirmationNumber}`)
  }
  if (booking.provider !== undefined) {
    lines.push(`予約先: ${booking.provider}`)
  }
  if (booking.from !== undefined || booking.to !== undefined) {
    lines.push(`${booking.from?.name ?? '?'} → ${booking.to?.name ?? '?'}`)
  }
  if (booking.note !== undefined) {
    lines.push(booking.note)
  }

  return lines.length === 0 ? null : lines.join('\n')
}

/**
 * 予約 1 件を「カレンダーに置く予定」として組み立てたもの。
 *
 * .ics の VEVENT と、Google カレンダーのイベント作成URL(calendarLinks.ts)の
 * 両方がこれを使う。書き出し方は違っても、タイトル・場所・説明・帯の決め方まで
 * 別々に持つと、2 つの経路で中身が食い違う(スマホから 1 件ずつ登録した宿だけ
 * チェックアウト日が抜けている、というような壊れ方をする)。
 * アラームだけは URL では表現できないので、ここには含めず .ics 側に置く。
 */
export interface CalendarEvent {
  window: EventWindow
  summary: string
  location: string | null
  description: string | null
}

export function bookingCalendarEvent(booking: Booking): CalendarEvent | null {
  const window = bookingEventWindow(booking)
  if (window === null) return null

  return {
    window,
    summary: `${KIND_EMOJI[booking.kind]} ${booking.title}`.trim(),
    location: locationText(eventPlace(booking)),
    description: descriptionText(booking),
  }
}

/**
 * 締切のアラーム 1 つ。分数が入っていなければ何も作らない。
 *
 * 種別で絞らないのは、AI 取り込みが手段未定の移動を kind: 'other' に
 * 分類するため(itinerary.ts の isMoveBooking)。利用者が締切の分数を
 * 入力しているなら、それは種別が未確定なだけの移動である。
 */
function alarmLines(
  minutesBefore: number | undefined,
  description: string,
): Array<string> {
  if (minutesBefore === undefined) return []
  if (!Number.isFinite(minutesBefore) || minutesBefore <= 0) return []

  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    textLine('DESCRIPTION', description),
    `TRIGGER:-PT${Math.round(minutesBefore)}M`,
    'END:VALARM',
  ]
}

/**
 * 予約 1 件ぶんの VEVENT。開始が読めない予約は null(出しても意味がない)。
 */
function bookingEvent(booking: Booking, dtstamp: string): Array<string> | null {
  const event = bookingCalendarEvent(booking)
  if (event === null) return null

  const { window } = event
  const lines: Array<string> = ['BEGIN:VEVENT']
  lines.push(`UID:${booking.id}@${UID_DOMAIN}`)
  lines.push(`DTSTAMP:${dtstamp}`)

  if (window.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${window.start}`)
    if (window.end !== null) lines.push(`DTEND;VALUE=DATE:${window.end}`)
  } else {
    lines.push(`DTSTART:${window.start}`)
    if (window.end !== null) lines.push(`DTEND:${window.end}`)
  }

  lines.push(textLine('SUMMARY', event.summary))
  if (event.location !== null) lines.push(textLine('LOCATION', event.location))
  if (event.description !== null) {
    lines.push(textLine('DESCRIPTION', event.description))
  }

  /*
    締切のアラームは時刻付きの予約にだけ付ける。終日の予約の DTSTART は
    現地 00:00 なので、そこから 60 分前を計算すると前日の 23:00 という
    もっともらしい嘘の時刻に鳴る。出発時刻そのものが分かっていない予約で
    締切だけ正しく置くことはできない(types.ts で締切を相対値で持っている
    のと同じ話で、嘘の時刻を出すくらいなら出さないほうがよい)。
  */
  if (!window.allDay) {
    lines.push(
      ...alarmLines(booking.checkInClosesMinutesBefore, '搭乗手続きの締切'),
      ...alarmLines(
        booking.bagDropClosesMinutesBefore,
        '受託手荷物を預ける締切',
      ),
    )
  }

  lines.push('END:VEVENT')
  return lines
}

/**
 * 手続き(ビザ・eSIM など)の申請期限を終日イベントにする。
 * 期限が無いもの、済んでいるもの(status: 'done')は出さない。
 * 済んだ手続きの期限がカレンダーに残っていると、当日に意味のない通知が出て、
 * 「まだ何かやり残しているのでは」と一瞬考えさせるだけで終わる。
 */
function travelDocEvent(doc: TravelDoc, dtstamp: string): Array<string> | null {
  if (doc.status === 'done') return null
  const due = doc.dueDate
  if (due === undefined || !isValidISODate(due)) return null

  const lines: Array<string> = ['BEGIN:VEVENT']
  lines.push(`UID:${doc.id}@${UID_DOMAIN}`)
  lines.push(`DTSTAMP:${dtstamp}`)
  lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(due)}`)
  // DTEND は排他なので、期限日そのものを含めるには翌日を指す
  lines.push(`DTEND;VALUE=DATE:${formatIcsDate(addDays(due, 1))}`)
  lines.push(textLine('SUMMARY', `〆 ${doc.title}の申請期限`))

  const details: Array<string> = []
  if (doc.region !== undefined) details.push(`対象: ${doc.region}`)
  if (doc.url !== undefined) details.push(doc.url)
  if (doc.note !== undefined) details.push(doc.note)
  if (details.length > 0) {
    lines.push(textLine('DESCRIPTION', details.join('\n')))
  }

  lines.push('END:VEVENT')
  return lines
}

/**
 * 旅程全体を .ics の中身にする。
 *
 * nowMs を引数で受け取るのは DTSTAMP(そのデータをいつ作ったか)のためだけ。
 * ここだけは呼び出し時刻に依存するので、computeSummary(derive.ts)と同じ流儀で
 * 外から渡してテスト可能にしておく。
 *
 * キャンセル済みの予約は出さない。行かないと決めた予定をカレンダーに置くと、
 * 当日に通知が出て、行く予定だったのか確認しに戻ることになる。
 */
export function buildTripIcs(state: TripNotesState, nowMs: number): string {
  const dtstamp = formatIcsUtc(nowMs)

  const lines: Array<string> = ['BEGIN:VCALENDAR', 'VERSION:2.0']
  lines.push(textLine('PRODID', PRODID))
  lines.push('CALSCALE:GREGORIAN')
  /*
    METHOD は付けない。METHOD:PUBLISH などを入れると iTIP(招待・返答)の
    メッセージとして解釈するクライアントがあり、単に取り込みたいだけの
    ファイルが「出欠を返すもの」に化ける。

    X-WR-CALNAME は標準外だが、多くのカレンダーが「取り込み先の新しい
    カレンダー名」の初期値に使う。取り込み専用のカレンダーを作る運用
    (UI 側で案内している)と噛み合うので、タイトルがあるときだけ入れる。
  */
  const calendarName = state.tripTitle.trim()
  if (calendarName !== '') lines.push(textLine('X-WR-CALNAME', calendarName))

  for (const booking of state.bookings) {
    if (booking.status === 'cancelled') continue
    const event = bookingEvent(booking, dtstamp)
    if (event !== null) lines.push(...event)
  }

  for (const doc of state.travelDocs ?? []) {
    const event = travelDocEvent(doc, dtstamp)
    if (event !== null) lines.push(...event)
  }

  lines.push('END:VCALENDAR')

  // 行末は CRLF。最後の行のあとにも付ける(RFC 5545 の行はすべて CRLF で終わる)
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

/**
 * ダウンロード時のファイル名。
 * タイトルが空なら日付で代用する(名前のないファイルが増えないように)。
 * ファイル名に使えない文字は落とす(OS によって弾かれる文字が違うので、
 * どこでも安全な範囲まで削る)。
 */
export function icsFileName(state: TripNotesState, todayISO: string): string {
  const title = state.tripTitle.trim().replace(/[\\/:*?"<>|]/g, '')
  return `旅のしおり-${title === '' ? todayISO : title}.ics`
}
