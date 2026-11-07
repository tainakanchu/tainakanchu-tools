import type { ReactNode } from 'react'
import type { ConstraintSeverity } from '../../../../lib/trip-scheduler/types'

interface ViolationLineProps {
  severity: ConstraintSeverity
  children: ReactNode
  title?: string
}

/**
 * 条件を満たしていない、という 1 行。
 * 必須は塗りの四角、できればは白抜きの四角で、ラベルの文字も添える（色だけに頼らない）。
 */
export function ViolationLine({
  severity,
  children,
  title,
}: ViolationLineProps) {
  const must = severity === 'must'
  return (
    <li
      className="flex items-baseline gap-2 text-sm leading-relaxed"
      title={title}
    >
      <span
        aria-hidden
        className={`size-[0.7em] shrink-0 translate-y-[0.05em] border-[1.5px] border-ink ${
          must ? 'bg-pink' : 'bg-paper'
        }`}
      />
      <span>
        <span className="mr-1.5 font-bold">{must ? '必須' : 'できれば'}</span>
        {children}
      </span>
    </li>
  )
}
