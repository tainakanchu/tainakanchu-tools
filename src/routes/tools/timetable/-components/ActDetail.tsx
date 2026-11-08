/**
 * グリッドでタップした出演の詳細。画面の下端に出す。
 * 縦の flex の中に置くので、出ている間はグリッドのほうが縮み、最下段まで
 * スクロールで届く(固定配置で上に重ねると、重なった分の行に届かなくなる)。
 * 枠のタップでは詳細を開くだけで、お気に入りは枠の右上の ☆ かここの ☆ で切り替える。
 * 出演名は検索や配信サービスで調べることが多いので、コピーの手段も置く。
 */

import { useEffect, useState } from 'react'
import { actTimeText } from '../../../../lib/timetable/derive'
import { Txt } from '@/components/Txt'
import { formatDateLabel } from '../../../../lib/timetable/time'
import { btn, copyText } from '../-lib/ui'
import { FavButton, FriendTags } from './FavButton'
import type {
  TimetableAct,
  TimetableDoc,
} from '../../../../lib/timetable/types'

interface ActDetailProps {
  doc: TimetableDoc
  act: TimetableAct
  fav: boolean
  friendNames: ReadonlyArray<string>
  onToggle: () => void
  onClose: () => void
}

export function ActDetail({
  doc,
  act,
  fav,
  friendNames,
  onToggle,
  onClose,
}: ActDetailProps) {
  const venue = doc.venues.find((v) => v.id === act.venueId)
  const day = doc.days.find((d) => d.id === act.dayId)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)

  // 別の出演に切り替えたら表示を戻す。「コピーしました」は少しで消す
  useEffect(() => setCopied(null), [act.id])
  useEffect(() => {
    if (copied === null) return
    const timer = window.setTimeout(() => setCopied(null), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const handleCopy = async () => {
    // 補足(subtitle)は付けない。検索欄にそのまま貼れる形にする
    setCopied((await copyText(act.title)) ? 'ok' : 'fail')
  }

  return (
    <div
      className="max-h-[45dvh] shrink-0 overflow-y-auto border-t-2 border-gray-900 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-gray-900 dark:border-gray-300 dark:bg-gray-900 dark:text-gray-100"
      role="region"
      aria-label="選んだ出演"
    >
      <div className="mx-auto flex max-w-3xl items-start gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-xs text-gray-700 dark:text-gray-300"
            aria-live="polite"
          >
            {fav ? '★ お気に入り' : 'お気に入りに入っていません'}
          </p>
          <p className="text-base font-bold leading-snug">
            <Txt text={act.title} />
          </p>
          <p className="text-sm tabular-nums text-gray-800 dark:text-gray-200">
            {day ? formatDateLabel(day.date) : ''} {actTimeText(act)}{' '}
            <Txt text={venue?.name} />
          </p>
          {act.subtitle && (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <Txt text={act.subtitle} />
            </p>
          )}
          {act.note && (
            <p className="text-sm text-amber-800 dark:text-amber-300">
              <Txt text={act.note} />
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              className={`${btn} px-2 py-0.5 text-xs`}
              onClick={handleCopy}
              aria-live="polite"
            >
              {copied === 'ok'
                ? 'コピーしました'
                : copied === 'fail'
                  ? 'コピーできませんでした'
                  : '名前をコピー'}
            </button>
            {act.url && (
              <a
                href={act.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-cyan-800 underline dark:text-cyan-300"
              >
                出演者のページ
              </a>
            )}
          </div>
          <FriendTags names={friendNames} />
        </div>
        <FavButton pressed={fav} label={act.title} onToggle={onToggle} />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-md border border-gray-300 px-2 text-sm dark:border-gray-600"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
