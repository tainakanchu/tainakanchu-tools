/**
 * 予約から「次に来る時刻」(マイルストーン)を導出する層。
 *
 * ■ なぜ予約ではなく時刻を単位にするのか
 *   「今」タブはこれまで予約(進行中・次)を単位に並べていた。しかし旅行中に
 *   スマホを開いて知りたいのは予約そのものではなく、次に来る時刻である。
 *   1 件の飛行機の予約は、利用者から見れば「手荷物を預ける締切」「搭乗手続きの
 *   締切」「出発」「到着」という 4 つの別々の時刻で、いま効くのはそのうち 1 つでしかない。
 *   予約を単位にすると、いちばん近い締切が予約カードの中身に埋もれる。
 *   だから予約を時刻に分解して、近い順に並べ直す。
 *
 * ■ 作らないもの(無い情報を作らない)
 *   - 締切の分数が入っていない予約からは、締切のマイルストーンを作らない。
 *     「だいたい 60 分前」で補うことはしない。締切は空港・航空会社・路線種別で
 *     違うので、こちらで決め打つと、利用者が自分で確かめる機会を奪ったうえで
 *     嘘をつくことになる。締切が出ていなければ利用者は自分で調べる。
 *   - 終日の予定からは作らない。終日の Stamp は暦の上では現地 00:00 なので、
 *     そこへ残り時間を出すと、実際とずれた数字を自信たっぷりに見せることになる
 *     (NowPanel の進行中カードが終日の終了を除いているのと同じ判断)。
 *   - キャンセル済みの予約からは作らない。
 *   - 締切は移動系の予約からしか作らない。宿やアクティビティに値が入っていても
 *     無視する。入力欄を出していないところに値がある時点で何かの取り違えなので、
 *     そのまま画面に出すより落とすほうが安全。
 *
 * ■ 進行中の予約から作らない理由(カウントダウンの二重表示を避ける)
 *   開始済みの予約からはマイルストーンを 1 つも作らない。開始側(締切・出発・
 *   チェックイン開始)はすべて過ぎているので出しようがなく、終了側(到着・
 *   チェックアウト)は「今」タブの進行中カードが既に「到着まで あと2時間」
 *   「チェックアウトまで あと3時間」としてカウントダウンしているためである。
 *   ここでも作ると、同じ数字が 1 画面に 2 回、別の見た目で並ぶ。
 *   どちらに残すかは「その予約の他の情報(確認番号・場所)と一緒に読めるか」で決めた。
 *   進行中の終了時刻は、カードの中で予約と一緒に読むほうが意味が取りやすい。
 *
 * ■ 過ぎたものは出さないが、宿のチェックイン開始だけは言い換える
 *   過ぎた時刻に「あと0分」を出し続けても意味がないので、過ぎたものは落とす。
 *   ただし宿のチェックイン開始は、過ぎていること自体が「もう入れる」という
 *   使える情報になる。到着してから宿に向かうまでの間にいちばん知りたいのは
 *   「もうチェックインできるのか」であって、15:00 という時刻ではない。
 *   そこで一覧からは落としつつ、状態としての「受付中」を isCheckInOpen で別に返し、
 *   画面はカウントダウンではなく現在の状態として出す。
 *
 * この層は純関数だけで構成し、現在時刻は引数で受け取る(derive.ts の
 * findCurrentAndNext と同じ流儀)。時刻に依存する判定をテストから
 * 素直に固定できるようにするため。
 */

import { tryParseStamp } from './datetime'
import { isTransportKind } from './nights'
import type { Booking, Stamp } from './types'

/**
 * マイルストーンの種類。
 * 同じ「終わり」でも、宿のチェックアウトと移動の到着では利用者のすべきことが
 * まったく違うので、ラベルのためだけでなく種類として分けて持つ。
 */
