/**
 * 地名の文字列を扱う共通部品。
 *
 * ここに置いてあるのは「施設名から地名の部分を取り出す」ための語彙と手続きで、
 * 目的の違う 2 か所から使われる。
 *
 * - itinerary.ts の場所の同一判定
 *   normalizeName() を通した後の形(小文字化 + 記号除去)どうしを突き合わせる。
 *   表記ゆれを潰したいだけで、元の表記は誰にも見えないので要らない。
 * - searchLinks.ts の Rome2Rio リンク
 *   組み立てた URL を利用者がそのまま開くので、元の表記(大文字小文字・中黒・
 *   文字種)を保ったまま語尾だけを落とす必要がある。小文字化して記号を消した
 *   文字列を検索サイトに渡すわけにはいかない。
 *
 * ■ なぜ 1 つのモジュールにまとめるのか
 *   扱いたい入力の形が違うので処理そのものは 2 本あるが、語彙
 *   (FACILITY_SUFFIXES)は 1 つしか置かない。
 *   以前このリポジトリで同じ内容の定数を 2 か所に持たせ、「値を変えるときは
 *   両方を揃えること」というコメントで担保しようとしたことがあるが、
 *   実際には片方だけ変わって静かに壊れた。コメントで守るしかない約束は、
 *   最初から作らないようにする。
 */

/**
 * 部分一致を認める最短の長さ。
 * 1 文字の地名まで包含判定に載せると、ほぼ何にでも一致してしまう。
 *
 * 語尾を落とした結果がこれ未満になったときは、落とす前の形に戻す
 * (withoutFacilitySuffix / toCityName)。削って意味を失った文字列は、
 * 判定でも検索でも役に立たないためである。
 */
export const MIN_PARTIAL_MATCH_LENGTH = 2

/**
 * 表記ゆれを潰す。NFKC で全角/半角を揃えたうえで小文字化し、
 * 文字と数字以外(空白・中黒・ハイフン・括弧などの記号)をすべて落とす。
 * 長音符「ー」は Unicode 上は文字なので残る。
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * 名前の末尾から落とす「どんな施設か」の語。normalizeName() を通した後の形で持つ
 * (空白・中黒はこの時点で消えているので、英語は続けて書いた形になる)。
 *
 * ■ なぜ語尾を落とすのか
 *   「マルタ・ルア国際空港」と「マルタの知人宅」は人間には同じ島の話だと分かるが、
 *   文字列としてはどちらも他方を含まないので包含判定では一致しない。
 *   この 2 つで共通しているのは地名の部分だけで、残りは施設の種類でしかない。
 *   語尾を落として地名部分を露出させれば、既存の包含判定にそのまま乗る。
 *
 * ■ なぜ辞書を持たないのか
 *   都市名・国名の一覧を持てば同じことをもっと正確にできるが、
 *   世界中の地名を網羅した表を個人ツールで維持し続けるのは無理がある。
 *   古い表は「載っていない街だけ判定が変わる」という説明しづらい壊れ方をするので、
 *   最初から持たず、語尾の除去だけで届く範囲に留める。
 *
 * ■ 落としすぎないための制約
 *   落とすのは末尾の 1 語だけで、長い語から順に試して 1 つ落としたら打ち切る
 *   (「国際空港」を「空港」で削って「◯◯国際」を作らないため)。
 *   落とした残りが MIN_PARTIAL_MATCH_LENGTH 未満になる候補は捨てる。
 *   「駅」だけを入力した予約から空文字の候補が生まれると、
 *   何にでも一致して食い違いを丸ごと見逃すことになる。
 *
 * ■ 英語の `port` を単独では入れない(再追加しないこと)
 *   Newport / Southport / Stockport / Bridgeport のように、地名そのものが
 *   -port で終わる街が英語圏には実在する。`port` を落とすと「Newport」から
 *   「new」という候補が生まれ、3 文字あるので長さのガードも素通りしたうえで
 *   「New York」(newyork)に包含判定で一致してしまう。つまり本当に出るべき
 *   到着地の食い違いが消える。itinerary.ts の方針は「見逃しより誤検出を許す」なので、
 *   港をひとつ拾うために見逃しを作るのは割に合わない。
 *   港を拾いたい場合は、地名の一部になりにくい複合語(seaport / ferryport /
 *   cruiseport)だけを足す。日本語の「港」は「神戸港」→「神戸」と落とせて、
 *   「香港」→「香」は 1 文字なので長さのガードで捨てられるため残してある。
 */
export const FACILITY_SUFFIXES: Array<string> = [
  '国際空港',
  '空港',
  '飛行場',
  '中央駅',
  '駅',
  'フェリーターミナル',
  'バスターミナル',
  'ターミナル',
  '港',
  'ホテル',
  'ゲストハウス',
  'ホステル',
  '旅館',
  '民宿',
  '民泊',
  '知人宅',
  '友人宅',
  '実家',
  '自宅',
  '別荘',
  '宅',
  'internationalairport',
  'intlairport',
  'airport',
  'centralstation',
  'station',
  'ferryterminal',
  'busterminal',
  'terminal',
  'cruiseport',
  'ferryport',
  'seaport',
  'hotel',
  'hostel',
  'guesthouse',
  'apartment',
].toSorted((a, b) => b.length - a.length)

/**
 * 施設の語を末尾から 1 つだけ落として、地名部分だけにした名前を返す。
 * 落とせない(施設の語で終わっていない、落とすと短くなりすぎる)なら null。
 *
 * 入力も出力も normalizeName() を通した形である。表記を保ったまま落としたい場合は
 * toCityName() を使う。
 */
