/**
 * スポット 1 件ぶんのカード。このツールの主役。
 *
 * 地図より先にコメント（summary）が目に入るよう、カードの中でも
 * summary を名前の次に大きく置く。星や点数は出さない（主観の記録であって
 * 評価サイトではないため）。
 *
 * 詳しいメモ（note / 食べたもの / タグ / 公式サイト）は折りたたむ。
 * 一覧をざっと流し読みするときに長文で縦に伸びないようにするためで、
 * ?spot= で開かれたカードだけは最初から開いておく。
 */

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, ExternalLink, Link2, MapPin } from 'lucide-react'
import {
  formatVisitedAt,
  googleMapsSearchUrl,
} from '../../../../lib/taiwan-map/format'
import { serializeTaiwanMapSearch } from '../../../../lib/taiwan-map/query'
import { getCity } from '../../../../lib/taiwan-map/types'
import { copyText, shareUrl } from '../-lib/copy'
import { actionButtonClass, linkClass } from '../-lib/styles'
import { CategoryChip, LabelBadge, StatusBadge } from './Badges'
import type { TaiwanArea, TaiwanSpot } from '../../../../lib/taiwan-map/types'

type Props = {
  spot: TaiwanSpot
  area: TaiwanArea | undefined
  /** 複数都市をまたいだ一覧のときだけ都市名を出す */
  showCity: boolean
  selected: boolean
  onSelect: (id: string) => void
  onShowOnMap: (id: string) => void
}

export function spotElementId(id: string): string {
  return `spot-${id}`
}

export function SpotCard({
  spot,
  area,
  showCity,
  selected,
  onSelect,
  onShowOnMap,
}: Props) {
  const detailId = useId()
  const ref = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(selected)
  const [copied, setCopied] = useState(false)
  const wantToGo = spot.status === 'want_to_go'

  const hasDetails =
    spot.note !== undefined ||
    (spot.tried?.length ?? 0) > 0 ||
    (spot.tags?.length ?? 0) > 0 ||
    spot.officialUrl !== undefined

  // 地図のピンや共有リンクで選ばれたら、開いて見える位置まで寄せる。
  // block: 'nearest' にしているのは、デスクトップで地図のピンを押したときに
  // 一覧が毎回大きく飛ぶと、今どこを見ていたか分からなくなるため
  useEffect(() => {
    if (!selected) return
    setOpen(true)
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

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
      // scroll-mt はスティッキーなサイトヘッダー（h-16）の下に隠れないように
      className={`scroll-mt-20 rounded-2xl border p-4 shadow-sm transition sm:p-5 ${
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

      {spot.visitedAt && (
        <p className="mt-2 text-xs text-gray-500">
          訪問：{formatVisitedAt(spot.visitedAt)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
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
        {hasDetails && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={`${detailId}-detail`}
            className={actionButtonClass}
          >
            <ChevronDown
              size={14}
              aria-hidden
              className={`transition ${open ? 'rotate-180' : ''}`}
            />
            {open ? '閉じる' : 'くわしく'}
          </button>
        )}
      </div>

      {hasDetails && open && (
        <div
          id={`${detailId}-detail`}
          className="mt-4 space-y-3 border-t border-gray-200 pt-4 text-sm text-gray-700"
        >
          {spot.note && (
            <p className="leading-relaxed whitespace-pre-line">{spot.note}</p>
          )}
          {spot.tried && spot.tried.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500">
                食べたもの・飲んだもの
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {spot.tried.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {spot.tags && spot.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="タグ">
              {spot.tags.map((t) => (
                <li
                  key={t}
                  className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                >
                  #{t}
                </li>
              ))}
            </ul>
          )}
          {spot.officialUrl && (
            <p>
              <a
                href={spot.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${linkClass} inline-flex items-center gap-1`}
              >
                公式サイト
                <ExternalLink size={12} aria-hidden />
              </a>
            </p>
          )}
        </div>
      )}
    </article>
  )
}
