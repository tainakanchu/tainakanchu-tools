/**
 * 外から旅程を読み込むときの取り込み先の確認。共有URL と JSON の両方が使う。
 *
 * 旅程を 1 つしか持てなかった頃は「置き換えるか、やめるか」しか選択肢が作れず、
 * 同行者から共有URLをもらうたびに自分の入力を捨てるか諦めるかの二択だった。
 * 複数の旅程を持てるようになったので、既定の導線は非破壊の
 * 「新しい旅程として追加」にする。置き換えは、同じ旅程の新しい版を
 * 受け取り直す場面のために残す(そちらを選んでも、他の旅程は巻き込まない)。
 *
 * 件数を先に見せるのは、押す前に「読み込むと何がどうなるか」を
 * 数字で確かめられるようにするため。
 */

import { useId } from 'react'
import { Download } from 'lucide-react'
import { useDialogFocus } from '../-lib/focusTrap'
import { primaryButtonClass, subtleButtonClass } from '../-lib/styles'
import type { TripNotesState } from '../../../../lib/trip-notes/types'

interface ImportChoiceDialogProps {
  /** 見出し。どこから来たデータなのかが分かる文にする */
  title: string
  /** 読み込む側のラベル。件数の行の見出しに使う(例: '共有された予約') */
  incomingLabel: string
  incoming: TripNotesState
  /** いま開いている旅程 */
  current: TripNotesState
  onAddAsNew: () => void
  onReplace: () => void
  onCancel: () => void
}

export function ImportChoiceDialog({
  title,
  incomingLabel,
  incoming,
  current,
  onAddAsNew,
  onReplace,
  onCancel,
}: ImportChoiceDialogProps) {
  const titleId = useId()
  const panelRef = useDialogFocus<HTMLDivElement>({ onClose: onCancel })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center print:hidden">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl outline-none"
      >
        <h2
          id={titleId}
          className="flex items-center gap-2 text-base font-semibold text-gray-900"
        >
          <Download size={18} className="text-cyan-600" />
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          <strong className="text-gray-900">新しい旅程として追加</strong>
          すれば、いま開いている旅程はそのまま残ります。
          <strong className="text-gray-900">置き換える</strong>
          を選んだ場合に入れ替わるのは、いま開いている旅程の中身だけです(他の旅程はそのまま残ります)。
        </p>
        <dl className="mt-4 space-y-1 rounded-xl bg-gray-50 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">いまの旅程の予約</dt>
            <dd className="font-semibold">{current.bookings.length}件</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">{incomingLabel}</dt>
            <dd className="font-semibold">{incoming.bookings.length}件</dd>
          </div>
          {incoming.tripTitle.length > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-gray-600">旅行の名前</dt>
              <dd className="truncate font-semibold">{incoming.tripTitle}</dd>
            </div>
          )}
        </dl>
        {/*
          縦積みでは主導線(追加)が一番下に来てしまうので、狭い画面だけ順序を反転させる。
          横並びのときは右端がもっとも押されやすい位置なので、そこに主導線を置く
        */}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className={subtleButtonClass}
          >
            読み込まない
          </button>
          <button
            type="button"
            onClick={onReplace}
            className={subtleButtonClass}
          >
            いまの旅程を置き換える
          </button>
          <button
            type="button"
            onClick={onAddAsNew}
            className={primaryButtonClass}
          >
            新しい旅程として追加
          </button>
        </div>
      </div>
    </div>
  )
}
