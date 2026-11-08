/**
 * スポット 1 件ぶんのカード。このツールの主役。
 *
 * 地図より先にコメント（summary）が目に入るよう、カードの中でも
 * summary を名前の次に大きく置く。星や点数は出さない（主観の記録であって
 * 評価サイトではないため）。
 *
 * 以前は note / 食べたもの / タグ / 公式サイトを「くわしく」で折りたたんで
 * いたが、開いても 1〜2 行しか無いことが多く、押す手間に見合わなかった。
 * 今は開閉を無くし、note と食べたものはあるときだけそのまま出す。
 *
 * 一覧で何件も見比べられるよう、カードは詰めて作る（390px 幅のスマホで
 * 2〜3 枚が同時に見える程度）:
 * - 名前のすぐ下に「どんな場所か」をタグの一言で出す（「牛肉麵、深夜」）
 * - 操作は「Google マップで開く」を主（塗りのボタン）、地図で見る・
 *   共有を一段小さい補助ボタン（文字だけ）にして 1 行に収める。
 *   公式サイトは名前の行の右端の丸いアイコン（SpotActions.tsx）
 * - 現在地が分かっていれば「現在地から約 400m」を添える
 * - コメント（summary）は左に線を引いた引用の形（SpotComment）にして、
 *   バッジや訪問時期のような情報と区別する
 */

import { memo, useEffect, useId, useRef } from 'react'
import { MapPin, Navigation } from 'lucide-react'
import {
  extraNameZh,
  formatVisitedAt,
  publicText,
  spotSubtitle,
} from '../../../../lib/taiwan-map/format'
import { formatDistance } from '../../../../lib/taiwan-map/nearby'
import { getCity } from '../../../../lib/taiwan-map/types'
import { CategoryChip, LabelBadge, StatusBadge } from './Badges'
import { SpotActions, SpotComment, SpotLinkIcons } from './SpotActions'
import type { TaiwanArea, TaiwanSpot } from '../../../../lib/taiwan-map/types'

type Props = {
  spot: TaiwanSpot
  area: TaiwanArea | undefined
  /** 複数都市をまたいだ一覧のときだけ都市名を出す */
  showCity: boolean
  selected: boolean
  /**
   * 選ばれたときにフォーカスまで移すか。共有リンクを開いた直後に
   * フォーカスを奪うと、キーボード・スクリーンリーダー利用者がページ
   * 途中から始まってしまうので、ユーザー操作で選んだときだけ true にする。
   */
  focusOnSelect: boolean
  onSelect: (id: string) => void
  onShowOnMap: (id: string) => void
  /** 現在地からの距離（m）。現在地が分からなければ undefined */
  distance?: number
}

export function spotElementId(id: string): string {
  return `spot-${id}`
}

/**
 * memo しているのは、カードを 1 枚選ぶたびに全カード（数十枚）を描き直さない
 * ため。親（index.tsx）から渡す関数は useCallback、area は Map から引いた
 * 同じオブジェクトなので、変わるのは selected が切り替わった 2 枚だけになる。
 */
