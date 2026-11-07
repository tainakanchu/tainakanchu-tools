import type { ReactNode } from 'react'
import { cx } from './cx'

type PageTitleProps = {
  children: ReactNode
  /** タイトルの下に添える一、二文（弱い文字色。幅は 40em まで） */
  lead?: ReactNode
  /** タイトルの右に並べる操作（旅程の切り替え・元に戻すなど）。狭い画面では下に回る */
  actions?: ReactNode
  className?: string
}

/**
 * ページの h1 と説明文。<Page> の先頭に置く（下に 32px の余白が付く）。
 * Dela Gothic One を使うのはこことヘッダーのワードマークだけ。
 */
export function PageTitle({
  children,
  lead,
  actions,
  className,
}: PageTitleProps) {
  return (
    <div className={cx('page-head', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="page-title min-w-0">{children}</h1>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {lead ? <p className="page-lead mt-2">{lead}</p> : null}
    </div>
  )
}
