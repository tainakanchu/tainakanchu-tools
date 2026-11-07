/**
 * スポット 1 件ぶんのカード。このツールの主役。
 *
 * 地図より先にコメント（summary）が目に入るよう、カードの中でも
 * summary を名前の次に大きく置く。星や点数は出さない（主観の記録であって
 * 評価サイトではないため）。
 *
 * 以前は note / 食べたもの / タグ / 公式サイトを「くわしく」で折りたたんで
 * いたが、開いても 1〜2 行しか無いことが多く、押す手間に見合わなかった。
 * 今は開閉を無くし、タグは小さく常に出す・公式サイトは Google Maps の隣の
 * ボタンにする・note と食べたものはあるときだけそのまま出す、にしている。
 */

import { memo, useEffect, useId, useRef, useState } from 'react'
import { Check, ExternalLink, Globe, Link2, MapPin } from 'lucide-react'
import {
  formatVisitedAt,
  googleMapsSearchUrl,
} from '../../../../lib/taiwan-map/format'
import { serializeTaiwanMapSearch } from '../../../../lib/taiwan-map/query'
import { getCity } from '../../../../lib/taiwan-map/types'
import { copyText, shareUrl } from '../-lib/copy'
import { actionButtonClass } from '../-lib/styles'
import { CategoryChip, LabelBadge, StatusBadge } from './Badges'
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
}: Props) {
  const detailId = useId()
  const ref = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)
  const wantToGo = spot.status === 'want_to_go'

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
  }, [selected, focusOnSelect])

  const mapsUrl =
    spot.googleMapsUrl ?? googleMapsSearchUrl(spot.nameZh ?? spot.name)

  const handleCopy = async () => {
    const ok = await copyText(
      shareUrl(serializeTaiwanMapSearch({ spot: spot.id })),
    )
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <article
      ref={ref}
      id={spotElementId(spot.id)}
      // 地図から一覧へ戻ったときにフォーカスを移せるように
      tabIndex={-1}
      aria-labelledby={`${detailId}-name`}
      // scroll-mt はスティッキーなサイトヘッダー（h-16）と、スマホでその下に
      // 貼り付く一覧 / 地図の切り替え（index.tsx）の下に隠れないように
      className={`scroll-mt-36 lg:scroll-mt-20 rounded-2xl focus:outline-none border p-4 shadow-sm transition sm:p-5 ${
        wantToGo
          ? 'border-dashed border-slate-300 bg-slate-50/70'
          : 'border-gray-200 bg-white'
      } ${selected ? 'ring-2 ring-cyan-500 ring-offset-2' : ''}`}
    >
      <header className="space-y-2">
        <h3
          id={`${detailId}-name`}
          className="text-lg leading-snug font-bold text-gray-900"
        >
          <button
            type="button"
            onClick={() => onSelect(spot.id)}
            className="text-left hover:text-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
          >
            {spot.name}
          </button>
          {spot.nameZh && (
            <span
              lang="zh-Hant-TW"
              className="ml-2 text-sm font-normal text-gray-500"
            >
              {spot.nameZh}
            </span>
          )}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={spot.status} />
          {spot.labels?.map((label) => (
            <LabelBadge key={label} label={label} />
          ))}
          {spot.categories.map((c) => (
            <CategoryChip key={c} category={c} />
          ))}
          {(showCity || area) && (
            <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
              <MapPin size={12} aria-hidden />
              {[showCity ? getCity(spot.city).name : null, area?.name]
                .filter(Boolean)
                .join(' › ')}
            </span>
          )}
        </div>
      </header>

      <p
        className={`mt-3 leading-relaxed whitespace-pre-line ${
          wantToGo ? 'text-slate-600' : 'text-gray-800'
        }`}
      >
        {spot.summary}
      </p>

      {spot.note && (
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-gray-600">
          {spot.note}
        </p>
      )}

      {spot.tried && spot.tried.length > 0 && (
        <div className="mt-2 text-sm text-gray-700">
          <p className="text-xs font-semibold text-gray-500">
            食べたもの・飲んだもの
          </p>
          <ul className="mt-0.5 list-inside list-disc space-y-0.5">
            {spot.tried.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {(spot.visitedAt || (spot.tags && spot.tags.length > 0)) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          {spot.visitedAt && <p>訪問：{formatVisitedAt(spot.visitedAt)}</p>}
          {spot.tags && spot.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label="タグ">
              {spot.tags.map((t) => (
                <li
                  key={t}
                  className="rounded bg-gray-100 px-1.5 py-px text-[0.7rem] text-gray-600"
                >
                  #{t}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onShowOnMap(spot.id)}
          className={actionButtonClass}
        >
          <MapPin size={14} aria-hidden />
          地図で見る
        </button>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={actionButtonClass}
        >
          <ExternalLink size={14} aria-hidden />
          Google Maps
        </a>
        {spot.officialUrl && (
          <a
            href={spot.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={actionButtonClass}
          >
            <Globe size={14} aria-hidden />
            公式サイト
          </a>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className={actionButtonClass}
          aria-label={`${spot.name} へのリンクをコピー`}
        >
          {copied ? (
            <Check size={14} aria-hidden />
          ) : (
            <Link2 size={14} aria-hidden />
          )}
          {copied ? 'コピーしました' : 'リンク'}
        </button>
      </div>
    </article>
  )
})
