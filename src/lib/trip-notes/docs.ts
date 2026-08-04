/**
 * 「旅行前に済ませておく手続き」(ビザ・eSIM・保険など)の抜けの判定。
 *
 * このツールの取り柄は「寝る場所がない夜が 3 泊ある」のように、穴を件数ではなく
 * 名指しで指摘できることにある(nights.ts / itinerary.ts)。手続きも同じ扱いにする。
 * 「ビザは大丈夫?」と問いかけるだけのチェックリストは、旅行が近づくほど
 * 全部にチェックが付いた気になって読み飛ばされる。指摘するのは
 * 「いつまでに何が足りていないか」だけに絞る。
 *
 * ■ 何を穴と呼ぶか
 *   - coverage-gap: 有効期間が旅程をはみ出している。この判定がこのファイルの主役。
 *     「eSIM が 9/15 で切れるのに旅行は 9/20 まで」は、買った本人が一番気づけない
 *     種類の抜けで、しかも現地で気づいたときには手遅れになりやすい。
 *     人間が暗算するのは 2 つの日付の大小比較だけなのに、旅行の 2 か月前に
 *     買った eSIM の期限を出発前にもう一度見返す人はいない。だから機械が見る。
 *   - not-done: まだ取得できていない。旅行がまだ先なら「知らせるだけ」で、
 *     間に合わなくなる時期に入ってから警告に格上げする。
 *   - due-soon: 申請期限そのものが迫っている / 過ぎている。
 *
 * ■ 迷ったら警告側に倒す(nights.ts と同じ)
 *   日付が壊れていて数えられないときは、安全側=警告として扱う。
 *   手続きの抜けは現地で埋め合わせが効かない(入国できない・通信できない)ので、
 *   見逃すより誤警告のほうがましである。
 *
 * ■ 有効期間は取得状況にかかわらず見る
 *   まだ買っていない eSIM でも、旅程をカバーしない期間の商品を選んでいるなら
 *   それは買う前に直すべき間違いである。「取得済みになってから初めて期間を見る」と、
 *   一番安く直せる購入前の段階で黙っていることになる。
 *
 * ■ 日数の数え方は computeCancelDeadlines(derive.ts)に揃える
 *   期限はその日の終わりまで有効で、切り捨てなので「あと 0 日 = 今日中」。
 *   同じ画面に「無料キャンセル期限まであと 0 日」と「申請期限まであと 0 日」が
 *   並ぶのに、片方が今日いっぱいでもう片方が期限切れでは読めたものではない。
 */

import { diffDays, formatDateJa } from './datetime'
import type { TravelDoc, TravelDocIssue, TripNotesState } from './types'

/**
 * 「まだ取得できていない」を情報から警告へ格上げする、旅行開始までの残り日数。
 *
 * 観光ビザの審査は 2〜4 週間かかることがあり、eSIM のように即日で済むものでも
 * 端末が対応していないと分かってから代替を用意する時間が要る。
 * 30 日を切ったら「まだ何とかなるが、今日動かないと詰む」領域とみなす。
 *
 * 逆に、旅行の半年前から全部を警告として赤くすると、まだ手を付ける時期でない
 * 手続きが警告の大半を占めることになり、本当に埋めるべき穴が埋もれる。
 */
const NOT_DONE_WARNING_DAYS = 30

/**
 * 申請期限を知らせ始める残り日数。
 * 郵送や窓口の予約が要る手続きでも 2 週間あればまだ選択肢が残る。
 * これより先の期限は、知らせても「まだ先の話」として流されるだけになる。
 */
const DUE_SOON_INFO_DAYS = 14

/** 未取得の手続きの言い回し。'done' はそもそも指摘しないので対象外 */
const PENDING_STATUS_TEXT: Record<'todo' | 'applied', string> = {
  todo: 'まだ手つかず',
  applied: '申請したまま発給待ち',
}

/**
 * 日数の差。壊れた日付が来ても null に逃がす。
 * ここで例外を投げると、手続きを 1 件入力し損ねただけで
 * computeSummary 全体が落ちて進捗タブが真っ白になる。
 */
function daysBetween(fromISO: string, toISO: string): number | null {
  try {
    return diffDays(fromISO, toISO)
  } catch {
    return null
  }
}

/** 表示用の日付。壊れていても文面を組み立てられるよう、元の文字列に落とす */
function formatDate(iso: string): string {
  try {
    return formatDateJa(iso)
  } catch {
    return iso
  }
}

/** メッセージの中で手続きを指す呼び名。地域が入っていれば添える */
function docLabel(doc: TravelDoc): string {
  const region = doc.region?.trim() ?? ''
  return region.length > 0 ? `${doc.title}(${region})` : doc.title
}

/**
 * まだ取得できていない手続き。
 * 旅行開始までの残り日数で severity を決める。日数が数えられない
 * (旅行の開始日が壊れている)ときは警告側に倒す。
 */
