/**
 * 旅程パズル(trip-scheduler)で決めた骨組みを、旅のしおり(trip-notes)の
 * 新しい旅程に変換する。2 つのツールの間で唯一の橋になるファイル。
 *
 * ■ なぜここだけ trip-notes を import してよいのか
 *   trip-notes/datetime.ts が書いているとおり、この 2 つのツールは
 *   互いに import しない(似た日付ユーティリティも各自で持つ)方針で来ている。
 *   引き継ぎだけはその方針の外に置く。しおり側のデータを作る以上、
 *   Booking の形も Stamp の作り方も向こうの定義に従うほかなく、
 *   ここで型や makeAllDayStamp を再実装すると「しおりの検証は通らないが
 *   こちらは正しいつもり」という食い違いが、引き継いだ瞬間ではなく
 *   しおりを開いた瞬間に初めて表面化することになる。
 *   橋は 1 本だけにして、向きも一方通行(パズル → しおり)に固定する。
 *
 * ■ status を 'idea'(検討中)にする理由
 *   旅程パズルが決めているのは「どの街に何泊するか」だけで、宿も切符も
 *   まだ 1 つも押さえていない。それを 'held'(仮押さえ)以上で書き込むと、
 *   しおりの進捗タブは「夜は埋まっている」と言い始める。実際には
 *   何も予約していないのだから、確保できていない事実をそのまま持ち込む。
 *   'idea' なら夜の集計でも tentativeNights(仮の予約でしか埋まっていない夜)
 *   として数えられ、「まだ確保できていない」と言い続けてくれる。
 *
 * ■ 移動を kind: 'other' にする理由
 *   パズルの移動手段(legModes / 推奨手段)は所要時間を見積もるための仮定であって、
 *   利用者が「これで行く」と決めた予約ではない。鉄道と書いて引き渡すと、
 *   しおりの上では手段が決まっているように見えてしまう。
 *   しおりの itinerary.ts は「from / to が入っていれば種別によらず移動として扱う」
 *   設計(isMoveBooking)なので、kind: 'other' + from / to が
 *   「手段は未定だが、この区間を移動する」の正しい表現になる。
 *   見積もりのほうは note に目安として残し、判断の材料だけ渡す。
 *
 * ■ 引き継ぐもの / 引き継がないもの
 *   引き継ぐ: 旅行期間(開始日・終了日)、滞在(都市と泊数 → 日付)、
 *             都市間の移動と、その区間の見積もり(note)。
 *   引き継がない: 制約(constraints)・候補プール・IN/OUT 都市・移動手段の選択。
 *   これらは「日程をどう組むか」を考えるための道具で、しおり側に対応する
 *   入れ物が無い。無理に note へ流し込むと、パズルで条件を変えるたびに
 *   しおりの note と食い違い、どちらが本当なのか分からなくなる。
 *   日程を組み直したくなったらパズルに戻るのが正しい導線なので、
 *   考えるための材料はパズル側に置いたままにする。
 *
 * ■ タイムゾーン
 *   cities.ts の City は tz を持っていない(name / enName / country / iata /
 *   dbStation / lat / lng / landmass だけ)。持っていないものは作れないので、
 *   Stamp のタイムゾーンは呼び出し側(デバイスのタイムゾーン)から受け取る。
 *   ここで生成する予定はすべて終日なので、実害はほぼ無い。しおりが
 *   「その予定が何日のものか」を決めるのは stampDate()、つまり Stamp 自身の
 *   現地日付であって(datetime.ts)、表示タイムゾーンへの変換を挟まないため、
 *   どのタイムゾーンで作っても日付は入れたとおりに読み出される。
 *   ずれうるのは並び順に使う epoch だけで、終日どうしの数時間差は
 *   同じ日の中での前後関係に影響しない。
 *   利用者が実際の時刻(チェックイン 15:00 など)を入れる段になれば、
 *   そのときに現地のタイムゾーンを選ぶことになる。それはしおりの仕事である。
 */

