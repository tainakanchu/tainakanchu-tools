/**
 * 「いま、どのあたりにいるか」の推定。
 *
 * ■ なぜ独立した問いとして置くのか
 *   最初は「やりたいこと」を持ち上げるためだけの補助として wishes.ts の中に
 *   書こうとしたが、旅程から現在地を当てるのは、やりたいことと何の関係もない
 *   一般的な問いである(この先「いまの国の緊急通報番号を先頭に出す」
 *   「いまの町の予約だけを畳む」といった使い道はいくらでも出てくる)。
 *   使い道の 1 つの都合で置き場所を決めると、2 つ目の使い道が現れたときに
 *   写して 2 本にするか、無関係なモジュールを import することになる。
 *
 * ■ 推定の元(強い順に重ねる。どれか 1 つを選ぶのではなく候補の集合を作る)
 *   1. 最後に着いた場所。旅程を時系列に並べ、いまより前に終わっている予約のうち
 *      最後のものの「終わりにいる場所」(移動なら to、滞在なら place)。
 *      これが主役である。宿の名前に町の名前が入っていないことは珍しくないが
 *      (「King's Mansion」)、そこへ着いた便の到着地はたいてい
 *      「香港国際空港」のように町の名前を含んでいて、施設の語を落とせば町が出る。
 *   2. 進行中の滞在の場所。宿の名前が町の名前そのもの(「コペンハーゲン滞在」)
 *      という書き方をする人には、これがいちばん素直に当たる。
 *   3. 利用者が「同じ場所として扱う」と教えた組(placeAliases)の相方。
 *      機械が当てられなかった対応を人間が既に教えてくれているなら、それを使う。
 *
 * ■ 推定は「持ち上げ」のためのものであって、絞り込みのためのものではない
 *   空港名に町の名前が入っていない場所(「インディラ・ガンディー国際空港」)は
 *   原理的に外れる。だからこの推定の結果を使って何かを画面から消してはいけない。
 *   使ってよいのは順番を変えること(上に出す)までで、外れたときに利用者が失うのは
 *   「一手多くタップする」ことだけ、という形に保つ。
 *
 * ■ 移動の最中は「まだ着いていない」ものとして扱う
 *   進行中の予約のうち移動(isMoveBooking)からは場所を取らない。乗っている
 *   飛行機の to はこれから着く町であって、いまいる町ではない。取り込むと
 *   離陸した瞬間に「いまの町」が次の町に変わり、乗り継ぎ空港でやりたかったことが
 *   画面から降りる。1 で拾った「最後に着いた場所」のまま留めておくほうが実態に近い。
 */

import { tryParseStamp } from './datetime'
import { findCurrentAndNext } from './derive'
import { isMoveBooking, placeAtEnd, sortItineraryBookings } from './itinerary'
import {
  addressMatchCandidates,
  nameMatchCandidates,
  normalizeName,
  toCityName,
} from './placeNames'
import type { Booking, Place, PlaceAlias, TripNotesState } from './types'

/** いまいる場所の推定結果 */
export interface CurrentPlaceGuess {
  /**
   * クイック追加のプリセットなどに出す町の名前。推定できなければ null。
   *
   * 候補のうちいちばん強いものだけを都市名に寄せた(toCityName)形で、
   * 住所から割ったトークンやエイリアスの相方は入れない。
   * 突き合わせなら「Bharat Nagar」が混ざっても持ち上げが増えるだけで害は無いが、
   * 入力欄に既定値として入ってしまうと、利用者が消さない限りそのまま保存される。
   * 画面に出す 1 つの値には、当てにいかず素直な形だけを使う。
   */
  area: string | null
  /**
   * 突き合わせに使う候補(normalizeName 済み)。
   * 名前・現地語表記・ラテン文字表記・住所のトークン・エイリアスの相方を
   * すべて同じ土俵に載せてある。
   */
  candidates: Array<string>
}