export const SpotCard = memo(function SpotCard({
  spot,
  area,
  showCity,
  selected,
  focusOnSelect,
  onSelect,
  onShowOnMap,
  distance,
}: Props) {
  const detailId = useId()
  const ref = useRef<HTMLElement>(null)
  const wantToGo = spot.status === 'want_to_go'
  // 書きかけ（TODO）のコメントは出さない（publicText 参照）
  const summary = publicText(spot.summary)
  const note = publicText(spot.note)
  // 名前に中国語名がもう入っている（「SIDOLI RADIO 小島裡」など）なら重ねて出さない
  const nameZh = extraNameZh(spot)
  const subtitle = spotSubtitle(spot.tags)

  // 地図のピン・共有リンク・地図からの「一覧でくわしく見る」で選ばれたら、
  // 見える位置まで寄せ、フォーカスもカードへ移す（スクリーンリーダーで
  // 「どのカードが選ばれたか」が伝わるように）。
  // block: 'nearest' にしているのは、デスクトップで地図のピンを押したときに
  // 一覧が毎回大きく飛ぶと、今どこを見ていたか分からなくなるため。
  // スクロールは scrollIntoView に任せたいので、focus 側はスクロールさせない。
  // カードの中のボタン（名前など）を押して選んだときは、そのボタンに
  // フォーカスを残す（押した場所からフォーカスを奪わない）。
  useEffect(() => {
    if (!selected) return
    const el = ref.current
    if (!el) return
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    if (focusOnSelect && !el.contains(document.activeElement))
      el.focus({ preventScroll: true })
    // なめらかなスクロールは、途中で地図の読み込み（重い処理）などが挟まると
    // 目的地の手前で止まることがある（共有リンクを開いた直後に起きやすい）。
    // スクロールが止まったころにもう一度確かめ、まだはみ出していれば
    // 一瞬で寄せ直す
    const timer = window.setTimeout(() => {
      const r = el.getBoundingClientRect()
      if (r.top < 0 || r.bottom > window.innerHeight)
        el.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [selected, focusOnSelect])

  return (
    <article
      ref={ref}
      id={spotElementId(spot.id)}
      // 地図から一覧へ戻ったときにフォーカスを移せるように
      tabIndex={-1}
      aria-labelledby={`${detailId}-name`}
      // scroll-mt はスティッキーなサイトヘッダー（h-16）と、スマホでその下に
      // 貼り付く一覧 / 地図の切り替え（index.tsx）の下に隠れないように
      className={`scroll-mt-36 rounded-2xl border p-3.5 shadow-sm transition focus:outline-none sm:p-4 lg:scroll-mt-20 ${
        wantToGo
          ? 'border-dashed border-slate-300 bg-slate-50/70 dark:border-slate-600 dark:bg-slate-900/40'
          : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
      } ${selected ? 'ring-2 ring-cyan-500 ring-offset-2 dark:ring-cyan-400 dark:ring-offset-gray-950' : ''} dark:shadow-none`}
    >
      <header>
        <div className="flex items-start gap-2">
          <h3
            id={`${detailId}-name`}
            className="min-w-0 flex-1 text-base leading-snug font-bold text-gray-900 sm:text-lg dark:text-gray-100"
          >
            <button
              type="button"
              onClick={() => onSelect(spot.id)}
              className="text-left hover:text-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:text-cyan-300 focus-visible:outline-cyan-500 dark:focus-visible:outline-cyan-400"
            >
              {spot.name}
            </button>
            {nameZh && (
              <span
                lang="zh-Hant-TW"
                className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400"
              >
                {nameZh}
              </span>
            )}
          </h3>
          <SpotLinkIcons spot={spot} />
        </div>
        {subtitle && (
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
            <span className="sr-only">どんな場所か: </span>
            {subtitle}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <StatusBadge status={spot.status} />
          {spot.labels?.map((label) => (
            <LabelBadge key={label} label={label} />
          ))}
          {spot.categories.map((c) => (
            <CategoryChip key={c} category={c} />
          ))}
          {(showCity || area) && (
            <span className="inline-flex items-center gap-0.5 text-xs text-gray-500 dark:text-gray-400">
              <MapPin size={12} aria-hidden />
              {[showCity ? getCity(spot.city).name : null, area?.name]
                .filter(Boolean)
                .join(' › ')}
            </span>
          )}
          {distance !== undefined && (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
              <Navigation size={11} aria-hidden />
              現在地から{formatDistance(distance)}
            </span>
          )}
        </div>
      </header>

      {summary && (
        <SpotComment
          text={summary}
          wantToGo={wantToGo}
          className="mt-2 text-[0.9375rem]"
        />
      )}

      {note && (
        <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-gray-600 dark:text-gray-300">
          {note}
        </p>
      )}

      {spot.tried && spot.tried.length > 0 && (
        <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-200">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            食べたもの・飲んだもの：
          </span>
          {spot.tried.join('、')}
        </p>
      )}

      {spot.visitedAt && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          訪問：{formatVisitedAt(spot.visitedAt)}
        </p>
      )}

      <div className="mt-2.5">
        <SpotActions spot={spot} onShowOnMap={onShowOnMap} />
      </div>
    </article>
  )
})
