import type { ImportIssue } from '../../../../lib/timetable/normalize'

/**
 * 取り込み時のエラーと警告の一覧。
 * エラー(取り込まれない)は常に開き、警告(取り込まれるが確認したほうがよい)は
 * 件数が多いと邪魔なので畳んでおく。
 */
export function IssueList({ issues }: { issues: ReadonlyArray<ImportIssue> }) {
  const errors = issues.filter((issue) => issue.level === 'error')
  const warnings = issues.filter((issue) => issue.level === 'warning')
  if (issues.length === 0) return null
  return (
    <div className="space-y-2 text-sm">
      {errors.length > 0 && (
        <div className="rounded-md border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-2">
          <p className="font-semibold text-rose-800 dark:text-rose-200">
            取り込めないもの {errors.length} 件
          </p>
          <p className="text-xs text-rose-800 dark:text-rose-200">
            これらは取り込まれません。AI
            に下の内容を伝えて直してもらうか、このまま残りだけ取り込めます。
          </p>
          <ul className="mt-1 space-y-0.5">
            {errors.map((issue, i) => (
              <li key={i} className="text-rose-900 dark:text-rose-100">
                <span className="font-medium">{issue.where}</span>:{' '}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <details
          className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-2"
          open={warnings.length <= 5}
        >
          <summary className="cursor-pointer font-semibold text-amber-900 dark:text-amber-200">
            確認したほうがよいもの {warnings.length} 件
          </summary>
          <ul className="mt-1 space-y-0.5">
            {warnings.map((issue, i) => (
              <li key={i} className="text-amber-950 dark:text-amber-100">
                <span className="font-medium">{issue.where}</span>:{' '}
                {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