/** 候補が 1 つも作れなかったとき。呼び出し側は「推定できなかった」として扱う */
export const NO_PLACE_GUESS: CurrentPlaceGuess = { area: null, candidates: [] }

/** 予約の終わりの絶対時刻。end が無ければ開始と同じ(itinerary.ts の Entry と同じ決め方) */
function endEpochOf(booking: Booking): number | null {
  const start = tryParseStamp(booking.start)
  if (start === null) return null
  const end = booking.end === null ? null : tryParseStamp(booking.end)
  return (end ?? start).epochMilliseconds
}

/** 中身のある名前だけを拾う */
function nameOf(place: Place): Array<string> {
  return [place.name, place.localName, place.latinName].filter(
    (name): name is string => name !== undefined && name.trim() !== '',
  )
}

/**
 * 名前の候補にエイリアスの相方を足す。
 *
 * 突き合わせは normalizeName() を通した完全一致で行う。isSameAliasPair と同じ流儀で、
 * ここは推測を足す場所ではなく、利用者が名指しで教えた組をそのまま引く場所だからである。
 * 包含まで認めると、教えていない組まで相方が生えて、推定の根拠が説明できなくなる。
 */
function expandByAliases(
  names: Array<string>,
  aliases: Array<PlaceAlias>,
): Array<string> {
  const known = new Set(names.map(normalizeName))
  const added: Array<string> = []
  for (const alias of aliases) {
    const [first, second] = alias.names
    if (first.trim() === '' || second.trim() === '') continue
    if (known.has(normalizeName(first))) added.push(second)
    if (known.has(normalizeName(second))) added.push(first)
  }
  return added
}

/**
 * いまいる場所を旅程から推定する。
 *
 * キャンセル済みの予約は無いものとして扱う(キャンセルした宿を根拠に
 * 「いまその町にいる」と推定しては困る)。開始時刻が壊れている予約も並べようがないので
 * 外れる(sortItineraryBookings がやる)。
 *
 * 予約が 1 件も無い / これから始まる予約しか無い(旅行前)ときは何も推定しない。
 * 無理に旅程の先頭を「いまの町」として返すと、出発前の画面で行ってもいない町の
 * やりたいことだけが持ち上がることになる。
 */
export function estimateCurrentPlaces(
  state: TripNotesState,
  nowMs: number,
): CurrentPlaceGuess {
  const alive = state.bookings.filter(
    (booking) => booking.status !== 'cancelled',
  )

  const places: Array<Place> = []

  // 1. 最後に着いた場所。いまより前に終わっていて、終わりの場所が取れる最後の予約
  const timeline = sortItineraryBookings(alive)
  for (let i = timeline.length - 1; i >= 0; i--) {
    const booking = timeline[i]
    const end = endEpochOf(booking)
    if (end === null || end > nowMs) continue
    const place = placeAtEnd(booking)
    if (place === null) continue
    places.push(place)
    break
  }

  // 2. 進行中の滞在の場所(移動は除く。冒頭コメントの「まだ着いていない」参照)
  const { current } = findCurrentAndNext(alive, nowMs)
  for (const booking of current) {
    if (isMoveBooking(booking)) continue
    const place = placeAtEnd(booking)
    if (place !== null) places.push(place)
  }

  // 名前は強い順に並べたまま重複だけを畳む。先頭が area(プリセット)の元になる
  const names = [...new Set(places.flatMap(nameOf))]
  if (names.length === 0) return NO_PLACE_GUESS

  // 3. 利用者が教えた組の相方
  const aliases = state.placeAliases ?? []
  const withAliases = [...names, ...expandByAliases(names, aliases)]

  const addressTokens = places.flatMap((place) =>
    addressMatchCandidates(place.address),
  )

  return {
    area: toCityName(names[0]),
    candidates: [
      ...new Set([...nameMatchCandidates(withAliases), ...addressTokens]),
    ],
  }
}
