import { useState } from 'react'
import type { ReactNode } from 'react'
import { cx } from './cx'

type DropZoneProps = {
  /** 選んだ・落としたファイル */
  onFiles: (files: Array<File>) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
  /** 太字の一行（「画像を選ぶか、ここへドロップ」など） */
  title: ReactNode
  /** 補足（対応形式・枚数） */
  hint?: ReactNode
  className?: string
}

/**
 * ファイルのドロップ領域。破線で囲んだ薄塗りの面で、ファイルを重ねている間はピンクの網。
 * 中身は label + sr-only の input[type=file] なので、クリック・キーボードでも選べる。
 */
export function DropZone({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  title,
  hint,
  className,
}: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <label
      className={cx('dropzone', className)}
      data-dragover={dragOver || undefined}
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragLeave={(event) => {
        // 子要素への移動でもちらつかないよう、label の外に出たときだけ解除する
        const related =
          event.relatedTarget instanceof Node ? event.relatedTarget : null
        if (related && event.currentTarget.contains(related)) return
        setDragOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        if (disabled) return
        const files = Array.from(event.dataTransfer.files)
        if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1))
      }}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length > 0) onFiles(files)
        }}
      />
      <span className="dropzone-title">{title}</span>
      {hint ? <span className="dropzone-hint">{hint}</span> : null}
    </label>
  )
}
