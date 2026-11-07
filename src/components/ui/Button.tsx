import type { ButtonHTMLAttributes, Ref } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
export type ButtonSize = 'md' | 'sm'

/**
 * ボタンの className。<a> や TanStack Router の <Link> をボタンの見た目にしたいときに使う。
 * 例: <Link to="/" className={buttonClass('secondary')}>目次に戻る</Link>
 */
export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
): string {
  // danger は secondary の見た目に、hover / フォーカスのピンクの薄網を足したもの
  return cx(
    'btn',
    variant === 'danger' ? 'btn-secondary btn-danger' : `btn-${variant}`,
    size === 'sm' && 'btn-sm',
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary は画面に 1 つだけ（版ズレ付き）。迷ったら secondary。削除など取り消しにくい操作は danger */
  variant?: ButtonVariant
  size?: ButtonSize
  /** 初期フォーカスを当てたいときなど（React 19 なので props で受け取れる） */
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonClass(variant, size), className)}
      {...props}
    />
  )
}
