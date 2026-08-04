/**
 * AI 取り込みの共通パーツ。
 *
 * 「プロンプトをコピー → 外部の AI に貼る → 返ってきた JSON を持ち帰る」という
 * 往復は、設定タブのウィザード(AiImportPanel)と予約フォームの折りたたみ
 * (BookingForm)の両方で同じものが要る。片方だけに置くと、リンク先が増えたときや
 * コピー失敗時の逃げ道を直したときに、もう片方が取り残される。
 * 見た目の差(ウィザードは広く使える / フォームは狭い)は props で吸収し、
 * 中身のロジックはここ 1 箇所に集める。
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { AI_SERVICE_LINKS } from '../../../../lib/trip-notes/aiPrompt'
import { copyText } from '../-lib/format'
import { fieldClass, primaryButtonClass } from '../-lib/styles'
import type { ImportIssue } from '../../../../lib/trip-notes/aiImport'

type CopyStatus = 'idle' | 'copied' | 'failed'

/** 「コピーしました」を出しておく時間 */
const COPY_RESET_MS = 2000

interface PromptCopyBlockProps {
  prompt: string
  /**
   * プロンプト本文を常に見せるか。
   * false でもコピーに失敗したときだけは出す。navigator.clipboard は
   * http のプレビューでは使えないので、手で選択してコピーする逃げ道を残す。
   */
  alwaysShowPrompt?: boolean
  /** プロンプト本文を出すときの行数 */
  rows?: number
  copyLabel?: string
}

/** プロンプトのコピーボタン(と、必要なときだけ出るプロンプト本文) */
export function PromptCopyBlock({
  prompt,
  alwaysShowPrompt = false,
  rows = 8,
  copyLabel = 'コピーする',
}: PromptCopyBlockProps) {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const timeoutRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    },
    [],
  )

  async function handleCopy(): Promise<void> {
    const ok = await copyText(prompt)
    setStatus(ok ? 'copied' : 'failed')
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(
      () => setStatus('idle'),
      COPY_RESET_MS,
    )
  }

  const showPrompt = alwaysShowPrompt || status === 'failed'

  return (
    <div className="space-y-2">
      {showPrompt && (
        <textarea
          readOnly
          value={prompt}
          rows={rows}
          className={`${fieldClass} resize-y font-mono text-xs leading-relaxed`}
          aria-label="AI に貼り付けるプロンプト"
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className={primaryButtonClass}
        >
          {status === 'copied' ? (
            <>
              <Check size={14} aria-hidden="true" />
              コピーしました
            </>
          ) : (
            <>
              <Copy size={14} aria-hidden="true" />
              {copyLabel}
            </>
          )}
        </button>
        {status === 'failed' && (
          <span role="alert" className="text-xs text-rose-600">
            コピーに失敗しました。テキストを選択して手動でコピーしてください
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * プロンプトを貼り付けに行く先のリンク。
 * compact では 1 行に並べ、添付対応などの補足は省く(予約フォームのように
 * 縦の余白が貴重な場所で使う)。
 */
export function AiServiceLinks({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {AI_SERVICE_LINKS.map((service) => (
          <a
            key={service.id}
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition hover:border-cyan-400 hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
          >
            <ExternalLink size={12} aria-hidden="true" />
            {service.label}
          </a>
        ))}
      </div>
    )
  }

  return (
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
  )
}

/**
 * 取り込み時に出た問題の一覧。
 * 「日付が読み取れませんでした」のような注記が黙って消えると、
 * 利用者は取り込めなかった予約に気付かないまま出発してしまう。
 * 畳んではおくが、件数だけは必ず見えるようにする。
 */
export function ImportIssueDetails({ issues }: { issues: Array<ImportIssue> }) {
  if (issues.length === 0) return null
  return (
    <details className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <summary className="cursor-pointer font-medium">
        問題の詳細({issues.length}件)
      </summary>
      <ul className="mt-2 space-y-2">
        {issues.map((issue, i) => (
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
  )
}
