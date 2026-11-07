/**
 * AI 取り込みの共通パーツ。
 * src/routes/tools/trip-notes/-components/AiImportParts.tsx を写したもので、
 * 「プロンプトをコピー → 外部の AI に貼る → 返ってきた JSON を持ち帰る」という
 * 往復に必要な部品(コピーボタン・貼り付け先リンク・問題の一覧)を集めてある。
 */

import { useEffect, useRef, useState } from 'react'
import { Button, Textarea, buttonClass } from '../../../../components/ui'
import { AI_SERVICE_LINKS } from '../-lib/aiPrompt'
import { copyText } from '../-lib/format'
import type { ImportIssue } from '../-lib/aiImport'

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
        <Textarea
          readOnly
          value={prompt}
          rows={rows}
          className="resize-y font-mono text-xs leading-relaxed"
          aria-label="AI に貼り付けるプロンプト"
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void handleCopy()}>
          {status === 'copied' ? 'コピーしました' : copyLabel}
        </Button>
        {status === 'failed' && (
          <span role="alert" className="field-error">
            コピーに失敗しました。テキストを選択して手動でコピーしてください
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * プロンプトを貼り付けに行く先のリンク。
 * compact では 1 行に並べ、添付対応などの補足は省く。
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
            className={buttonClass('secondary', 'sm')}
          >
            {service.label}(別サイト)
          </a>
        ))}
      </div>
    )
  }

  return (
    <ul className="border-b border-rule">
      {AI_SERVICE_LINKS.map((service) => (
        <li
          key={service.id}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-rule py-2 text-sm"
        >
          <a
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ink-link font-bold"
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
 * 「便名が読み取れませんでした」のような注記が黙って消えると、
 * 利用者は取り込めなかった項目に気付かないまま書き出してしまう。
 * 畳んではおくが、件数だけは必ず見えるようにする。
 */
export function ImportIssueDetails({ issues }: { issues: Array<ImportIssue> }) {
  if (issues.length === 0) return null
  return (
    <details className="border-t border-rule pt-3 text-sm">
      <summary className="cursor-pointer font-bold">
        問題の詳細({issues.length}件)
      </summary>
      <ul className="mt-2 space-y-2">
        {issues.map((issue, i) => (
          <li
            key={i}
            className="border-t border-rule pt-2 first:border-t-0 first:pt-0"
          >
            <p>
              {issue.index !== null ? `${issue.index + 1}人目: ` : ''}
              {issue.message}
            </p>
            {issue.raw !== undefined && (
              <blockquote className="mt-1 border-l-4 border-ink-muted pl-2 text-xs text-ink-muted">
                {issue.raw}
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
