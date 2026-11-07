import { createContext, useContext, useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cx } from './cx'

type FieldContextValue = {
  id: string
  describedBy: string | undefined
  invalid: boolean
}

const FieldContext = createContext<FieldContextValue | null>(null)

type FieldProps = {
  label: ReactNode
  /** 補足（入力の前に知っておきたいこと） */
  hint?: ReactNode
  /** エラー文。あると入力欄に aria-invalid が付き、ピンクの印付きで出る */
  error?: ReactNode
  /** 入力欄の id。省略すると自動で振る */
  id?: string
  className?: string
  /** TextInput / Select / Textarea を 1 つ入れる。label・補足・エラーとは自動でつながる */
  children: ReactNode
}

export function Field({
  label,
  hint,
  error,
  id: idProp,
  className,
  children,
}: FieldProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <FieldContext value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cx('field', className)}>
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {children}
        {hint ? (
          <p className="field-hint" id={hintId}>
            {hint}
          </p>
        ) : null}
        {error ? (
          <p className="field-error" id={errorId}>
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext>
  )
}

/** Field の中なら id・aria-describedby・aria-invalid を補う（明示した props が優先） */
function useFieldProps<
  P extends {
    id?: string
    'aria-describedby'?: string
    'aria-invalid'?: InputHTMLAttributes<HTMLInputElement>['aria-invalid']
  },
>(props: P): P {
  const field = useContext(FieldContext)
  if (!field) return props
  return {
    ...props,
    id: props.id ?? field.id,
    'aria-describedby': props['aria-describedby'] ?? field.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field.invalid || undefined),
  }
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      {...useFieldProps(props)}
      className={cx('input', className)}
    />
  )
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...useFieldProps(props)} className={cx('input', className)} />
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...useFieldProps(props)} className={cx('input', className)} />
  )
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
}

/** ラベルごと押せるチェックボックス。Field には入れずに単独で使う */
export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={cx('checkbox', className)}>
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  )
}
