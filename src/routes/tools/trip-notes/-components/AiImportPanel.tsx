/**
 * AI インポート・ウィザード。
 *
 * 「プロンプトをコピー → 結果を貼り付け → レビューして取り込み」の3ステップに
 * 分けているのは、アプリが外部 API を一切呼ばない設計(aiPrompt.ts 参照)のため、
 * 利用者自身が手でコピー&ペーストを往復する必要があるから。各ステップの
 * 見出しと進捗を明示し、いま何をすればいいかを常に1つだけ提示する。
 *
 * 取り込みそのものはハイブリッド導線にしている。AI の抽出結果はそのまま信じず、
 * 日時とタイムゾーンだけは ReviewDialog で人間の確認を必須にし、
 * それ以外のフィールドは黄色い下線(unverified)を付けたまま取り込んで
 * あとで確認できるようにする。全項目を毎回確認させると利用者が確認を
 * 面倒がって素通りするようになり、かえって事故が増えるための妥協。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  ListChecks,
  Sparkles,
  X,
} from 'lucide-react'
import {
  AI_SERVICE_LINKS,
  buildImportPrompt,
} from '../../../../lib/trip-notes/aiPrompt'
import { parseImportedJson } from '../../../../lib/trip-notes/aiImport'
import { formatStamp } from '../../../../lib/trip-notes/datetime'
import { copyText } from '../-lib/format'
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  sectionTitleClass,
  subtleButtonClass,
  unverifiedFieldClass,
} from '../-lib/styles'
import { BookingStatusBadge } from './StatusBadge'
import { ConfirmDialog } from './ConfirmDialog'
import { KindIcon } from './KindIcon'
import { ReviewDialog } from './ReviewDialog'
import type { TripNotesDispatch } from '../-lib/reducer'
import type {
  Booking,
  FieldKey,
  TripNotesState,
} from '../../../../lib/trip-notes/types'
import type { ImportResult } from '../../../../lib/trip-notes/aiImport'

interface AiImportPanelProps {
  state: TripNotesState
  displayTz: string
  dispatch: TripNotesDispatch
}

type WizardStep = 1 | 2 | 3
type CopyStatus = 'idle' | 'copied' | 'failed'

/** ステップの見出しと進捗表示。中身は呼び出し側に委ねる薄いラッパー */
function StepHeading({ step, title }: { step: WizardStep; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-cyan-700">
        ステップ {step} / 3
      </p>
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
    </div>
  )
}

/** 取り込み候補の1件をカードで見せる。unverified なフィールドには黄色い下線を引く */
function BookingPreviewCard({
  booking,
  displayTz,
}: {
  booking: Booking
  displayTz: string
}) {
  const unverified = booking.unverified ?? []
  const isUnverified = (key: FieldKey): boolean => unverified.includes(key)

  const dateText =
    booking.end === null
      ? formatStamp(booking.start, displayTz, { withDate: true })
      : `${formatStamp(booking.start, displayTz, { withDate: true })} 〜 ${formatStamp(
          booking.end,
          displayTz,
          { withDate: true },
        )}`

  return (
    <li className={cardClass}>
      <div className="flex flex-wrap items-center gap-2">
        <KindIcon kind={booking.kind} className="shrink-0 text-gray-500" />
        <span
          className={`font-semibold text-gray-800 ${isUnverified('title') ? unverifiedFieldClass : ''}`}
        >
          {booking.title}
        </span>
        <BookingStatusBadge status={booking.status} size="sm" />
      </div>
      <p
        className={`mt-1 inline-block text-sm text-gray-600 ${
          isUnverified('start') || isUnverified('end')
            ? unverifiedFieldClass
            : ''
        }`}
      >
        {dateText}
      </p>
      {booking.confirmationNumber !== undefined && (
        <p
          className={`mt-1 inline-block text-xs text-gray-500 ${
            isUnverified('confirmationNumber') ? unverifiedFieldClass : ''
          }`}
        >
          確認番号: {booking.confirmationNumber}
        </p>
      )}
    </li>
  )
}

/**
 * issues から「全体の何件中、何件が取り込めなかったか」を出す。
 *
 * ImportIssue は index ごとに複数積まれうる(tz 補完の注記など、取り込みが
 * 成功した予約にも付く)ため、issue の有無だけでは失敗件数を数えられない。
 * aiImport.ts の convertBooking は、取り込みを断念する直前に必ず
 * raw 付きの issue を1件だけ積んでから null を返すので、
 * 「raw が付いた index 付き issue の件数」が失敗件数と一致する。
 */
function summarizeResult(result: ImportResult): string {
  const successCount = result.bookings.length
  const failedIndexes = new Set(
    result.issues
      .filter((issue) => issue.index !== null && issue.raw !== undefined)
      .map((issue) => issue.index),
  )
  const failedCount = failedIndexes.size
  const total = successCount + failedCount

  if (total === 0) return '取り込めるものがありませんでした'
  if (failedCount === 0) return `${total}件を取り込み候補として読み込みました`
  return `${total}件中${successCount}件を取り込みました。${failedCount}件は取り込めませんでした`
}

