import type { HTMLAttributes } from 'react'
import { cx } from './cx'

type PageProps = HTMLAttributes<HTMLElement> & {
  /**
   * standard: ヘッダーと同じ幅（72rem）。フォームや一覧のツール。
   * wide: 地図・プレビューなど作業面が広いツール（90rem）。開いている間はヘッダーも同じ幅になる。
   */
  width?: 'standard' | 'wide'
}

/**
 * ページの枠（<main>）。最大幅・左右の余白・タイトルの上の余白をツール間で揃える。
 * タイトルは <PageTitle> を先頭に置く（page-head の余白付き）。
 */
export function Page({ width = 'standard', className, ...props }: PageProps) {
  return (
    <main
      className={cx('page', width === 'wide' && 'page-wide', className)}
      {...props}
    />
  )
}
