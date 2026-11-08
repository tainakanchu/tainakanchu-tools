/**
 * スポットの操作とコメント。一覧のカード（SpotCard）・地図のポップアップ
 * （SpotPopup・デスクトップ）・地図の下端のカード（index.tsx・スマホ）で
 * 同じ見た目・同じ並びにするための部品。
 *
 * 操作の重み:
 * - 主 … 「Google マップで開く」（塗りのボタン）。現地で使う人がいちばん押す
 * - 補助 … 「地図で見る」「共有 / リンクをコピー」（文字だけの小さいボタン）
 * - 外部リンク … 公式サイトなど。名前の行の右端の丸いアイコン（SpotLinkIcons）。
 *   主操作と並べると押す先が増えて迷うので、行を分けて小さくする
 *
 * 地図の上の小さいカード（ポップアップ・スマホの地図の下端のカード）は
 * compact にして、必ず 1 行に収める: 補助操作はアイコンだけの四角いボタン
 * （aria-label と title で名前を付ける）、主操作は狭い幅では「Google マップ」まで
 * 縮め、それでも入らなければ文字を省略する（折り返さない）。スマホでは
 * 指で押すので、ボタンの高さ・アイコンボタンの幅は 44px にする。
 */

import { useState } from 'react'
import {
  Check,
  ExternalLink,
  Globe,
  Link2,
  List,
  Share2,
  ZoomIn,
} from 'lucide-react'
import { spotMapsUrl } from '../../../../lib/taiwan-map/format'
import { serializeTaiwanMapSearch } from '../../../../lib/taiwan-map/query'
import { shareUrl } from '../-lib/copy'
import { canNativeShare, shareOrCopy } from '../-lib/share'
import {
  compactPrimaryButtonClass,
  iconButtonClass,
  iconLinkClass,
  primaryButtonClass,
  smallButtonClass,
} from '../-lib/styles'
import type { ReactNode } from 'react'
import type { TaiwanSpot } from '../../../../lib/taiwan-map/types'

type LinkSpot = Pick<TaiwanSpot, 'name' | 'officialUrl'>

/** データにある外部リンク（Google マップ以外）。今は公式サイトだけ */
type ExternalLink = {
  key: string
  href: string
  label: string
  icon: ReactNode
}

function externalLinks(spot: LinkSpot): Array<ExternalLink> {
  const links: Array<ExternalLink> = []
  if (spot.officialUrl) {
    links.push({
      key: 'official',
      href: spot.officialUrl,
      label: '公式サイト',
      icon: <Globe size={15} aria-hidden />,
    })
  }
  return links
}

/** 名前の行の右端に並べる、外部リンクの丸いアイコンボタン。無ければ何も出さない */
export function SpotLinkIcons({ spot }: { spot: LinkSpot }) {
  const links = externalLinks(spot)
  if (links.length === 0) return null
  return (
    <div className="flex shrink-0 items-center gap-1">
      {links.map((l) => (
        <a
          key={l.key}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className={iconLinkClass}
          title={l.label}
          aria-label={`${spot.name} の${l.label}（新しいタブ）`}
        >
          {l.icon}
        </a>
      ))}
    </div>
  )
}

