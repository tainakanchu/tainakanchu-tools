/**
 * 外から旅程を読み込むときの取り込み先の確認。共有URL と JSON の両方が使う。
 *
 * 旅程を 1 つしか持てなかった頃は「置き換えるか、やめるか」しか選択肢が作れず、
 * 同行者から共有URLをもらうたびに自分の入力を捨てるか諦めるかの二択だった。
 * 複数の旅程を持てるようになったので、既定の導線は非破壊の
 * 「新しい旅程として追加」にする。置き換えは、同じ旅程の新しい版を
 * 受け取り直す場面のために残す(そちらを選んでも、他の旅程は巻き込まない)。
 *
 * 3 つ目に「いまの旅程に合流」を足したのは、同行者と分担して旅程を組んでいると
 * 「相手が足したぶんだけを自分の旅程に入れたい」場面があるためである。
 * 追加は非破壊だが 2 つの旅程を人間が見比べて手で写す羽目になり、置き換えは
 * 自分の入力が消える。その間がまるごと抜けていた。
 *
 * 件数を先に見せるのは、押す前に「読み込むと何がどうなるか」を
 * 数字で確かめられるようにするため。
 */

import { useId, useMemo } from 'react'
import { Download } from 'lucide-react'
import { planImport } from '../../../../lib/trip-notes/importMerge'
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
  /** いま開いている旅程に、読み込む側の予約を混ぜ込む */
  onMerge: () => void
  onCancel: () => void
}

export function ImportChoiceDialog({
  title,
  incomingLabel,
  incoming,
  current,
  onAddAsNew,
  onReplace,
  onMerge,
  onCancel,
}: ImportChoiceDialogProps) {
  const titleId = useId()
  const panelRef = useDialogFocus<HTMLDivElement>({ onClose: onCancel })

  // 合流したときの内訳。判定はここで書き直さず、実際に適用するのと同じ
  // planImport にそのまま委ねる(AiImportPanel のプレビューと同じ考え方)。
  // プレビューと結果が別の関数から出ていると、「更新と出ていたのに別々に増えた」
  // ように見えて、この画面の数字そのものが信用されなくなる
  const mergePlan = useMemo(
    () => planImport(current.bookings, incoming.bookings),
    [current.bookings, incoming.bookings],
  )

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
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          <strong className="text-gray-900">合流</strong>
          は、いま開いている旅程に読み込む側の予約を混ぜ込みます。同じ予約とみなせるもの(確認番号が一致、または日付と名前が一致)は更新し、それ以外は追加します。いまの旅程の名前と期間は変わりません。「元に戻す」1
          回でまとめて取り消せます。
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
          <div className="flex justify-between gap-3">
            <dt className="text-gray-600">合流した場合</dt>
            <dd className="font-semibold">
              {mergePlan.addedCount}件を追加・{mergePlan.updatedCount}件を更新
            </dd>
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
          横並びのときは右端がもっとも押されやすい位置なので、そこに主導線を置く。

          したがって DOM の並びは「優先度の低いものから」になる。合流を主導線と
          置き換えの間に置いているのは、非破壊寄りのものほど押しやすい位置に
          置くためである(追加 > 合流 > 置き換え > 読み込まない の順に、
          誤って押したときに失うものが大きくなる)
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
          <button type="button" onClick={onMerge} className={subtleButtonClass}>
            いまの旅程に合流
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
