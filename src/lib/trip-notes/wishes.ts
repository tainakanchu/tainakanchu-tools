/**
 * やりたいこと(Wish)を「いまの町のもの」とそれ以外に振り分ける。
 *
 * ■ なぜ場所で振り分けるのか
 *   やりたいことリストは、旅が長くなるほど町ごとに溜まっていく。28 日の周遊で
 *   30 件を 1 本の列にして出すと、いま歩いている町のパン屋を探すのに、
 *   来週の町の予定を 20 行スクロールすることになる。「今」タブが一画面一情報で
 *   あろうとしている理由(NowPanel.tsx)がそのまま、ここでも効く。
 *
 * ■ 突き合わせは既存の名寄せを使い回す。新しく発明しない
 *   wish.area は自由入力で、旅程の場所は予約確認メールから来る施設名である。
 *   この 2 つを繋ぐ問題は、旅程の連続性の判定(itinerary.ts)が
 *   「マルタ・ルア国際空港」と「マルタの知人宅」で既に解いている問題と同じもので、
 *   道具は placeNames.ts に置いてある(施設の語を落とす・包含を許す)。
 *   ここで独自の判定を書くと、片方だけ緩めたときに
 *   「旅程では同じ場所なのに、やりたいことは持ち上がらない」という
 *   説明のつかない食い違いが生まれる。
 *
 * ■ マッチは「持ち上げ」であって「フィルタ」ではない
 *   これがこのモジュールでいちばん大事な判断である。
 *   宿の名前に町の名前が入っていない予約(香港の「King's Mansion」)は必ずあり、
 *   推定(whereabouts.ts)がどれだけ賢くなっても外れる場合は残る。
 *   だから当たらなかったやりたいことを画面から消してはいけない。
 *   ここが返す 3 つの束は「上に出すもの / 折りたたみに入れるもの」の区別であって、
 *   「出すもの / 出さないもの」の区別ではない。外したときに利用者が払う代償は
 *   一手多くタップすることだけ、という形に保つ。
 *   画面側(NowPanel.tsx)は elsewhere と anywhere を必ず開ける形で置くこと。
 *
 * ■ 済んだものは消さずに沈める
 *   done を消さないのは、旅の記録としてあとから読み返す価値があるためである
 *   (types.ts の Wish 参照)。ただし「これから何をするか」を見に来た画面で
 *   済んだものが先に並ぶ理由は無いので、束の中では後ろに回す。
 */

import { nameMatchCandidates, namesOverlap } from './placeNames'
import type { CurrentPlaceGuess } from './whereabouts'
import type { Wish } from './types'

/** やりたいことを「いまの町 / 他の町 / 場所指定なし」に分けた束 */
export interface WishSplit {
  /** いまいると推定した町のもの。画面の上に出す */
  here: Array<Wish>
  /** 他の町のもの。折りたたみに入れる(消さない) */
  elsewhere: Array<Wish>
  /** 場所を書いていないもの。どこにいても意味があるので常に見せてよい */
  anywhere: Array<Wish>
}

/** 場所が書かれているか。空白だけの area は「どこでも」として扱う */
export function hasArea(wish: Wish): boolean {
  return wish.area !== undefined && wish.area.trim() !== ''
}

/**
 * そのやりたいことが、いまいると推定した場所のものか。
 * 推定できていない(候補が空)ときは常に false。何とも突き合わせられないので、
 * 当てずっぽうで持ち上げるより、全部を素直に一覧として出すほうがよい。
 */
export function matchesCurrentPlace(
  wish: Wish,
  guess: CurrentPlaceGuess,
): boolean {
  if (!hasArea(wish)) return false
  if (guess.candidates.length === 0) return false
  return namesOverlap(nameMatchCandidates([wish.area]), guess.candidates)
}

/**
 * 未完了を先に、完了を後ろに。同じ側どうしの並びは元のまま
 * (toSorted は安定ソートなので、利用者が足した順が保たれる)。
 *
 * 場所で振り分けられないとき(旅行前など)に一覧をそのまま出す画面も
 * この並びを使うので公開している。並べ方が画面ごとに違うと、
 * 同じ一覧なのに済んだ行の位置が変わって探し直すことになる。
 */
export function sortWishesForDisplay(wishes: Array<Wish>): Array<Wish> {
  return wishes.toSorted((a, b) => Number(a.done) - Number(b.done))
}

/**
 * やりたいことを 3 つの束に分ける。
 * どの束も未完了が先・完了が後ろに並ぶ。
 */
export function splitWishesForNow(
  wishes: Array<Wish>,
  guess: CurrentPlaceGuess,
): WishSplit {
  const here: Array<Wish> = []
  const elsewhere: Array<Wish> = []
  const anywhere: Array<Wish> = []

  for (const wish of wishes) {
    if (!hasArea(wish)) anywhere.push(wish)
    else if (matchesCurrentPlace(wish, guess)) here.push(wish)
    else elsewhere.push(wish)
  }

  return {
    here: sortWishesForDisplay(here),
    elsewhere: sortWishesForDisplay(elsewhere),
    anywhere: sortWishesForDisplay(anywhere),
  }
}

/**
 * 設定タブの一覧のための、場所ごとのまとまり。
 *
 * 見出しに使うのは利用者が最初に書いた表記そのままで、正規化した形ではない。
 * 「台北」と書いた人の画面に「たいぺい」と出しても、自分が書いた行を探せない。
 * まとめる単位だけは正規化(表記ゆれの吸収)で決め、見せる文字は元のものを使う。
 */
export interface WishGroup {
  /** 見出し。場所を書いていない束は null */
  area: string | null
  wishes: Array<Wish>
}

/** 表記ゆれを吸収したうえで、area ごとにまとめる。並びは登場順 */
export function groupWishesByArea(wishes: Array<Wish>): Array<WishGroup> {
  const groups = new Map<string, WishGroup>()
  for (const wish of wishes) {
    const area = hasArea(wish) ? (wish.area ?? '').trim() : null
    // 正規化した形をキーにするので「台北」と「台 北」は同じ束になる。
    // 場所なしは他のどの area とも衝突しない専用のキーに落とす
    const key =
      area === null ? '\u0000none' : (nameMatchCandidates([area])[0] ?? area)
    const found = groups.get(key)
    if (found === undefined) groups.set(key, { area, wishes: [wish] })
    else found.wishes.push(wish)
  }
  return [...groups.values()]
}
