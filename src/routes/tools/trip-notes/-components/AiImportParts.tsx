/**
 * AI 取り込みの共通パーツ。
 *
 * 「プロンプトをコピーし、外部の AI に貼り、返ってきた JSON を持ち帰る」という
 * 往復は、設定タブのウィザード(AiImportPanel)と予約フォームの折りたたみ
 * (BookingForm)の両方で同じものが要る。片方だけに置くと、リンク先が増えたときや
 * コピー失敗時の逃げ道を直したときに、もう片方が取り残される。
 * 見た目の差(ウィザードは広く使える / フォームは狭い)は props で吸収し、
 * 中身のロジックはここ 1 箇所に集める。
 */

import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../../components/ui'
import { AI_SERVICE_LINKS } from '../../../../lib/trip-notes/aiPrompt'
import { copyText } from '../-lib/format'
import { fieldClass } from '../-lib/styles'
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
        <Button size="sm" onClick={handleCopy}>
          {status === 'copied' ? 'コピーしました' : copyLabel}
        </Button>
        {status === 'failed' && (
          <span role="alert" className="text-xs text-ink">
            コピーできませんでした。上の欄のテキストを選んで、手でコピーしてください。
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
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {AI_SERVICE_LINKS.map((service) => (
          <a
            key={service.id}
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ink-link"
          >
            {service.label}
          </a>
        ))}
        <span className="text-xs text-ink-muted">(どれも別サイト)</span>
      </p>
    )
  }

  return (
    <ul className="ink-line-t ink-line-b text-sm">
      {AI_SERVICE_LINKS.map((service) => (
        <li
          key={service.id}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-rule py-2 first:border-t-0"
        >
          <a
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ink-link font-medium"
          >
            {service.label} を開く(別サイト)
          </a>
          <span className="text-xs text-ink-muted">{service.hint}</span>
        </li>
      ))}
    </ul>
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
    <details className="panel-note panel-note-warn text-sm">
      <summary className="cursor-pointer font-medium">
        問題の詳細({issues.length}件)
      </summary>
      <ul className="mt-2 space-y-2">
        {issues.map((issue, i) => (
          <li
            key={i}
            className="border-t border-rule pt-2 first:border-t-0 first:pt-0"
          >
            <p>
              {issue.index !== null ? `${issue.index + 1}件目: ` : ''}
              {issue.message}
            </p>
            {issue.raw !== undefined && (
              <blockquote className="mt-1 border-l-2 border-rule pl-2 text-xs text-ink-muted">
                {issue.raw}
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