export type MilestoneKind =
  /** 受託手荷物の預け締切 */
  | 'bagDrop'
  /** 搭乗手続きの締切 */
  | 'checkIn'
  /** 移動の出発 */
  | 'departure'
  /** 移動の到着 */
  | 'arrival'
  /** 宿のチェックイン開始 */
  | 'lodgingCheckIn'
  /** 宿のチェックアウト */
  | 'lodgingCheckOut'
  /** 移動でも宿泊でもない予定の開始 */
  | 'start'
  /** 移動でも宿泊でもない予定の終了 */
  | 'end'

/**
 * 画面に出す名前。ここ(導出側)に置いているのは、マイルストーンが
 * 「何の時刻か」を説明できなければ、時刻だけ並べても読めないため。
 * 種類とラベルが離れていると、種類を足したときにラベルだけ付け忘れる。
 */
export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  bagDrop: '手荷物を預ける締切',
  checkIn: '搭乗手続きの締切',
  departure: '出発',
  arrival: '到着',
  lodgingCheckIn: 'チェックイン開始',
  lodgingCheckOut: 'チェックアウト',
  start: '開始',
  end: '終了',
}

/**
 * 締切系(過ぎたら取り返しがつかない)のマイルストーン。
 * 出発や到着は過ぎても次の行動が残っているが、こちらは締め切られたら
 * その便に乗れない。強調の対象になるのはこの 2 つだけ。
 */
const DEADLINE_KINDS: ReadonlySet<MilestoneKind> = new Set<MilestoneKind>([
  'bagDrop',
  'checkIn',
])

export function isDeadlineMilestone(kind: MilestoneKind): boolean {
  return DEADLINE_KINDS.has(kind)
}

/**
 * 締切系の残り時間を強調に切り替えるしきい値。
 *
 * NowPanel の ENDING_SOON_MS(2 時間)とは意味が違うので値も変える。
 * あちらは「チェックアウトに向けて荷造りを始める」段取りの時間で、だから
 * 起床から逆算した 2 時間になっている。こちらが促すのは段取りではなく
 * 「いま列に並ぶ」という 1 つの行動で、締切そのものが出発の 45〜90 分前に
 * 置かれている。ここを 2 時間にすると、空港へ向かう電車に乗った時点から
 * ずっと赤いままになり、いよいよ危ないときと区別が付かなくなって効かなくなる。
 * 逆に 15 分では、保安検査の列に並んだあとで気付いても間に合わない。
 * 空港に着いてからカウンターに辿り着くまでの実際の所要を見込んで 45 分にした。
 */
export const DEADLINE_SOON_MS = 45 * 60 * 1000

export interface Milestone {
  bookingId: string
  kind: MilestoneKind
  /** 表示用。予約の現地時刻とタイムゾーンをそのまま保つ */
  at: Stamp
  /** 並べ替えとカウントダウンに使う絶対時刻 */
  atMs: number
  /** 題名や種別アイコンを出すための元の予約 */
  booking: Booking
}

/**
 * 同じ時刻に並んだときの順序。人が動く順(準備 → 出る → 着く)で固定する。
 * 時刻が同じなら、先にすべきことが上に来ないと読む順序が逆になる。
 */
const KIND_ORDER: Record<MilestoneKind, number> = {
  bagDrop: 0,
  checkIn: 1,
  departure: 2,
  lodgingCheckIn: 2,
  start: 2,
  arrival: 3,
  lodgingCheckOut: 3,
  end: 3,
}

function startKindOf(booking: Booking): MilestoneKind {
  if (booking.kind === 'lodging') return 'lodgingCheckIn'
  return isTransportKind(booking.kind) ? 'departure' : 'start'
}

function endKindOf(booking: Booking): MilestoneKind {
  if (booking.kind === 'lodging') return 'lodgingCheckOut'
  return isTransportKind(booking.kind) ? 'arrival' : 'end'
}

function makeMilestone(
  booking: Booking,
  kind: MilestoneKind,
  at: Stamp,
  atMs: number,
): Milestone {
  return { bookingId: booking.id, kind, at, atMs, booking }
}