import { cityName, getCity } from './cities'
import { addDays } from './dates'
import { deriveTrip } from './derive'
import { formatMinutes, travelModeLabel } from './travel'
import { FALLBACK_TZ, isValidTz, makeAllDayStamp } from '../trip-notes/datetime'
import { newId } from '../trip-notes/id'
import type { Booking, Place, TripNotesState } from '../trip-notes/types'
import type { ResolvedLeg, TripState } from './types'

export interface TripNotesHandoffOptions {
  /**
   * 生成する Stamp に使う IANA タイムゾーン。通常はデバイスのタイムゾーン。
   * 不正な値なら FALLBACK_TZ に寄せる(この関数は例外を投げない)。
   */
  tz: string
  /** 旅程の名前。省略時は訪問順の都市名から組み立てる */
  tripTitle?: string
}

/** タイトルに都市名を並べる上限。これを超えたら「ほか N 都市」に畳む */
const MAX_TITLE_CITIES = 3

/**
 * 旅程の名前の候補。
 *
 * パズル側に旅行のタイトルという概念が無いので、無いものは空のまま……とは
 * しなかった。しおりは複数の旅程を名前で選ぶ画面(旅程セレクタ)を持っていて、
 * 名前が空の旅程が増えると、どれが今作ったものか利用者にも見分けがつかなくなる。
 * 引き継ぎのたびに名前を考えさせるのも本題ではないので、訪問する都市から
 * 当たり障りのない名前を組み立てて渡し、気に入らなければしおり側で変えてもらう。
 */
export function suggestTripTitle(state: TripState): string {
  const names: Array<string> = []
  for (const stay of state.stays) {
    const name = cityName(stay.cityId)
    // 同じ都市への再訪(パリ IN・パリ OUT など)は 1 回だけ数える
    if (!names.includes(name)) names.push(name)
  }
  if (names.length === 0) return ''
  if (names.length <= MAX_TITLE_CITIES) return `${names.join('・')}の旅`
  const head = names.slice(0, MAX_TITLE_CITIES).join('・')
  return `${head}ほか${names.length - MAX_TITLE_CITIES}都市の旅`
}

/**
 * 都市を Place にする。
 *
 * name は日本語の都市名。latinName / lat / lng まで埋めるのは、しおり側が
 * この 2 つを機械向けの情報として使うためである。latinName は外部の検索サイトへの
 * リンク(searchLinks.ts)に渡され、座標は場所の同一判定(itinerary.ts の
 * 半径 30km)に使われる。どちらも埋めておけば、宿の名前がまだ「パリ滞在」で
 * しかない段階から、しおりの機能がそのまま効く。
 *
 * カタログに無い都市 ID は、名前として都市 ID をそのまま置く。
 * 引き継ぎを丸ごと諦めるより、名前の分からない滞在が 1 件残るほうがましで、
 * その 1 件は利用者が手で直せる。
 */
function placeOfCity(cityId: string): Place {
  const city = getCity(cityId)
  if (city === undefined) return { name: cityId }
  return {
    name: city.name,
    latinName: city.enName,
    lat: city.lat,
    lng: city.lng,
  }
}

/** 滞在 → 検討中の宿。チェックイン日〜チェックアウト日を終日で持つ */
function lodgingBooking(
  cityId: string,
  checkInDate: string,
  checkOutDate: string,
  nights: number,
  tz: string,
): Booking {
  return {
    id: newId('bk'),
    kind: 'lodging',
    title: `${cityName(cityId)}滞在`,
    start: makeAllDayStamp(checkInDate, tz),
    end: makeAllDayStamp(checkOutDate, tz),
    place: placeOfCity(cityId),
    status: 'idea',
    payment: 'unpaid',
    note: `旅程パズルから引き継いだ${nights}泊の滞在。宿はこれから探す`,
  }
}

/**
 * leg → 手段未定の移動。
 *
 * 出発は「前の都市のチェックアウト日」の終日。到着日が出発日と違うとき
 * (夜行での移動)だけ end を入れる。同日中に着く移動に end を入れても
 * 「その日ずっと移動している」ように見えるだけで、情報が増えないため。
 */