/** 共有シート（スマホ）か、リンクのコピー（パソコン）。compact はアイコンだけ */
function ShareButton({
  spot,
  compact,
}: {
  spot: Pick<TaiwanSpot, 'id' | 'name'>
  compact: boolean
}) {
  const [copied, setCopied] = useState(false)
  const native = canNativeShare()
  const handleShare = async () => {
    const result = await shareOrCopy(
      spot.name,
      shareUrl(serializeTaiwanMapSearch({ spot: spot.id })),
    )
    if (result !== 'copied') return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  const label = copied
    ? 'コピーしました'
    : native
      ? `${spot.name} を共有`
      : `${spot.name} へのリンクをコピー`
  if (compact) {
    return (
      <button
        type="button"
        onClick={handleShare}
        className={iconButtonClass}
        aria-label={label}
        title={copied ? 'コピーしました' : native ? '共有' : 'リンクをコピー'}
      >
        {copied ? (
          <Check size={16} aria-hidden />
        ) : native ? (
          <Share2 size={16} aria-hidden />
        ) : (
          <Link2 size={16} aria-hidden />
        )}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={handleShare}
      className={smallButtonClass}
      aria-label={label}
    >
      {copied && <Check size={13} aria-hidden />}
      {copied ? 'コピーしました' : native ? '共有' : 'リンクをコピー'}
    </button>
  )
}

type ActionsProps = {
  spot: TaiwanSpot
  /** 「地図で見る」。無ければ出さない */
  onShowOnMap?: (id: string) => void
  /** 「一覧で見る」（スマホの地図の下端のカード）。無ければ出さない */
  onShowInList?: () => void
  /**
   * 地図の上の小さいカード用。補助操作をアイコンだけにして必ず 1 行に収める
   * （冒頭のコメント参照）
   */
  compact?: boolean
}

/** 主操作（Google マップ）＋ 補助（地図で見る・共有・一覧で見る）の 1 行 */
export function SpotActions({
  spot,
  onShowOnMap,
  onShowInList,
  compact = false,
}: ActionsProps) {
  if (compact) {
    return (
      // 320px 幅の端末でも主操作の文字が切れないよう、スマホは間隔を詰める
      <div className="flex flex-nowrap items-center gap-1 lg:gap-1.5">
        <a
          href={spotMapsUrl(spot)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Google マップで開く（新しいタブ）"
          title="Google マップで開く"
          className={compactPrimaryButtonClass}
        >
          <span className="truncate">
            Google マップ<span className="hidden sm:inline">で開く</span>
          </span>
          <ExternalLink size={13} aria-hidden className="shrink-0" />
        </a>
        {onShowOnMap && (
          <button
            type="button"
            onClick={() => onShowOnMap(spot.id)}
            className={iconButtonClass}
            aria-label="地図で見る"
            title="地図で見る"
          >
            <ZoomIn size={16} aria-hidden />
          </button>
        )}
        <ShareButton spot={spot} compact />
        {onShowInList && (
          <button
            type="button"
            onClick={onShowInList}
            className={iconButtonClass}
            aria-label="一覧で見る"
            title="一覧で見る"
          >
            <List size={16} aria-hidden />
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <a
        href={spotMapsUrl(spot)}
        target="_blank"
        rel="noopener noreferrer"
        className={primaryButtonClass}
      >
        Google マップで開く
        <ExternalLink size={13} aria-hidden />
        <span className="sr-only">（新しいタブ）</span>
      </a>
      {onShowOnMap && (
        <button
          type="button"
          onClick={() => onShowOnMap(spot.id)}
          className={smallButtonClass}
        >
          地図で見る
        </button>
      )}
      <ShareButton spot={spot} compact={false} />
      {onShowInList && (
        <button
          type="button"
          onClick={onShowInList}
          className={smallButtonClass}
        >
          <List size={13} aria-hidden />
          一覧で見る
        </button>
      )}
    </div>
  )
}

type CommentProps = {
  /** publicText を通した本文 */
  text: string
  /** 未訪問・気になるの場所か（線を破線にし、文字を一段薄くする） */
  wantToGo?: boolean
  /** 行数の上限（地図の上の小さいカード用）。無ければ全文 */
  clamp?: 2 | 4
  /** 文字の大きさなど */
  className?: string
}

/**
 * かんちゅのコメント（summary）。訪問時期・タグのような「情報」と区別して、
 * 書いた人自身の言葉として読めるよう、左に線を引いた引用の形にする。
 * 未訪問の場所は線を破線にする（バッジ・ピンと同じ「未確定」の形）
 */
export function SpotComment({
  text,
  wantToGo,
  clamp,
  className,
}: CommentProps) {
  const clampClass =
    clamp === 2 ? 'line-clamp-2' : clamp === 4 ? 'line-clamp-4' : ''
  return (
    <blockquote
      className={`border-l-[3px] pl-2.5 leading-relaxed whitespace-pre-line ${
        wantToGo
          ? 'border-dashed border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
          : 'border-gray-300 text-gray-800 dark:border-gray-600 dark:text-gray-200'
      } ${clampClass} ${className ?? ''}`}
    >
      <span className="sr-only">かんちゅのコメント: </span>
      {text}
    </blockquote>
  )
}
