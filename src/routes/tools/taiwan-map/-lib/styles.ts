/**
 * 台湾マップ UI で共有する Tailwind クラス。
 * サイト全体のトーン（rounded-2xl のカード + cyan アクセント）に合わせる。
 *
 * cyan は「押せるもの」（絞り込みチップの選択中・リンク・主操作）専用にして、
 * 訪問状況の色には使わない。旅のしおりと同じ方針で、状態色と操作色が
 * 混ざると「どれが押せるのか」が分かりにくくなるため。
 *
 * ダーク（dark:）は styles.css 冒頭の配色の約束どおり。面は gray-900、枠は
 * gray-600（カードの枠は gray-800）、塗りの cyan は cyan-400 地 + gray-950 字。
 * 影は暗い地では見えないので消し、枠で面を分ける。
 */

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:focus-visible:outline-cyan-400'

/**
 * 白地の副ボタン・チップのダーク（枠の色は別。破線のチップは slate の枠にする）。
 * hover は cyan の枠 + ごく薄い cyan の地
 */
const darkQuietClass =
  'dark:bg-gray-900 dark:text-gray-200 dark:hover:border-cyan-400 dark:hover:bg-cyan-950/40'
const darkQuietWithBorder = `dark:border-gray-600 ${darkQuietClass}`

export const cardClass =
  'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-gray-800 dark:bg-gray-900 dark:shadow-none'

export const sectionTitleClass =
  'text-sm font-semibold text-gray-700 dark:text-gray-200'

/**
 * チップの見た目の約束（絞り込みチップ・カードのバッジ・地図のチップで共通）:
 * - 塗り（cyan）… 選んでいる絞り込み条件。塗りはこれにしか使わない
 * - 実線の枠 … ふつうのジャンル・状態など
 * - 破線の枠 … 未訪問・気になる（地図の白抜きのピンと同じ「未確定」の形）
 * 色を増やさず、塗り / 枠 / 破線の 3 つだけで役割を分ける。
 */
const chipPressedClass =
  'border-cyan-600 bg-cyan-600 font-semibold text-white hover:border-cyan-700 hover:bg-cyan-700 dark:border-cyan-400 dark:bg-cyan-400 dark:text-gray-950 dark:hover:border-cyan-300 dark:hover:bg-cyan-300'

/**
 * 絞り込みチップ。aria-pressed と見た目を必ずセットで切り替える。
 * デスクトップでは一覧カラム（約 440px）に収まるよう一段小さくする。
 * スマホは指で押すので小さくしない。dashed は「未訪問・気になる」の条件用
 */
export function chipClass(pressed: boolean, dashed = false): string {
  return `inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition lg:px-2.5 lg:py-1 lg:text-[0.8125rem] ${focusRing} ${
    pressed
      ? chipPressedClass
      : `${dashed ? 'border-dashed border-slate-400 dark:border-slate-500' : 'border-gray-300 dark:border-gray-600'} bg-white text-gray-700 hover:border-cyan-400 hover:bg-cyan-50/50 ${darkQuietClass}`
  }`
}

/** チップの中の件数。塗りのチップでも読めるよう、色は文字色を薄めて使う */
export const chipCountClass =
  'text-[0.7rem] font-normal tabular-nums opacity-70'

/**
 * 地図の上に重ねる小さめのチップ。地図の上で埋もれないよう、地色は
 * 半透明でなく白にして影を付ける。高さは一覧側のチップより一段低くし、
 * スマホでも地図を隠しすぎないようにしている。
 */
export function mapChipClass(pressed: boolean): string {
  // スマホは指で押すので高さ 32px 以上（min-h-8）。デスクトップは一段低く
  return `inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap shadow-sm transition lg:min-h-0 ${focusRing} ${
    pressed
      ? chipPressedClass
      : `border-gray-300 bg-white text-gray-700 hover:border-cyan-400 hover:bg-cyan-50 ${darkQuietWithBorder}`
  }`
}

export const actionButtonClass = `inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 ${darkQuietWithBorder} dark:hover:text-cyan-200 ${focusRing}`

/**
 * カードの主操作（Google マップで開く）。cyan で塗って、横に並ぶ
 * 小さな補助ボタン（smallButtonClass）と重みの差をはっきりさせる
 */
const primaryButtonBase = `inline-flex items-center gap-1 rounded-lg border border-cyan-600 bg-cyan-600 py-1 text-[0.8125rem] font-semibold text-white transition hover:border-cyan-700 hover:bg-cyan-700 dark:border-cyan-400 dark:bg-cyan-400 dark:text-gray-950 dark:hover:border-cyan-300 dark:hover:bg-cyan-300 ${focusRing}`

export const primaryButtonClass = `${primaryButtonBase} min-h-8 px-2.5`

/**
 * 地図の上の小さいカードの主操作（SpotActions の compact）。1 行に収めるため
 * 縮められるようにし（文字は省略）、スマホは指で押すので高さ 44px
 */
export const compactPrimaryButtonClass = `${primaryButtonBase} min-h-11 min-w-0 px-2 whitespace-nowrap lg:min-h-8 lg:px-2.5`

/** カードの補助操作（地図で見る・共有）。主操作より一段小さい */
export const smallButtonClass = `inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-300 bg-white px-1.5 py-1 text-xs font-medium text-gray-700 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 ${darkQuietWithBorder} dark:hover:text-cyan-200 ${focusRing}`

/**
 * 地図の上の小さいカードの補助操作（地図で見る・共有・一覧で見る）。アイコン
 * だけの四角いボタンなので aria-label と title を必ず付けること。
 * スマホは指で押すので 44px 四方、デスクトップ（ポップアップ）は主操作と同じ 32px
 */
export const iconButtonClass = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 lg:h-8 lg:w-8 ${darkQuietWithBorder} dark:hover:text-cyan-200 ${focusRing}`

/**
 * 名前の行の右端に置く、外部リンク（公式サイトなど）の丸いアイコンボタン。
 * 文字を出さないので aria-label と title を必ず付けること
 */
export const iconLinkClass = `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 ${darkQuietWithBorder} dark:hover:text-cyan-200 ${focusRing}`

export const linkClass = `text-cyan-700 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-900 dark:text-cyan-300 dark:decoration-cyan-700 dark:hover:text-cyan-200 ${focusRing}`

/** トップの「都市から探す」などの大きめボタン */
export const bigChoiceClass = `flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:shadow-none dark:hover:border-cyan-400 ${focusRing}`

export const segmentedClass = (active: boolean) =>
  `flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${focusRing} ${
    active
      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100 dark:shadow-none'
      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
  }`
