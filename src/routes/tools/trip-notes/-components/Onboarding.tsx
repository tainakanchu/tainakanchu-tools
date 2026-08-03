/**
 * 予約が 1 件も無いときの入口。
 *
 * 初回に進捗ダッシュボードを見せても「未確保 3泊」の赤い帯が出るだけで、
 * 何をすればいいのか分からない。まず旅行期間を決めてもらい、
 * そこから「予約を1件足す」か「AIにまとめて読ませる」かの二択に絞る。
 */

import { CalendarRange, Plus, Sparkles } from 'lucide-react'
import { diffDays, isValidISODate } from '../../../../lib/trip-notes/datetime'
import {
  cardClass,
  fieldClass,
  labelClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
} from '../-lib/styles'
import type { TripNotesDispatch } from '../-lib/reducer'
import type { TripNotesState } from '../../../../lib/trip-notes/types'

interface OnboardingProps {
  state: TripNotesState
  dispatch: TripNotesDispatch
  onAddBooking: () => void
  onOpenSettings: () => void
}

export function Onboarding({
  state,
  dispatch,
  onAddBooking,
  onOpenSettings,
}: OnboardingProps) {
  const datesValid =
    isValidISODate(state.startDate) && isValidISODate(state.endDate)
  const nights = datesValid ? diffDays(state.startDate, state.endDate) : 0

  return (
    <div className="space-y-4">
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>
          <CalendarRange size={18} className="text-cyan-600" />
          まず旅行の期間を決める
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          期間が決まると「何泊ぶんの寝る場所が要るのか」が確定します。
          このツールはそこを基準に、予約の穴を見つけ続けます。
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="space-y-1">
            <span className={labelClass}>出発日</span>
            <input
              type="date"
              value={state.startDate}
              onChange={(event) =>
                dispatch({ type: 'setStartDate', date: event.target.value })
              }
              className={fieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>帰宅日</span>
            <input
              type="date"
              value={state.endDate}
              onChange={(event) =>
                dispatch({ type: 'setEndDate', date: event.target.value })
              }
              className={fieldClass}
            />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>旅行の名前(任意)</span>
            <input
              type="text"
              value={state.tripTitle}
              placeholder="ヨーロッパ周遊"
              onChange={(event) =>
                dispatch({ type: 'setTripTitle', title: event.target.value })
              }
              className={fieldClass}
            />
          </label>
        </div>

        <p className="mt-3 text-sm text-gray-700">
          {nights > 0 ? (
            <>
              この期間は <strong>{nights}泊</strong> です。まだ 1
              件も予約が登録されていません。
            </>
          ) : (
            <span className="text-rose-700">
              帰宅日は出発日より後の日付にしてください。
            </span>
          )}
        </p>
      </section>

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>次にやること</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onAddBooking}
            className={`${primaryButtonClass} h-auto justify-start px-4 py-3 text-left`}
          >
            <Plus size={18} />
            <span>
              <span className="block">予約を 1 件登録する</span>
              <span className="block text-xs font-normal opacity-90">
                種別・日付・タイトルの 3 つだけで登録できます
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className={`${subtleButtonClass} h-auto justify-start px-4 py-3 text-left`}
          >
            <Sparkles size={18} className="text-cyan-600" />
            <span>
              <span className="block">AI にまとめて読ませる</span>
              <span className="block text-xs font-normal text-gray-500">
                予約確認メールを ChatGPT などに貼って一括で取り込みます
              </span>
            </span>
          </button>
        </div>
      </section>
    </div>
  )
}