function moveBooking(
  leg: ResolvedLeg,
  departDate: string,
  arriveDate: string | undefined,
  tz: string,
): Booking {
  const from = placeOfCity(leg.fromCityId)
  const to = placeOfCity(leg.toCityId)
  const { mode, doorToDoorMinutes } = leg.chosen
  return {
    id: newId('bk'),
    kind: 'other',
    title: `${from.name} → ${to.name} の移動`,
    start: makeAllDayStamp(departDate, tz),
    end:
      arriveDate !== undefined && arriveDate > departDate
        ? makeAllDayStamp(arriveDate, tz)
        : null,
    from,
    to,
    status: 'idea',
    payment: 'unpaid',
    note: `旅程パズルの目安: ${travelModeLabel[mode]} / 約${formatMinutes(doorToDoorMinutes)}(宿から宿まで)。手段は未定`,
  }
}

/**
 * 旅程パズルの状態を、旅のしおりの新しい旅程に変換する。
 *
 * 日付は自分で数えず deriveTrip() の窓(StayWindow)をそのまま使う。
 * パズルの画面に出ている日付と 1 日でもずれると、引き継いだ結果を見た利用者は
 * どちらが正しいのか判断できない。夜行移動が泊を 1 つ食う扱いも含めて、
 * 日付の決め方はパズル側の 1 箇所(derive.ts)に閉じておく。
 *
 * 滞在が 1 つも無いときは null を返す。日付だけが入った空の旅程を作っても、
 * しおり側の「新規」ボタンと変わらないものが 1 件増えるだけで、
 * 引き継いだつもりの利用者を混乱させる。
 */
export function convertToTripNotes(
  state: TripState,
  options: TripNotesHandoffOptions,
): TripNotesState | null {
  if (state.stays.length === 0) return null

  // 不正なタイムゾーンでも引き継ぎ自体は成立させる。ここで例外を投げると
  // 「ボタンを押しても何も起きない」という、利用者に理由の分からない壊れ方になる
  const tz = isValidTz(options.tz) ? options.tz : FALLBACK_TZ

  const derived = deriveTrip(state)
  const { windows, legs } = derived
  if (windows.length === 0) return null

  const legByFromStayId = new Map(legs.map((leg) => [leg.fromStayId, leg]))
  const arriveDateByStayId = new Map(
    windows.map((window) => [window.stayId, window.arriveDate]),
  )

  const bookings: Array<Booking> = []

  for (let i = 0; i < windows.length;) {
    /*
     * 同じ都市が隣り合う滞在は 1 件の宿にまとめる。
     * derive.ts は同一都市の隣接に leg を立てない(移動が発生しないため)ので、
     * 宿だけを分けて出すと「同じ街で同じ日にチェックアウトしてチェックインする、
     * 移動を伴わない宿替え」がしおりに 2 件並ぶことになる。
     * パズルの上でも実態は連続した 1 つの滞在なので、そのまま 1 件にする。
     */
    let last = i
    while (
      last + 1 < windows.length &&
      windows[last + 1].cityId === windows[i].cityId
    ) {
      last += 1
    }
    const head = windows[i]
    const tail = windows[last]
    const nights = windows
      .slice(i, last + 1)
      .reduce((sum, window) => sum + window.nights, 0)

    bookings.push(
      lodgingBooking(head.cityId, head.arriveDate, tail.departDate, nights, tz),
    )

    // まとめた滞在の最後尾から出る移動だけが、次の都市への leg になる
    const leg = legByFromStayId.get(tail.stayId)
    if (leg !== undefined) {
      bookings.push(
        moveBooking(
          leg,
          addDays(state.startDate, leg.dayIndex),
          arriveDateByStayId.get(leg.toStayId),
          tz,
        ),
      )
    }

    i = last + 1
  }

  return {
    schemaVersion: 1,
    tripTitle: options.tripTitle ?? suggestTripTitle(state),
    startDate: state.startDate,
    endDate: state.endDate,
    // 表示タイムゾーンの固定はしおり側の好みでしかなく、パズルには対応する設定が無い。
    // null = デバイスのタイムゾーンに任せる
    pinnedTz: null,
    bookings,
    emergencyContacts: [],
  }
}