export function AiImportPanel({
  state,
  displayTz,
  dispatch,
}: AiImportPanelProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [pastedText, setPastedText] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  // 直前の取り込みで未確認が残った予約の id。「まとめて確認する」の対象を
  // このときの取り込みぶんだけに限る(手入力ぶんの未確認まで巻き込まない)
  const [importedUnverifiedIds, setImportedUnverifiedIds] = useState<
    Array<string>
  >([])
  const [bulkVerifyOpen, setBulkVerifyOpen] = useState(false)
  const copyTimeoutRef = useRef<number | null>(null)

  // 表示中のタイムゾーンをそのままプロンプトの基準タイムゾーンにする。
  // 画面に出ている「今どこにいる想定か」とプロンプトの前提がずれると、
  // 年またぎの日付解釈などで AI がおかしな年を補ってしまう。
  const prompt = useMemo(
    () => buildImportPrompt(state, { deviceTz: displayTz }),
    [state, displayTz],
  )

  useEffect(
    () => () => {
      if (copyTimeoutRef.current !== null)
        window.clearTimeout(copyTimeoutRef.current)
    },
    [],
  )

  async function handleCopy(): Promise<void> {
    const ok = await copyText(prompt)
    setCopyStatus(ok ? 'copied' : 'failed')
    if (copyTimeoutRef.current !== null)
      window.clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = window.setTimeout(
      () => setCopyStatus('idle'),
      2000,
    )
  }

  function handleParse(): void {
    const result = parseImportedJson(pastedText, displayTz)
    setImportResult(result)
    setStep(3)
  }

  function handleConfirmImport(confirmed: Array<Booking>): void {
    if (confirmed.length > 0) {
      dispatch({ type: 'importBookings', bookings: confirmed })
    }
    // 日時は ReviewDialog で確認済みになっているので、ここに残るのは
    // タイトル・確認番号・料金など「間違っていても乗り遅れない」項目だけ
    const unverifiedIds = confirmed
      .filter((b) => b.unverified !== undefined && b.unverified.length > 0)
      .map((b) => b.id)

    setReviewOpen(false)
    setImportResult(null)
    setPastedText('')
    setStep(1)
    setImportedUnverifiedIds(unverifiedIds)
    if (confirmed.length === 0) {
      setSuccessMessage('取り込む予約がありませんでした')
    } else if (unverifiedIds.length === 0) {
      setSuccessMessage(`${confirmed.length}件を取り込みました`)
    } else {
      setSuccessMessage(
        `${confirmed.length}件を取り込みました。${unverifiedIds.length}件に未確認の項目があります`,
      )
    }
  }

  /** 取り込んだぶんの未確認をまとめて外す。Undo 1 回で戻せる 1 アクション */
  function handleBulkVerify(): void {
    const count = importedUnverifiedIds.length
    dispatch({ type: 'verifyAllUnverified', ids: importedUnverifiedIds })
    setBulkVerifyOpen(false)
    setImportedUnverifiedIds([])
    setSuccessMessage(`${count}件の未確認をすべて解除しました`)
  }

  return (
    <section className={cardClass}>
      <div className={sectionTitleClass}>
        <Sparkles size={18} aria-hidden="true" className="text-cyan-600" />
        AI インポート
      </div>
      <p className="mt-1 text-sm text-gray-500">
        予約確認メールや PDF を AI
        に読み取らせて、予約情報を一括で取り込みます。
      </p>

      {successMessage !== null && (
        <div
          role="status"
          className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          <div className="flex items-start justify-between gap-2">
            <span>{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              aria-label="このメッセージを閉じる"
              className="shrink-0 rounded p-0.5 text-emerald-700 transition hover:bg-emerald-100"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          {/*
            取り込んだ直後こそ、値が頭に残っていてまとめて確認しやすい。
            日程タブまで移動して1件ずつ押させると、その勢いが切れる
          */}
          {importedUnverifiedIds.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBulkVerifyOpen(true)}
                className={subtleButtonClass}
                aria-label={`取り込んだ${importedUnverifiedIds.length}件の未確認をまとめて確認済みにする`}
              >
                <ListChecks size={15} aria-hidden="true" />
                まとめて確認する
              </button>
              <span className="text-xs text-emerald-700">
                日程タブの各カードでも、1件ずつ確認できます
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {step === 1 && (
          <div className="space-y-3">
            <StepHeading step={1} title="プロンプトをコピー" />
            <textarea
              readOnly
              value={prompt}
              rows={10}
              className={`${fieldClass} resize-y font-mono text-xs leading-relaxed`}
              aria-label="AI に貼り付けるプロンプト"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className={primaryButtonClass}
              >
                {copyStatus === 'copied' ? (
                  <>
                    <Check size={14} aria-hidden="true" />
                    コピーしました
                  </>
                ) : (
                  <>
                    <Copy size={14} aria-hidden="true" />
                    コピーする
                  </>
                )}
              </button>
              {copyStatus === 'failed' && (
                <span role="alert" className="text-xs text-rose-600">
                  コピーに失敗しました。テキストを選択して手動でコピーしてください
                </span>
              )}
            </div>

            <p className="text-sm text-gray-600">
              コピーしたプロンプトを、下のいずれかで開いた新しい会話に貼り付けたあと、
              <strong className="font-semibold text-gray-800">
                予約確認メールや PDF を添付して実行してください。
              </strong>
              AI が本文や添付ファイルを読み取り、予約情報を JSON
              形式で抽出します。
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {AI_SERVICE_LINKS.map((service) => (
                <a
                  key={service.id}
                  href={service.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col gap-0.5 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-cyan-400 hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ExternalLink size={14} aria-hidden="true" />
                    {service.label} を開く
                  </span>
                  <span className="text-xs font-normal text-gray-500">
                    {service.hint}
                  </span>
                </a>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => setStep(2)}
              >
                次へ: 結果を貼り付ける
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <StepHeading step={2} title="結果を貼り付ける" />
            <p className="text-sm text-gray-600">
              AI が返した JSON
              をそのまま貼り付けてください。前後に説明文が付いていたり、 ```json
              のようなフェンスが付いたままでも構いません。
            </p>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={12}
              placeholder="AI の出力をそのまま貼り付け"
              className={`${fieldClass} resize-y font-mono text-xs leading-relaxed`}
              aria-label="AI が返した JSON"
            />
            <div className="flex flex-wrap justify-between gap-2">
              <button
                type="button"
                className={subtleButtonClass}
                onClick={() => setStep(1)}
              >
                戻る
              </button>
              <button
                type="button"
                className={primaryButtonClass}
                onClick={handleParse}
              >
                読み込む
              </button>
            </div>
          </div>
        )}

        {step === 3 && importResult !== null && (
          <div className="space-y-3">
            <StepHeading step={3} title="レビューして取り込み" />

            <p className="text-sm font-medium text-gray-700">
              {summarizeResult(importResult)}
            </p>

            {importResult.issues.length > 0 && (
              <details className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <summary className="cursor-pointer font-medium">
                  問題の詳細({importResult.issues.length}件)
                </summary>
                <ul className="mt-2 space-y-2">
                  {importResult.issues.map((issue, i) => (
                    <li
                      key={i}
                      className="border-t border-amber-200 pt-2 first:border-t-0 first:pt-0"
                    >
                      <p>
                        {issue.index !== null ? `${issue.index + 1}件目: ` : ''}
                        {issue.message}
                      </p>
                      {issue.raw !== undefined && (
                        <blockquote className="mt-1 border-l-4 border-amber-300 pl-2 text-xs text-amber-700">
                          {issue.raw}
                        </blockquote>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {importResult.bookings.length === 0 ? (
              <div className="flex justify-start">
                <button
                  type="button"
                  className={subtleButtonClass}
                  onClick={() => setStep(2)}
                >
                  ステップ2に戻ってやり直す
                </button>
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {importResult.bookings.map((booking) => (
                    <BookingPreviewCard
                      key={booking.id}
                      booking={booking}
                      displayTz={displayTz}
                    />
                  ))}
                </ul>
                <div className="flex flex-wrap justify-between gap-2">
                  <button
                    type="button"
                    className={subtleButtonClass}
                    onClick={() => setStep(2)}
                  >
                    戻る
                  </button>
                  <button
                    type="button"
                    className={primaryButtonClass}
                    onClick={() => setReviewOpen(true)}
                  >
                    取り込む
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {reviewOpen && importResult !== null && (
        <ReviewDialog
          bookings={importResult.bookings}
          displayTz={displayTz}
          tripStartDate={state.startDate}
          tripEndDate={state.endDate}
          tzFallbackIds={importResult.tzFallbackIds}
          onConfirm={handleConfirmImport}
          onCancel={() => setReviewOpen(false)}
        />
      )}

      {bulkVerifyOpen && (
        <ConfirmDialog
          title="未確認をまとめて解除しますか?"
          description={`取り込んだ${importedUnverifiedIds.length}件の黄色い下線が消え、AI が入力した値と自分で確認した値の区別が付かなくなります。取り消したいときは「元に戻す」で1回ぶん戻せます。`}
          confirmLabel="すべて解除する"
          confirmAriaLabel={`取り込んだ${importedUnverifiedIds.length}件の未確認をすべて解除する`}
          onConfirm={handleBulkVerify}
          onCancel={() => setBulkVerifyOpen(false)}
        />
      )}
    </section>
  )
}