function compareMilestones(a: Milestone, b: Milestone): number {
  if (a.atMs !== b.atMs) return a.atMs - b.atMs
  const order = KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
  if (order !== 0) return order
  const title = a.booking.title.localeCompare(b.booking.title, 'ja')
  if (title !== 0) return title
  // 同題名・同時刻でも並びが揺れないように、最後は id で決める
  return a.bookingId.localeCompare(b.bookingId)
}

/**
 * これから来るマイルストーンを、近い順に返す。
 *
 * 「ちょうどその瞬間」は過ぎた側として扱う(atMs > nowMs だけを残す)。
 * findCurrentAndNext が終了のちょうどその瞬間に予約を進行中から外すのと
 * 同じ向きに揃えてある。境界の扱いが場所によって違うと、
 * 同じ 1 分のあいだ画面のどこかだけが古い状態を映すことになる。
 */
export function deriveMilestones(
  bookings: Array<Booking>,
  nowMs: number,
): Array<Milestone> {
  const milestones: Array<Milestone> = []

  for (const booking of bookings) {
    if (booking.status === 'cancelled') continue

    const start = tryParseStamp(booking.start)
    if (start === null) continue

    // 開始済みの予約は丸ごと飛ばす(冒頭「二重表示を避ける」を参照)。
    // 開始側は過ぎているので下の絞り込みでも落ちるが、終了側は
    // ここで落とさないと進行中カードと同じ数字が二重に出る
    if (start.epochMilliseconds <= nowMs) continue

    if (!booking.start.allDay) {
      if (isTransportKind(booking.kind)) {
        // 分の引き算は Temporal の時刻演算なので、夏時間の切り替わりを
        // 跨いでも「出発の 60 分前」という実経過時間どおりの瞬間になる
        // (暦の上で 1 時間ずれた壁時計時刻にはならない)
        const deadlines = [
          ['bagDrop', booking.bagDropClosesMinutesBefore],
          ['checkIn', booking.checkInClosesMinutesBefore],
        ] as const
        for (const [kind, minutes] of deadlines) {
          if (minutes === undefined) continue
          const at = start.subtract({ minutes })
          milestones.push(
            makeMilestone(
              booking,
              kind,
              { zdt: at.toString(), allDay: false },
              at.epochMilliseconds,
            ),
          )
        }
      }

      milestones.push(
        makeMilestone(
          booking,
          startKindOf(booking),
          booking.start,
          start.epochMilliseconds,
        ),
      )
    }

    const end = booking.end
    if (end !== null && !end.allDay) {
      const endZdt = tryParseStamp(end)
      if (endZdt !== null) {
        milestones.push(
          makeMilestone(
            booking,
            endKindOf(booking),
            end,
            endZdt.epochMilliseconds,
          ),
        )
      }
    }
  }

  return milestones
    .filter((milestone) => milestone.atMs > nowMs)
    .toSorted(compareMilestones)
}

/**
 * 宿のチェックイン受付が既に始まっているか。
 *
 * 「チェックイン開始まであと◯」が過ぎたあとの言い換えとして使う。
 * 過ぎたことを黙って消すと、到着した利用者にとっていちばん知りたい
 * 「もう入れるのか」が画面から消えてしまう。
 *
 * 終日のチェックインでは false を返す。終日の start は現地 00:00 で、
 * それは「0 時から受け付けている」という事実ではなく「時刻が分からない」の
 * 表現でしかないので、受付中だと言い切れない。
 */
export function isCheckInOpen(booking: Booking, nowMs: number): boolean {
  if (booking.kind !== 'lodging') return false
  if (booking.status === 'cancelled') return false
  if (booking.start.allDay) return false

  const start = tryParseStamp(booking.start)
  if (start === null) return false
  if (start.epochMilliseconds > nowMs) return false

  // チェックアウトを過ぎていれば、その宿はもう終わっている
  const end = booking.end
  if (end !== null) {
    const endZdt = tryParseStamp(end)
    if (endZdt !== null && endZdt.epochMilliseconds <= nowMs) return false
  }
  return true
}
