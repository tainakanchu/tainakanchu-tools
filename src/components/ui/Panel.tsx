import type { HTMLAttributes } from 'react'
import { cx } from './cx'

type PanelProps = HTMLAttributes<HTMLElement> & {
  /** solid: 青インクの線 / wash: 線＋薄塗り / dashed: 未確定のもの（破線） */
  tone?: 'solid' | 'wash' | 'dashed'
  as?: 'div' | 'section' | 'article' | 'aside' | 'li' | 'form'
}

/** 青インク 1.5px の線で囲んだ面。角丸・影は付けない */
export function Panel({
  tone = 'solid',
  as: Tag = 'div',
  className,
  ...props
}: PanelProps) {
  return (
    <Tag
      className={cx(
        'panel',
        tone === 'wash' && 'panel-wash',
        tone === 'dashed' && 'panel-dashed',
        className,
      )}
      {...props}
    />
  )
}
