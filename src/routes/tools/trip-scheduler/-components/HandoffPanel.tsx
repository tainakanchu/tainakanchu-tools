import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { NotebookPen } from 'lucide-react'
import { convertToTripNotes } from '../../../../lib/trip-scheduler/toTripNotes'
import { getDeviceTz } from '../../../../lib/trip-notes/datetime'
import {
  addTripToLibrary,
  loadLibrary,
  saveLibrary,
} from '../../../../lib/trip-notes/trips'
import { todayISO } from '../-lib/format'
import {
  cardClass,
  primaryButtonClass,
  sectionTitleClass,
} from '../-lib/styles'
import type { TripState } from '../../../../lib/trip-scheduler/types'

interface HandoffPanelProps {
  state: TripState
}

/**
 * 「どの街に何泊するか」が決まったあとの出口。
 * ここで決めた骨組みを旅のしおりの新しい旅程として書き出し、そのまま向こうへ移る。
 *
 * 確認は window.confirm で出す。このツールの破壊的な操作(最初からやり直す)も
 * 同じ流儀で、引き継ぎのためだけにダイアログの部品を持ち込む理由が無い。
 * 文面で「いまのしおりのデータは消えません」と言い切れるのは、書き込みが
 * addTripToLibrary()(既存の旅程に触れない追加のみ)だからである。
 */
export function HandoffPanel({ state }: HandoffPanelProps) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  /*
   * 画面に出す件数と、実際に書き込む中身を同じ 1 回の変換から取る。
   * 「滞在3件」と表示しておいて別の数を書き込む、という食い違いが起きない。
   */
  const preview = useMemo(
    () => convertToTripNotes(state, { tz: getDeviceTz() }),
    [state],
  )

  const lodgingCount =
    preview?.bookings.filter((booking) => booking.kind === 'lodging').length ??
    0
  const moveCount = (preview?.bookings.length ?? 0) - lodgingCount

  const handleHandoff = () => {
    if (preview === null) return

    const ok = window.confirm(
      `旅のしおりに新しい旅程「${preview.tripTitle}」を作ります(いまのしおりのデータは消えません)。\n` +
        '滞在は検討中の宿、都市間は手段未定の移動として入ります。',
    )
    if (!ok) return

    // 保存済みの入れ物を読んでから足す。しおり側の状態を画面に持っていないので、
    // 「いま保存されているもの」を起点にするのが唯一ずれない足し方になる
    const next = addTripToLibrary(loadLibrary(todayISO()), preview)
    saveLibrary(next)

    /*
     * saveLibrary は容量超過やプライベートモードを握りつぶすので、
     * 書けたかどうかは読み直して確かめる。書けていないまましおりへ送ると、
     * 利用者は「引き継いだのに何も無い」画面を見ることになり、
     * どちら側が壊れているのか分からない。
     */
    const saved = loadLibrary(todayISO())
    if (!saved.trips.some((trip) => trip.id === next.activeTripId)) {
      setError(
        'このブラウザに保存できませんでした(プライベートモードか、保存容量がいっぱいかもしれません)。',
      )
      return
    }

    void navigate({ to: '/tools/trip-notes' })
  }

  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>
        <NotebookPen size={18} className="text-cyan-600" />
        旅のしおりへ引き継ぐ
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">
        行き先が決まったら、この骨組みを旅のしおりの新しい旅程にします。
        滞在は「検討中の宿」、都市間は「手段未定の移動」として入るので、あとは向こうで実際の予約に育てていきます。
      </p>

      {preview !== null ? (
        <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
          「{preview.tripTitle}」として、宿 {lodgingCount} 件・移動 {moveCount}{' '}
          件を作ります。
        </p>
      ) : (
        <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-500">
          滞在を 1 つ以上入れると引き継げます。
        </p>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={handleHandoff}
          disabled={preview === null}
          className={primaryButtonClass}
        >
          <NotebookPen size={16} />
          旅のしおりへ引き継ぐ
        </button>
      </div>

      {error !== null ? (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  )
}