function findNotDoneIssue(
  doc: TravelDoc,
  state: TripNotesState,
  todayISO: string,
): TravelDocIssue | null {
  if (doc.status === 'done') return null

  const label = docLabel(doc)
  const text = PENDING_STATUS_TEXT[doc.status]
  const daysToStart = daysBetween(todayISO, state.startDate)

  if (daysToStart === null) {
    return {
      docId: doc.id,
      kind: 'not-done',
      severity: 'warning',
      message: `「${label}」は${text}です。旅行の開始日が読み取れないため残り日数を数えられません。設定タブで旅行期間を直したうえで、申請状況を確認してください。`,
    }
  }

  if (daysToStart <= NOT_DONE_WARNING_DAYS) {
    return {
      docId: doc.id,
      kind: 'not-done',
      severity: 'warning',
      message:
        daysToStart < 0
          ? `「${label}」は${text}のまま旅行が始まっています。現地で必要になる前に申請状況を確認し、間に合わないなら代わりの手段を用意してください。`
          : `「${label}」は${text}です。旅行開始(${formatDate(state.startDate)})まであと${daysToStart}日しかありません。今日中に申請状況を確認し、間に合わないなら代わりの手段を用意してください。`,
    }
  }

  return {
    docId: doc.id,
    kind: 'not-done',
    severity: 'info',
    message: `「${label}」は${text}です。旅行開始(${formatDate(state.startDate)})まであと${daysToStart}日あるので、まだ慌てる必要はありません。済んだら「取得済み」にしてください。`,
  }
}

/**
 * 申請期限。取得済みのものは期限が過ぎていても困らないので対象外にする。
 * 残り日数の数え方は computeCancelDeadlines と同じ切り捨てで、0 は今日中を指す。
 */
function findDueSoonIssue(
  doc: TravelDoc,
  todayISO: string,
): TravelDocIssue | null {
  if (doc.status === 'done') return null
  const dueDate = doc.dueDate
  if (dueDate === undefined) return null

  const daysLeft = daysBetween(todayISO, dueDate)
  if (daysLeft === null) return null

  const label = docLabel(doc)

  if (daysLeft < 0) {
    return {
      docId: doc.id,
      kind: 'due-soon',
      severity: 'warning',
      message: `「${label}」の申請期限(${formatDate(dueDate)})を過ぎています。まだ受け付けてもらえるか申請先に確認し、だめなら代わりの手段を探してください。`,
    }
  }

  if (daysLeft === 0) {
    return {
      docId: doc.id,
      kind: 'due-soon',
      severity: 'warning',
      message: `「${label}」の申請期限は今日(${formatDate(dueDate)})までです。今日中に申請を終わらせてください。`,
    }
  }

  if (daysLeft <= DUE_SOON_INFO_DAYS) {
    return {
      docId: doc.id,
      kind: 'due-soon',
      severity: 'info',
      message: `「${label}」の申請期限は${formatDate(dueDate)}(あと${daysLeft}日)です。忘れないうちに申請を済ませてください。`,
    }
  }

  return null
}

/**
 * 有効期間が旅程をカバーしているか。
 *
 * 前(validFrom が旅行開始より後)と後ろ(validUntil が旅行終了より前)は
 * 別々の穴なので、両方はみ出していれば 2 件出す。1 件にまとめると
 * 「前を直せば片付く」と読めてしまい、後ろの穴が残ったまま消える。
 * 片方しか入力されていなければ、入力されている側だけを見る
 * (入っていない日付を「無制限」とも「即失効」とも決めつけない)。
 */
function findCoverageGapIssues(
  doc: TravelDoc,
  state: TripNotesState,
): Array<TravelDocIssue> {
  const issues: Array<TravelDocIssue> = []
  const label = docLabel(doc)

  const validFrom = doc.validFrom
  if (validFrom !== undefined) {
    const lateDays = daysBetween(state.startDate, validFrom)
    if (lateDays !== null && lateDays > 0) {
      issues.push({
        docId: doc.id,
        kind: 'coverage-gap',
        severity: 'warning',
        message: `「${label}」が有効になるのは${formatDate(validFrom)}からですが、旅行は${formatDate(state.startDate)}に始まります。最初の${lateDays}日分をカバーできないので、開始日を早めるか、その期間だけ別の手段を用意してください。`,
      })
    }
  }

  const validUntil = doc.validUntil
  if (validUntil !== undefined) {
    const shortDays = daysBetween(validUntil, state.endDate)
    if (shortDays !== null && shortDays > 0) {
      issues.push({
        docId: doc.id,
        kind: 'coverage-gap',
        severity: 'warning',
        message: `「${label}」の有効期間は${formatDate(validUntil)}までですが、旅行は${formatDate(state.endDate)}まで続きます。最後の${shortDays}日分をカバーできないので、期間を延長するか、その期間だけ別の手段を用意してください。`,
      })
    }
  }

  return issues
}

/**
 * 手続きの抜けを名指しする。todayISO は「どのタイムゾーンの今日か」を
 * 呼び出し側に決めさせるため引数で受け取る(derive.ts の computeSummary が
 * 表示タイムゾーンの今日を渡す)。手続きが 1 件も無ければ空配列。
 *
 * 1 つの手続きから複数の指摘が出ることがある(未取得かつ期限切れなど)。
 * 「一番重い 1 件だけ」に絞らないのは、直す手順がそれぞれ違うためで、
 * 期限切れを直しても未取得は未取得のまま残る。
 */
export function findTravelDocIssues(
  state: TripNotesState,
  todayISO: string,
): Array<TravelDocIssue> {
  const issues: Array<TravelDocIssue> = []
  for (const doc of state.travelDocs ?? []) {
    const notDone = findNotDoneIssue(doc, state, todayISO)
    if (notDone !== null) issues.push(notDone)

    const dueSoon = findDueSoonIssue(doc, todayISO)
    if (dueSoon !== null) issues.push(dueSoon)

    issues.push(...findCoverageGapIssues(doc, state))
  }
  return issues
}

/**
 * 型の実体は types.ts の ItineraryIssue の隣に置いてある(判定の型はすべて
 * そこに集める、というこのツールの決まりに従うため)。
 * このモジュールを import する側が types.ts を別に読まなくて済むよう、
 * 判定関数と同じ入口からも取れるようにしておく。
 */
export type { TravelDocIssue, TravelDocIssueKind } from './types'