export function withoutFacilitySuffix(name: string): string | null {
  for (const suffix of FACILITY_SUFFIXES) {
    if (!name.endsWith(suffix)) continue
    const stripped = name.slice(0, name.length - suffix.length)
    // 「マルタの知人宅」は「マルタの」で終わるので、助詞もここで落として地名にする
    const base = stripped.endsWith('の') ? stripped.slice(0, -1) : stripped
    return base.length < MIN_PARTIAL_MATCH_LENGTH ? null : base
  }
  return null
}

// --- 元の表記を保ったまま都市名に寄せる ---

/**
 * ターミナルの表記。
 *
 * FACILITY_SUFFIXES と分けて持つのは、位置が末尾とは限らないためである。
 * 「香港国際空港 T2」の T2 は施設の語(国際空港)より後ろに付くので、
 * 語尾の除去だけでは絶対に落ちない。
 *
 * 全角も拾う。手入力や AI 取り込みの出力には全角が混ざる。
 * 「T2」は前後が英数字なら落とさない。英単語や地名の途中(St. Moritz の t など)を
 * 削ってしまうと、直しようのない別の文字列ができあがるためである。
 */
const TERMINAL_PATTERNS: Array<RegExp> = [
  /第\s*[0-9０-９]+\s*ターミナル/gu,
  /ターミナル\s*[0-9０-９]+/gu,
  /terminal\s*[0-9０-９]+[A-Za-z]?/giu,
  /(?<![A-Za-z0-9])[TtＴｔ]\s?[0-9０-９]+[A-Za-z]?(?![A-Za-z0-9])/gu,
]

/**
 * 語を落とした跡に残る区切り記号。中黒・ハイフン・読点・空白・括弧など。
 * 「コペンハーゲン・カストラップ空港」から施設の語だけを落とすと
 * 中黒が末尾に残ることがあり、そのまま検索サイトに渡しても意味がない。
 */
const EDGE_SEPARATORS =
  /^[\s・･、。,.\-‐–—－/|()（）]+|[\s・･、。,.\-‐–—－/|()（）]+$/gu

function trimSeparators(raw: string): string {
  return raw.replace(EDGE_SEPARATORS, '')
}

/**
 * 元の表記を保ったまま、末尾の施設の語を 1 つだけ落とす。落とせないなら null。
 *
 * FACILITY_SUFFIXES は normalizeName() を通した形なので、末尾を 1 文字ずつ
 * 広げながら正規化して突き合わせる。こうしないと
 * 「Milan Malpensa International Airport」のように元の表記では空白が入る語と
 * 対応が付かず、英語の施設名だけ落とせないという中途半端な挙動になる。
 */
function withoutFacilitySuffixRaw(raw: string): string | null {
  for (const suffix of FACILITY_SUFFIXES) {
    for (let i = raw.length - 1; i >= 0; i--) {
      const tail = normalizeName(raw.slice(i))
      // これ以上末尾を広げても長くなる一方なので、この語は諦めて次の語へ
      if (tail.length > suffix.length) break
      if (tail !== suffix) continue
      const head = trimSeparators(raw.slice(0, i))
      // 「マルタの知人宅」は「マルタの」で終わるので、助詞もここで落として地名にする
      return head.endsWith('の') ? trimSeparators(head.slice(0, -1)) : head
    }
  }
  return null
}

/**
 * 施設名を都市名に寄せる。元の表記(大文字小文字・文字種)は保つ。
 *
 * 「香港国際空港 T2」→「香港」のように、ターミナルの表記と施設の語を落として
 * 街の名前だけにする。都市名しか受け付けない検索サイト(searchLinks.ts の
 * Rome2Rio)に渡すためのもので、施設名のほうが正確に解決できる相手
 * (Google マップなど)には使わない。
 *
 * ■ 落とす順番
 *   1. ターミナルの表記(位置が末尾とは限らないので先に消す)
 *   2. 施設の語を末尾から 1 つだけ(長い語から順に試して 1 つ落としたら打ち切る)
 *   3. 落とした跡に残った区切り記号
 *
 * ■ 削りすぎたら元に戻す
 *   結果が MIN_PARTIAL_MATCH_LENGTH 未満になるなら、落とす前の文字列をそのまま返す。
 *   「駅」「T2」しか入っていない予約から空文字や 1 文字を作って検索サイトに渡すより、
 *   施設名のままのほうがまだ解決される見込みがあるためである。
 *   「香港」が「香」にならないのもこのガードによる。
 *
 * ■ 寄せた結果が当たっているかは、ここでは分からない
 *   このツールはネットワークに出ないので、渡した先の検索サイトがその文字列を
 *   解決できるかは検証しようがない(searchLinks.ts の transitBookingLinks 参照)。
 *   ここでできるのは「都市名らしい形にする」ところまでである。
 */
export function toCityName(raw: string): string {
  const original = raw.trim()

  let stripped = original
  for (const pattern of TERMINAL_PATTERNS) {
    stripped = stripped.replace(pattern, ' ')
  }
  // ターミナルの表記を抜いた跡に空白が二重に残ることがあるので詰める
  stripped = trimSeparators(stripped.replace(/\s+/gu, ' '))

  const city = trimSeparators(withoutFacilitySuffixRaw(stripped) ?? stripped)
  return normalizeName(city).length < MIN_PARTIAL_MATCH_LENGTH ? original : city
}
